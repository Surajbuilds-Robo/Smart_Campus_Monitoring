import os
import time
from typing import Any

from dotenv import load_dotenv
import requests

load_dotenv()


class BackendClient:
    """Send authenticated AI events to the Express backend."""

    def __init__(
        self,
        base_url: str,
        api_token: str,
        timeout: float = 10.0,
        max_retries: int = 3,
    ) -> None:
        if not base_url:
            raise ValueError("Backend base URL is required")

        if not api_token:
            raise ValueError("AI service API token is required")

        if timeout <= 0 or max_retries < 1:
            raise ValueError("Invalid timeout or retry configuration")

        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {api_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )

    @classmethod
    def from_environment(cls) -> "BackendClient":
        backend_url = os.environ.get("BACKEND_URL", "http://localhost:5000")
        api_token = os.environ.get("AI_SERVICE_TOKEN", "")

        if not api_token:
            raise ValueError("AI_SERVICE_TOKEN environment variable is required")

        return cls(
            base_url=backend_url,
            api_token=api_token,
            timeout=float(os.getenv("BACKEND_TIMEOUT", "10")),
            max_retries=int(os.getenv("BACKEND_MAX_RETRIES", "3")),
        )

    def check_health(self) -> dict[str, Any]:
        """Verify connectivity to the backend health endpoint."""
        try:
            response = self.session.get(
                f"{self.base_url}/api/v1/health",
                timeout=self.timeout,
            )
            return {
                "reachable": response.status_code == 200,
                "status_code": response.status_code,
            }
        except requests.RequestException as exc:
            return {
                "reachable": False,
                "error": str(exc),
            }

    def get_camera_config(self, camera_id: str) -> dict[str, Any] | None:
        """Fetch registered camera stream configuration from the backend."""
        try:
            response = self.session.get(
                f"{self.base_url}/api/v1/ai/cameras/{camera_id}",
                timeout=self.timeout,
            )
            if response.status_code == 200:
                body = response.json()
                return body.get("data")
            return None
        except requests.RequestException:
            return None

    def get_all_cameras(self) -> list[dict[str, Any]]:
        """Fetch all registered and active cameras from the backend."""
        try:
            response = self.session.get(
                f"{self.base_url}/api/v1/ai/cameras",
                timeout=self.timeout,
            )
            if response.status_code == 200:
                body = response.json()
                data = body.get("data")
                if isinstance(data, dict):
                    return data.get("cameras", [])
                elif isinstance(data, list):
                    return data
                elif isinstance(body.get("cameras"), list):
                    return body["cameras"]
                return []
            return []
        except requests.RequestException:
            return []

    def send_event(self, event: dict[str, Any]) -> dict[str, Any]:
        """Submit an authenticated event to the Express backend (/api/v1/ai/events)."""
        last_error = None

        for attempt in range(self.max_retries):
            try:
                response = self.session.post(
                    f"{self.base_url}/api/v1/ai/events",
                    json=event,
                    timeout=self.timeout,
                )

                if response.status_code in (200, 201, 202):
                    if not response.content:
                        return {"accepted": True}

                    try:
                        return response.json()
                    except requests.exceptions.JSONDecodeError:
                        return {"accepted": True}

                if response.status_code < 500 and response.status_code != 429:
                    response.raise_for_status()

                last_error = RuntimeError(
                    f"Backend returned HTTP {response.status_code}"
                )

            except requests.RequestException as exc:
                last_error = exc

            if attempt < self.max_retries - 1:
                time.sleep(min(2**attempt, 8))

        raise RuntimeError(
            f"Could not deliver AI event after {self.max_retries} attempts"
        ) from last_error

    def close(self) -> None:
        self.session.close()