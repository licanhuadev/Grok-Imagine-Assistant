# Setup Guide - Grok Imagine Assistant

Complete step-by-step guide to install and run the Grok Imagine Assistant.

## Prerequisites

Before you begin, make sure you have:

- **Python 3.8+** - [Download Python](https://www.python.org/downloads/)
- **Google Chrome** - [Download Chrome](https://www.google.com/chrome/)
- **Grok Account** - Sign up at [grok.com](https://grok.com)

## Quick Start (5 Minutes)

If you're familiar with Python and Chrome extensions, here's the condensed version:

### 1. Start the Server

```bash
cd grok-video-server
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

Server runs at: `http://localhost:8000`

### 2. Load Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top-right)
3. Click "Load unpacked"
4. Select `grok-video-extension` folder

### 3. Open Grok

1. Open https://grok.com/imagine in Chrome
2. Log in to your account
3. Keep this tab open

### 4. Test It

```bash
curl -X POST http://localhost:8000/v1/video/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"grok","prompt":"A cat playing piano"}'
```

Done! Skip to [Testing](#testing-the-system) section.

---

## Detailed Setup

### Part 1: Python Server Setup

#### Step 1: Navigate to Server Directory

Open a terminal and navigate to the server directory:

```bash
cd grok-video-server
```

#### Step 2: Create Virtual Environment

Creating a virtual environment keeps dependencies isolated.

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**macOS/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

You should see `(venv)` in your terminal prompt, indicating the virtual environment is active.

#### Step 3: Install Dependencies

Install the required Python packages:

```bash
pip install -r requirements.txt
```

This installs:
- **FastAPI** - Modern web framework
- **Uvicorn** - ASGI server for FastAPI
- **Pydantic** - Data validation
- **aiosqlite** - Async SQLite database
- **python-multipart** - File upload support
- **aiofiles** - Async file I/O

#### Step 4: Start the Server

You can start the server using the provided scripts or manually:

**Windows:**
```bash
start_server.bat
```

**macOS/Linux:**
```bash
chmod +x start_server.sh  # Make script executable (first time only)
./start_server.sh
```

**Or manually:**
```bash
python server.py
```

**Expected output:**
```
Server starting on 0.0.0.0:8000
Video storage: ./videos
Database: ./jobs.db
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

#### Step 5: Verify Server

Open a new terminal (keep the server running) and test:

```bash
curl http://localhost:8000/
```

**Expected response:**
```json
{
  "status": "ok",
  "service": "Grok Imagine API",
  "version": "1.0.0"
}
```

✅ **Server is running successfully!**

---

### Part 2: Chrome Extension Setup

#### Step 1: Open Chrome Extensions Page

1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Or use menu: **Chrome Menu → Extensions → Manage Extensions**

#### Step 2: Enable Developer Mode

In the top-right corner of the extensions page, toggle on **"Developer mode"**.

This enables the "Load unpacked" button needed for development extensions.

#### Step 3: Load the Extension

1. Click the **"Load unpacked"** button
2. Navigate to and select the `grok-video-extension` folder
3. Click **"Select Folder"** (Windows) or **"Open"** (Mac)

The extension should now appear in your extensions list.

#### Step 4: Pin the Extension (Optional)

1. Click the puzzle piece icon in Chrome toolbar
2. Find "Grok Imagine Assistant"
3. Click the pin icon to keep it visible

#### Step 5: Open Extension Side Panel

Click the extension icon in Chrome toolbar. The side panel should open showing:

- **Header** with "Grok Imagine Assistant" title
- **Connection status** - Should show "Connected" (green dot)
- **Worker controls** - Start/Stop buttons
- **Statistics** - Completed and failed job counts

If status shows "Disconnected":
- Verify server is running at `http://localhost:8000`
- Check server logs for errors

✅ **Extension is installed and connected!**

---

### Part 3: Grok Setup

#### Step 1: Open Grok Imagine Page

1. Open a new Chrome tab
2. Navigate to: **https://grok.com/imagine**
3. Log in to your Grok account if not already logged in

**Important:** The extension only works on the Grok Imagine page (`grok.com/imagine`). It will not activate on other Grok pages.

#### Step 2: Keep Tab Open

The extension needs this tab to be open to process video generation jobs. You can:
- Keep the tab in the background
- Pin the tab to prevent accidental closure
- Use the tab normally (just keep it open)

✅ **Grok is ready!**

---

## Testing the System

Now let's test the complete workflow:

### Test 1: Simple Text-to-Video

Create a simple video generation job:

```bash
curl -X POST http://localhost:8000/v1/video/generations \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok",
    "prompt": "A cat playing piano in a cozy room"
  }'
```

**Expected response:**
```json
{
  "id": "job_abc123def456",
  "status": "pending",
  "model": "grok",
  "prompt": "A cat playing piano in a cozy room",
  "created_at": 1234567890
}
```

Save the `job_id` (e.g., `job_abc123def456`) for the next steps.

### Test 2: Check Extension

1. Click the extension icon to open the side panel
2. Click **"Start Worker"** if not already running
3. You should see:
   - Worker status: "Worker is running - polling for jobs"
   - Current Job section appears with your prompt
   - Status updates as job progresses

**Watch the Grok tab:**
- Extension automatically enters your prompt
- Clicks the generate button
- Waits for video to complete
- Downloads video automatically

### Test 3: Check Job Status

While the job is processing, you can check its status:

```bash
curl http://localhost:8000/v1/video/generations/job_abc123def456
```

**Possible statuses:**
- `pending` - Waiting for extension to pick up
- `processing` - Extension is working on it
- `completed` - Video is ready
- `failed` - Something went wrong

### Test 4: Download Video

Once status is `completed`, download the video:

```bash
# Download with original filename
curl -O http://localhost:8000/videos/job_abc123def456.mp4

# Or specify custom filename
curl -o my_cat_video.mp4 http://localhost:8000/videos/job_abc123def456.mp4
```

**Video location:** `grok-video-server/videos/job_abc123def456.mp4`

✅ **System is working!**

---

## Using with Images (Image-to-Video)

To generate a video from an image:

```bash
curl -X POST http://localhost:8000/v1/video/generations \
  -H "Content-Type: application/json" \
  -d '{
    "model": "grok",
    "prompt": "Make this image come to life with gentle movement",
    "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgA..."
  }'
```

The `image` field should contain a base64-encoded image with the data URL prefix:
- PNG: `data:image/png;base64,<base64-data>`
- JPEG: `data:image/jpeg;base64,<base64-data>`

**Example with Python:**
```python
import base64
import requests

# Read and encode image
with open('my_image.png', 'rb') as f:
    image_data = base64.b64encode(f.read()).decode('utf-8')
    image_url = f'data:image/png;base64,{image_data}'

# Create job
response = requests.post('http://localhost:8000/v1/video/generations',
    json={
        'model': 'grok',
        'prompt': 'Make this image come to life',
        'image': image_url
    })

print(response.json())
```

---

## Configuration

### Server Configuration

Edit `grok-video-server/config.json`:

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8000,
    "videoStoragePath": "./videos",
    "logPath": "./logs",
    "dbPath": "./jobs.db",
    "maxVideoAgeDays": 7,
    "jobTimeoutSeconds": 300
  }
}
```

### Extension Configuration

Edit `grok-video-extension/config.json`:

```json
{
  "extension": {
    "pollIntervalSeconds": 10,
    "videoTimeoutSeconds": 300
  }
}
```

**Note:** The server URL is hardcoded to `http://localhost:8000` in the extension for simplicity.

---

## Troubleshooting

### Server Issues

**Problem:** Server won't start
```bash
# Check Python version (must be 3.8+)
python --version

# Reinstall dependencies
pip install --upgrade -r requirements.txt

# Check for port conflicts
# Windows: netstat -ano | findstr :8000
# Mac/Linux: lsof -i :8000
```

**Problem:** Server shows errors about missing modules
```bash
# Make sure virtual environment is activated
# You should see (venv) in your prompt
source venv/bin/activate  # Mac/Linux
venv\Scripts\activate     # Windows

# Reinstall dependencies
pip install -r requirements.txt
```

**Problem:** Can't access server from browser
- Check firewall settings
- Try accessing `http://127.0.0.1:8000` instead of `localhost`
- Check server logs for errors

### Extension Issues

**Problem:** Extension shows "Disconnected"
- Verify server is running: `curl http://localhost:8000/`
- Check Chrome console for errors (F12 → Console tab)
- Try reloading extension: `chrome://extensions/` → Click reload icon

**Problem:** Jobs stuck in "pending"
- Make sure worker is started (click "Start Worker" button)
- Check that Grok tab is open at `grok.com/imagine`
- Check extension console logs:
  - Right-click extension icon → "Inspect popup" → Console tab
- Reload extension and try again

**Problem:** Jobs failing immediately
- Check Grok tab - are you logged in?
- Check browser console in Grok tab (F12)
- Try manually generating a video on Grok to verify your account works
- Check extension logs for specific error messages

**Problem:** "Rate limit" errors
- Grok has rate limits on video generation
- Wait a few minutes before submitting more jobs
- Extension will show rate limit message

**Problem:** Extension doesn't appear on Grok page
- Extension only runs on `https://grok.com/imagine*`
- Make sure you're on the Imagine page, not the chat page
- Try refreshing the Grok tab

### Video Generation Issues

**Problem:** Video download fails
- Check disk space in `grok-video-server/videos/` folder
- Check server logs for download errors
- Video may have been automatically cleaned up (default: 7 days old)

**Problem:** Generated video is corrupted
- Check server logs for upload errors
- Try generating a simpler prompt
- Check Grok tab for error messages

**Problem:** Video generation times out
- Default timeout is 5 minutes (300 seconds)
- Complex videos take longer
- Adjust timeout in `config.json` if needed

### General Tips

**Reset stuck worker:**
1. Open extension popup
2. Click "Reset Worker (Clear Stuck Job)"
3. Worker will clear current job and continue

**Check server logs:**
- Logs are in `grok-video-server/logs/` folder
- Server also outputs logs to terminal

**Check extension logs:**
- Background worker: `chrome://extensions/` → Details → "Inspect views: service worker"
- Content script: Open Grok tab → F12 → Console

**Reload everything:**
If things aren't working, try this sequence:
1. Stop server (Ctrl+C)
2. Reload extension (`chrome://extensions/` → reload icon)
3. Close and reopen Grok tab
4. Start server (`python server.py`)
5. Start worker in extension popup
6. Try test request again

---

## Next Steps

- Read **[API.md](API.md)** for complete API documentation
- Check `grok-video-server/test_client.py` for example usage
- Review extension popup for job history and statistics
- Explore the code to customize behavior

---

## Running in Background

### Keep Server Running

**Windows (Command Prompt):**
```bash
start /B python server.py > server.log 2>&1
```

**Mac/Linux (Terminal):**
```bash
nohup python server.py > server.log 2>&1 &
```

### Auto-start Extension

The extension automatically remembers its running state:
- If worker was running when Chrome closed, it restarts on Chrome startup
- You can close Chrome and restart without reconfiguring

---

## Uninstallation

### Remove Extension

1. Go to `chrome://extensions/`
2. Find "Grok Imagine Assistant"
3. Click "Remove"

### Remove Server

1. Stop server (Ctrl+C)
2. Delete `grok-video-server` folder
3. Or keep it for future use

### Clean Up Data

```bash
# Remove generated videos
rm -rf grok-video-server/videos/*

# Remove database
rm grok-video-server/jobs.db

# Remove logs
rm -rf grok-video-server/logs/*
```

---

## Support

For issues and questions:
- Check the troubleshooting section above
- Review code comments in source files
- Check `docs/archive/` for implementation notes

This is an unofficial tool not affiliated with xAI or Grok.
