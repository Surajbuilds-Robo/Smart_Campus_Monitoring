import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any

import cv2
from config import Settings, load_settings
from detector.crowd_detector import CrowdDetector
from detector.person_detector import PersonDetector
from rules.alert_rules import AlertRules
from transport.backend_client import BackendClient
from utils.screenshot_burst import ScreenshotBurst
from utils.stream_handler import StreamHandler
from utils.timer_2min import PersistenceTimer

logger = logging.getLogger("campus-ai.worker")


class CameraSession:
    """Represents an independent processing session for a single IP camera stream."""

    def __init__(
        self,
        camera_id: str,
        stream_url: str,
        name: str = "",
        location: str = "",
        capacity: int = 10,
        settings: Settings | None = None,
        person_detector: PersonDetector | None = None,
        inference_lock: Any = None,
        backend_client: BackendClient | None = None,
    ) -> None:
        self.camera_id = str(camera_id).strip()
        self.stream_url = str(stream_url).strip()
        self.name = name or self.camera_id
        self.location = location
        self.capacity = capacity if capacity > 0 else 10
        self.settings = settings or load_settings()

        self._person_detector = person_detector
        self._inference_lock = inference_lock or threading.Lock()
        self._backend_client = backend_client

        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()

        # Operational telemetry
        self.status: str = "disconnected"
        self.camera_connected: bool = False
        self.tcp_verified: bool = False
        self.http_verified: bool = False
        self.has_valid_frame: bool = False

        self.frames_processed: int = 0
        self.events_submitted: int = 0
        self.consecutive_failures: int = 0
        self.current_retry_delay: float = self.settings.initial_retry_delay

        self.last_frame_timestamp: str | None = None
        self.last_inference_timestamp: str | None = None
        self.last_detection: dict[str, Any] | None = None
        self.last_error: str | None = None
        self.started_at: str | None = None

        self._current_stream: StreamHandler | None = None
        self._crowd_detector: CrowdDetector | None = None
        self._alert_rules = AlertRules()
        self._persistence = PersistenceTimer(self.settings.persistence_seconds)
        self._screenshot_burst = ScreenshotBurst(
            output_dir=self.settings.evidence_dir,
            count=self.settings.evidence_count,
        )
        self.is_crowd_alert_active: bool = False
        self.crowd_alert_threshold: int = getattr(self.settings, "crowd_alert_threshold", 4)

        self.latest_annotated_jpeg: bytes | None = None
        self.latest_detections: list[dict[str, Any]] = []

        if self._person_detector is not None:
            self._crowd_detector = CrowdDetector(
                person_detector=self._person_detector,
                capacity=self.capacity,
            )

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive() and not self._stop_event.is_set()

    def update_stream_url(self, new_url: str) -> None:
        """Update stream URL dynamically and reset stream connection if changed."""
        cleaned_url = str(new_url).strip()
        if cleaned_url and cleaned_url != self.stream_url:
            logger.info("Camera %s URL updated: %s -> %s", self.camera_id, self.stream_url, cleaned_url)
            self.stream_url = cleaned_url
            if self._current_stream is not None:
                try:
                    self._current_stream.stop()
                except Exception:
                    pass

    def start(self) -> bool:
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return False

            self._stop_event.clear()
            self.status = "starting"
            self.started_at = datetime.now(timezone.utc).isoformat()
            self.consecutive_failures = 0
            self.current_retry_delay = self.settings.initial_retry_delay
            self.last_error = None

            self._thread = threading.Thread(
                target=self._session_loop,
                name=f"CameraSession-{self.camera_id}",
                daemon=True,
            )
            self._thread.start()
            return True

    def stop(self, timeout: float = 4.0) -> bool:
        self._stop_event.set()
        if self._current_stream is not None:
            try:
                self._current_stream.stop()
            except Exception:
                pass

        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=timeout)

        with self._lock:
            self.status = "disconnected"
            self.camera_connected = False
            self._thread = None
        return True

    def process_crowd_observation(
        self,
        people_count: int | None,
        avg_conf: float | None = 0.90,
        frame: Any | None = None,
    ) -> tuple[Any | None, str | None]:
        """
        Evaluate crowd count against threshold and manage deduplication state.
        Returns (candidate, image_base64) when a qualifying new incident triggers.
        Returns (None, None) when count <= threshold, missing telemetry, or already active.
        """
        if people_count is None or avg_conf is None:
            return None, None

        candidate = self._alert_rules.evaluate(
            event_type="crowd_overcrowding",
            camera_id=self.camera_id,
            confidence=avg_conf,
            metadata={
                "people_count": people_count,
                "threshold": self.crowd_alert_threshold,
                "camera_id": self.camera_id,
                "capacity": self.capacity,
            },
        )

        if candidate is None:
            if self.is_crowd_alert_active:
                logger.info(
                    "Camera %s: Crowd count returned to %d (<= threshold %d). Condition reset.",
                    self.camera_id,
                    people_count,
                    self.crowd_alert_threshold,
                )
                self.is_crowd_alert_active = False
            return None, None

        if not self.is_crowd_alert_active:
            self.is_crowd_alert_active = True
            image_base64 = None
            if frame is not None:
                try:
                    import base64
                    ret_enc, buf_enc = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
                    if ret_enc:
                        image_base64 = base64.b64encode(buf_enc.tobytes()).decode("utf-8")
                except Exception as enc_err:
                    logger.warning("Camera %s frame encoding error: %s", self.camera_id, enc_err)
            return candidate, image_base64

        # Already active - deduplicated
        return None, None

    def _session_loop(self) -> None:
        """Dedicated loop for ingesting and processing frames from this camera."""
        logger.info("Processing session started for camera: %s (%s)", self.camera_id, self.stream_url)
        last_sent: set[str] = set()
        frame_number = 0

        while not self._stop_event.is_set():
            if not self.stream_url:
                self.status = "error"
                self.last_error = "No stream URL configured"
                time.sleep(2.0)
                continue

            self.status = "connecting"
            stream = StreamHandler(
                self.stream_url,
                reconnect_delay=self.settings.initial_retry_delay,
                max_reconnect_attempts=2,
                connect_timeout=self.settings.connect_timeout,
            )
            self._current_stream = stream

            try:
                with stream:
                    for frame in stream.frames():
                        if self._stop_event.is_set():
                            break

                        if not self.camera_connected:
                            self.camera_connected = True
                            self.has_valid_frame = True
                            self.tcp_verified = stream.tcp_verified
                            self.http_verified = stream.http_verified
                            self.status = "processing"
                            self.consecutive_failures = 0
                            self.current_retry_delay = self.settings.initial_retry_delay
                            self.last_error = None
                            logger.info("Camera %s connected and streaming frames", self.camera_id)

                        frame_number += 1
                        self.frames_processed += 1
                        self.last_frame_timestamp = datetime.now(timezone.utc).isoformat()

                        # Configurable frame skip
                        if frame_number % self.settings.frame_skip != 0:
                            # Render latest detections on intermediate frames for smooth video
                            if self.latest_detections and getattr(frame, "shape", None):
                                try:
                                    smooth_frame = frame.copy()
                                    for det_info in self.latest_detections:
                                        b = det_info.get("bbox", [])
                                        if len(b) == 4:
                                            cv2.rectangle(smooth_frame, (b[0], b[1]), (b[2], b[3]), (0, 230, 115), 2)
                                            lbl = f"Person: {det_info.get('confidence', 0.88):.2f}"
                                            (w, h), _ = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                                            cv2.rectangle(smooth_frame, (b[0], max(0, b[1] - 18)), (b[0] + w + 6, b[1]), (0, 230, 115), -1)
                                            cv2.putText(smooth_frame, lbl, (b[0] + 3, max(12, b[1] - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)
                                    now_s = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                                    cv2.putText(smooth_frame, now_s, (max(10, smooth_frame.shape[1] - 190), 24), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
                                    cv2.circle(smooth_frame, (18, 18), 4, (0, 0, 255), -1)
                                    cv2.putText(smooth_frame, "LIVE", (26, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
                                    cv2.putText(smooth_frame, "AI Processing...", (72, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1, cv2.LINE_AA)
                                    ret_s, buf_s = cv2.imencode(".jpg", smooth_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                                    if ret_s:
                                        self.latest_annotated_jpeg = buf_s.tobytes()
                                except Exception:
                                    pass
                            continue

                        # Perform inference using shared model with thread lock
                        if self._crowd_detector is not None and self._person_detector is not None:
                            try:
                                with self._inference_lock:
                                    detections = self._person_detector.detect(frame)
                                    result = self._crowd_detector.analyze_detections(detections)

                                self.last_inference_timestamp = self.last_frame_timestamp
                                self.latest_detections = [d.to_dict() for d in detections]

                                # Annotate frame with green bounding boxes and confidence labels
                                try:
                                    annotated = frame.copy()
                                    for det in detections:
                                        x1, y1, x2, y2 = det.bbox
                                        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 230, 115), 2)
                                        label_text = f"Person: {det.confidence:.2f}"
                                        (w, h), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                                        cv2.rectangle(annotated, (x1, max(0, y1 - 18)), (x1 + w + 6, y1), (0, 230, 115), -1)
                                        cv2.putText(annotated, label_text, (x1 + 3, max(12, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)

                                    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                                    cv2.putText(annotated, now_str, (max(10, annotated.shape[1] - 190), 24), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
                                    cv2.circle(annotated, (18, 18), 4, (0, 0, 255), -1)
                                    cv2.putText(annotated, "LIVE", (26, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
                                    cv2.putText(annotated, "AI Processing...", (72, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220), 1, cv2.LINE_AA)

                                    ret, buf = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                                    if ret:
                                        self.latest_annotated_jpeg = buf.tobytes()
                                except Exception as draw_err:
                                    logger.debug("Annotated frame rendering skipped: %s", draw_err)

                                avg_conf = (
                                    round(sum(d.confidence for d in detections) / len(detections), 2)
                                    if detections
                                    else None
                                )

                                self.last_detection = {
                                    "people_count": result.people_count,
                                    "capacity": result.capacity,
                                    "occupancy_ratio": round(result.occupancy_ratio, 4),
                                    "level": result.level,
                                    "timestamp": self.last_frame_timestamp,
                                    "camera_id": self.camera_id,
                                    "confidence": avg_conf,
                                    "detections": self.latest_detections,
                                }

                                candidate = None
                                if avg_conf is not None:
                                    candidate = self._alert_rules.evaluate(
                                        event_type="crowd_overcrowding",
                                        camera_id=self.camera_id,
                                        confidence=avg_conf,
                                        metadata={
                                            "occupancy_ratio": result.occupancy_ratio,
                                            "people_count": result.people_count,
                                            "threshold": self.crowd_alert_threshold,
                                            "capacity": result.capacity,
                                            "camera_id": self.camera_id,
                                        },
                                    )

                                if candidate is None:
                                    # Condition cleared or within acceptable bounds (0-4 people)
                                    if self.is_crowd_alert_active:
                                        logger.info(
                                            "Camera %s: Crowd count returned to %d (<= threshold %d). Condition reset.",
                                            self.camera_id,
                                            result.people_count,
                                            self.crowd_alert_threshold,
                                        )
                                        self.is_crowd_alert_active = False

                                    # Regular baseline crowd telemetry sent every (frame_skip * 4) frames (~1.5s)
                                    if frame_number % (self.settings.frame_skip * 4) == 0:
                                        if self._backend_client is not None:
                                            try:
                                                self._backend_client.send_event(
                                                    {
                                                        "camera_id": self.camera_id,
                                                        "event_type": "crowd_measurement",
                                                        "confidence": avg_conf,
                                                        "metadata": {
                                                            "people_count": result.people_count,
                                                            "threshold": self.crowd_alert_threshold,
                                                            "capacity": result.capacity,
                                                            "occupancy_ratio": result.occupancy_ratio,
                                                            "camera_id": self.camera_id,
                                                            "confidence": avg_conf,
                                                            "detections": self.latest_detections,
                                                        },
                                                    }
                                                )
                                                self.events_submitted += 1
                                                logger.debug(
                                                    "Camera %s: crowd measurement sent (%d people, conf: %s)",
                                                    self.camera_id,
                                                    result.people_count,
                                                    f"{avg_conf:.2f}" if avg_conf is not None else "None",
                                                )
                                            except Exception as tele_err:
                                                logger.debug("Camera %s telemetry error: %s", self.camera_id, tele_err)
                                    continue

                                # Incident candidate evaluation (person_count > threshold: 5+ people)
                                # Immediate trigger on valid fresh frame without 2-minute waiting period
                                if not self.is_crowd_alert_active:
                                    self.is_crowd_alert_active = True
                                    payload = candidate.to_dict()

                                    # Capture evidence burst frames
                                    evidence_records = []
                                    try:
                                        evidence_records = self._screenshot_burst.capture(
                                            frame, self.camera_id
                                        )
                                    except Exception as snap_err:
                                        logger.warning("Camera %s screenshot error: %s", self.camera_id, snap_err)

                                    # Capture actual qualifying frame as JPEG base64 for reliable backend persistence
                                    image_base64 = None
                                    try:
                                        import base64
                                        ret_enc, buf_enc = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
                                        if ret_enc:
                                            image_base64 = base64.b64encode(buf_enc.tobytes()).decode("utf-8")
                                    except Exception as enc_err:
                                        logger.warning("Camera %s frame encoding error: %s", self.camera_id, enc_err)

                                    payload.update(
                                        {
                                            "camera_id": self.camera_id,
                                            "people_count": result.people_count,
                                            "threshold": self.crowd_alert_threshold,
                                            "capacity": result.capacity,
                                            "occupancy_ratio": result.occupancy_ratio,
                                            "image_base64": image_base64,
                                            "timestamp": self.last_frame_timestamp,
                                            "metadata": {
                                                "evidence": [
                                                    item.get("path")
                                                    for item in evidence_records
                                                    if "path" in item
                                                ],
                                                "people_count": result.people_count,
                                                "threshold": self.crowd_alert_threshold,
                                                "capacity": result.capacity,
                                                "occupancy_ratio": result.occupancy_ratio,
                                                "camera_id": self.camera_id,
                                                "timestamp": self.last_frame_timestamp,
                                                "confidence": avg_conf,
                                                "detections": self.latest_detections,
                                                "image_base64": image_base64,
                                            },
                                        }
                                    )

                                    if self._backend_client is not None:
                                        try:
                                            self._backend_client.send_event(payload)
                                            self.events_submitted += 1
                                            logger.warning(
                                                "Camera %s: Qualifying incident triggered: %d people detected (threshold: %d)",
                                                self.camera_id,
                                                result.people_count,
                                                self.crowd_alert_threshold,
                                            )
                                        except Exception as send_err:
                                            logger.error("Camera %s: Event submission error: %s", self.camera_id, send_err)
                                else:
                                    logger.debug(
                                        "Camera %s: Condition remains above threshold (%d people > %d). Deduplicated.",
                                        self.camera_id,
                                        result.people_count,
                                        self.crowd_alert_threshold,
                                    )

                            except Exception as infer_err:
                                logger.exception("Camera %s: Inference error: %s", self.camera_id, infer_err)

            except ConnectionError as conn_err:
                self._handle_disconnect(str(conn_err), stream)
            except Exception as stream_err:
                self._handle_disconnect(str(stream_err), stream)
            finally:
                self.camera_connected = False
                self._current_stream = None

            if self._stop_event.is_set():
                break

            # Exponential backoff sleep
            sleep_step = 0.5
            steps = int(self.current_retry_delay / sleep_step)
            for _ in range(steps):
                if self._stop_event.is_set():
                    break
                time.sleep(sleep_step)

        self.status = "disconnected"
        self.camera_connected = False
        logger.info("Camera %s session terminated cleanly", self.camera_id)

    def _handle_disconnect(self, err_msg: str, stream: StreamHandler) -> None:
        self.camera_connected = False
        self.status = "reconnecting"
        self.tcp_verified = stream.tcp_verified
        self.http_verified = stream.http_verified
        self.consecutive_failures += 1
        self.last_error = err_msg

        self.current_retry_delay = min(
            self.settings.initial_retry_delay * (1.5 ** min(self.consecutive_failures - 1, 6)),
            self.settings.max_retry_delay,
        )
        logger.warning(
            "Camera %s stream unavailable (attempt #%d): %s. Next retry in %.1fs",
            self.camera_id,
            self.consecutive_failures,
            err_msg,
            self.current_retry_delay,
        )

    def get_status_report(self) -> dict[str, Any]:
        return {
            "camera_id": self.camera_id,
            "name": self.name,
            "location": self.location,
            "stream_url": self.stream_url,
            "worker_status": self.status,
            "is_running": self.is_running,
            "camera_connected": self.camera_connected,
            "tcp_verified": self.tcp_verified,
            "http_verified": self.http_verified,
            "has_valid_frame": self.has_valid_frame,
            "frames_processed": self.frames_processed,
            "events_submitted": self.events_submitted,
            "consecutive_failures": self.consecutive_failures,
            "next_retry_delay": round(self.current_retry_delay, 1),
            "last_frame_timestamp": self.last_frame_timestamp,
            "last_inference_timestamp": self.last_inference_timestamp,
            "last_detection": self.last_detection,
            "last_error": self.last_error,
            "is_crowd_alert_active": self.is_crowd_alert_active,
            "crowd_alert_threshold": self.crowd_alert_threshold,
            "started_at": self.started_at,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


class EdgeWorker:
    """
    Managed background worker and supervisor for multi-camera AI vision analytics.
    Discovers all active registered cameras from the backend, creates independent sessions,
    and shares the YOLOv8 model safely across sessions.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or load_settings()
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._inference_lock = threading.Lock()

        # Operational status
        self.status: str = "disconnected"
        self.camera_connected: bool = False
        self.model_loaded: bool = False
        self.backend_reachable: bool = False
        self.tcp_verified: bool = False
        self.http_verified: bool = False
        self.has_valid_frame: bool = False

        self.current_source: str = self.settings.camera_source
        self.frames_processed: int = 0
        self.events_submitted: int = 0
        self.consecutive_failures: int = 0
        self.current_retry_delay: float = self.settings.initial_retry_delay

        self.last_frame_timestamp: str | None = None
        self.last_inference_timestamp: str | None = None
        self.last_detection: dict[str, Any] | None = None
        self.last_error: str | None = None
        self.started_at: str | None = None

        self._person_detector: PersonDetector | None = None
        self._backend_client: BackendClient | None = None
        self.sessions: dict[str, CameraSession] = {}

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive() and not self._stop_event.is_set()

    def start(self) -> bool:
        """Start the supervisor and multi-camera processing threads."""
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                logger.warning("Worker thread is already active.")
                return False

            self._stop_event.clear()
            self.status = "starting"
            self.started_at = datetime.now(timezone.utc).isoformat()
            self.consecutive_failures = 0
            self.current_retry_delay = self.settings.initial_retry_delay
            self.last_error = None

            self._thread = threading.Thread(
                target=self._supervisor_run,
                name="EdgeAISupervisorThread",
                daemon=True,
            )
            self._thread.start()
            return True

    def stop(self, timeout: float = 5.0) -> bool:
        """Signal supervisor and all camera sessions to stop cleanly."""
        self._stop_event.set()

        # Stop all camera sessions
        with self._lock:
            for session in list(self.sessions.values()):
                try:
                    session.stop(timeout=2.0)
                except Exception as exc:
                    logger.debug("Error stopping session %s: %s", session.camera_id, exc)

        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=timeout)

        with self._lock:
            self.status = "disconnected"
            self.camera_connected = False
            self._thread = None
        return True

    def _init_detector(self) -> bool:
        if self._person_detector is None:
            try:
                self._person_detector = PersonDetector(
                    model_path=self.settings.person_model_path,
                    confidence_threshold=self.settings.confidence_threshold,
                )
                self.model_loaded = True
                logger.info("Loaded shared YOLO model from: %s", self.settings.person_model_path)
                return True
            except Exception as exc:
                self.model_loaded = False
                self.last_error = f"Model initialization failed: {exc}"
                self.status = "error"
                logger.error("Failed to initialize person detector: %s", exc)
                return False
        return True

    def sync_cameras(self) -> None:
        """
        Synchronize camera sessions with persistent camera registry from backend.
        Creates sessions for new cameras, stops deleted cameras, and updates stream URLs.
        """
        if self._backend_client is None:
            return

        try:
            raw_data = self._backend_client.get_all_cameras()
            if isinstance(raw_data, dict):
                cameras_data = raw_data.get("cameras", [])
            elif isinstance(raw_data, list):
                cameras_data = raw_data
            else:
                cameras_data = []
        except Exception as exc:
            logger.debug("Failed to query cameras from backend: %s", exc)
            cameras_data = []

        active_camera_ids: set[str] = set()

        if cameras_data and len(cameras_data) > 0:
            for cam in cameras_data:
                if not isinstance(cam, dict):
                    continue

                # Support both business cameraId and Mongo _id
                cam_id = str(cam.get("cameraId") or cam.get("_id") or cam.get("id") or "").strip()
                if not cam_id:
                    continue

                active_camera_ids.add(cam_id)
                stream_url = str(cam.get("streamUrl") or "").strip()
                name = str(cam.get("name") or cam_id)
                location = str(cam.get("location") or "")

                threshold_val = cam.get("crowdAlertThreshold")
                cam_threshold = int(threshold_val) if threshold_val is not None else self.settings.crowd_alert_threshold

                if cam_id not in self.sessions:
                    # New camera session discovered
                    logger.info("Spawning independent AI session for registered camera: %s (%s)", cam_id, stream_url)
                    session = CameraSession(
                        camera_id=cam_id,
                        stream_url=stream_url,
                        name=name,
                        location=location,
                        capacity=self.settings.crowd_capacity,
                        settings=self.settings,
                        person_detector=self._person_detector,
                        inference_lock=self._inference_lock,
                        backend_client=self._backend_client,
                    )
                    session.crowd_alert_threshold = cam_threshold
                    self.sessions[cam_id] = session
                    session.start()
                else:
                    # Existing session: update stream URL if modified
                    existing_session = self.sessions[cam_id]
                    existing_session.crowd_alert_threshold = cam_threshold
                    if stream_url and stream_url != existing_session.stream_url:
                        existing_session.update_stream_url(stream_url)
                    if not existing_session.is_running:
                        existing_session.start()

            # Clean up sessions for deleted/disabled cameras
            for existing_id in list(self.sessions.keys()):
                if existing_id not in active_camera_ids:
                    logger.info("Removing inactive/deleted camera session: %s", existing_id)
                    old_session = self.sessions.pop(existing_id, None)
                    if old_session is not None:
                        old_session.stop()

        else:
            # Fallback to single configured camera from environment if backend returned none
            fallback_id = self.settings.camera_id
            active_camera_ids.add(fallback_id)

            # Check if backend has a config for this fallback ID
            fallback_url = self.settings.camera_source
            try:
                cam_info = self._backend_client.get_camera_config(fallback_id)
                if cam_info and cam_info.get("streamUrl"):
                    fallback_url = str(cam_info["streamUrl"]).strip()
            except Exception:
                pass

            if fallback_id not in self.sessions:
                session = CameraSession(
                    camera_id=fallback_id,
                    stream_url=fallback_url,
                    name=fallback_id,
                    capacity=self.settings.crowd_capacity,
                    settings=self.settings,
                    person_detector=self._person_detector,
                    inference_lock=self._inference_lock,
                    backend_client=self._backend_client,
                )
                self.sessions[fallback_id] = session
                session.start()
            else:
                existing_session = self.sessions[fallback_id]
                if fallback_url and fallback_url != existing_session.stream_url:
                    existing_session.update_stream_url(fallback_url)
                if not existing_session.is_running:
                    existing_session.start()

    def _supervisor_run(self) -> None:
        """Main supervisor thread running discovery and aggregating telemetry."""
        logger.info("Edge AI multi-camera supervisor thread started.")

        if not self._init_detector():
            return

        try:
            self._backend_client = BackendClient(
                base_url=self.settings.backend_url,
                api_token=self.settings.ai_service_token,
                timeout=3.0,
            )
        except Exception as exc:
            self.last_error = f"Backend client initialization error: {exc}"
            self.status = "error"
            logger.error("Failed to initialize backend client: %s", exc)
            return

        last_health_check = 0.0
        last_sync_time = 0.0
        health_interval = getattr(self.settings, "backend_health_check_interval", 30.0)
        sync_interval = getattr(self.settings, "camera_sync_interval", 30.0)

        while not self._stop_event.is_set():
            now = time.time()

            # Update backend connectivity periodically (default 30s) or on startup
            if now - last_health_check >= health_interval or last_health_check == 0.0:
                health = self._backend_client.check_health()
                self.backend_reachable = health.get("reachable", False)
                last_health_check = now

            # Sync cameras from backend periodically (default 30s) or on startup
            if now - last_sync_time >= sync_interval or last_sync_time == 0.0:
                self.sync_cameras()
                last_sync_time = now

            # Aggregate telemetry across sessions
            any_connected = False
            total_frames = 0
            total_events = 0
            latest_frame_time = None
            latest_infer_time = None
            latest_detection = None

            for session in list(self.sessions.values()):
                if session.camera_connected:
                    any_connected = True
                total_frames += session.frames_processed
                total_events += session.events_submitted

                if session.last_frame_timestamp:
                    if not latest_frame_time or session.last_frame_timestamp > latest_frame_time:
                        latest_frame_time = session.last_frame_timestamp
                if session.last_inference_timestamp:
                    if not latest_infer_time or session.last_inference_timestamp > latest_infer_time:
                        latest_infer_time = session.last_inference_timestamp
                        latest_detection = session.last_detection

            self.camera_connected = any_connected
            self.has_valid_frame = any_connected or total_frames > 0
            self.frames_processed = total_frames
            self.events_submitted = total_events
            self.last_frame_timestamp = latest_frame_time
            self.last_inference_timestamp = latest_infer_time
            if latest_detection:
                self.last_detection = latest_detection

            primary_session = self.sessions.get(self.settings.camera_id) or (
                next(iter(self.sessions.values())) if self.sessions else None
            )

            if primary_session:
                self.tcp_verified = primary_session.tcp_verified
                self.http_verified = primary_session.http_verified
                self.current_source = primary_session.stream_url
                self.last_error = primary_session.last_error
                self.status = primary_session.status
            else:
                self.status = "connected" if any_connected else "connecting"

            # Sleep 1s between supervisor loops
            for _ in range(2):
                if self._stop_event.is_set():
                    break
                time.sleep(0.5)

        # Stop all sessions on supervisor exit
        for session in list(self.sessions.values()):
            try:
                session.stop()
            except Exception:
                pass

        if self._backend_client is not None:
            try:
                self._backend_client.close()
            except Exception:
                pass
            self._backend_client = None

        self.status = "disconnected"
        self.camera_connected = False
        logger.info("Edge AI multi-camera supervisor terminated cleanly.")

    def _handle_disconnect(self, err_msg: str, stream: Any) -> None:
        """Update metrics and apply exponential backoff on connection failure."""
        self.camera_connected = False
        self.status = "reconnecting"
        self.tcp_verified = getattr(stream, "tcp_verified", False)
        self.http_verified = getattr(stream, "http_verified", False)
        self.consecutive_failures += 1
        self.last_error = err_msg

        self.current_retry_delay = min(
            self.settings.initial_retry_delay * (1.5 ** min(self.consecutive_failures - 1, 6)),
            self.settings.max_retry_delay,
        )

    def _resolve_source(self, backend: BackendClient) -> str:
        """Determine stream source with transparent precedence."""
        env_source = self.settings.camera_source.strip() if self.settings.camera_source else ""
        backend_source = ""

        try:
            cam_info = backend.get_camera_config(self.settings.camera_id)
            if cam_info and cam_info.get("streamUrl"):
                backend_source = str(cam_info["streamUrl"]).strip()
        except Exception as exc:
            logger.debug("Backend camera config lookup skipped: %s", exc)

        if backend_source and env_source and backend_source != env_source:
            probe_env = StreamHandler(env_source, connect_timeout=1.5)
            env_tcp_ok, _ = probe_env.probe_tcp()
            if env_tcp_ok:
                return env_source

            probe_backend = StreamHandler(backend_source, connect_timeout=1.5)
            backend_tcp_ok, _ = probe_backend.probe_tcp()
            if backend_tcp_ok:
                return backend_source

        if backend_source:
            return backend_source

        return env_source or "0"

    def get_readiness_report(self) -> dict[str, Any]:
        """Produce comprehensive readiness report for all camera streams."""
        if self.is_running:
            backend_reachable = self.backend_reachable
        else:
            try:
                b = BackendClient(
                    base_url=self.settings.backend_url,
                    api_token=self.settings.ai_service_token,
                    timeout=1.0,
                )
                backend_reachable = b.check_health().get("reachable", False)
                b.close()
            except Exception:
                backend_reachable = False

        is_ready = bool(self.camera_connected and self.model_loaded and backend_reachable)
        status_str = "ready" if is_ready else ("degraded" if (self.model_loaded or self.camera_connected) else "unavailable")

        primary_session = self.sessions.get(self.settings.camera_id) or (
            next(iter(self.sessions.values())) if self.sessions else None
        )

        cam_err = primary_session.last_error if primary_session and not primary_session.camera_connected else (
            self.last_error if not self.camera_connected else None
        )

        return {
            "ready": is_ready,
            "status": status_str,
            "camera": {
                "camera_id": primary_session.camera_id if primary_session else self.settings.camera_id,
                "source": primary_session.stream_url if primary_session else self.current_source,
                "connected": primary_session.camera_connected if primary_session else self.camera_connected,
                "tcp_verified": primary_session.tcp_verified if primary_session else self.tcp_verified,
                "http_verified": primary_session.http_verified if primary_session else self.http_verified,
                "consecutive_failures": primary_session.consecutive_failures if primary_session else self.consecutive_failures,
                "error": cam_err,
            },
            "detector": {
                "model_loaded": self.model_loaded,
                "model_path": self.settings.person_model_path,
                "worker_status": self.status,
            },
            "backend": {
                "url": self.settings.backend_url,
                "reachable": backend_reachable,
            },
            "configuration": {
                "crowd_capacity": self.settings.crowd_capacity,
                "frame_skip": self.settings.frame_skip,
                "confidence_threshold": self.settings.confidence_threshold,
                "persistence_seconds": self.settings.persistence_seconds,
            },
            "cameras_active": len(self.sessions),
            "cameras": {
                cid: session.get_status_report()
                for cid, session in self.sessions.items()
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get_status_report(self, camera_id: str | None = None) -> dict[str, Any]:
        """Produce real-time telemetry metrics on one or all camera sessions."""
        if camera_id and camera_id in self.sessions:
            return self.sessions[camera_id].get_status_report()

        primary_session = self.sessions.get(self.settings.camera_id) or (
            next(iter(self.sessions.values())) if self.sessions else None
        )

        return {
            "worker_status": self.status,
            "is_running": self.is_running,
            "camera_id": primary_session.camera_id if primary_session else self.settings.camera_id,
            "camera_source": primary_session.stream_url if primary_session else self.current_source,
            "camera_connected": self.camera_connected,
            "tcp_verified": primary_session.tcp_verified if primary_session else self.tcp_verified,
            "http_verified": primary_session.http_verified if primary_session else self.http_verified,
            "has_valid_frame": self.has_valid_frame,
            "frames_processed": self.frames_processed,
            "events_submitted": self.events_submitted,
            "consecutive_failures": primary_session.consecutive_failures if primary_session else self.consecutive_failures,
            "next_retry_delay": round(primary_session.current_retry_delay if primary_session else self.current_retry_delay, 1),
            "last_frame_timestamp": self.last_frame_timestamp,
            "last_inference_timestamp": self.last_inference_timestamp,
            "last_detection": self.last_detection,
            "last_error": self.last_error,
            "backend_reachable": self.backend_reachable,
            "started_at": self.started_at,
            "cameras_active": len(self.sessions),
            "cameras": {
                cid: session.get_status_report()
                for cid, session in self.sessions.items()
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
