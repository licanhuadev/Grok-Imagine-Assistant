import aiofiles
from pathlib import Path
from typing import Optional
from datetime import datetime, timedelta
import config

# Setup video storage directory
VIDEO_DIR = Path(config.VIDEO_STORAGE_PATH)
VIDEO_DIR.mkdir(exist_ok=True)


class VideoStorage:
    def __init__(self):
        self.video_dir = VIDEO_DIR

    async def save_video(self, job_id: str, video_data: bytes) -> str:
        """
        Save video file to storage

        Args:
            job_id: Job ID
            video_data: Video file bytes

        Returns:
            Path to saved video file
        """
        video_path = self.video_dir / f"{job_id}.mp4"

        async with aiofiles.open(video_path, 'wb') as f:
            await f.write(video_data)

        return str(video_path)

    async def get_video_path(self, job_id: str) -> Optional[str]:
        """
        Get path to video file if it exists

        Args:
            job_id: Job ID

        Returns:
            Path to video file or None
        """
        video_path = self.video_dir / f"{job_id}.mp4"

        if video_path.exists():
            return str(video_path)

        return None

    def list_videos(self) -> list:
        """List all video files in storage"""
        return [f.name for f in self.video_dir.glob("*.mp4")]

    async def cleanup_old_videos(self, max_age_days: int = None):
        """
        Delete videos older than max_age_days

        Args:
            max_age_days: Maximum age in days (default from config)
        """
        if max_age_days is None:
            max_age_days = config.MAX_VIDEO_AGE_DAYS

        cutoff_date = datetime.now() - timedelta(days=max_age_days)

        for video_file in self.video_dir.glob("*.mp4"):
            file_time = datetime.fromtimestamp(video_file.stat().st_mtime)

            if file_time < cutoff_date:
                try:
                    video_file.unlink()
                    print(f"Deleted old video: {video_file.name}")
                except Exception as e:
                    print(f"Failed to delete {video_file.name}: {e}")


# Global storage instance
storage = VideoStorage()
