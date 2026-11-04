from dataclasses import dataclass
from pathlib import Path

from ultralytics import YOLO


@dataclass
class EventCandidate:
    event_type: str
    confidence: float
    requires_review: bool = True

    def to_dict(self) -> dict:
        return {
            "event_type": self.event_type,
            "confidence": round(self.confidence, 4),
            "requires_review": self.requires_review,
            "status": "candidate",
        }


class FallViolenceDetector:
    """
    Run a separately trained event-classification model.

    The supplied model must be trained and validated for the required
    event classes. An ordinary COCO object-detection model is not
    suitable for this purpose.
    """

    SUPPORTED_EVENTS = {"fall", "violence"}

    def __init__(
        self,
        model_path: str,
        confidence_threshold: float = 0.70,
        event_class_names: dict[int, str] | None = None,
    ) -> None:
        if not 0.0 <= confidence_threshold <= 1.0:
            raise ValueError("confidence_threshold must be between 0 and 1")

        if not Path(model_path).is_file():
            raise FileNotFoundError(
                f"Trained event model not found: {model_path}"
            )

        self.model = YOLO(model_path)
        self.confidence_threshold = confidence_threshold
        self.event_class_names = event_class_names or {}

    def detect(self, frame) -> list[EventCandidate]:
        if frame is None or getattr(frame, "size", 0) == 0:
            return []

        results = self.model.predict(
            source=frame,
            conf=self.confidence_threshold,
            verbose=False,
        )

        candidates: list[EventCandidate] = []

        for result in results:
            if result.probs is not None:
                class_id = int(result.probs.top1)
                confidence = float(result.probs.top1conf.item())
                label = self.event_class_names.get(
                    class_id,
                    str(result.names.get(class_id, class_id)),
                )

                normalized_label = label.strip().lower()

                if (
                    normalized_label in self.SUPPORTED_EVENTS
                    and confidence >= self.confidence_threshold
                ):
                    candidates.append(
                        EventCandidate(
                            event_type=normalized_label,
                            confidence=confidence,
                        )
                    )

            elif result.boxes is not None:
                for box in result.boxes:
                    class_id = int(box.cls.item())
                    confidence = float(box.conf.item())
                    label = self.event_class_names.get(
                        class_id,
                        str(result.names.get(class_id, class_id)),
                    )

                    normalized_label = label.strip().lower()

                    if (
                        normalized_label in self.SUPPORTED_EVENTS
                        and confidence >= self.confidence_threshold
                    ):
                        candidates.append(
                            EventCandidate(
                                event_type=normalized_label,
                                confidence=confidence,
                            )
                        )

        return candidates