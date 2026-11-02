import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    camera_source: str
    camera_id: str
    backend_url: str
    ai_service_token: str
    person_model_path: str
    confidence_threshold: float
    crowd_capacity: int
    persistence_seconds: float
    frame_skip: int
    evidence_dir: str
    evidence_count: int
    log_level: str
    event_model_path: str | None = None
    connect_timeout: float = 3.0
    read_timeout: float = 5.0
    initial_retry_delay: float = 2.0
    max_retry_delay: float = 16.0
    backend_health_check_interval: float = 30.0
    camera_sync_interval: float = 30.0
    crowd_alert_threshold: int = 4


def load_settings() -> Settings:
    token = os.getenv("AI_SERVICE_TOKEN", "")
    if not token:
        raise ValueError("AI_SERVICE_TOKEN must be configured")

    confidence = float(os.getenv("CONFIDENCE_THRESHOLD", "0.35"))

    if not 0.0 <= confidence <= 1.0:
        raise ValueError("CONFIDENCE_THRESHOLD must be between 0 and 1")

    capacity = int(os.getenv("CROWD_CAPACITY", "100"))
    if capacity <= 0:
        raise ValueError("CROWD_CAPACITY must be positive")

    frame_skip = int(os.getenv("FRAME_SKIP", "5"))
    if frame_skip < 1:
        raise ValueError("FRAME_SKIP must be at least 1")

    persistence = float(os.getenv("PERSISTENCE_SECONDS", "120"))
    if persistence < 0:
        raise ValueError("PERSISTENCE_SECONDS cannot be negative")

    evidence_count = int(os.getenv("EVIDENCE_COUNT", "4"))
    if evidence_count < 1:
        raise ValueError("EVIDENCE_COUNT must be positive")

    crowd_alert_threshold = int(os.getenv("CROWD_ALERT_THRESHOLD", "4"))
    if crowd_alert_threshold < 0:
        raise ValueError("CROWD_ALERT_THRESHOLD cannot be negative")

    event_model_path = os.getenv("EVENT_MODEL_PATH", "").strip() or None

    connect_timeout = float(os.getenv("CAMERA_CONNECT_TIMEOUT", "3.0"))
    read_timeout = float(os.getenv("CAMERA_READ_TIMEOUT", "5.0"))
    initial_retry_delay = float(os.getenv("INITIAL_RETRY_DELAY", "2.0"))
    max_retry_delay = float(os.getenv("MAX_RETRY_DELAY", "16.0"))
    health_interval = float(os.getenv("BACKEND_HEALTH_INTERVAL", "30.0"))
    sync_interval = float(os.getenv("CAMERA_SYNC_INTERVAL", "30.0"))

    return Settings(
        camera_source=os.getenv("CAMERA_SOURCE", "test_video.mp4"),
        camera_id=os.getenv("CAMERA_ID", "camera-01"),
        backend_url=os.getenv("BACKEND_URL", "http://localhost:5000").rstrip("/"),
        ai_service_token=token,
        person_model_path=os.getenv("PERSON_MODEL_PATH", "yolo26n.pt"),
        confidence_threshold=confidence,
        crowd_capacity=capacity,
        persistence_seconds=persistence,
        frame_skip=frame_skip,
        evidence_dir=os.getenv("EVIDENCE_DIR", "evidence"),
        evidence_count=evidence_count,
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        event_model_path=event_model_path,
        connect_timeout=connect_timeout,
        read_timeout=read_timeout,
        initial_retry_delay=initial_retry_delay,
        max_retry_delay=max_retry_delay,
        backend_health_check_interval=health_interval,
        camera_sync_interval=sync_interval,
        crowd_alert_threshold=crowd_alert_threshold,
    )
