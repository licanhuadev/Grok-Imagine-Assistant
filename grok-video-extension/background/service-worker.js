// Background service worker for polling server and managing chat/video jobs

const SERVER_URL = 'http://localhost:8000';
let POLL_INTERVAL = 10000; // 10 seconds
let VIDEO_TIMEOUT_SECONDS = 300; // 5 minutes
let CHAT_TIMEOUT_SECONDS = 60; // 1 minute
let CHAT_IMAGE_UPLOAD_DELAY_MS = 5000;

let pollingInterval = null;
let chatPollingEnabled = false;
let videoPollingEnabled = false;
const cancelledJobIds = new Set();

async function initializeRuntimeState() {
  await loadConfig();
  await loadPollingState();
  if (isAnyPollingEnabled() && !pollingInterval) {
    startPollingLoop();
  }
}

// Load configuration from config.json
async function loadConfig() {
  try {
    const response = await fetch(chrome.runtime.getURL('config.json'));
    const config = await response.json();

    if (config.extension) {
      POLL_INTERVAL = (config.extension.pollIntervalSeconds || 10) * 1000;
      VIDEO_TIMEOUT_SECONDS = config.extension.videoTimeoutSeconds || 300;
      CHAT_TIMEOUT_SECONDS = config.extension.chat?.timeoutSeconds || 60;
      CHAT_IMAGE_UPLOAD_DELAY_MS = config.extension.chat?.imageUploadDelayMs || 5000;
    }

    console.log('Config loaded:', {
      serverUrl: SERVER_URL,
      pollInterval: POLL_INTERVAL,
      videoTimeout: VIDEO_TIMEOUT_SECONDS,
      chatTimeout: CHAT_TIMEOUT_SECONDS,
      chatImageUploadDelayMs: CHAT_IMAGE_UPLOAD_DELAY_MS
    });
  } catch (error) {
    console.warn('Could not load config.json, using defaults:', error);
  }
}

async function loadPollingState() {
  const state = await chrome.storage.local.get(['chatPollingEnabled', 'videoPollingEnabled']);
  chatPollingEnabled = !!state.chatPollingEnabled;
  videoPollingEnabled = !!state.videoPollingEnabled;
}

async function savePollingState() {
  await chrome.storage.local.set({
    chatPollingEnabled,
    videoPollingEnabled
  });
}

function isAnyPollingEnabled() {
  return chatPollingEnabled || videoPollingEnabled;
}

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Grok Imagine Assistant installed');

  await loadConfig();

  const { stats } = await chrome.storage.local.get('stats');
  if (!stats) {
    await chrome.storage.local.set({
      stats: {
        totalCompleted: 0,
        totalFailed: 0
      }
    });
  }

  await loadPollingState();
  if (isAnyPollingEnabled()) {
    startPollingLoop();
  }
});

// Start polling on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension started');
  await loadConfig();
  await loadPollingState();

  if (isAnyPollingEnabled()) {
    startPollingLoop();
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

initializeRuntimeState();

function startPollingLoop() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  pollingInterval = setInterval(pollServer, POLL_INTERVAL);
  console.log('Polling loop started');
  pollServer();
}

function stopPollingLoopIfIdle() {
  if (!isAnyPollingEnabled() && pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('Polling loop stopped (all modes disabled)');
  }
}

async function setChatPolling(enabled) {
  chatPollingEnabled = enabled;
  if (!enabled) {
    await cancelCurrentJobForMode('chat');
  }
  await savePollingState();
  if (enabled) {
    startPollingLoop();
  } else {
    stopPollingLoopIfIdle();
  }
}

async function setVideoPolling(enabled) {
  videoPollingEnabled = enabled;
  if (!enabled) {
    await cancelCurrentJobForMode('video');
  }
  await savePollingState();
  if (enabled) {
    startPollingLoop();
  } else {
    stopPollingLoopIfIdle();
  }
}

async function cancelCurrentJobForMode(mode) {
  const { currentJob } = await chrome.storage.local.get('currentJob');
  if (!currentJob || currentJob.status !== 'processing' || currentJob.mode !== mode) {
    return;
  }

  const reason = `Cancelled by user (${mode} worker stopped)`;
  console.log(`Cancelling current ${mode} job:`, currentJob.jobId);
  cancelledJobIds.add(currentJob.jobId);
  await handleJobFailed(currentJob.jobId, reason);
}

// Check if content script is ready with retries
async function ensureContentScriptReady(tabId, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (response && response.ready) {
        console.log('✓ Content script is ready');
        return true;
      }
    } catch (error) {
      console.log(`Content script not ready, attempt ${i + 1}/${maxRetries}...`);

      if (i === 0) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content/content.js']
          });
          console.log('Manually injected content script');
        } catch (injectError) {
          console.log('Could not inject content script:', injectError.message);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
    }
  }

  console.error('✗ Content script not ready after retries');
  return false;
}

