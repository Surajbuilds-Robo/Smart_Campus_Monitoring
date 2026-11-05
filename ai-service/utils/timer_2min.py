import time
from dataclasses import dataclass, field


@dataclass
class PersistenceTimer:
    """Require an event to persist before treating it as verified."""

    duration_seconds: float = 120.0
    active_since: dict[str, float] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.duration_seconds < 0:
            raise ValueError("duration_seconds cannot be negative")

    def update(
        self,
        event_key: str,
        detected: bool,
        now: float | None = None,
    ) -> bool:
        """
        Return True when the event has persisted long enough.

        Use the same event key for repeated observations of one event.
        """
        if not event_key:
            raise ValueError("event_key is required")

        current_time = time.monotonic() if now is None else now

        if not detected:
            self.active_since.pop(event_key, None)
            return False

        if event_key not in self.active_since:
            self.active_since[event_key] = current_time

        elapsed = current_time - self.active_since[event_key]
        return elapsed >= self.duration_seconds

    def reset(self, event_key: str) -> None:
        self.active_since.pop(event_key, None)

    def clear(self) -> None:
        self.active_since.clear()