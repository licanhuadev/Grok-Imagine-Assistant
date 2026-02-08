# API Documentation - Grok Imagine API

Complete reference for the OpenAI-compatible video generation API.

## Base URL

```
http://localhost:8000
```

All endpoints are prefixed with this base URL.

---

## Authentication

Currently, no authentication is required. The API is designed for local use only.

**Security Note:** Do not expose this server to the internet without adding proper authentication.

---

## Endpoints

### Health Check

Check if the server is running.

**Endpoint:** `GET /`

**Response:**
```json
{
  "status": "ok",
  "service": "Grok Imagine API",
  "version": "1.0.0"
}
```

**Example:**
```bash
curl http://localhost:8000/
```

---

### Create Video Generation Job

Submit a new video generation request.

**Endpoint:** `POST /v1/video/generations`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "model": "grok",
  "prompt": "A cat playing piano in a cozy room",
  "image": "data:image/png;base64,iVBORw0KGgo..." // Optional
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | Yes | Must be "grok" |
| `prompt` | string | Yes | Text description for video generation (max 500 chars) |
| `image` | string | No | Base64-encoded image with data URL prefix for image-to-video |

**Response:** `201 Created`
```json
{
  "id": "job_abc123def456",
  "status": "pending",
  "model": "grok",
  "prompt": "A cat playing piano in a cozy room",
  "created_at": 1234567890
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique job identifier |
| `status` | string | Job status: `pending`, `processing`, `completed`, or `failed` |
| `model` | string | Model used (always "grok") |
| `prompt` | string | The prompt text |
| `created_at` | integer | Unix timestamp when job was created |

**Error Responses:**

`400 Bad Request` - Invalid request
```json
{
  "detail": "Prompt is required"
}
```

`422 Unprocessable Entity` - Validation error
```json
{
  "detail": [
    {
      "loc": ["body", "prompt"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

**Examples:**

**Text-to-Video (curl):**
```bash
curl -X POST http://localhost:8000/v1/video/generations \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok",
    "prompt": "A serene mountain landscape at sunset"
  }'
```

**Image-to-Video (curl):**
```bash
curl -X POST http://localhost:8000/v1/video/generations \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok",
    "prompt": "Make this image come to life with gentle motion",
    "image": "data:image/png;base64,iVBORw0KGgoAAAANS..."
  }'
```

**Python:**
```python
import requests

response = requests.post('http://localhost:8000/v1/video/generations',
    json={
        'model': 'grok',
        'prompt': 'A cat playing piano'
    })

job = response.json()
print(f"Job ID: {job['id']}")
print(f"Status: {job['status']}")
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:8000/v1/video/generations', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    model: 'grok',
    prompt: 'A cat playing piano'
  })
});

const job = await response.json();
console.log(`Job ID: ${job.id}`);
console.log(`Status: ${job.status}`);
```

---

### Get Job Status

Retrieve the current status of a video generation job.

**Endpoint:** `GET /v1/video/generations/{job_id}`

**Parameters:**

| Field | Type | Location | Description |
|-------|------|----------|-------------|
| `job_id` | string | Path | The job ID returned from create endpoint |

**Response:** `200 OK`

**Pending/Processing:**
```json
{
  "id": "job_abc123def456",
  "status": "processing",
  "model": "grok",
  "prompt": "A cat playing piano",
  "created_at": 1234567890
}
```

**Completed:**
```json
{
  "id": "job_abc123def456",
  "status": "completed",
  "model": "grok",
  "prompt": "A cat playing piano",
  "video_url": "http://localhost:8000/videos/job_abc123def456.mp4",
  "created_at": 1234567890,
  "completed_at": 1234567950
}
```

**Failed:**
```json
{
  "id": "job_abc123def456",
  "status": "failed",
  "model": "grok",
  "prompt": "A cat playing piano",
  "error": "Rate limit reached - please wait before submitting more jobs",
  "created_at": 1234567890,
  "failed_at": 1234567920
}
```

**Error Responses:**

`404 Not Found` - Job doesn't exist
```json
{
  "detail": "Job not found"
}
```

**Examples:**

**curl:**
```bash
curl http://localhost:8000/v1/video/generations/job_abc123def456
```

**Python:**
```python
import requests
import time

job_id = "job_abc123def456"

# Poll until completed
while True:
    response = requests.get(f'http://localhost:8000/v1/video/generations/{job_id}')
    job = response.json()

    if job['status'] == 'completed':
        print(f"Video ready: {job['video_url']}")
        break
    elif job['status'] == 'failed':
        print(f"Job failed: {job.get('error', 'Unknown error')}")
        break
    else:
        print(f"Status: {job['status']}...")
        time.sleep(5)
```

**JavaScript:**
```javascript
async function waitForJob(jobId) {
  while (true) {
    const response = await fetch(`http://localhost:8000/v1/video/generations/${jobId}`);
    const job = await response.json();

    if (job.status === 'completed') {
      console.log(`Video ready: ${job.video_url}`);
      return job;
    } else if (job.status === 'failed') {
      console.error(`Job failed: ${job.error}`);
      throw new Error(job.error);
    }

    console.log(`Status: ${job.status}...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
```

---

### Download Video

Download a completed video file.

**Endpoint:** `GET /videos/{job_id}.mp4`

**Parameters:**

| Field | Type | Location | Description |
|-------|------|----------|-------------|
| `job_id` | string | Path | The job ID |

**Response:** `200 OK`
- Content-Type: `video/mp4`
- Binary video file data

**Error Responses:**

`404 Not Found` - Video file doesn't exist
```json
{
  "detail": "Video not found"
}
```

**Examples:**

**curl (save to file):**
```bash
# Save with original filename
curl -O http://localhost:8000/videos/job_abc123def456.mp4

# Save with custom filename
curl -o my_video.mp4 http://localhost:8000/videos/job_abc123def456.mp4
```

**Python:**
```python
import requests

job_id = "job_abc123def456"
video_url = f"http://localhost:8000/videos/{job_id}.mp4"

response = requests.get(video_url)
with open(f"{job_id}.mp4", 'wb') as f:
    f.write(response.content)

print(f"Video saved: {job_id}.mp4")
```

**JavaScript (Node.js):**
```javascript
const fs = require('fs');
const https = require('http');

async function downloadVideo(jobId) {
  const url = `http://localhost:8000/videos/${jobId}.mp4`;
  const file = fs.createWriteStream(`${jobId}.mp4`);

  http.get(url, (response) => {
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log(`Video saved: ${jobId}.mp4`);
    });
  });
}
```

**JavaScript (Browser):**
```javascript
async function downloadVideo(jobId) {
  const url = `http://localhost:8000/videos/${jobId}.mp4`;
  const response = await fetch(url);
  const blob = await response.blob();

  // Create download link
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${jobId}.mp4`;
  a.click();
}
```

---

### List All Jobs

Get a list of all jobs (pending, processing, completed, failed).

**Endpoint:** `GET /v1/video/generations`

**Query Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | No | Filter by status: `pending`, `processing`, `completed`, `failed` |
| `limit` | integer | No | Maximum number of jobs to return (default: 100) |

**Response:** `200 OK`
```json
{
  "jobs": [
    {
      "id": "job_abc123",
      "status": "completed",
      "model": "grok",
      "prompt": "A cat playing piano",
      "video_url": "http://localhost:8000/videos/job_abc123.mp4",
      "created_at": 1234567890,
      "completed_at": 1234567950
    },
    {
      "id": "job_def456",
      "status": "pending",
      "model": "grok",
      "prompt": "A serene landscape",
      "created_at": 1234567900
    }
  ],
  "total": 2
}
```

**Examples:**

**curl (all jobs):**
```bash
curl http://localhost:8000/v1/video/generations
```

**curl (filter by status):**
```bash
curl "http://localhost:8000/v1/video/generations?status=completed&limit=10"
```

**Python:**
```python
import requests

# Get all completed jobs
response = requests.get('http://localhost:8000/v1/video/generations',
    params={'status': 'completed', 'limit': 10})

jobs = response.json()
print(f"Found {jobs['total']} completed jobs")

for job in jobs['jobs']:
    print(f"- {job['id']}: {job['prompt']}")
```

---

## Extension Endpoints

These endpoints are used internally by the Chrome extension and are not meant for direct client use.

### Extension Poll

**Endpoint:** `GET /extension/poll`

Extension polls this endpoint to fetch the next pending job.

**Response:**
- `200 OK` - Job available (returns job details)
- `204 No Content` - No jobs available

### Extension Complete

**Endpoint:** `POST /extension/complete`

Extension uploads completed video.

**Form Data:**
- `job_id` - Job identifier
- `video` - Video file (multipart/form-data)

### Extension Error

**Endpoint:** `POST /extension/error`

Extension reports job failure.

**Request Body:**
```json
{
  "job_id": "job_abc123",
  "error": "Error message"
}
```

---

## Job Status Flow

```
pending
   ↓
processing (extension working on it)
   ↓
completed (video ready) or failed (error occurred)
```

**Status Descriptions:**

- **pending** - Job created, waiting for extension to pick it up
- **processing** - Extension is currently generating the video
- **completed** - Video generation successful, file ready for download
- **failed** - Video generation failed (see error message)

---

## Error Handling

### Common Error Codes

| Status Code | Meaning | Common Causes |
|-------------|---------|---------------|
| 400 | Bad Request | Missing required fields, invalid data format |
| 404 | Not Found | Job ID doesn't exist, video file not found |
| 422 | Unprocessable Entity | Validation error (check field requirements) |
| 500 | Internal Server Error | Server-side error (check logs) |

### Error Response Format

```json
{
  "detail": "Error message describing what went wrong"
}
```

For validation errors (422):
```json
{
  "detail": [
    {
      "loc": ["body", "field_name"],
      "msg": "error description",
      "type": "error_type"
    }
  ]
}
```

---

## Rate Limiting

The API itself has no rate limits, but Grok's service does:
- Extension processes jobs sequentially (one at a time)
- Grok may rate limit video generation requests
- Failed jobs due to rate limits will have status `failed` with appropriate error message

**Recommendations:**
- Don't submit hundreds of jobs at once
- Monitor extension for rate limit warnings
- Wait a few minutes if you encounter rate limits

---

## OpenAI Compatibility

This API follows OpenAI's API structure where applicable:

**Compatible:**
- Endpoint structure: `/v1/video/generations`
- Request/response JSON format
- Job ID format
- Status polling pattern

**Differences:**
- No API key authentication (local use only)
- Single model: "grok"
- Synchronous processing (jobs processed sequentially)
- Local file storage instead of cloud URLs

**Migration from OpenAI:**
```python
# OpenAI-style code (hypothetical)
import openai
response = openai.Video.create(
    model="dall-e-video",
    prompt="A cat playing piano"
)

# Grok Imagine API equivalent
import requests
response = requests.post('http://localhost:8000/v1/video/generations',
    json={'model': 'grok', 'prompt': 'A cat playing piano'})
```

---

## Best Practices

### 1. Poll for Status

Don't assume immediate completion. Always poll for status:

```python
import time

def wait_for_completion(job_id, timeout=300):
    start_time = time.time()
    while time.time() - start_time < timeout:
        response = requests.get(f'http://localhost:8000/v1/video/generations/{job_id}')
        job = response.json()

        if job['status'] in ['completed', 'failed']:
            return job

        time.sleep(5)

    raise TimeoutError(f"Job {job_id} did not complete within {timeout} seconds")
```

### 2. Handle Errors Gracefully

```python
try:
    response = requests.post('http://localhost:8000/v1/video/generations',
        json={'model': 'grok', 'prompt': 'My prompt'})
    response.raise_for_status()
    job = response.json()
except requests.exceptions.RequestException as e:
    print(f"API request failed: {e}")
```

### 3. Validate Image Data

When using image-to-video, ensure proper encoding:

```python
import base64

def encode_image(image_path):
    with open(image_path, 'rb') as f:
        image_data = base64.b64encode(f.read()).decode('utf-8')

    # Detect image type
    if image_path.endswith('.png'):
        prefix = 'data:image/png;base64,'
    elif image_path.endswith('.jpg') or image_path.endswith('.jpeg'):
        prefix = 'data:image/jpeg;base64,'
    else:
        raise ValueError('Unsupported image format')

    return prefix + image_data
```

### 4. Clean Up Old Videos

Videos are automatically cleaned up after 7 days (configurable), but you can delete them manually:

```bash
curl -X DELETE http://localhost:8000/videos/job_abc123.mp4
```

(Note: DELETE endpoint may need to be implemented in server)

---

## Examples

### Complete Workflow (Python)

```python
import requests
import time

def generate_video(prompt, image=None):
    """Complete video generation workflow"""

    # 1. Create job
    print(f"Creating job: {prompt}")
    response = requests.post('http://localhost:8000/v1/video/generations',
        json={
            'model': 'grok',
            'prompt': prompt,
            'image': image
        })

    if response.status_code != 201:
        raise Exception(f"Failed to create job: {response.text}")

    job = response.json()
    job_id = job['id']
    print(f"Job created: {job_id}")

    # 2. Poll for completion
    print("Waiting for completion...")
    while True:
        response = requests.get(f'http://localhost:8000/v1/video/generations/{job_id}')
        job = response.json()
        status = job['status']

        if status == 'completed':
            print(f"✓ Video completed: {job['video_url']}")
            break
        elif status == 'failed':
            raise Exception(f"✗ Job failed: {job.get('error', 'Unknown error')}")

        print(f"  Status: {status}...")
        time.sleep(5)

    # 3. Download video
    video_url = job['video_url']
    print(f"Downloading video...")
    response = requests.get(video_url)

    filename = f"{job_id}.mp4"
    with open(filename, 'wb') as f:
        f.write(response.content)

    print(f"✓ Video saved: {filename}")
    return filename

# Usage
video_file = generate_video("A cat playing piano in a cozy room")
```

### Complete Workflow (JavaScript)

```javascript
async function generateVideo(prompt, image = null) {
  // 1. Create job
  console.log(`Creating job: ${prompt}`);
  const createResponse = await fetch('http://localhost:8000/v1/video/generations', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({model: 'grok', prompt, image})
  });

  const job = await createResponse.json();
  const jobId = job.id;
  console.log(`Job created: ${jobId}`);

  // 2. Poll for completion
  console.log('Waiting for completion...');
  while (true) {
    const statusResponse = await fetch(`http://localhost:8000/v1/video/generations/${jobId}`);
    const jobStatus = await statusResponse.json();

    if (jobStatus.status === 'completed') {
      console.log(`✓ Video completed: ${jobStatus.video_url}`);
      return jobStatus.video_url;
    } else if (jobStatus.status === 'failed') {
      throw new Error(`✗ Job failed: ${jobStatus.error}`);
    }

    console.log(`  Status: ${jobStatus.status}...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Usage
generateVideo('A cat playing piano in a cozy room')
  .then(url => console.log(`Video URL: ${url}`))
  .catch(err => console.error(err));
```

---

## Limitations

1. **Sequential Processing** - Jobs are processed one at a time
2. **Local Only** - Designed for localhost, not production deployment
3. **No Authentication** - No API keys or user management
4. **Rate Limits** - Subject to Grok's service rate limits
5. **Browser Required** - Chrome with extension must be running
6. **Single Model** - Only supports Grok model

---

## Support

For additional help:
- See [SETUP.md](SETUP.md) for installation guidance
- Check [README.md](README.md) for system overview
- Review `docs/archive/` for implementation details

This is an unofficial tool not affiliated with xAI or Grok.
