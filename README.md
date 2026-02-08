# Grok Imagine Assistant

OpenAI-compatible API for automated video generation using Grok Imagine.

## What is This?

Grok Imagine Assistant is a complete system that exposes Grok's video generation capabilities through an OpenAI-compatible REST API. It consists of:

1. **Python Server** - FastAPI server with job queue management
2. **Chrome Extension** - Automated worker that controls Grok to generate videos

The extension runs in the background, polls the server for jobs, automates Grok's web interface to generate videos, and uploads them back to the server. This allows you to integrate Grok's video generation into your applications via simple API calls.

## Features

- **OpenAI-Compatible API** - Drop-in replacement for video generation workflows
- **Job Queue System** - Submit multiple jobs and process them sequentially
- **Image-to-Video** - Support for generating videos from images with prompts
- **Text-to-Video** - Generate videos from text prompts only
- **Automatic Retry** - Handles failures and timeouts gracefully
- **Real-time Status** - Track job progress through the extension UI
- **Local Storage** - All videos stored locally on your machine
- **No API Keys** - Uses your existing Grok account via browser automation

## Quick Example

```bash
# Start the server
cd grok-video-server
python server.py

# Create a video generation job
curl -X POST http://localhost:8000/v1/video/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"grok","prompt":"A cat playing piano"}'

# Response: {"id":"job_abc123","status":"pending",...}

# Download the completed video
curl -O http://localhost:8000/videos/job_abc123.mp4
```

## System Requirements

- **Python 3.8+** - For the API server
- **Google Chrome** - For the extension
- **Grok Account** - Free or paid account at grok.com

## Getting Started

See **[SETUP.md](SETUP.md)** for detailed installation and setup instructions.

For API documentation, see **[API.md](API.md)**.

## Architecture

```
Your Application
      ↓
  API Request (POST /v1/video/generations)
      ↓
Python Server (localhost:8000)
  - Creates job in queue
  - Returns job_id
      ↓
Chrome Extension polls server
  - Fetches next pending job
  - Automates Grok Imagine
  - Uploads video back to server
      ↓
Your Application polls status
  - Gets video_url when complete
  - Downloads video file
```

## How It Works

1. You submit a video generation request to the API server
2. Server creates a job and adds it to the queue
3. Chrome extension polls the server every 10 seconds
4. Extension automates Grok's web interface:
   - Navigates to grok.com/imagine
   - Uploads image (if provided)
   - Enters text prompt
   - Clicks generate button
   - Waits for video to complete
   - Downloads the video blob
5. Extension uploads video to server
6. You download the completed video from the server

## Project Structure

```
grok-imagine-loop/
├── grok-video-server/       # Python FastAPI server
│   ├── server.py            # Main server application
│   ├── config.py            # Configuration
│   ├── models.py            # Data models
│   ├── job_queue.py         # Job queue management
│   ├── storage.py           # File storage
│   └── requirements.txt     # Python dependencies
│
├── grok-video-extension/    # Chrome extension
│   ├── manifest.json        # Extension manifest
│   ├── background/          # Background service worker
│   ├── content/             # Content script (Grok automation)
│   ├── popup/               # Extension UI
│   └── config.json          # Extension configuration
│
├── README.md                # This file
├── SETUP.md                 # Setup guide
└── API.md                   # API documentation
```

## Use Cases

- **Batch video generation** - Generate multiple videos programmatically
- **Integration with existing apps** - Add video generation to your application
- **Automated workflows** - Create videos as part of automated pipelines
- **Testing and prototyping** - Quick video generation for testing
- **Content creation** - Generate videos from scripts or templates

## Limitations

- Requires Chrome browser to be running
- Rate limited by Grok's service
- Videos must be generated sequentially (one at a time)
- Requires active Grok.com session in browser
- Only works on localhost (not designed for remote deployment)

## Documentation

- **[SETUP.md](SETUP.md)** - Complete installation and setup guide
- **[API.md](API.md)** - Full API reference and examples
- **[docs/archive/](docs/archive/)** - Implementation notes and changelogs

## License

This project is for personal use and educational purposes. Please respect Grok's terms of service when using this tool.

## Support

This is an unofficial tool and is not affiliated with or endorsed by xAI or Grok.

For issues and questions, please check the documentation files or review the code comments.
