from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ultralytics import YOLO


@dataclass
class Detection:
    label: str
    confidence: float
    bbox: tuple[int, int, int, int]
    class_id: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "confidence": round(self.confidence, 4),
            "bbox": list(self.bbox),
            "class_id": self.class_id,
        }


class PersonDetector:
    """Detect people and vehicles using an Ultralytics YOLO model."""

    PERSON_CLASS_ID = 0
    VEHICLE_CLASS_IDS = {1, 2, 3, 5, 7}  # COCO: bicycle, car, motorcycle, bus, truck

    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        confidence_threshold: float = 0.35,
        model: Any | None = None,
    ) -> None:
        if not 0.0 <= confidence_threshold <= 1.0:
            raise ValueError("confidence_threshold must be between 0 and 1")

        self.confidence_threshold = confidence_threshold
        self.model_path = model_path

        if model is not None:
            self.model = model
        else:
            path_obj = Path(model_path)
            # Check if an explicit file path was specified and does not exist
            if (path_obj.suffix in (".pt", ".onnx", ".engine") and not path_obj.exists() and ("/" in model_path or "\\" in model_path)):
                raise FileNotFoundError(
                    f"YOLO model file not found at '{model_path}'. "
                    "Please provide valid model weights via PERSON_MODEL_PATH."
                )

            try:
                self.model = YOLO(model_path)
            except Exception as exc:
                raise RuntimeError(
                    f"Failed to initialize YOLO model from '{model_path}': {exc}"
                ) from exc

    def _parse_results(
        self,
        results: Any,
        target_class_ids: set[int] | None = None,
        default_label: str = "person",
    ) -> list[Detection]:
        detections: list[Detection] = []

        for result in results:
            if getattr(result, "boxes", None) is None:
                continue

            for box in result.boxes:
                class_id = int(box.cls.item())

                if target_class_ids is not None and class_id not in target_class_ids:
                    continue

                coords = box.xyxy[0]
                if hasattr(coords, "tolist"):
                    coords = coords.tolist()
                x1, y1, x2, y2 = (int(value) for value in coords)
                label = "person" if class_id == self.PERSON_CLASS_ID else default_label

                detections.append(
                    Detection(
                        label=label,
                        confidence=float(box.conf.item()),
                        bbox=(x1, y1, x2, y2),
                        class_id=class_id,
                    )
                )

        return detections

    def detect(self, frame) -> list[Detection]:
        """Detect people in the frame."""
        if frame is None or getattr(frame, "size", 0) == 0:
            return []

        results = self.model.predict(
            source=frame,
            conf=self.confidence_threshold,
            classes=[self.PERSON_CLASS_ID],
            verbose=False,
        )

        return self._parse_results(
            results,
            target_class_ids={self.PERSON_CLASS_ID},
            default_label="person",
        )

    def detect_vehicles(self, frame) -> list[Detection]:
        """Detect vehicles (cars, motorcycles, buses, trucks) for parking analysis."""
        if frame is None or getattr(frame, "size", 0) == 0:
            return []

        vehicle_classes = list(self.VEHICLE_CLASS_IDS)
        results = self.model.predict(
            source=frame,
            conf=self.confidence_threshold,
            classes=vehicle_classes,
            verbose=False,
        )

        return self._parse_results(
            results,
            target_class_ids=self.VEHICLE_CLASS_IDS,
            default_label="vehicle",
        )