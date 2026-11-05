from pathlib import Path
from datetime import datetime, timezone
import time
import uuid

import cv2


class ScreenshotBurst:
    """Capture a limited number of snapshots for an approved event."""

    def __init__(
        self,
        output_dir: str = "evidence",
        count: int = 4,
        interval_seconds: float = 0.5,
    ) -> None:
        if count < 1:
            raise ValueError("count must be at least 1")

        if interval_seconds < 0:
            raise ValueError("interval_seconds cannot be negative")

        self.output_dir = Path(output_dir)
        self.count = count
        self.interval_seconds = interval_seconds
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def capture(self, frame, camera_id: str) -> list[dict]:
        if frame is None or frame.size == 0:
            raise ValueError("Cannot capture an empty frame")

        safe_camera_id = "".join(
            char if char.isalnum() or char in "-_" else "_"
            for char in camera_id
        )

        if not safe_camera_id:
            raise ValueError("camera_id is required")

        event_id = str(uuid.uuid4())
        captured = []

        for index in range(self.count):
            timestamp = datetime.now(timezone.utc)
            filename = (
                f"{safe_camera_id}_{event_id}_{index + 1}.jpg"
            )
            path = self.output_dir / filename

            success = cv2.imwrite(
                str(path),
                frame,
                [cv2.IMWRITE_JPEG_QUALITY, 90],
            )

            if not success:
                raise RuntimeError(f"Could not save evidence: {path}")

            captured.append(
                {
                    "event_id": event_id,
                    "camera_id": camera_id,
                    "captured_at": timestamp.isoformat(),
                    "path": str(path),
                }
            )

            if index < self.count - 1:
                time.sleep(self.interval_seconds)

        return captured