from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, Response, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import uvicorn
from datetime import datetime
import time
import json
from pathlib import Path

import config
from models import (
    VideoGenerationRequest, VideoGenerationResponse,
    ExtensionPollResponse, ExtensionErrorRequest, ExtensionChatCompleteRequest,
    ChatCompletionRequest, JobStatus, JobType
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


def _extract_user_prompt(messages):
    """Best-effort extraction for dashboards/history"""
    for message in reversed(messages):
        if message.get("role") != "user":
            continue

        content = message.get("content")
        if isinstance(content, str):
            return content.strip()[:2000]

        if isinstance(content, list):
            text_parts = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    text_value = part.get("text")
                    if text_value:
                        text_parts.append(str(text_value))
            if text_parts:
                return "\n".join(text_parts).strip()[:2000]

    return "Vision chat request"


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
        image=request.image,
        job_type=JobType.VIDEO.value
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
async def extension_poll(mode: JobType = JobType.VIDEO):
    """
    Extension polls for next job to process
    Returns 204 if no jobs available, otherwise returns job details
    """
    # Cleanup stale jobs
    await job_queue.cleanup_stale_jobs()

    # Get next pending job by mode
    job = await job_queue.get_next_pending_job(job_type=mode.value)

    if not job:
        return Response(status_code=204)

    # Mark job as processing
    await job_queue.update_job_status(job.job_id, JobStatus.PROCESSING)

    # Return job details
    parsed_request = None
    if job.request_payload:
        try:
            parsed_request = json.loads(job.request_payload)
        except json.JSONDecodeError:
            parsed_request = None

    response = ExtensionPollResponse(
        job_id=job.job_id,
        job_type=job.job_type,
        prompt=job.prompt,
        image=job.image,
        request=parsed_request
    )

    logger.log_request(
        method="GET",
        path=f"/extension/poll?mode={mode.value}",
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


@app.post("/extension/complete/chat")
async def extension_complete_chat(request: ExtensionChatCompleteRequest):
    """
    Extension reports completed chat/vision response
    """
    job = await job_queue.get_job(request.job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    await job_queue.update_job_status(
        job_id=request.job_id,
        status=JobStatus.COMPLETED,
        text_response=request.content
    )

    logger.log_response(
        job_id=request.job_id,
        status=JobStatus.COMPLETED
    )

    return {"status": "ok", "job_id": request.job_id}


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


@app.post("/v1/chat/completions")
async def create_chat_completion(request: ChatCompletionRequest):
    """
    OpenAI-compatible chat endpoint bridged to extension workers.
    """
    start_time = time.time()
    prompt_for_history = _extract_user_prompt(request.messages)

    job = await job_queue.create_job(
        prompt=prompt_for_history,
        image=None,
        job_type=JobType.CHAT.value,
        request_payload=json.dumps(request.model_dump())
    )

    logger.log_request(
        method="POST",
        path="/v1/chat/completions",
        job_id=job.job_id,
        payload={"model": request.model, "messages_count": len(request.messages)}
    )

    deadline = time.time() + config.CHAT_COMPLETION_WAIT_SECONDS
    while time.time() < deadline:
        latest = await job_queue.get_job(job.job_id)

        if latest and latest.status == JobStatus.COMPLETED:
            content = latest.text_response or ""
            duration = time.time() - start_time
            logger.log_response(
                job_id=job.job_id,
                status=JobStatus.COMPLETED,
                duration=duration
            )
            return {
                "id": f"chatcmpl-{job.job_id}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": request.model,
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": content},
                        "finish_reason": "stop"
                    }
                ],
                "usage": {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0
                }
            }

        if latest and latest.status == JobStatus.FAILED:
            duration = time.time() - start_time
            logger.log_response(
                job_id=job.job_id,
                status=JobStatus.FAILED,
                duration=duration,
                error=latest.error
            )
            raise HTTPException(status_code=500, detail=latest.error or "Chat job failed")

        await asyncio.sleep(1)

    raise HTTPException(
        status_code=504,
        detail=f"Timed out waiting for chat completion after {config.CHAT_COMPLETION_WAIT_SECONDS}s"
    )


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


@app.delete("/jobs")
async def clear_jobs():
    """
    Delete all jobs
    """
    await job_queue.clear_jobs()
    return {"status": "ok"}


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


@app.delete("/api/logs")
async def clear_logs():
    """
    Delete all request logs
    """
    deleted = logger.clear_logs()
    return {"status": "ok", "deleted_files": deleted}


if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host=config.SERVER_HOST,
        port=config.SERVER_PORT,
        reload=True
    )
