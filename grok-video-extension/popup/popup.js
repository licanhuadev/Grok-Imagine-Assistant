// Popup UI logic

const SERVER_URL = 'http://localhost:8000';

// DOM elements
let connectionStatus;
let currentJobSection;
let currentJobId;
let currentJobPrompt;
let currentJobStatus;
let progressFill;
let totalCompleted;
let totalFailed;
let historyList;
let refreshBtn;
let resetBtn;
let startBtn;
let stopBtn;
let workerStatus;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  connectionStatus = document.getElementById('connectionStatus');
  currentJobSection = document.getElementById('currentJobSection');
  currentJobId = document.getElementById('currentJobId');
  currentJobPrompt = document.getElementById('currentJobPrompt');
  currentJobStatus = document.getElementById('currentJobStatus');
  progressFill = document.getElementById('progressFill');
  totalCompleted = document.getElementById('totalCompleted');
  totalFailed = document.getElementById('totalFailed');
  historyList = document.getElementById('historyList');
  refreshBtn = document.getElementById('refreshBtn');
  resetBtn = document.getElementById('resetBtn');
  startBtn = document.getElementById('startBtn');
  stopBtn = document.getElementById('stopBtn');
  workerStatus = document.getElementById('workerStatus');

  // Load data
  await loadData();

  // Event listeners
  refreshBtn.addEventListener('click', loadData);
  resetBtn.addEventListener('click', resetWorker);
  startBtn.addEventListener('click', startWorker);
  stopBtn.addEventListener('click', stopWorker);

  // Update worker status
  await updateWorkerStatus();

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      loadData();
      if (changes.isPollingEnabled) {
        updateWorkerStatus();
      }
    }
  });

  // Check server connection
  checkServerConnection();
  setInterval(checkServerConnection, 10000); // Check every 10 seconds
});

// Load data from storage
async function loadData() {
  const data = await chrome.storage.local.get([
    'currentJob',
    'stats',
    'history'
  ]);

  // Current job
  if (data.currentJob) {
    showCurrentJob(data.currentJob);
  } else {
    hideCurrentJob();
  }

  // Stats
  const stats = data.stats || { totalCompleted: 0, totalFailed: 0 };
  totalCompleted.textContent = stats.totalCompleted || 0;
  totalFailed.textContent = stats.totalFailed || 0;

  // History
  const history = data.history || [];
  renderHistory(history);
}

// Check server connection
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

// Show current job
function showCurrentJob(job) {
  currentJobSection.style.display = 'block';

  currentJobId.textContent = job.jobId || 'N/A';
  currentJobPrompt.textContent = job.prompt || 'No prompt';
  currentJobStatus.textContent = job.progressStatus || job.status || 'Processing...';

  // Update progress bar (simple animation)
  const statusMap = {
    'processing': 20,
    'Initializing...': 10,
    'Finding prompt input...': 20,
    'Uploading image...': 30,
    'Entering prompt...': 40,
    'Submitting request...': 50,
    'Waiting for video generation...': 70,
    'Downloading video...': 90,
    'Completed!': 100
  };

  const progress = statusMap[job.progressStatus] || statusMap[job.status] || 50;
  progressFill.style.width = `${progress}%`;
}

// Hide current job
function hideCurrentJob() {
  currentJobSection.style.display = 'none';
}

// Render history
function renderHistory(history) {
  if (!history || history.length === 0) {
    historyList.innerHTML = '<div class="empty-state">No completed jobs yet</div>';
    return;
  }

  // Create table
  const table = document.createElement('table');
  table.className = 'history-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Time</th>
        <th>Status</th>
        <th>Job ID</th>
      </tr>
    </thead>
    <tbody>
    </tbody>
  `;

  const tbody = table.querySelector('tbody');

  history.forEach(item => {
    const row = document.createElement('tr');
    const status = item.status || (item.error ? 'failed' : 'completed');
    const statusClass = status === 'completed' ? 'status-success' : 'status-failed';

    row.innerHTML = `
      <td class="history-time">${formatDetailedTime(item.completedAt || item.failedAt)}</td>
      <td><span class="status-badge ${statusClass}">${status === 'completed' ? '✓ Pass' : '✗ Fail'}</span></td>
      <td class="history-job-link">
        <a href="${item.videoUrl || `${SERVER_URL}/videos/${item.jobId}.mp4`}" target="_blank" title="${item.prompt || 'No prompt'}">
          ${item.jobId || 'Unknown'}
        </a>
      </td>
    `;

    tbody.appendChild(row);
  });

  historyList.innerHTML = '';
  historyList.appendChild(table);
}

// Format timestamp
function formatTime(timestamp) {
  if (!timestamp) return 'Unknown time';

  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  // Less than 1 minute
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }

  // Show date
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Format detailed time for history table (day/hh:mm)
function formatDetailedTime(timestamp) {
  if (!timestamp) return 'Unknown';

  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${hours}:${minutes}`;
}

// Reset worker (clear stuck job)
async function resetWorker() {
  if (!confirm('Are you sure you want to reset the worker? This will clear any stuck job.')) {
    return;
  }

  console.log('Resetting worker...');

  // Clear current job
  await chrome.storage.local.remove('currentJob');

  // Show feedback
  resetBtn.textContent = 'Worker Reset!';
  resetBtn.style.background = '#4CAF50';

  setTimeout(() => {
    resetBtn.textContent = 'Reset Worker (Clear Stuck Job)';
    resetBtn.style.background = '';
  }, 2000);

  // Reload data
  await loadData();

  console.log('Worker reset complete');
}

// Start worker
async function startWorker() {
  console.log('Starting worker...');

  // Send message to background to start polling
  const response = await chrome.runtime.sendMessage({ type: 'START_POLLING' });

  if (response.success) {
    console.log('Worker started');
    await updateWorkerStatus();
  }
}

// Stop worker
async function stopWorker() {
  console.log('Stopping worker...');

  // Send message to background to stop polling
  const response = await chrome.runtime.sendMessage({ type: 'STOP_POLLING' });

  if (response.success) {
    console.log('Worker stopped');
    await updateWorkerStatus();
  }
}

// Update worker status display
async function updateWorkerStatus() {
  // Get current polling state from background
  const response = await chrome.runtime.sendMessage({ type: 'GET_POLLING_STATE' });

  if (response.isPollingEnabled) {
    workerStatus.textContent = '✓ Worker is running - polling for jobs';
    workerStatus.className = 'worker-status active';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    startBtn.style.opacity = '0.5';
    stopBtn.style.opacity = '1';
  } else {
    workerStatus.textContent = '⏸ Worker is stopped - not polling';
    workerStatus.className = 'worker-status stopped';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    startBtn.style.opacity = '1';
    stopBtn.style.opacity = '0.5';
  }

  // Also update from storage
  const { isPollingEnabled } = await chrome.storage.local.get('isPollingEnabled');
  console.log('Worker polling enabled:', isPollingEnabled);
}

