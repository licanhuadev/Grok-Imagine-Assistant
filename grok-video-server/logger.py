import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict
import config

# Setup log directory
LOG_DIR = Path(config.LOG_PATH)
LOG_DIR.mkdir(exist_ok=True)


class StructuredLogger:
    def __init__(self):
        self.log_dir = LOG_DIR

    def get_log_file(self) -> Path:
        """Get today's log file path"""
        date_str = datetime.now().strftime('%Y-%m-%d')
        return self.log_dir / f"requests_{date_str}.jsonl"

    def log_request(self, method: str, path: str, job_id: str = None, payload: Dict[str, Any] = None):
        """Log incoming request"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "type": "request",
            "method": method,
            "path": path,
        }

        if job_id:
            log_entry["job_id"] = job_id

        if payload:
            # Sanitize large base64 data
            log_entry["payload"] = self._sanitize_payload(payload)

        self._write_log(log_entry)

    def _sanitize_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Remove or truncate large base64 data from payload"""
        sanitized = payload.copy()

        if 'image' in sanitized and sanitized['image']:
            # If image is present, just log that it exists and its size
            image_data = sanitized['image']
            if isinstance(image_data, str) and len(image_data) > 100:
                sanitized['image'] = f"<base64_data:{len(image_data)}_chars>"

        return sanitized

    def log_response(self, job_id: str = None, status: str = None, duration: float = None,
                     video_size: int = None, error: str = None):
        """Log response"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "type": "response",
        }

        if job_id:
            log_entry["job_id"] = job_id
        if status:
            log_entry["status"] = status
        if duration is not None:
            log_entry["duration"] = duration
        if video_size:
            log_entry["video_size"] = video_size
        if error:
            log_entry["error"] = error

        self._write_log(log_entry)

    def _write_log(self, log_entry: Dict[str, Any]):
        """Write log entry to file"""
        try:
            log_file = self.get_log_file()
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
        except Exception as e:
            print(f"Failed to write log: {e}")


# Global logger instance
logger = StructuredLogger()
