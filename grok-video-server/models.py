from pydantic import BaseModel, Field
from typing import Optional, Any, Dict, List
from enum import Enum


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class JobType(str, Enum):
    VIDEO = "video"
    CHAT = "chat"


class VideoGenerationRequest(BaseModel):
    model: str = Field(default="grok", description="Model to use for video generation")
    prompt: str = Field(..., description="Text prompt for video generation")
    image: Optional[str] = Field(None, description="Base64 encoded image (optional)")


class VideoGenerationResponse(BaseModel):
    id: str = Field(..., description="Job ID")
    object: str = Field(default="videos.generation", description="Object type")
    created: int = Field(..., description="Unix timestamp of creation")
    model: str = Field(..., description="Model used")
    status: JobStatus = Field(..., description="Current job status")
    video_url: Optional[str] = Field(None, description="URL to download completed video")
    error: Optional[str] = Field(None, description="Error message if failed")


class ExtensionPollResponse(BaseModel):
    job_id: str = Field(..., description="Job ID to process")
    job_type: JobType = Field(..., description="Type of job for extension worker")
    client_id: str = Field(..., description="Worker client ID that claimed the job")
    prompt: str = Field(..., description="Prompt for job processing")
    image: Optional[str] = Field(None, description="Base64 encoded image or null")
    request: Optional[Dict[str, Any]] = Field(None, description="Raw OpenAI-style request for chat jobs")


class ExtensionErrorRequest(BaseModel):
    job_id: str = Field(..., description="Job ID that failed")
    error: str = Field(..., description="Error message")


class ExtensionChatCompleteRequest(BaseModel):
    job_id: str = Field(..., description="Job ID that completed")
    content: str = Field(..., description="Assistant text content")


class ChatCompletionRequest(BaseModel):
    model: str = Field(default="grok-vision", description="Model to use")
    messages: List[Dict[str, Any]] = Field(..., description="OpenAI chat messages")
    temperature: Optional[float] = Field(default=0.2, description="Sampling temperature")
    max_tokens: Optional[int] = Field(default=512, description="Max tokens for completion")
    response_format: Optional[Dict[str, Any]] = Field(default=None, description="Optional response format, e.g. {\"type\":\"json_object\"}")
