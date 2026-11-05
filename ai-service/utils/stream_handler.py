import logging
import socket
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
import urllib.request

import cv2

logger = logging.getLogger("campus-ai.stream")


class StreamHandler:
    """Read frames from a local video or authorized camera stream with bounded retries."""

    def __init__(
        self,
        source: str | int,
        reconnect_delay: float = 2.0,
        max_reconnect_attempts: int = 10,
        loop_video: bool = True,
        connect_timeout: float = 2.5,
    ) -> None:
        self.source = int(source) if str(source).isdigit() else source
        self.reconnect_delay = reconnect_delay
        self.max_reconnect_attempts = max_reconnect_attempts
        self.loop_video = loop_video
        self.connect_timeout = connect_timeout
        self.capture = None
        self._running = True

        self.tcp_verified: bool = False
        self.http_verified: bool = False
        self.last_probe_result: dict[str, Any] | None = None
        self.last_error: str | None = None

    @property
    def is_opened(self) -> bool:
        return self.capture is not None and self.capture.isOpened()

    def probe_tcp(self, timeout: float | None = None) -> tuple[bool, str | None]:
        """Verify TCP-level socket connectivity to target host:port before OpenCV/FFmpeg invocation."""
        if not isinstance(self.source, str):
            return True, None

        src = self.source.strip()
        if not (src.startswith("http://") or src.startswith("https://") or src.startswith("rtsp://")):
            return True, None

        to = timeout if timeout is not None else self.connect_timeout
        host = ""
        port = 80
        try:
            parsed = urlparse(src)
            host = parsed.hostname or ""
            if not host:
                return False, "Invalid host in stream URL"

            if parsed.port:
                port = parsed.port
            elif parsed.scheme == "https":
                port = 443
            elif parsed.scheme == "rtsp":
                port = 554
            else:
                port = 80

            with socket.create_connection((host, port), timeout=to):
                return True, None
        except (socket.timeout, TimeoutError):
            return False, f"TCP connection to {host}:{port} timed out after {to}s"
        except ConnectionRefusedError:
            return False, f"TCP connection to {host}:{port} refused (server not listening)"
        except OSError as exc:
            return False, f"TCP connection to {host}:{port} failed: {exc}"

    def probe_http(self, timeout: float | None = None) -> dict[str, Any]:
        """Probe HTTP/HTTPS endpoint for status code, content-type, and endpoint diagnostics."""
        if not isinstance(self.source, str) or not (
            self.source.startswith("http://") or self.source.startswith("https://")
        ):
            return {"supported": False, "reachable": True}

        to = timeout if timeout is not None else self.connect_timeout
        try:
            req = urllib.request.Request(
                self.source,
                headers={
                    "User-Agent": "SmartCampus-AI-StreamProbe/1.0",
                    "Range": "bytes=0-1024",
                },
            )
            with urllib.request.urlopen(req, timeout=to) as resp:
                status_code = resp.status
                content_type = resp.headers.get("Content-Type", "").lower()
                is_html = "text/html" in content_type
                is_mjpeg = (
                    "mixed-replace" in content_type
                    or "multipart" in content_type
                    or "image" in content_type
                    or "video" in content_type
                )

                return {
                    "supported": True,
                    "reachable": True,
                    "status_code": status_code,
                    "content_type": content_type,
                    "is_mjpeg": is_mjpeg,
                    "is_html_base_page": is_html,
                    "diagnosis": (
                        "Missing /video endpoint; server is returning HTML web page"
                        if is_html
                        else None
                    ),
                }
        except urllib.error.HTTPError as err:
            return {
                "supported": True,
                "reachable": False,
                "status_code": err.code,
                "error": f"HTTP {err.code}: {err.reason}",
            }
        except Exception as exc:
            return {
                "supported": True,
                "reachable": False,
                "error": str(exc),
            }

    def open(self) -> bool:
        self.release()

        # If network stream, probe TCP first to diagnose and prevent FFmpeg -138 error log flooding
        if isinstance(self.source, str) and (
            self.source.startswith("http://")
            or self.source.startswith("https://")
            or self.source.startswith("rtsp://")
        ):
            tcp_ok, tcp_err = self.probe_tcp()
            self.tcp_verified = tcp_ok
            if not tcp_ok:
                self.last_error = tcp_err
                logger.debug("Stream pre-probe TCP failure: %s", tcp_err)
                return False

            http_res = self.probe_http()
            self.last_probe_result = http_res
            self.http_verified = http_res.get("reachable", False)
            if http_res.get("is_html_base_page"):
                logger.warning(
                    "Stream URL %s returned HTML page instead of video. IP Webcam requires /video",
                    self.source,
                )

        try:
            self.capture = cv2.VideoCapture(self.source)
            if not self.capture or not self.capture.isOpened():
                self.release()
                self.last_error = f"Failed to open video capture for source: {self.source}"
                return False

            try:
                self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            except Exception:
                pass

            self.last_error = None
            return True
        except Exception as exc:
            self.release()
            self.last_error = f"OpenCV capture initialization error: {exc}"
            return False

    def read(self):
        if not self.is_opened:
            return False, None

        success, frame = self.capture.read()

        if not success or frame is None or getattr(frame, "size", 0) == 0:
            if self.loop_video and isinstance(self.source, str) and Path(self.source).exists():
                try:
                    self.capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    return self.capture.read()
                except Exception:
                    pass
            return False, None

        return True, frame

    def frames(self) -> Iterator:
        reconnect_attempts = 0

        while self._running and reconnect_attempts < self.max_reconnect_attempts:
            if not self.is_opened:
                if not self.open():
                    reconnect_attempts += 1
                    time.sleep(self.reconnect_delay)
                    continue

            success, frame = self.read()

            if success:
                reconnect_attempts = 0
                yield frame
            else:
                self.release()
                reconnect_attempts += 1
                if self._running and reconnect_attempts < self.max_reconnect_attempts:
                    time.sleep(self.reconnect_delay)

        if self._running and reconnect_attempts >= self.max_reconnect_attempts:
            error_details = self.last_error or f"source {self.source} did not return valid frames"
            raise ConnectionError(
                f"Camera stream connection limit reached ({self.max_reconnect_attempts} attempts): {error_details}"
            )

    def stop(self) -> None:
        """Signal the generator to stop cleanly."""
        self._running = False
        self.release()

    def release(self) -> None:
        if self.capture is not None:
            try:
                self.capture.release()
            except Exception:
                pass
            self.capture = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.stop()