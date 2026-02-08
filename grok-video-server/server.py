from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, Response, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
from datetime import datetime
import time
import json
from pathlib import Path

import config
from models import (
    VideoGenerationRequest, VideoGenerationResponse,
    ExtensionPollResponse, ExtensionErrorRequest, JobStatus
)
from job_queue import job_queue
from storage import storage
from logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Startup
    await job_queue.init_db()
    print(f"Server starting on {config.SERVER_HOST}:{config.SERVER_PORT}")
    print(f"Video storage: {config.VIDEO_STORAGE_PATH}")
    print(f"Database: {config.DB_PATH}")
    yield
    # Shutdown
    print("Server shutting down")


app = FastAPI(
    title="Grok Imagine API",
    description="OpenAI-compatible video generation API powered by Grok",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve dashboard"""
    static_path = Path(__file__).parent / 'static' / 'dashboard.html'
    if static_path.exists():
        with open(static_path, 'r', encoding='utf-8') as f:
            return f.read()
    return """
    <html>
        <body>
            <h1>Grok Imagine API</h1>
            <p>Dashboard not found. Please ensure static/dashboard.html exists.</p>
            <p>API Health: OK</p>
        </body>
    </html>
    """


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "Grok Imagine API",
        "version": "1.0.0"
    }


@app.post("/v1/videos/generations", response_model=VideoGenerationResponse)
async def create_video_generation(request: VideoGenerationRequest):
    """
    Create a new video generation job (OpenAI-compatible endpoint)
    """
    start_time = time.time()

    # Log request
    logger.log_request(
        method="POST",
        path="/v1/videos/generations",
        payload=request.model_dump()
    )

    # Create job
    job = await job_queue.create_job(
        prompt=request.prompt,
        image=request.image
    )

    # Build video URL
    video_url = f"http://localhost:{config.SERVER_PORT}/videos/{job.job_id}.mp4"

    # Build response
    response = VideoGenerationResponse(
        id=job.job_id,
        created=job.created_at,
        model=request.model,
        status=JobStatus(job.status),
        video_url=video_url if job.status == JobStatus.COMPLETED else None,
        error=job.error
    )

    # Log response
    duration = time.time() - start_time
    logger.log_response(
        job_id=job.job_id,
        status=job.status,
        duration=duration
    )

    return response


@app.get("/v1/videos/generations/{job_id}", response_model=VideoGenerationResponse)
async def get_video_generation(job_id: str):
    """
    Get status of a video generation job (OpenAI-compatible endpoint)
    """
    start_time = time.time()

    # Log request
    logger.log_request(
        method="GET",
        path=f"/v1/videos/generations/{job_id}",
        job_id=job_id
    )

    # Get job
    job = await job_queue.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Build video URL
    video_url = f"http://localhost:{config.SERVER_PORT}/videos/{job.job_id}.mp4"

    # Build response
    response = VideoGenerationResponse(
        id=job.job_id,
        created=job.created_at,
        model="grok",
        status=JobStatus(job.status),
        video_url=video_url if job.status == JobStatus.COMPLETED else None,
        error=job.error
    )

    # Log response
    duration = time.time() - start_time
    logger.log_response(
        job_id=job.job_id,
        status=job.status,
        duration=duration
    )

    return response


@app.get("/extension/poll")
async def extension_poll():
    """
    Extension polls for next job to process
    Returns 204 if no jobs available, otherwise returns job details
    """
    # Cleanup stale jobs
    await job_queue.cleanup_stale_jobs()

    # Get next pending job
    job = await job_queue.get_next_pending_job()

    if not job:
        return Response(status_code=204)

    # Mark job as processing
    await job_queue.update_job_status(job.job_id, JobStatus.PROCESSING)

    # Return job details
    response = ExtensionPollResponse(
        job_id=job.job_id,
        prompt=job.prompt,
        image=job.image
    )

    logger.log_request(
        method="GET",
        path="/extension/poll",
        job_id=job.job_id
    )

    return response


@app.post("/extension/complete")
async def extension_complete(
    job_id: str = Form(...),
    video: UploadFile = File(...)
):
    """
    Extension uploads completed video
    """
    start_time = time.time()

    # Get job
    job = await job_queue.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Read video data
    video_data = await video.read()

    # Save video
    video_path = await storage.save_video(job_id, video_data)

    # Update job status
    await job_queue.update_job_status(
        job_id=job_id,
        status=JobStatus.COMPLETED,
        video_path=video_path
    )

    # Log response
    duration = time.time() - start_time
    logger.log_response(
        job_id=job_id,
        status=JobStatus.COMPLETED,
        duration=duration,
        video_size=len(video_data)
    )

    return {"status": "ok", "job_id": job_id}


@app.post("/extension/error")
async def extension_error(request: ExtensionErrorRequest):
    """
    Extension reports job failure
    """
    # Get job
    job = await job_queue.get_job(request.job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Update job status
    await job_queue.update_job_status(
        job_id=request.job_id,
        status=JobStatus.FAILED,
        error=request.error
    )

    # Log response
    logger.log_response(
        job_id=request.job_id,
        status=JobStatus.FAILED,
        error=request.error
    )

    return {"status": "ok", "job_id": request.job_id}


@app.get("/videos/{job_id}.mp4")
async def get_video(job_id: str):
    """
    Serve completed video file
    """
    # Get video path
    video_path = await storage.get_video_path(job_id)

    if not video_path:
        raise HTTPException(status_code=404, detail="Video not found")

    # Return video file
    return FileResponse(
        video_path,
        media_type="video/mp4",
        filename=f"{job_id}.mp4"
    )


@app.get("/jobs")
async def list_jobs(status: str = None, limit: int = 100):
    """
    List jobs (for debugging/monitoring)
    """
    jobs = await job_queue.list_jobs(status=status, limit=limit)

    return {
        "jobs": [job.to_dict() for job in jobs],
        "count": len(jobs)
    }


@app.get("/api/logs")
async def get_logs(limit: int = 50):
    """
    Get recent request logs
    """
    log_file = logger.get_log_file()

    if not log_file.exists():
        return {"logs": [], "count": 0}

    logs = []
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Get last N lines
        recent_lines = lines[-limit:] if len(lines) > limit else lines

        # Parse JSON logs
        for line in recent_lines:
            try:
                logs.append(json.loads(line.strip()))
            except json.JSONDecodeError:
                pass

        return {
            "logs": logs,
            "count": len(logs)
        }
    except Exception as e:
        return {
            "error": str(e),
            "logs": [],
            "count": 0
        }


if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host=config.SERVER_HOST,
        port=config.SERVER_PORT,
        reload=True
    )
