# Grok Imagine Assistant - Chrome Extension

Chrome extension that automates Grok Imagine video generation and acts as a worker for the Grok Imagine API server.

## Features

- **Automated Video Generation**: Automates Grok.com to generate videos
- **Polling Worker**: Polls server for jobs every 10 seconds
- **Job Queue Processing**: Processes jobs sequentially
- **Progress Tracking**: Real-time status updates in popup UI
- **History Management**: Keeps last 10 completed jobs
- **Statistics**: Tracks completed and failed jobs
- **Configurable Server**: Change server URL in settings

## Installation

### Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `grok-video-extension` folder
5. The extension icon should appear in your toolbar

### Create Icons (Optional)

The extension needs icons. See `icons/README.md` for instructions on creating them.

For testing, the extension will work with default Chrome icons.

## Setup

1. **Start the server**:
   ```bash
   cd grok-video-server
   python server.py
   ```

2. **Open Grok**:
   - Navigate to https://grok.com in a Chrome tab
   - Log in if necessary
   - Keep this tab open while processing jobs

3. **Configure extension**:
   - Click the extension icon
   - Verify server URL is correct (default: `http://localhost:8000`)
   - Check connection status shows "Connected"

## Usage

### Automatic Mode

The extension automatically polls the server every 10 seconds. When a job is available:

1. Extension fetches the job
2. Automates Grok to generate the video
3. Downloads the generated video
4. Uploads the video to the server
5. Updates job status
6. Moves to the next job

### Monitor Progress

Click the extension icon to see:
- **Connection Status**: Server connectivity
- **Current Job**: Active job details and progress
- **Statistics**: Total completed and failed jobs
- **History**: Last 10 completed jobs with video previews

### View History

- Click on any history item to expand and play the video
- Videos are streamed from the server

## Configuration

### Server URL

Change the server URL in the popup settings:
1. Click extension icon
2. Enter new server URL (e.g., `http://192.168.1.100:8000`)
3. Click "Save"
4. Connection status will update automatically

### Polling Interval

Currently fixed at 10 seconds. To change, edit `background/service-worker.js`:
```javascript
const POLL_INTERVAL = 10000; // Change this value (in milliseconds)
```

## Architecture

### Components

1. **Background Service Worker** (`background/service-worker.js`)
   - Polls server for jobs
   - Manages job state
   - Uploads completed videos
   - Handles errors

2. **Content Script** (`content/content.js`)
   - Automates Grok interface
   - Handles video generation flow
   - Downloads generated videos
   - Reports progress

3. **Popup UI** (`popup/`)
   - Status display
   - Settings management
   - History viewer
   - Statistics

### Automation Flow

```
1. Receive job → 2. Upload image (if any) → 3. Enter prompt
    ↓
4. Click submit → 5. Wait for generation → 6. Download video
    ↓
7. Upload to server → 8. Update history → 9. Get next job
```

## Troubleshooting

### Extension not polling

**Check:**
- Server is running and accessible
- Extension has correct server URL
- Connection status shows "Connected"

**Fix:**
- Click "Refresh" in popup
- Reload extension in `chrome://extensions/`
- Check browser console for errors

### Job fails to process

**Common issues:**
1. **No Grok tab open**: Open https://grok.com in a tab
2. **Not logged in**: Log in to Grok
3. **Rate limited**: Wait before sending more jobs
4. **Content moderation**: Prompt may violate policies

**Check error in:**
- Extension popup (if job fails)
- Browser console (F12 → Console)
- Extension background page (chrome://extensions/ → "Inspect views: service worker")

### Video not generated

**Check:**
- Grok tab is visible (not minimized/background)
- Grok interface is responsive
- No error messages on Grok page
- Browser has permission to access Grok.com

**Fix:**
- Refresh Grok tab
- Clear browser cache
- Check Grok is not in maintenance mode

### Upload fails

**Check:**
- Server is still running
- Network connection is stable
- Server has disk space for videos

**Fix:**
- Restart server
- Check server logs
- Verify video file was created locally

## Development

### Debugging

**Background Worker:**
```
1. Go to chrome://extensions/
2. Find extension
3. Click "Inspect views: service worker"
4. Console opens for background script
```

**Content Script:**
```
1. Open Grok tab
2. Press F12 (Developer Tools)
3. Go to Console tab
4. Look for messages from content script
```

**Popup:**
```
1. Right-click extension icon
2. Select "Inspect popup"
3. Console opens for popup
```

### Modify Automation

Edit `content/content.js` to adjust:
- Element selectors (if Grok UI changes)
- Wait times
- Retry logic
- Error handling

### Change UI

Edit `popup/` files:
- `popup.html` - Structure
- `popup.css` - Styling
- `popup.js` - Logic

## Storage Schema

The extension uses `chrome.storage.local`:

```javascript
{
  "serverUrl": "http://localhost:8000",
  "currentJob": {
    "jobId": "job_123abc",
    "prompt": "A cat playing piano",
    "image": null,
    "status": "processing",
    "progressStatus": "Waiting for video generation...",
    "startedAt": 1675389721000
  },
  "history": [
    {
      "jobId": "job_123abc",
      "prompt": "A cat playing piano",
      "videoUrl": "http://localhost:8000/videos/job_123abc.mp4",
      "completedAt": 1675389821000
    }
  ],
  "stats": {
    "totalCompleted": 42,
    "totalFailed": 3
  }
}
```

## Permissions

The extension requires:
- `storage` - Store settings and history
- `tabs` - Find and communicate with Grok tab
- `scripting` - Inject content script
- `https://grok.com/*` - Access Grok website
- `http://localhost:8000/*` - Communicate with server

## Known Limitations

1. **Sequential Processing**: Only one job at a time
2. **Single Tab**: Requires one Grok tab open
3. **Rate Limits**: Subject to Grok's rate limits
4. **Browser Open**: Requires Chrome running (not headless)
5. **No Persistence**: Jobs reset if extension reloads

## Future Improvements

- [ ] Concurrent job processing (multiple tabs)
- [ ] Configurable polling interval in UI
- [ ] Retry failed jobs automatically
- [ ] Export history as JSON
- [ ] Dark mode theme
- [ ] Job priority queue
- [ ] Notification on job completion
- [ ] Pause/resume functionality

## License

MIT
