# Grok Imagine Assistant - Chrome Extension

Chrome extension worker that automates Grok for both video generation and chat/vision jobs from the local API server.

## Features

- **Automated Video Generation**: Automates Grok.com to generate videos
- **Automated Chat/Vision Flow**: Handles image + context chat requests and extracts assistant response text
- **Dual Workers**: Separate Start/Stop controls for Chat and Video
- **Polling Worker**: Polls server for mode-specific jobs every 10 seconds
- **Job Queue Processing**: Processes jobs sequentially
- **Progress Tracking**: Real-time status updates in popup UI
- **History Management**: Keeps last 10 completed jobs
- **Statistics**: Tracks completed and failed jobs
- **History Cleanup**: One-click clean history in popup

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
   - Open https://grok.com (chat jobs)
   - Open https://grok.com/imagine (video jobs)
   - Log in if necessary
   - Keep tabs open while processing jobs

3. **Configure extension**:
   - Click the extension icon
   - Check connection status shows "Connected"

## Usage

### Automatic Mode

The extension has separate polling controls for each mode:

1. **Start Chat** - polls and processes chat/vision jobs
2. **Start Video** - polls and processes video jobs

When a job is available:
- Chat mode: upload images, insert text, submit, wait for response, extract markdown text, upload result to server
- Video mode: upload image (optional), enter prompt, generate video, download blob, upload video to server

### Monitor Progress

Click the extension icon to see:
- **Connection Status**: Server connectivity
- **Current Job**: Active job details and progress
- **Statistics**: Total completed and failed jobs
- **History**: Last 10 completed/failed jobs

### Clear History

- Click `Clean History` at the bottom of popup to clear extension-side history rows.

## Configuration

Update `config.json`:
- `extension.pollIntervalSeconds`
- `extension.videoTimeoutSeconds`
- `extension.chat.timeoutSeconds`
- `extension.chat.imageUploadDelayMs`

## Architecture

### Components

1. **Background Service Worker** (`background/service-worker.js`)
   - Polls server for jobs by mode
   - Manages job state
   - Uploads completed videos/chat responses
   - Handles errors

2. **Content Script** (`content/content.js`)
   - Automates Grok web UI for chat/video flows
   - Extracts chat response markdown text
   - Downloads generated videos
   - Reports progress

3. **Popup UI** (`popup/`)
   - Status display
   - Settings management
   - History viewer
   - Statistics

### Automation Flow

Video flow:
```
1. Receive video job → 2. Upload image (if any) → 3. Enter prompt
4. Submit → 5. Wait for video → 6. Download video → 7. Upload to server
```

Chat flow:
```
1. Receive chat job → 2. Upload images (if any) → 3. Enter context text
4. Submit → 5. Wait response complete → 6. Extract .response-content-markdown text
7. Upload chat content to server
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
1. **No Grok tab open**:
   - Open https://grok.com for chat jobs
   - Open https://grok.com/imagine for video jobs
2. **Not logged in**: Log in to Grok
3. **Rate limited**: Wait before sending more jobs
4. **Content moderation**: Prompt may violate policies

**Check error in:**
- Extension popup (if job fails)
- Browser console (F12 → Console)
- Extension background page (chrome://extensions/ → "Inspect views: service worker")

### Video not generated

**Check:**
- Grok imagine tab is open and loaded
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
  "currentJob": {
    "jobId": "job_123abc",
    "prompt": "A cat playing piano",
    "mode": "video",
    "status": "processing",
    "progressStatus": "Waiting...",
    "startedAt": 1675389721000
  },
  "history": [
    {
      "jobId": "job_123abc",
      "mode": "video",
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
2. **Tab Requirements**: Requires Grok tab(s) open for active modes
3. **Rate Limits**: Subject to Grok's rate limits
4. **Browser Open**: Requires Chrome running (not headless)
5. **In-flight Jobs**: Jobs can fail if extension/browser is reloaded

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