async function pollServerForMode(mode) {
  const response = await fetch(`${SERVER_URL}/extension/poll?mode=${mode}`);

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    console.error(`Poll failed for mode=${mode}:`, response.status);
    return null;
  }

  return response.json();
}

async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return false;
}

async function getTargetGrokTabForJob(jobType) {
  if (jobType === 'chat') {
    const tabs = await chrome.tabs.query({ url: 'https://grok.com/*' });
    if (tabs.length === 0) {
      throw new Error('No Grok tab open. Please open https://grok.com/ in a tab.');
    }

    const tab = tabs[0];
    const targetUrl = 'https://grok.com/';
    if (tab.url !== targetUrl) {
      await chrome.tabs.update(tab.id, { url: targetUrl });
      const loaded = await waitForTabComplete(tab.id);
      if (!loaded) {
        throw new Error('Timed out waiting for https://grok.com/ to load.');
      }
    }
    return tab.id;
  }

  const tabs = await chrome.tabs.query({ url: 'https://grok.com/imagine*' });
  if (tabs.length === 0) {
    throw new Error('No Grok tab open. Please open https://grok.com/imagine in a tab.');
  }
  return tabs[0].id;
}

// Poll server for jobs
async function pollServer() {
  try {
    if (!isAnyPollingEnabled()) {
      return;
    }

    const { currentJob } = await chrome.storage.local.get('currentJob');
    if (currentJob && currentJob.status === 'processing') {
      const processingTime = Date.now() - (currentJob.startedAt || 0);
      const maxProcessingTime = ((currentJob.timeoutSeconds || VIDEO_TIMEOUT_SECONDS) + 60) * 1000;

      if (processingTime > maxProcessingTime) {
        console.warn('Job stuck in processing. Clearing:', currentJob.jobId);
        await reportError(currentJob.jobId, 'Job timed out - stuck in processing state');
        await chrome.storage.local.remove('currentJob');

        const { stats } = await chrome.storage.local.get('stats');
        stats.totalFailed = (stats.totalFailed || 0) + 1;
        await chrome.storage.local.set({ stats });
      } else {
        return;
      }
    }

    const modes = [];
    if (videoPollingEnabled) modes.push('video');
    if (chatPollingEnabled) modes.push('chat');
    if (modes.length === 0) return;

    let job = null;
    for (const mode of modes) {
      job = await pollServerForMode(mode);
      if (job) break;
    }

    if (!job) {
      return;
    }

    await chrome.storage.local.set({
      currentJob: {
        jobId: job.job_id,
        prompt: job.prompt,
        image: job.image,
        mode: job.job_type || 'video',
        status: 'processing',
        startedAt: Date.now(),
        timeoutSeconds: job.job_type === 'chat' ? CHAT_TIMEOUT_SECONDS : VIDEO_TIMEOUT_SECONDS
      }
    });

    let tabId;
    try {
      tabId = await getTargetGrokTabForJob(job.job_type || 'video');
    } catch (tabError) {
      await reportError(job.job_id, tabError.message);
      await chrome.storage.local.remove('currentJob');
      return;
    }

    const isReady = await ensureContentScriptReady(tabId);
    if (!isReady) {
      await reportError(job.job_id, 'Content script not loaded. Please refresh the Grok tab and try again.');
      await chrome.storage.local.remove('currentJob');
      return;
    }

    try {
      if (job.job_type === 'chat') {
        const chatConfig = {
          timeoutSeconds: CHAT_TIMEOUT_SECONDS,
          imageUploadDelayMs: CHAT_IMAGE_UPLOAD_DELAY_MS
        };
        console.log('Sending START_CHAT_JOB with chatConfig:', chatConfig);
        await chrome.tabs.sendMessage(tabId, {
          type: 'START_CHAT_JOB',
          job: {
            ...job,
            mode: 'chat',
            chatConfig
          }
        });
      } else {
        await chrome.tabs.sendMessage(tabId, {
          type: 'START_JOB',
          job: {
            ...job,
            mode: 'video',
            videoTimeoutSeconds: VIDEO_TIMEOUT_SECONDS
          }
        });
      }
      console.log('Job sent to content script successfully:', job.job_id, job.job_type);
    } catch (error) {
      console.error('Failed to send message to content script:', error);
      await reportError(job.job_id, 'Failed to communicate with Grok tab. Please refresh the page.');
      await chrome.storage.local.remove('currentJob');
    }
  } catch (error) {
    console.error('Polling error:', error);
  }
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'JOB_COMPLETED') {
    if (cancelledJobIds.has(message.jobId)) {
      console.log('Ignoring JOB_COMPLETED for cancelled job:', message.jobId);
      cancelledJobIds.delete(message.jobId);
      return true;
    }
    const uint8Array = new Uint8Array(message.videoData);
    const videoBlob = new Blob([uint8Array], { type: message.videoType });
    handleVideoJobCompleted(message.jobId, videoBlob);
  } else if (message.type === 'JOB_CHAT_COMPLETED') {
    if (cancelledJobIds.has(message.jobId)) {
      console.log('Ignoring JOB_CHAT_COMPLETED for cancelled job:', message.jobId);
      cancelledJobIds.delete(message.jobId);
      return true;
    }
    handleChatJobCompleted(message.jobId, message.content || '');
  } else if (message.type === 'JOB_FAILED') {
    if (cancelledJobIds.has(message.jobId)) {
      console.log('Ignoring JOB_FAILED for already-cancelled job:', message.jobId);
      cancelledJobIds.delete(message.jobId);
      return true;
    }
    handleJobFailed(message.jobId, message.error);
  } else if (message.type === 'UPDATE_STATUS') {
    updateJobStatus(message.status);
  } else if (message.type === 'START_CHAT_POLLING') {
    setChatPolling(true).then(() => sendResponse({ success: true, chatPollingEnabled, videoPollingEnabled }));
  } else if (message.type === 'STOP_CHAT_POLLING') {
    setChatPolling(false).then(() => sendResponse({ success: true, chatPollingEnabled, videoPollingEnabled }));
  } else if (message.type === 'START_VIDEO_POLLING') {
    setVideoPolling(true).then(() => sendResponse({ success: true, chatPollingEnabled, videoPollingEnabled }));
  } else if (message.type === 'STOP_VIDEO_POLLING') {
    setVideoPolling(false).then(() => sendResponse({ success: true, chatPollingEnabled, videoPollingEnabled }));
  } else if (message.type === 'GET_POLLING_STATE') {
    sendResponse({ chatPollingEnabled, videoPollingEnabled });
  }
  return true;
});

