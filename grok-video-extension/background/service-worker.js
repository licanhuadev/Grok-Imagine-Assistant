// Background service worker for polling server and managing jobs

const SERVER_URL = 'http://localhost:8000';
let POLL_INTERVAL = 10000; // 10 seconds
let VIDEO_TIMEOUT_SECONDS = 300; // 5 minutes

let pollingInterval = null;
let isPollingEnabled = false;

// Load configuration from config.json
async function loadConfig() {
  try {
    const response = await fetch(chrome.runtime.getURL('config.json'));
    const config = await response.json();

    if (config.extension) {
      POLL_INTERVAL = (config.extension.pollIntervalSeconds || 10) * 1000;
      VIDEO_TIMEOUT_SECONDS = config.extension.videoTimeoutSeconds || 300;
    }

    console.log('Config loaded:', {
      serverUrl: SERVER_URL,
      pollInterval: POLL_INTERVAL,
      videoTimeout: VIDEO_TIMEOUT_SECONDS
    });
  } catch (error) {
    console.warn('Could not load config.json, using defaults:', error);
  }
}

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Grok Imagine Assistant installed');

  // Load config first
  await loadConfig();

  // Initialize stats
  const { stats } = await chrome.storage.local.get('stats');
  if (!stats) {
    await chrome.storage.local.set({
      stats: {
        totalCompleted: 0,
        totalFailed: 0
      }
    });
  }

  // Initialize polling state (default: stopped)
  const { isPollingEnabled: savedPollingState } = await chrome.storage.local.get('isPollingEnabled');
  if (savedPollingState === undefined) {
    await chrome.storage.local.set({ isPollingEnabled: false });
    isPollingEnabled = false;
  } else {
    isPollingEnabled = savedPollingState;
  }

  // Only start polling if enabled
  if (isPollingEnabled) {
    startPolling();
  }
});

// Start polling on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension started');
  await loadConfig();

  // Load polling state
  const { isPollingEnabled: savedPollingState } = await chrome.storage.local.get('isPollingEnabled');
  isPollingEnabled = savedPollingState !== false; // Default to true if not set

  if (isPollingEnabled) {
    startPolling();
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  // Open side panel for the current window
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// Start polling loop
function startPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  isPollingEnabled = true;
  pollingInterval = setInterval(pollServer, POLL_INTERVAL);
  console.log('Polling started');

  // Save state
  chrome.storage.local.set({ isPollingEnabled: true });

  // Poll immediately
  pollServer();
}

// Stop polling loop
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  isPollingEnabled = false;
  console.log('Polling stopped');

  // Save state
  chrome.storage.local.set({ isPollingEnabled: false });
}

// Poll server for jobs
async function pollServer() {
  try {
    // Check if polling is enabled
    if (!isPollingEnabled) {
      console.log('Polling is disabled, skipping poll');
      return;
    }

    // Check if already processing
    const { currentJob } = await chrome.storage.local.get('currentJob');
    if (currentJob && currentJob.status === 'processing') {
      // Check if job is stuck (processing for more than 5 minutes)
      const processingTime = Date.now() - (currentJob.startedAt || 0);
      const MAX_PROCESSING_TIME = 5 * 60 * 1000; // 5 minutes

      if (processingTime > MAX_PROCESSING_TIME) {
        console.warn('Job stuck in processing for', Math.floor(processingTime / 1000), 'seconds. Clearing...');
        await reportError(currentJob.jobId, 'Job timed out - stuck in processing state');
        await chrome.storage.local.remove('currentJob');

        // Update stats
        const { stats } = await chrome.storage.local.get('stats');
        stats.totalFailed = (stats.totalFailed || 0) + 1;
        await chrome.storage.local.set({ stats });
      } else {
        console.log('Already processing job, skipping poll. Time:', Math.floor(processingTime / 1000), 'seconds');
        return;
      }
    }

    // Poll server
    const response = await fetch(`${SERVER_URL}/extension/poll`);

    if (response.status === 204) {
      // No jobs available
      console.log('No jobs available');
      return;
    }

    if (!response.ok) {
      console.error('Poll failed:', response.status);
      return;
    }

    const job = await response.json();
    console.log('Received job:', job.job_id);

    // Store job and set status
    await chrome.storage.local.set({
      currentJob: {
        jobId: job.job_id,
        prompt: job.prompt,
        image: job.image,
        status: 'processing',
        startedAt: Date.now()
      }
    });

    // Find Grok tab
    const tabs = await chrome.tabs.query({ url: 'https://grok.com/imagine*' });

    if (tabs.length === 0) {
      console.error('No Grok tab open');
      await reportError(job.job_id, 'No Grok tab open. Please open https://grok.com in a tab.');
      await chrome.storage.local.remove('currentJob'); // Clear so we can try next job
      return;
    }

    // Send job to content script (include config values)
    try {
      await chrome.tabs.sendMessage(tabs[0].id, {
        type: 'START_JOB',
        job: {
          ...job,
          videoTimeoutSeconds: VIDEO_TIMEOUT_SECONDS
        }
      });
      console.log('Job sent to content script successfully');
    } catch (error) {
      console.error('Failed to send message to content script:', error);
      await reportError(job.job_id, 'Failed to communicate with Grok tab. Please refresh the page.');
      await chrome.storage.local.remove('currentJob'); // Clear so we can try next job
    }

  } catch (error) {
    console.error('Polling error:', error);
  }
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'JOB_COMPLETED') {
    console.log('Received JOB_COMPLETED message');
    console.log('Job ID:', message.jobId);
    console.log('Video type:', message.videoType);
    console.log('Video data type:', typeof message.videoData);
    console.log('Video data is Array:', Array.isArray(message.videoData));
    console.log('Video data length:', message.videoData?.length);

    // Convert Array back to Uint8Array then to Blob
    const uint8Array = new Uint8Array(message.videoData);
    console.log('✓ Converted to Uint8Array, length:', uint8Array.length);
    console.log('First 10 bytes:', Array.from(uint8Array.slice(0, 10)));

    const videoBlob = new Blob([uint8Array], { type: message.videoType });
    console.log('Created blob, size:', videoBlob.size);
    handleJobCompleted(message.jobId, videoBlob);
  } else if (message.type === 'JOB_FAILED') {
    handleJobFailed(message.jobId, message.error);
  } else if (message.type === 'UPDATE_STATUS') {
    updateJobStatus(message.status);
  } else if (message.type === 'START_POLLING') {
    startPolling();
    sendResponse({ success: true, isPollingEnabled: true });
  } else if (message.type === 'STOP_POLLING') {
    stopPolling();
    sendResponse({ success: true, isPollingEnabled: false });
  } else if (message.type === 'GET_POLLING_STATE') {
    sendResponse({ isPollingEnabled: isPollingEnabled });
  }
  return true; // Keep channel open for async response
});

