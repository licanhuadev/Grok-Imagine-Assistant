import aiosqlite
import uuid
from datetime import datetime
from typing import Optional, List
from models import JobStatus
import config


class Job:
    def __init__(self, job_id: str, prompt: str, image: Optional[str] = None,
                 status: str = JobStatus.PENDING, created_at: int = None,
                 completed_at: Optional[int] = None, video_path: Optional[str] = None,
                 error: Optional[str] = None):
        self.job_id = job_id
        self.prompt = prompt
        self.image = image
        self.status = status
        self.created_at = created_at or int(datetime.now().timestamp())
        self.completed_at = completed_at
        self.video_path = video_path
        self.error = error

    def to_dict(self):
        return {
            'job_id': self.job_id,
            'prompt': self.prompt,
            'image': self.image,
            'status': self.status,
            'created_at': self.created_at,
            'completed_at': self.completed_at,
            'video_path': self.video_path,
            'error': self.error
        }


class JobQueue:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or config.DB_PATH

    async def init_db(self):
        """Initialize database and create tables"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    prompt TEXT NOT NULL,
                    image TEXT,
                    status TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    completed_at INTEGER,
                    video_path TEXT,
                    error TEXT
                )
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_status ON jobs(status)
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_created_at ON jobs(created_at)
            """)
            await db.commit()

    async def create_job(self, prompt: str, image: Optional[str] = None) -> Job:
        """Create a new job"""
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        job = Job(job_id=job_id, prompt=prompt, image=image)

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO jobs (job_id, prompt, image, status, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (job.job_id, job.prompt, job.image, job.status, job.created_at))
            await db.commit()

        return job

    async def get_job(self, job_id: str) -> Optional[Job]:
        """Get job by ID"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("""
                SELECT * FROM jobs WHERE job_id = ?
            """, (job_id,)) as cursor:
                row = await cursor.fetchone()

                if row:
                    return Job(
                        job_id=row['job_id'],
                        prompt=row['prompt'],
                        image=row['image'],
                        status=row['status'],
                        created_at=row['created_at'],
                        completed_at=row['completed_at'],
                        video_path=row['video_path'],
                        error=row['error']
                    )

        return None

    async def get_next_pending_job(self) -> Optional[Job]:
        """Get next pending job from queue"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("""
                SELECT * FROM jobs
                WHERE status = ?
                ORDER BY created_at ASC
                LIMIT 1
            """, (JobStatus.PENDING,)) as cursor:
                row = await cursor.fetchone()

                if row:
                    return Job(
                        job_id=row['job_id'],
                        prompt=row['prompt'],
                        image=row['image'],
                        status=row['status'],
                        created_at=row['created_at'],
                        completed_at=row['completed_at'],
                        video_path=row['video_path'],
                        error=row['error']
                    )

        return None

    async def update_job_status(self, job_id: str, status: str,
                               video_path: Optional[str] = None,
                               error: Optional[str] = None):
        """Update job status"""
        completed_at = None
        if status in [JobStatus.COMPLETED, JobStatus.FAILED]:
            completed_at = int(datetime.now().timestamp())

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE jobs
                SET status = ?, completed_at = ?, video_path = ?, error = ?
                WHERE job_id = ?
            """, (status, completed_at, video_path, error, job_id))
            await db.commit()

    async def list_jobs(self, status: Optional[str] = None, limit: int = 100) -> List[Job]:
        """List jobs with optional status filter"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row

            if status:
                query = "SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?"
                params = (status, limit)
            else:
                query = "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?"
                params = (limit,)

            async with db.execute(query, params) as cursor:
                rows = await cursor.fetchall()

                return [Job(
                    job_id=row['job_id'],
                    prompt=row['prompt'],
                    image=row['image'],
                    status=row['status'],
                    created_at=row['created_at'],
                    completed_at=row['completed_at'],
                    video_path=row['video_path'],
                    error=row['error']
                ) for row in rows]

    async def cleanup_stale_jobs(self, timeout_seconds: int = None):
        """Mark stale processing jobs as failed"""
        if timeout_seconds is None:
            timeout_seconds = config.JOB_TIMEOUT_SECONDS

        cutoff_time = int(datetime.now().timestamp()) - timeout_seconds

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE jobs
                SET status = ?, error = ?, completed_at = ?
                WHERE status = ? AND created_at < ?
            """, (JobStatus.FAILED, "Job timed out", int(datetime.now().timestamp()),
                  JobStatus.PROCESSING, cutoff_time))
            await db.commit()


# Global job queue instance
job_queue = JobQueue()
