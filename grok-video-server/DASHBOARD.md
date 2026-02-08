# Web Dashboard Guide

The Grok Imagine API Server includes a built-in web dashboard for monitoring and testing.

## Accessing the Dashboard

Once the server is running, open your browser and navigate to:

```
http://localhost:8000/
```

(Or whatever port you configured in `config.json`)

## Dashboard Features

### 📊 Statistics Overview

At the top of the dashboard, you'll see real-time statistics:
- **Total Jobs** - All jobs ever created
- **Pending** - Jobs waiting to be processed
- **Processing** - Jobs currently being worked on
- **Completed** - Successfully finished jobs
- **Failed** - Jobs that encountered errors

Statistics auto-refresh every 10 seconds.

### 📋 Jobs Tab

View and manage all video generation jobs:

**Features:**
- List of all jobs with status
- Job ID, prompt preview, creation time
- Download button for completed videos
- Refresh button to update the list
- Color-coded status badges

**Status Colors:**
- 🟨 Yellow - Pending
- 🔵 Blue - Processing
- 🟢 Green - Completed
- 🔴 Red - Failed

### 📝 Logs Tab

View recent request/response logs:

**Features:**
- Last 50 log entries (configurable)
- Color-coded by type (requests vs responses)
- JSON formatted for easy reading
- Refresh button to load latest logs
- Dark code editor style

**Note:** Base64 image data is automatically sanitized in logs to show only the data size, not the full content.

### 🧪 Test Tab

Test video generation directly from the browser:

**Features:**
1. **Prompt Input**
   - Enter your video generation prompt
   - Textarea with default example

2. **Image Upload** (Optional)
   - Click to select an image file
   - Preview shows before submission
   - Converts to base64 automatically

3. **Generate Button**
   - Submits job to API
   - Shows loading state
   - Creates job and starts monitoring

4. **Results Display**
   - Shows job ID and status
   - Auto-refreshes every 5 seconds
   - Displays video player when complete
   - Download button for finished videos

## Usage Examples

### Monitor Active Jobs

1. Go to **Jobs** tab
2. Click **Refresh** to see latest
3. Check status badges for progress
4. Download completed videos

### View Request Logs

1. Go to **Logs** tab
2. Click **Refresh** to load
3. Scroll through log entries
4. Check for errors or debug info

### Test Video Generation

1. Go to **Test** tab
2. Enter a prompt (or use default)
3. Optionally upload an image
4. Click **Generate Video**
5. Wait for processing (status auto-updates)
6. Watch or download when complete

## API Endpoints Used

The dashboard uses these API endpoints:

### Statistics & Jobs
```
GET /jobs
```
Returns all jobs with full details

### Logs
```
GET /api/logs?limit=50
```
Returns last 50 log entries (JSON)

### Video Generation
```
POST /v1/video/generations
{
  "model": "grok",
  "prompt": "Your prompt",
  "image": "data:image/png;base64,..." // optional
}
```

### Job Status
```
GET /v1/video/generations/{job_id}
```
Returns job status and video URL

### Video Download
```
GET /videos/{job_id}.mp4
```
Serves the video file

## Configuration

### Change Log Limit

Edit the dashboard HTML to change how many logs are displayed:

```javascript
// In dashboard.html
async function loadLogs() {
    const response = await fetch('/api/logs?limit=100'); // Change 50 to 100
    ...
}
```

### Change Auto-Refresh Interval

```javascript
// In dashboard.html, at bottom
setInterval(loadStats, 10000); // Change 10000 to desired milliseconds
```

### Styling

The dashboard uses inline CSS. To customize:
1. Edit `static/dashboard.html`
2. Modify the `<style>` section
3. Refresh browser (Ctrl+F5 for hard refresh)

## Troubleshooting

### Dashboard doesn't load
- Check server is running: `curl http://localhost:8000/health`
- Verify port is correct
- Check `static/dashboard.html` exists
- Look for errors in browser console (F12)

### Jobs not showing
- Click **Refresh** button
- Check browser console for fetch errors
- Verify API endpoint works: `curl http://localhost:8000/jobs`

### Logs empty
- Make sure some requests have been made
- Check log file exists: `grok-video-server/logs/requests_*.jsonl`
- Click **Refresh** button
- Check browser console for errors

### Test video generation fails
- Ensure Chrome extension is running
- Verify Grok tab is open
- Check extension shows "Connected"
- Look for error messages in test result
- Check browser console for details

### Video won't play
- Check video file exists: `ls grok-video-server/videos/`
- Try downloading instead of inline playback
- Some browsers may not support inline MP4
- Check video isn't corrupted

### Stats not updating
- Check browser console for errors
- Try manual refresh (Ctrl+F5)
- Verify server is responding: `/jobs` endpoint
- Check for CORS issues in console

## Browser Compatibility

Tested and working on:
- ✅ Chrome/Chromium (Recommended)
- ✅ Firefox
- ✅ Edge
- ✅ Safari

**Note:** Video playback depends on browser codec support.

## Security Notes

⚠️ **Important:**

The dashboard has **NO authentication**. It's designed for local development only.

**Do NOT expose to the internet without:**
- Adding authentication
- Implementing access controls
- Using HTTPS
- Rate limiting

For local use only!

## Tips

1. **Keep dashboard open** while processing jobs to see real-time updates

2. **Use the test tab** for quick experiments without writing code

3. **Check logs** if jobs are failing to debug issues

4. **Bookmark** the dashboard URL for quick access

5. **Refresh data** manually if auto-refresh seems slow

6. **Download videos** before they're auto-cleaned (7 days default)

7. **Use browser dev tools** (F12) for advanced debugging

## Screenshots

When you open the dashboard, you'll see:

- **Header** - Purple gradient with server status indicator
- **Stats Cards** - 5 cards showing job counts
- **Tabs** - Jobs, Logs, Test navigation
- **Content Area** - Changes based on selected tab

## Next Steps

- See **[GROK_VIDEO_SERVER.md](../GROK_VIDEO_SERVER.md)** for full API docs
- See **[CONFIG_GUIDE.md](../CONFIG_GUIDE.md)** for configuration options
- See **[SETUP_GUIDE.md](../SETUP_GUIDE.md)** for initial setup

---

**Enjoy your visual monitoring experience!** 📊🎬
