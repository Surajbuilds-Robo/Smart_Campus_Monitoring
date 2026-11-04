from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class AlertRuleConfig:
    crowd_warning_threshold: float = 0.70
    crowd_critical_threshold: float = 0.90
    minimum_confidence: float = 0.60
    crowd_alert_threshold: int = 4
    parking_violation_enabled: bool = True
    fall_candidate_enabled: bool = True
    violence_candidate_enabled: bool = True

    def __post_init__(self) -> None:
        for name, value in (
            ("crowd_warning_threshold", self.crowd_warning_threshold),
            ("crowd_critical_threshold", self.crowd_critical_threshold),
            ("minimum_confidence", self.minimum_confidence),
        ):
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be between 0 and 1")

        if self.crowd_alert_threshold < 0:
            raise ValueError("crowd_alert_threshold cannot be negative")

        if self.crowd_warning_threshold > self.crowd_critical_threshold:
            raise ValueError(
                "Crowd warning threshold cannot exceed critical threshold"
            )


@dataclass
class AlertCandidate:
    event_type: str
    severity: str
    camera_id: str
    message: str
    confidence: float
    timestamp: str
    requires_human_review: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_type": self.event_type,
            "severity": self.severity,
            "camera_id": self.camera_id,
            "message": self.message,
            "confidence": self.confidence,
            "timestamp": self.timestamp,
            "requires_human_review": self.requires_human_review,
            "status": "candidate",
        }


class AlertRules:
    """Evaluate AI observations and produce alert candidates."""

    def __init__(self, config: AlertRuleConfig | None = None) -> None:
        self.config = config or AlertRuleConfig()

    @staticmethod
    def _timestamp() -> str:
        return datetime.now(timezone.utc).isoformat()

    def evaluate(
        self,
        event_type: str,
        camera_id: str,
        confidence: float,
        metadata: dict[str, Any] | None = None,
    ) -> AlertCandidate | None:
        if not camera_id or not camera_id.strip():
            raise ValueError("camera_id is required")

        if not 0.0 <= confidence <= 1.0:
            raise ValueError("confidence must be between 0 and 1")

        metadata = metadata or {}
        event_type = event_type.strip().lower()

        if confidence < self.config.minimum_confidence:
            return None

        severity = None
        message = None

        if event_type == "crowd_overcrowding":
            people_count = metadata.get("people_count")
            threshold = metadata.get("threshold", self.config.crowd_alert_threshold)

            # Strict count-based rule: person_count > threshold (0-4: no alert, 5+: alert)
            if isinstance(people_count, (int, float)):
                if people_count > threshold:
                    severity = "critical" if people_count >= (threshold * 2) else "high"
                    message = (
                        f"People count threshold exceeded: {int(people_count)} detected "
                        f"(threshold: {int(threshold)})."
                    )
                else:
                    return None
            else:
                occupancy = metadata.get("occupancy_ratio")

                if not isinstance(occupancy, (int, float)):
                    return None

                if not 0.0 <= occupancy:
                    return None

                if occupancy >= self.config.crowd_critical_threshold:
                    severity = "critical"
                    message = "Crowd occupancy has reached the critical threshold."
                elif occupancy >= self.config.crowd_warning_threshold:
                    severity = "warning"
                    message = "Crowd occupancy has reached the warning threshold."

        elif event_type == "parking_violation":
            if not self.config.parking_violation_enabled:
                return None

            severity = "warning"
            message = "A potential parking violation requires review."

        elif event_type == "fall":
            if not self.config.fall_candidate_enabled:
                return None

            severity = "high"
            message = "A possible fall was detected; human review is required."

        elif event_type == "violence":
            if not self.config.violence_candidate_enabled:
                return None

            severity = "critical"
            message = "A possible violent incident requires urgent review."

        else:
            return None

        if severity is None or message is None:
            return None

        return AlertCandidate(
            event_type=event_type,
            severity=severity,
            camera_id=camera_id,
            message=message,
            confidence=confidence,
            timestamp=self._timestamp(),
            requires_human_review=True,
        )