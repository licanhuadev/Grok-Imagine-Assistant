// Popup UI logic

const SERVER_URL = 'http://localhost:8000';

let connectionStatus;
let currentJobSection;
let currentJobId;
let currentJobMode;
let currentJobPrompt;
let currentJobStatus;
let progressFill;
let totalCompleted;
let totalFailed;
let historyList;
let startChatBtn;
let stopChatBtn;
let startVideoBtn;
let stopVideoBtn;
let chatWorkerStatus;
let videoWorkerStatus;
let cleanHistoryBtn;

document.addEventListener('DOMContentLoaded', async () => {
  connectionStatus = document.getElementById('connectionStatus');
  currentJobSection = document.getElementById('currentJobSection');
  currentJobId = document.getElementById('currentJobId');
  currentJobMode = document.getElementById('currentJobMode');
  currentJobPrompt = document.getElementById('currentJobPrompt');
  currentJobStatus = document.getElementById('currentJobStatus');
  progressFill = document.getElementById('progressFill');
  totalCompleted = document.getElementById('totalCompleted');
  totalFailed = document.getElementById('totalFailed');
  historyList = document.getElementById('historyList');
  startChatBtn = document.getElementById('startChatBtn');
  stopChatBtn = document.getElementById('stopChatBtn');
  startVideoBtn = document.getElementById('startVideoBtn');
  stopVideoBtn = document.getElementById('stopVideoBtn');
  chatWorkerStatus = document.getElementById('chatWorkerStatus');
  videoWorkerStatus = document.getElementById('videoWorkerStatus');
  cleanHistoryBtn = document.getElementById('cleanHistoryBtn');

  await loadData();

  startChatBtn.addEventListener('click', startChatWorker);
  stopChatBtn.addEventListener('click', stopChatWorker);
  startVideoBtn.addEventListener('click', startVideoWorker);
  stopVideoBtn.addEventListener('click', stopVideoWorker);
  cleanHistoryBtn.addEventListener('click', cleanHistory);

  await updateWorkerStatus();

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;
    loadData();
    if (changes.chatPollingEnabled || changes.videoPollingEnabled) {
      updateWorkerStatus();
    }
  });

  checkServerConnection();
  setInterval(checkServerConnection, 10000);
});

async function loadData() {
  const data = await chrome.storage.local.get([
    'currentJob',
    'stats',
    'history'
  ]);

  if (data.currentJob) {
    showCurrentJob(data.currentJob);
  } else {
    hideCurrentJob();
  }

  const stats = data.stats || { totalCompleted: 0, totalFailed: 0 };
  totalCompleted.textContent = stats.totalCompleted || 0;
  totalFailed.textContent = stats.totalFailed || 0;

  renderHistory(data.history || []);
}

async function checkServerConnection() {
  try {
    const response = await fetch(`${SERVER_URL}/`, { method: 'GET' });
    if (response.ok) {
      connectionStatus.className = 'status-indicator connected';
      connectionStatus.querySelector('.status-text').textContent = 'Connected';
    } else {
      connectionStatus.className = 'status-indicator disconnected';
      connectionStatus.querySelector('.status-text').textContent = 'Server Error';
    }
  } catch (error) {
    connectionStatus.className = 'status-indicator disconnected';
    connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
  }
}

function showCurrentJob(job) {
  currentJobSection.style.display = 'block';

  currentJobId.textContent = job.jobId || 'N/A';
  currentJobMode.textContent = `Mode: ${(job.mode || 'video').toUpperCase()}`;
  currentJobPrompt.textContent = job.prompt || 'No prompt';
  currentJobStatus.textContent = job.progressStatus || job.status || 'Processing...';

  const statusMap = {
    'processing': 15,
    'Initializing...': 10,
    'Initializing chat...': 10,
    'Navigating to imagine page...': 25,
    'Finding prompt input...': 20,
    'Uploading image...': 30,
    'Entering prompt...': 40,
    'Submitting request...': 50,
    'Waiting for video generation...': 70,
    'Downloading video...': 90,
    'Generating description (placeholder)...': 80,
    'Preparing for next job...': 95,
    'Completed!': 100
  };

  const progress = statusMap[job.progressStatus] || statusMap[job.status] || 50;
  progressFill.style.width = `${progress}%`;
}

