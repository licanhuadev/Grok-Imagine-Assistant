# Grok Imagine Assistant

<div align="center">
  <a href="https://youtu.be/QXs4h_SYPOM">
    <img src="https://img.youtube.com/vi/QXs4h_SYPOM/maxresdefault.jpg" alt="Watch Demo" style="width:80%;">
  </a>
  <p><strong>👆 Click to watch demo video</strong></p>
</div>

OpenAI-compatible API for automated Grok video generation and Grok chat/vision (image-to-description) automation.

## What is This?

Grok Imagine Assistant is a complete system that exposes Grok capabilities through OpenAI-compatible REST endpoints. It consists of:

1. **Python Server** - FastAPI server with job queue management
2. **Chrome Extension** - Automated worker that controls Grok for video jobs and chat/vision jobs

The extension runs in the background, polls the server for jobs, automates Grok's web interface, and reports results back to the server. This allows simple API integration for both video workflows and image-based chat workflows.

## Features

- **OpenAI-Compatible API** - Drop-in replacement for video generation workflows
- **Chat/Vision Bridge** - OpenAI-style chat completion endpoint routed through Grok web automation
- **Job Queue System** - Submit multiple jobs and process them sequentially
- **Image-to-Video** - Support for generating videos from images with prompts
- **Text-to-Video** - Generate videos from text prompts only
- **Automatic Retry** - Handles failures and timeouts gracefully
- **Real-time Status** - Track job progress through the extension UI
- **Local Storage** - All videos stored locally on your machine
- **No API Keys** - Uses your existing Grok account session via browser automation

## Quick Example

```bash
# Start the server
cd grok-video-server
python server.py

# Create a video generation job
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"grok","prompt":"A cat playing piano"}'

# Create a chat/vision request (text + image URL/data URL)
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model":"grok-vision",
    "messages":[{"role":"user","content":[
      {"type":"text","text":"Describe this image"},
      {"type":"image_url","image_url":{"url":"data:image/png;base64,...."}}
    ]}]
  }'
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
  API Request (POST /v1/videos/generations or /v1/chat/completions)
      ↓
Python Server (localhost:8000)
  - Creates job in queue
  - Returns job_id
      ↓
Chrome Extension polls server by mode
  - Fetches next pending job
  - Runs video flow or chat flow
  - Uploads video or chat text back to server
      ↓
Your Application polls status
  - Gets video_url when complete
  - Downloads video file
```

## How It Works

1. You submit a video generation request or chat completion request
2. Server creates a job and adds it to the queue
3. Chrome extension polls the server every 10 seconds
4. Extension automates Grok web UI for the matching job type
5. Extension reports completion back to server
6. Client receives video URL (video) or assistant text (chat)

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
- **Image to description** - Use chat/vision endpoint for image analysis through Grok UI
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

## License

This project is for personal use and educational purposes. Please respect Grok's terms of service when using this tool.

## Support

This is an unofficial tool and is not affiliated with or endorsed by xAI or Grok.

For issues and questions, please check the documentation files or review the code comments.
