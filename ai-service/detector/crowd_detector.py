from dataclasses import dataclass

from .person_detector import Detection, PersonDetector


@dataclass
class CrowdResult:
    people_count: int
    capacity: int
    occupancy_ratio: float
    level: str

    def to_dict(self) -> dict:
        return {
            "people_count": self.people_count,
            "capacity": self.capacity,
            "occupancy_ratio": round(self.occupancy_ratio, 4),
            "level": self.level,
        }


class CrowdDetector:
    """Estimate crowd levels from person detections."""

    def __init__(
        self,
        person_detector: PersonDetector,
        capacity: int,
        warning_threshold: float = 0.70,
        critical_threshold: float = 0.90,
    ) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be greater than zero")

        if not 0.0 <= warning_threshold <= 1.0:
            raise ValueError("warning_threshold must be between 0 and 1")

        if not 0.0 <= critical_threshold <= 1.0:
            raise ValueError("critical_threshold must be between 0 and 1")

        if warning_threshold > critical_threshold:
            raise ValueError(
                "warning_threshold cannot exceed critical_threshold"
            )

        self.person_detector = person_detector
        self.capacity = capacity
        self.warning_threshold = warning_threshold
        self.critical_threshold = critical_threshold

    def analyze_detections(
        self,
        detections: list[Detection],
    ) -> CrowdResult:
        people_count = sum(
            detection.label == "person"
            for detection in detections
        )

        ratio = people_count / self.capacity

        if ratio >= self.critical_threshold:
            level = "critical"
        elif ratio >= self.warning_threshold:
            level = "warning"
        else:
            level = "normal"

        return CrowdResult(
            people_count=people_count,
            capacity=self.capacity,
            occupancy_ratio=ratio,
            level=level,
        )

    def detect(self, frame) -> CrowdResult:
        detections = self.person_detector.detect(frame)
        return self.analyze_detections(detections)
    