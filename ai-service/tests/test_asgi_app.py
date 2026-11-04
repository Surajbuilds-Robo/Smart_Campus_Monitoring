import unittest
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

from main import app, edge_worker
from worker import EdgeWorker


class ASGIAppTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app, raise_server_exceptions=False)
        self.auth_headers = {
            "Authorization": f"Bearer {edge_worker.settings.ai_service_token}"
        }

    def test_app_instance(self):
        self.assertIsInstance(app, FastAPI)
        self.assertEqual(app.title, "Smart Campus AI Edge Service")

    def test_root_endpoint(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["service"], "Smart Campus AI Edge Service")
        self.assertIn("endpoints", data)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertTrue(data["api_running"])

    def test_ready_endpoint_schema(self):
        response = self.client.get("/ready")
        # In isolated test without real camera, returns 503 (degraded) or 200
        self.assertIn(response.status_code, (200, 503))
        data = response.json()
        self.assertIn("ready", data)
        self.assertIn("status", data)
        self.assertIn("camera", data)
        self.assertIn("detector", data)
        self.assertIn("backend", data)
        self.assertIn("configuration", data)
        self.assertEqual(data["camera"]["camera_id"], edge_worker.settings.camera_id)

    def test_status_endpoint(self):
        response = self.client.get("/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("worker_status", data)
        self.assertIn("frames_processed", data)
        self.assertIn("events_submitted", data)
        self.assertIn("camera_id", data)

    def test_worker_auth_enforcement(self):
        # Missing auth
        res_no_auth = self.client.post("/worker/stop")
        self.assertEqual(res_no_auth.status_code, 401)

        # Invalid token
        res_bad_auth = self.client.post(
            "/worker/stop",
            headers={"Authorization": "Bearer bad_secret_token"},
        )
        self.assertEqual(res_bad_auth.status_code, 401)

    def test_worker_singleton_duplicate_prevention(self):
        worker = EdgeWorker()
        worker._thread = MagicMock()
        worker._thread.is_alive.return_value = True

        # Attempting to start already running worker returns False
        started = worker.start()
        self.assertFalse(started)


if __name__ == "__main__":
    unittest.main()