function hideCurrentJob() {
  currentJobSection.style.display = 'none';
}

function renderHistory(history) {
  if (!history || history.length === 0) {
    historyList.innerHTML = '<div class="empty-state">No completed jobs yet</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'history-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Time</th>
        <th>Mode</th>
        <th>Status</th>
        <th>Job ID</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');

  history.forEach(item => {
    const row = document.createElement('tr');
    const status = item.status || (item.error ? 'failed' : 'completed');
    const statusClass = status === 'completed' ? 'status-success' : 'status-failed';
    const mode = (item.mode || 'video').toUpperCase();

    const idCell = item.videoUrl
      ? `<a href="${item.videoUrl}" target="_blank" title="${item.prompt || 'No prompt'}">${item.jobId || 'Unknown'}</a>`
      : `<span title="${item.prompt || 'No prompt'}">${item.jobId || 'Unknown'}</span>`;

    row.innerHTML = `
      <td class="history-time">${formatDetailedTime(item.completedAt || item.failedAt)}</td>
      <td>${mode}</td>
      <td><span class="status-badge ${statusClass}">${status === 'completed' ? '✓ Pass' : '✗ Fail'}</span></td>
      <td class="history-job-link">${idCell}</td>
    `;

    tbody.appendChild(row);
  });

  historyList.innerHTML = '';
  historyList.appendChild(table);
}

function formatDetailedTime(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${hours}:${minutes}`;
}

async function startChatWorker() {
  const response = await chrome.runtime.sendMessage({ type: 'START_CHAT_POLLING' });
  if (response?.success) await updateWorkerStatus();
}

async function stopChatWorker() {
  const response = await chrome.runtime.sendMessage({ type: 'STOP_CHAT_POLLING' });
  if (response?.success) await updateWorkerStatus();
}

async function startVideoWorker() {
  const response = await chrome.runtime.sendMessage({ type: 'START_VIDEO_POLLING' });
  if (response?.success) await updateWorkerStatus();
}

async function stopVideoWorker() {
  const response = await chrome.runtime.sendMessage({ type: 'STOP_VIDEO_POLLING' });
  if (response?.success) await updateWorkerStatus();
}

async function updateWorkerStatus() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_POLLING_STATE' });
  const isChatOn = !!response?.chatPollingEnabled;
  const isVideoOn = !!response?.videoPollingEnabled;

  if (isChatOn) {
    chatWorkerStatus.textContent = '✓ Chat worker is running';
    chatWorkerStatus.className = 'worker-status active';
  } else {
    chatWorkerStatus.textContent = '⏸ Chat worker is stopped';
    chatWorkerStatus.className = 'worker-status stopped';
  }

  if (isVideoOn) {
    videoWorkerStatus.textContent = '✓ Video worker is running';
    videoWorkerStatus.className = 'worker-status active';
  } else {
    videoWorkerStatus.textContent = '⏸ Video worker is stopped';
    videoWorkerStatus.className = 'worker-status stopped';
  }

  startChatBtn.disabled = isChatOn;
  stopChatBtn.disabled = !isChatOn;
  startVideoBtn.disabled = isVideoOn;
  stopVideoBtn.disabled = !isVideoOn;

  startChatBtn.style.opacity = isChatOn ? '0.5' : '1';
  stopChatBtn.style.opacity = isChatOn ? '1' : '0.5';
  startVideoBtn.style.opacity = isVideoOn ? '0.5' : '1';
  stopVideoBtn.style.opacity = isVideoOn ? '1' : '0.5';
}

async function cleanHistory() {
  const confirmed = confirm('Clear extension history?');
  if (!confirmed) return;

  await chrome.storage.local.set({ history: [] });
  await loadData();
}
