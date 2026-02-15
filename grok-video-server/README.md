# Grok Imagine API Server

OpenAI-compatible API server powered by Grok web automation for both video generation and chat/vision.

## Features

- **OpenAI-Compatible API**: Video generation and chat completion endpoints
- **Job Queue Management**: SQLite-based persistent job queue
- **Video Storage**: Local file storage for generated videos
- **Request/Response Logging**: Structured JSON logging for all operations
- **CORS Enabled**: Works with web-based clients
- **Extension Integration**: Mode-based polling endpoints for Chrome extension workers (`video`/`chat`)

## Installation

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Usage

### Start the server:
```bash
python server.py
```

The server will start on `http://localhost:8000` by default.

### Environment Variables

Configure the server using environment variables:

```bash
# Server configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=8000

# Storage paths
VIDEO_STORAGE_PATH=./videos
LOG_PATH=./logs
DB_PATH=./jobs.db

# Job management
MAX_VIDEO_AGE_DAYS=7
JOB_TIMEOUT_SECONDS=300
CHAT_JOB_TIMEOUT_SECONDS=60
CHAT_COMPLETION_WAIT_SECONDS=60
```

## API Endpoints

### Client Endpoints (OpenAI-Compatible)

#### Create Video Generation Job
```bash
POST /v1/videos/generations
Content-Type: application/json

{
  "model": "grok",
  "prompt": "A cat playing piano",
  "image": "base64_encoded_image_optional"
}
```

Response:
```json
{
  "id": "job_123abc",
  "object": "videos.generation",
  "created": 1675389721,
  "model": "grok",
  "status": "pending",
  "video_url": "http://localhost:8000/videos/job_123abc.mp4",
  "error": null
}
```

#### Get Job Status
```bash
GET /v1/videos/generations/{job_id}
```

#### Create Chat Completion (Vision Supported)
```bash
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "grok-vision",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Describe this image." },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
      ]
    }
  ]
}
```

Response (OpenAI-style):
```json
{
  "id": "chatcmpl-job_123abc",
  "object": "chat.completion",
  "created": 1675389721,
  "model": "grok-vision",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

#### Download Video
```bash
GET /videos/{job_id}.mp4
```

### Extension Endpoints

#### Poll for Jobs
```bash
GET /extension/poll?mode=video
GET /extension/poll?mode=chat
```

Returns `204 No Content` if no jobs available, otherwise:
```json
{
  "job_id": "job_123abc",
  "job_type": "video",
  "prompt": "A cat playing piano",
  "image": "base64_or_null",
  "request": null
}
```

#### Complete Job
```bash
POST /extension/complete
Content-Type: multipart/form-data

job_id: job_123abc
video: <binary video file>
```

#### Complete Chat Job
```bash
POST /extension/complete/chat
Content-Type: application/json

{
  "job_id": "job_123abc",
  "content": "assistant response text"
}
```

#### Report Error
```bash
POST /extension/error
Content-Type: application/json

{
  "job_id": "job_123abc",
  "error": "Error message"
}
```

### Monitoring Endpoints

#### List Jobs
```bash
GET /jobs?status=completed&limit=100
```

#### Delete Jobs
```bash
DELETE /jobs
```

#### Health Check
```bash
GET /
```

#### Delete Logs
```bash
DELETE /api/logs
```

## Example Usage

### Python with OpenAI SDK Style

```python
import requests

# Create job
response = requests.post('http://localhost:8000/v1/videos/generations', json={
    'model': 'grok',
    'prompt': 'A beautiful sunset over mountains'
})

job = response.json()
job_id = job['id']

# Poll for completion
import time
while True:
    response = requests.get(f'http://localhost:8000/v1/videos/generations/{job_id}')
    job = response.json()

    if job['status'] == 'completed':
        print(f"Video ready: {job['video_url']}")
        break
    elif job['status'] == 'failed':
        print(f"Job failed: {job['error']}")
        break

    print(f"Status: {job['status']}")
    time.sleep(5)

# Download video
video_response = requests.get(job['video_url'])
with open('video.mp4', 'wb') as f:
    f.write(video_response.content)
```

### cURL

```bash
# Create job
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"grok","prompt":"A cat playing piano"}'

# Check status
curl http://localhost:8000/v1/videos/generations/job_123abc

# Download video
curl -O http://localhost:8000/videos/job_123abc.mp4
```

## Job States

Jobs flow through the following states:

1. `pending` - Job created, waiting for worker
2. `processing` - Worker is processing video/chat
3. `completed` - Result uploaded (video or chat text)
4. `failed` - Job failed with error

## Logging

All requests and responses are logged to `logs/requests_YYYY-MM-DD.jsonl` in JSON Lines format:

```json
{"timestamp": "2024-01-01T12:00:00Z", "type": "request", "method": "POST", "path": "/v1/video/generations", "job_id": "job_123abc", "payload": {...}}
{"timestamp": "2024-01-01T12:02:30Z", "type": "response", "job_id": "job_123abc", "status": "completed", "duration": 150.5, "video_size": 2048576}
```

## Storage

- **Videos**: Stored in `videos/` directory as `{job_id}.mp4`
- **Database**: SQLite database at `jobs.db`
- **Logs**: JSON Lines files in `logs/` directory

## Cleanup

Old videos are automatically cleaned up after 7 days (configurable via `MAX_VIDEO_AGE_DAYS`).

Stale processing jobs are marked as failed with separate timeouts for video and chat.

## Development

### Run with auto-reload:
```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

### Run tests:
```bash
# TODO: Add tests
pytest tests/
```

## Architecture

The server is built with:
- **FastAPI**: Modern async web framework
- **Uvicorn**: ASGI server
- **Pydantic**: Data validation
- **aiosqlite**: Async SQLite access
- **aiofiles**: Async file I/O

## Troubleshooting

### Server won't start
- Check if port 8000 is already in use
- Verify all dependencies are installed
- Check logs directory is writable

### Extension can't connect
- Verify server is running
- Check CORS settings
- Ensure server URL is correct in extension settings

### Jobs timeout
- Increase `JOB_TIMEOUT_SECONDS`
- Check extension is running and has Grok tab open
- Verify Grok.com is accessible

## License

MIT
