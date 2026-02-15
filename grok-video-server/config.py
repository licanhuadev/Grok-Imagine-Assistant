import os
import json
from pathlib import Path

# Try to load shared config.json from extension directory
_config_data = {}
_config_path = Path(__file__).parent.parent / 'grok-video-extension' / 'config.json'

if _config_path.exists():
    try:
        with open(_config_path, 'r') as f:
            _config_data = json.load(f).get('server', {})
    except Exception as e:
        print(f"Warning: Could not load config.json: {e}")

# Configuration with priority: Environment Variables > config.json > Defaults
SERVER_HOST = os.getenv('SERVER_HOST', _config_data.get('host', '0.0.0.0'))
SERVER_PORT = int(os.getenv('SERVER_PORT', _config_data.get('port', 8000)))
VIDEO_STORAGE_PATH = os.getenv('VIDEO_STORAGE_PATH', _config_data.get('videoStoragePath', './videos'))
LOG_PATH = os.getenv('LOG_PATH', _config_data.get('logPath', './logs'))
DB_PATH = os.getenv('DB_PATH', _config_data.get('dbPath', './jobs.db'))
MAX_VIDEO_AGE_DAYS = int(os.getenv('MAX_VIDEO_AGE_DAYS', _config_data.get('maxVideoAgeDays', 7)))
JOB_TIMEOUT_SECONDS = int(os.getenv('JOB_TIMEOUT_SECONDS', _config_data.get('jobTimeoutSeconds', 300)))
CHAT_JOB_TIMEOUT_SECONDS = int(os.getenv('CHAT_JOB_TIMEOUT_SECONDS', _config_data.get('chatJobTimeoutSeconds', 60)))
CHAT_COMPLETION_WAIT_SECONDS = int(os.getenv('CHAT_COMPLETION_WAIT_SECONDS', _config_data.get('chatCompletionWaitSeconds', 60)))
