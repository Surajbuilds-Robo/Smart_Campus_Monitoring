import logging
import signal
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import asyncio
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.responses import JSONResponse, StreamingResponse

from config import Settings, load_settings
from detector.crowd_detector import CrowdDetector
from detector.person_detector import PersonDetector
from rules.alert_rules import AlertRules
from transport.backend_client import BackendClient
from utils.screenshot_burst import ScreenshotBurst
from utils.stream_handler import StreamHandler
from utils.timer_2min import PersistenceTimer
from worker import EdgeWorker

logger = logging.getLogger("campus-ai")

# Singleton worker instance for ASGI lifecycle management
edge_worker = EdgeWorker()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context manager for safe startup and graceful shutdown."""
    logger.info("Starting Smart Campus AI Edge Service ASGI application...")
    try:
        edge_worker.start()
    except Exception as exc:
        logger.error("Failed to start edge worker on startup: %s", exc)

    yield

    logger.info("Shutting down Smart Campus AI Edge Service ASGI application...")
    try:
        edge_worker.stop(timeout=5.0)
    except Exception as exc:
        logger.error("Error during edge worker shutdown: %s", exc)


app = FastAPI(
    title="Smart Campus AI Edge Service",
    description="Real-time vision analytics edge service for CCTV and IP camera streams.",
    version="1.0.0",
    lifespan=lifespan,
)


def _verify_worker_auth(authorization: str | None) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token required for worker administration.",
        )
    token = authorization.split("Bearer ", 1)[1].strip()
    if token != edge_worker.settings.ai_service_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service authorization token.",
        )


@app.get("/", tags=["General"])
def root() -> dict[str, Any]:
    """Root metadata and navigation endpoint."""
    return {
        "service": "Smart Campus AI Edge Service",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "readiness": "/ready",
            "status": "/status",
            "docs": "/docs",
        },
        "camera_id": edge_worker.settings.camera_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/health", tags=["Monitoring"])
def get_health() -> dict[str, Any]:
    """Liveness probe: verifies that the FastAPI application and HTTP server are responsive."""
    return {
        "status": "healthy",
        "service": "smart-campus-ai-service",
        "version": "1.0.0",
        "api_running": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/ready", tags=["Monitoring"])
def get_ready() -> JSONResponse:
    """Readiness probe: reports actual camera connection, AI model, and backend availability."""
    report = edge_worker.get_readiness_report()
    http_status = status.HTTP_200_OK if report["ready"] else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=http_status, content=report)


@app.get("/status", tags=["Worker"])
@app.get("/worker/status", tags=["Worker"])
def get_status() -> dict[str, Any]:
    """Processing telemetry: returns genuine frame counts, detection output, and error state."""
    return edge_worker.get_status_report()


@app.get("/cameras", tags=["Cameras"])
def get_cameras_status() -> dict[str, Any]:
    """Return live status of all active camera AI sessions."""
    report = edge_worker.get_status_report()
    return {
        "success": True,
        "count": report.get("cameras_active", 0),
        "cameras": report.get("cameras", {}),
    }


@app.get("/cameras/{camera_id}/status", tags=["Cameras"])
def get_camera_status(camera_id: str) -> dict[str, Any]:
    """Return status and latest AI detection for a specific camera."""
    session_report = edge_worker.get_status_report(camera_id=camera_id)
    if not session_report or session_report.get("camera_id") != camera_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera session '{camera_id}' not found or not active.",
        )
    return session_report


@app.get("/cameras/{camera_id}/annotated-stream", tags=["Cameras"])
async def get_camera_annotated_stream(camera_id: str):
    """
    Stream live video annotated with genuine YOLO detection bounding boxes,
    confidence labels, status pills, and timestamps.
    Yields multipart/x-mixed-replace JPEG frames.
    """
    session = edge_worker.sessions.get(camera_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera session '{camera_id}' not found.",
        )

    async def frame_generator():
        last_frame_bytes = None
        while session.is_running:
            frame_bytes = session.latest_annotated_jpeg
            if frame_bytes is not None and frame_bytes != last_frame_bytes:
                last_frame_bytes = frame_bytes
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
                )
            await asyncio.sleep(0.033)  # ~30 FPS max

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "close",
        },
    )


@app.post("/worker/sync", tags=["Worker"])
def sync_worker_cameras(authorization: str | None = Header(None)) -> dict[str, Any]:
    """Force synchronization of camera sessions from the backend registry."""
    _verify_worker_auth(authorization)
    edge_worker.sync_cameras()
    return {
        "success": True,
        "message": "Camera sessions synchronized with persistent backend registry",
        "active_cameras": len(edge_worker.sessions),
    }


@app.post("/worker/start", tags=["Worker"])
def start_worker(authorization: str | None = Header(None)) -> dict[str, Any]:
    """Protected endpoint to trigger detector worker startup."""
    _verify_worker_auth(authorization)
    started = edge_worker.start()
    return {
        "success": started,
        "message": "Worker started successfully" if started else "Worker is already active",
        "status": edge_worker.status,
    }


@app.post("/worker/stop", tags=["Worker"])
def stop_worker(authorization: str | None = Header(None)) -> dict[str, Any]:
    """Protected endpoint to gracefully stop detector worker."""
    _verify_worker_auth(authorization)
    stopped = edge_worker.stop(timeout=5.0)
    return {
        "success": stopped,
        "message": "Worker stopped cleanly",
        "status": edge_worker.status,
    }


def check_system_readiness(settings: Settings) -> dict[str, Any]:
    """Diagnostic readiness probe for the edge computer (preserved contract)."""
    backend = BackendClient(
        base_url=settings.backend_url,
        api_token=settings.ai_service_token,
        timeout=3.0,
    )
    health_result = backend.check_health()
    backend.close()

    return {
        "camera_id": settings.camera_id,
        "camera_source": settings.camera_source,
        "backend_url": settings.backend_url,
        "backend_reachable": health_result.get("reachable", False),
        "frame_skip": settings.frame_skip,
        "crowd_capacity": settings.crowd_capacity,
        "persistence_seconds": settings.persistence_seconds,
    }


def run_edge_service(
    settings: Settings | None = None,
    stop_after_frames: int | None = None,
    stream_handler: StreamHandler | None = None,
    person_detector: PersonDetector | None = None,
    backend_client: BackendClient | None = None,
) -> dict[str, Any]:
    """Run the CCTV stream detection loop with bounded frame count for testability (preserved contract)."""
    if settings is None:
        settings = load_settings()

    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    logger.info("Initializing Smart Campus AI Edge Service for camera: %s", settings.camera_id)

    if person_detector is None:
        person_detector = PersonDetector(
            model_path=settings.person_model_path,
            confidence_threshold=settings.confidence_threshold,
        )

    crowd_detector = CrowdDetector(
        person_detector=person_detector,
        capacity=settings.crowd_capacity,
    )

    alert_rules = AlertRules()
    persistence = PersistenceTimer(settings.persistence_seconds)
    screenshot_burst = ScreenshotBurst(
        output_dir=settings.evidence_dir,
        count=settings.evidence_count,
    )

    backend = backend_client or BackendClient.from_environment()
    stream = stream_handler or StreamHandler(settings.camera_source)

    running = True

    def handle_shutdown(signum, _frame):
        nonlocal running
        sig_name = signal.Signals(signum).name if hasattr(signal, "Signals") else str(signum)
        logger.info("Received shutdown signal %s. Stopping AI service cleanly...", sig_name)
        running = False
        stream.stop()

    try:
        signal.signal(signal.SIGINT, handle_shutdown)
        signal.signal(signal.SIGTERM, handle_shutdown)
    except (ValueError, AttributeError):
        pass

    frame_number = 0
    events_submitted = 0
    last_sent: set[str] = set()

    try:
        with stream:
            for frame in stream.frames():
                if not running:
                    break

                frame_number += 1

                if stop_after_frames is not None and frame_number > stop_after_frames:
                    logger.info("Reached stop_after_frames limit (%d). Exiting loop.", stop_after_frames)
                    break

                if frame_number % settings.frame_skip != 0:
                    continue

                try:
                    result = crowd_detector.detect(frame)
                    logger.debug("Crowd measurement: %s", result.to_dict())

                    candidate = alert_rules.evaluate(
                        event_type="crowd_overcrowding",
                        camera_id=settings.camera_id,
                        confidence=1.0,
                        metadata={
                            "occupancy_ratio": result.occupancy_ratio,
                            "people_count": result.people_count,
                            "threshold": settings.crowd_alert_threshold,
                            "capacity": result.capacity,
                        },
                    )

                    event_key = f"{settings.camera_id}:crowd_overcrowding"

                    if candidate is None:
                        persistence.update(event_key, False)
                        last_sent.discard(event_key)

                        if frame_number % (settings.frame_skip * 10) == 0:
                            try:
                                backend.send_event(
                                    {
                                        "camera_id": settings.camera_id,
                                        "event_type": "crowd_measurement",
                                        "confidence": 1.0,
                                        "metadata": {
                                            "people_count": result.people_count,
                                            "threshold": settings.crowd_alert_threshold,
                                            "capacity": result.capacity,
                                            "occupancy_ratio": result.occupancy_ratio,
                                        },
                                    }
                                )
                            except Exception as tele_err:
                                logger.debug("Telemetry report omitted: %s", tele_err)

                        continue

                    verified = persistence.update(event_key, True)

                    if verified and event_key not in last_sent:
                        payload = candidate.to_dict()

                        evidence_records = []
                        try:
                            evidence_records = screenshot_burst.capture(frame, settings.camera_id)
                        except Exception as snap_err:
                            logger.warning("Could not capture screenshot burst: %s", snap_err)

                        image_base64 = None
                        try:
                            import base64
                            import cv2
                            ret_enc, buf_enc = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
                            if ret_enc:
                                image_base64 = base64.b64encode(buf_enc.tobytes()).decode("utf-8")
                        except Exception as enc_err:
                            logger.warning("Could not encode evidence frame: %s", enc_err)

                        now_iso = datetime.now(timezone.utc).isoformat()
                        payload.update(
                            {
                                "people_count": result.people_count,
                                "threshold": settings.crowd_alert_threshold,
                                "capacity": result.capacity,
                                "occupancy_ratio": result.occupancy_ratio,
                                "image_base64": image_base64,
                                "timestamp": now_iso,
                                "metadata": {
                                    "evidence": [item.get("path") for item in evidence_records if "path" in item],
                                    "people_count": result.people_count,
                                    "threshold": settings.crowd_alert_threshold,
                                    "capacity": result.capacity,
                                    "occupancy_ratio": result.occupancy_ratio,
                                    "image_base64": image_base64,
                                    "timestamp": now_iso,
                                },
                            }
                        )

                        try:
                            backend.send_event(payload)
                            last_sent.add(event_key)
                            events_submitted += 1
                            logger.warning(
                                "Submitted sustained crowd overcrowding event to backend for review"
                            )
                        except Exception as send_err:
                            logger.error("Could not submit event to backend: %s", send_err)

                except Exception as frame_err:
                    logger.exception("Frame processing error on frame #%d: %s", frame_number, frame_err)

    except ConnectionError as conn_err:
        logger.error("Camera stream disconnected: %s", conn_err)
    finally:
        stream.release()
        if backend_client is None:
            backend.close()

    return {
        "frames_processed": frame_number,
        "events_submitted": events_submitted,
    }


def main() -> None:
    """Entry point when executed directly via python main.py."""
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    main()