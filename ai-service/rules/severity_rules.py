from dataclasses import dataclass
from typing import Any


SEVERITY_LEVELS = ("info", "warning", "high", "critical")


@dataclass(frozen=True)
class SeverityConfig:
    crowd_warning_threshold: float = 0.70
    crowd_critical_threshold: float = 0.90
    low_confidence_threshold: float = 0.60
    high_confidence_threshold: float = 0.85

    def __post_init__(self) -> None:
        for name, value in vars(self).items():
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be between 0 and 1")

        if self.crowd_warning_threshold > self.crowd_critical_threshold:
            raise ValueError(
                "Crowd warning threshold cannot exceed critical threshold"
            )


class SeverityRules:
    """Classify event severity. This does not verify an incident."""

    def __init__(self, config: SeverityConfig | None = None) -> None:
        self.config = config or SeverityConfig()

    def classify(
        self,
        event_type: str,
        confidence: float,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        if not 0.0 <= confidence <= 1.0:
            raise ValueError("confidence must be between 0 and 1")

        event_type = event_type.strip().lower()
        metadata = metadata or {}

        if confidence < self.config.low_confidence_threshold:
            return "info"

        if event_type == "violence":
            return "critical"

        if event_type == "fall":
            return "high"

        if event_type == "crowd_overcrowding":
            occupancy = metadata.get("occupancy_ratio")

            if not isinstance(occupancy, (int, float)):
                return "info"

            if occupancy >= self.config.crowd_critical_threshold:
                return "critical"

            if occupancy >= self.config.crowd_warning_threshold:
                return "warning"

            return "info"

        if event_type == "parking_violation":
            if confidence >= self.config.high_confidence_threshold:
                return "high"

            return "warning"

        return "info"