async function handleVideoJobCompleted(jobId, videoBlob) {
  try {
    if (!videoBlob || videoBlob.size === 0) {
      throw new Error('Invalid video blob - size is 0');
    }

    const formData = new FormData();
    formData.append('job_id', jobId);
    formData.append('video', videoBlob, `${jobId}.mp4`);

    const response = await fetch(`${SERVER_URL}/extension/complete`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }

    const { stats } = await chrome.storage.local.get('stats');
    stats.totalCompleted = (stats.totalCompleted || 0) + 1;
    await chrome.storage.local.set({ stats });

    const { history = [] } = await chrome.storage.local.get('history');
    const { currentJob } = await chrome.storage.local.get('currentJob');

    history.unshift({
      jobId: jobId,
      mode: 'video',
      prompt: currentJob?.prompt || '',
      videoUrl: `${SERVER_URL}/videos/${jobId}.mp4`,
      completedAt: Date.now()
    });

    if (history.length > 10) {
      history.splice(10);
    }

    await chrome.storage.local.set({ history });
    await chrome.storage.local.remove('currentJob');
  } catch (error) {
    await reportError(jobId, `Failed to upload video: ${error.message}`);

    const { stats } = await chrome.storage.local.get('stats');
    stats.totalFailed = (stats.totalFailed || 0) + 1;
    await chrome.storage.local.set({ stats });

    await chrome.storage.local.remove('currentJob');
  }
}

async function handleChatJobCompleted(jobId, content) {
  try {
    const response = await fetch(`${SERVER_URL}/extension/complete/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        content
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat completion upload failed: ${response.status} - ${errorText}`);
    }

    const { stats } = await chrome.storage.local.get('stats');
    stats.totalCompleted = (stats.totalCompleted || 0) + 1;
    await chrome.storage.local.set({ stats });

    const { history = [] } = await chrome.storage.local.get('history');
    const { currentJob } = await chrome.storage.local.get('currentJob');

    history.unshift({
      jobId: jobId,
      mode: 'chat',
      prompt: currentJob?.prompt || '',
      textResponse: content,
      completedAt: Date.now()
    });

    if (history.length > 10) {
      history.splice(10);
    }

    await chrome.storage.local.set({ history });
    await chrome.storage.local.remove('currentJob');
  } catch (error) {
    await reportError(jobId, `Failed to complete chat job: ${error.message}`);

    const { stats } = await chrome.storage.local.get('stats');
    stats.totalFailed = (stats.totalFailed || 0) + 1;
    await chrome.storage.local.set({ stats });

    await chrome.storage.local.remove('currentJob');
  }
}

async function handleJobFailed(jobId, error) {
  await reportError(jobId, error);

  const { stats } = await chrome.storage.local.get('stats');
  stats.totalFailed = (stats.totalFailed || 0) + 1;
  await chrome.storage.local.set({ stats });

  const { history = [] } = await chrome.storage.local.get('history');
  const { currentJob } = await chrome.storage.local.get('currentJob');

  history.unshift({
    jobId: jobId,
    mode: currentJob?.mode || 'video',
    prompt: currentJob?.prompt || '',
    status: 'failed',
    error: error,
    failedAt: Date.now()
  });

  if (history.length > 10) {
    history.splice(10);
  }

  await chrome.storage.local.set({ history });
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
