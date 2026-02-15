import aiosqlite
import uuid
import json
from datetime import datetime
from typing import Optional, List
from models import JobStatus, JobType
import config


class Job:
    def __init__(self, job_id: str, prompt: str, image: Optional[str] = None,
                 status: str = JobStatus.PENDING, job_type: str = JobType.VIDEO,
                 request_payload: Optional[str] = None, text_response: Optional[str] = None,
                 created_at: int = None,
                 completed_at: Optional[int] = None, video_path: Optional[str] = None,
                 error: Optional[str] = None):
        self.job_id = job_id
        self.prompt = prompt
        self.image = image
        self.status = status
        self.job_type = job_type.value if isinstance(job_type, JobType) else job_type
        self.request_payload = request_payload
        self.text_response = text_response
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
            'job_type': self.job_type,
            'request_payload': json.loads(self.request_payload) if self.request_payload else None,
            'text_response': self.text_response,
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
                    job_type TEXT NOT NULL DEFAULT 'video',
                    request_payload TEXT,
                    text_response TEXT,
                    created_at INTEGER NOT NULL,
                    completed_at INTEGER,
                    video_path TEXT,
                    error TEXT
                )
            """)
            # Lightweight migration for existing DBs.
            async with db.execute("PRAGMA table_info(jobs)") as cursor:
                columns = {row[1] for row in await cursor.fetchall()}

            if 'job_type' not in columns:
                await db.execute("ALTER TABLE jobs ADD COLUMN job_type TEXT NOT NULL DEFAULT 'video'")
            if 'request_payload' not in columns:
                await db.execute("ALTER TABLE jobs ADD COLUMN request_payload TEXT")
            if 'text_response' not in columns:
                await db.execute("ALTER TABLE jobs ADD COLUMN text_response TEXT")

            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_status ON jobs(status)
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_status_job_type ON jobs(status, job_type)
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_created_at ON jobs(created_at)
            """)
            await db.commit()

    async def create_job(self, prompt: str, image: Optional[str] = None,
                         job_type: str = JobType.VIDEO,
                         request_payload: Optional[str] = None) -> Job:
        """Create a new job"""
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        job = Job(
            job_id=job_id,
            prompt=prompt,
            image=image,
            job_type=job_type,
            request_payload=request_payload
        )

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO jobs (job_id, prompt, image, status, job_type, request_payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (job.job_id, job.prompt, job.image, job.status, job.job_type, job.request_payload, job.created_at))
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
                        job_type=row['job_type'],
                        request_payload=row['request_payload'],
                        text_response=row['text_response'],
                        created_at=row['created_at'],
                        completed_at=row['completed_at'],
                        video_path=row['video_path'],
                        error=row['error']
                    )

        return None

    async def get_next_pending_job(self, job_type: Optional[str] = None) -> Optional[Job]:
        """Get next pending job from queue"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            if job_type:
                query = """
                    SELECT * FROM jobs
                    WHERE status = ? AND job_type = ?
                    ORDER BY created_at ASC
                    LIMIT 1
                """
                params = (JobStatus.PENDING, job_type)
            else:
                query = """
                    SELECT * FROM jobs
                    WHERE status = ?
                    ORDER BY created_at ASC
                    LIMIT 1
                """
                params = (JobStatus.PENDING,)

            async with db.execute(query, params) as cursor:
                row = await cursor.fetchone()

                if row:
                    return Job(
                        job_id=row['job_id'],
                        prompt=row['prompt'],
                        image=row['image'],
                        status=row['status'],
                        job_type=row['job_type'],
                        request_payload=row['request_payload'],
                        text_response=row['text_response'],
                        created_at=row['created_at'],
                        completed_at=row['completed_at'],
                        video_path=row['video_path'],
                        error=row['error']
                    )

        return None

    async def update_job_status(self, job_id: str, status: str,
                               video_path: Optional[str] = None,
                               text_response: Optional[str] = None,
                               error: Optional[str] = None):
        """Update job status"""
        completed_at = None
        if status in [JobStatus.COMPLETED, JobStatus.FAILED]:
            completed_at = int(datetime.now().timestamp())

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE jobs
                SET status = ?, completed_at = ?, video_path = ?, text_response = ?, error = ?
                WHERE job_id = ?
            """, (status, completed_at, video_path, text_response, error, job_id))
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
                    job_type=row['job_type'],
                    request_payload=row['request_payload'],
                    text_response=row['text_response'],
                    created_at=row['created_at'],
                    completed_at=row['completed_at'],
                    video_path=row['video_path'],
                    error=row['error']
                ) for row in rows]

    async def clear_jobs(self):
        """Delete all jobs from queue storage"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM jobs")
            await db.commit()

    async def cleanup_stale_jobs(self, video_timeout_seconds: int = None,
                                 chat_timeout_seconds: int = None):
        """Mark stale processing jobs as failed with independent timeouts by job type"""
        if video_timeout_seconds is None:
            video_timeout_seconds = config.JOB_TIMEOUT_SECONDS
        if chat_timeout_seconds is None:
            chat_timeout_seconds = config.CHAT_JOB_TIMEOUT_SECONDS

        now_ts = int(datetime.now().timestamp())
        video_cutoff = now_ts - video_timeout_seconds
        chat_cutoff = now_ts - chat_timeout_seconds

        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE jobs
                SET status = ?, error = ?, completed_at = ?
                WHERE status = ? AND job_type = ? AND created_at < ?
            """, (JobStatus.FAILED, "Video job timed out", now_ts,
                  JobStatus.PROCESSING, JobType.VIDEO.value, video_cutoff))

            await db.execute("""
                UPDATE jobs
                SET status = ?, error = ?, completed_at = ?
                WHERE status = ? AND job_type = ? AND created_at < ?
            """, (JobStatus.FAILED, "Chat job timed out", now_ts,
                  JobStatus.PROCESSING, JobType.CHAT.value, chat_cutoff))

            await db.commit()


# Global job queue instance
job_queue = JobQueue()