// Handle job completion
async function handleJobCompleted(jobId, videoBlob) {
  console.log('Job completed:', jobId);
  console.log('Video blob size:', videoBlob.size, 'bytes');
  console.log('Video blob type:', videoBlob.type);

  try {
    // Validate blob
    if (!videoBlob || videoBlob.size === 0) {
      throw new Error('Invalid video blob - size is 0');
    }

    console.log('Uploading to server:', SERVER_URL);

    // Test: Read first few bytes of blob to verify it's not corrupted
    const testSlice = videoBlob.slice(0, 100);
    const testArray = new Uint8Array(await testSlice.arrayBuffer());
    console.log('First 10 bytes of video:', Array.from(testArray.slice(0, 10)));

    // Upload video to server
    const formData = new FormData();
    formData.append('job_id', jobId);
    formData.append('video', videoBlob, `${jobId}.mp4`);

    console.log('FormData created');
    console.log('FormData entries:');
    for (let pair of formData.entries()) {
      console.log('  -', pair[0], ':', typeof pair[1], pair[1] instanceof Blob ? `Blob (${pair[1].size} bytes)` : pair[1]);
    }
    console.log('Uploading...');

    const response = await fetch(`${SERVER_URL}/extension/complete`, {
      method: 'POST',
      body: formData
    });

    console.log('Upload response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upload failed:', errorText);
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✓ Video uploaded successfully:', result);

    // Update stats
    const { stats } = await chrome.storage.local.get('stats');
    stats.totalCompleted = (stats.totalCompleted || 0) + 1;
    await chrome.storage.local.set({ stats });

    // Add to history
    const { history = [] } = await chrome.storage.local.get('history');
    const { currentJob } = await chrome.storage.local.get('currentJob');

    history.unshift({
      jobId: jobId,
      prompt: currentJob?.prompt || '',
      videoUrl: `${SERVER_URL}/videos/${jobId}.mp4`,
      completedAt: Date.now()
    });

    // Keep only last 10 items
    if (history.length > 10) {
      history.splice(10);
    }

    await chrome.storage.local.set({ history });

    // Clear current job
    await chrome.storage.local.remove('currentJob');

  } catch (error) {
    console.error('Failed to upload video:', error);
    await reportError(jobId, `Failed to upload video: ${error.message}`);

    // Update stats
    const { stats } = await chrome.storage.local.get('stats');
    stats.totalFailed = (stats.totalFailed || 0) + 1;
    await chrome.storage.local.set({ stats });

    // IMPORTANT: Always clear current job even if upload fails
    await chrome.storage.local.remove('currentJob');
  }
}

// Handle job failure
async function handleJobFailed(jobId, error) {
  console.error('Job failed:', jobId, error);
  await reportError(jobId, error);

  // Update stats
  const { stats } = await chrome.storage.local.get('stats');
  stats.totalFailed = (stats.totalFailed || 0) + 1;
  await chrome.storage.local.set({ stats });

  // Add to history
  const { history = [] } = await chrome.storage.local.get('history');
  const { currentJob } = await chrome.storage.local.get('currentJob');

  history.unshift({
    jobId: jobId,
    prompt: currentJob?.prompt || '',
    status: 'failed',
    error: error,
    videoUrl: `${SERVER_URL}/videos/${jobId}.mp4`,
    failedAt: Date.now()
  });

  // Keep only last 10 items
  if (history.length > 10) {
    history.splice(10);
  }

  await chrome.storage.local.set({ history });

  // Clear current job
  await chrome.storage.local.remove('currentJob');
}

// Report error to server
async function reportError(jobId, error) {
  try {
    await fetch(`${SERVER_URL}/extension/error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        job_id: jobId,
        error: error
      })
    });
  } catch (err) {
    console.error('Failed to report error:', err);
  }
}

// Update job status in storage
async function updateJobStatus(status) {
  const { currentJob } = await chrome.storage.local.get('currentJob');
  if (currentJob) {
    currentJob.progressStatus = status;
    await chrome.storage.local.set({ currentJob });
  }
}
