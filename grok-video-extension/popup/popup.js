// Popup UI logic

const SERVER_URL = 'http://localhost:8000';

let connectionStatus;
let currentJobSection;
let currentJobId;
let currentJobClient;
let currentJobMode;
let currentJobPrompt;
let currentJobStatus;
let progressFill;
let totalCompleted;
let totalFailed;
let historyList;
let toggleChatBtn;
let toggleVideoBtn;
let chatWorkerStatus;
let videoWorkerStatus;
let cleanHistoryBtn;

document.addEventListener('DOMContentLoaded', async () => {
  await chrome.runtime.sendMessage({ type: 'PANEL_OPEN' });

  connectionStatus = document.getElementById('connectionStatus');
  currentJobSection = document.getElementById('currentJobSection');
  currentJobId = document.getElementById('currentJobId');
  currentJobClient = document.getElementById('currentJobClient');
  currentJobMode = document.getElementById('currentJobMode');
  currentJobPrompt = document.getElementById('currentJobPrompt');
  currentJobStatus = document.getElementById('currentJobStatus');
  progressFill = document.getElementById('progressFill');
  totalCompleted = document.getElementById('totalCompleted');
  totalFailed = document.getElementById('totalFailed');
  historyList = document.getElementById('historyList');
  toggleChatBtn = document.getElementById('toggleChatBtn');
  toggleVideoBtn = document.getElementById('toggleVideoBtn');
  chatWorkerStatus = document.getElementById('chatWorkerStatus');
  videoWorkerStatus = document.getElementById('videoWorkerStatus');
  cleanHistoryBtn = document.getElementById('cleanHistoryBtn');

  await loadData();

  toggleChatBtn.addEventListener('click', toggleChatWorker);
  toggleVideoBtn.addEventListener('click', toggleVideoWorker);
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

window.addEventListener('beforeunload', () => {
  // Fire-and-forget: side panel closing should stop polling.
  chrome.runtime.sendMessage({ type: 'PANEL_CLOSED' }).catch(() => {});
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
  const { clientId } = await chrome.storage.local.get('clientId');
  const clientSuffix = clientId ? ` · Client ${clientId}` : '';

  try {
    const response = await fetch(`${SERVER_URL}/`, { method: 'GET' });
    if (response.ok) {
      connectionStatus.className = 'status-indicator connected';
      connectionStatus.querySelector('.status-text').textContent = `Connected${clientSuffix}`;
    } else {
      connectionStatus.className = 'status-indicator disconnected';
      connectionStatus.querySelector('.status-text').textContent = `Server Error${clientSuffix}`;
    }
  } catch (error) {
    connectionStatus.className = 'status-indicator disconnected';
    connectionStatus.querySelector('.status-text').textContent = `Disconnected${clientSuffix}`;
  }
}

function showCurrentJob(job) {
  currentJobSection.style.display = 'block';

  currentJobId.textContent = job.jobId || 'N/A';
  currentJobClient.textContent = `Client: ${job.clientId || '-----'}`;
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
        <th>Client</th>
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
      <td>${item.clientId || '-----'}</td>
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

async function toggleChatWorker() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_POLLING_STATE' });
  const nextMessageType = state?.chatPollingEnabled ? 'STOP_CHAT_POLLING' : 'START_CHAT_POLLING';
  const response = await chrome.runtime.sendMessage({ type: nextMessageType });
  if (response?.success) await updateWorkerStatus();
}

async function toggleVideoWorker() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_POLLING_STATE' });
  const nextMessageType = state?.videoPollingEnabled ? 'STOP_VIDEO_POLLING' : 'START_VIDEO_POLLING';
  const response = await chrome.runtime.sendMessage({ type: nextMessageType });
  if (response?.success) await updateWorkerStatus();
}

async function updateWorkerStatus() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_POLLING_STATE' });
  const isChatOn = !!response?.chatPollingEnabled;
  const isVideoOn = !!response?.videoPollingEnabled;

  if (isChatOn) {
    chatWorkerStatus.textContent = '✓ running';
    chatWorkerStatus.className = 'worker-status-inline active';
    toggleChatBtn.textContent = '⏸ Stop Chat';
    toggleChatBtn.className = 'btn btn-secondary';
  } else {
    chatWorkerStatus.textContent = '⏸ stopped';
    chatWorkerStatus.className = 'worker-status-inline stopped';
    toggleChatBtn.textContent = '▶ Start Chat';
    toggleChatBtn.className = 'btn btn-primary';
  }

  if (isVideoOn) {
    videoWorkerStatus.textContent = '✓ running';
    videoWorkerStatus.className = 'worker-status-inline active';
    toggleVideoBtn.textContent = '⏸ Stop Video';
    toggleVideoBtn.className = 'btn btn-secondary';
  } else {
    videoWorkerStatus.textContent = '⏸ stopped';
    videoWorkerStatus.className = 'worker-status-inline stopped';
    toggleVideoBtn.textContent = '▶ Start Video';
    toggleVideoBtn.className = 'btn btn-primary';
  }
}

async function cleanHistory() {
  const confirmed = confirm('Clear extension history and reset statistics?');
  if (!confirmed) return;

  await chrome.storage.local.set({
    history: [],
    stats: {
      totalCompleted: 0,
      totalFailed: 0
    }
  });
  await loadData();
}
