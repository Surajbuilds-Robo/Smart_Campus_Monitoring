import unittest
from unittest.mock import MagicMock, patch

from config import Settings
from worker import CameraSession, EdgeWorker


class MultiCameraWorkerTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(
            camera_source="http://127.0.0.1:8080/video",
            camera_id="CAM-MAIN",
            backend_url="http://localhost:5000",
            ai_service_token="test_token",
            person_model_path="yolov8n.pt",
            confidence_threshold=0.35,
            crowd_capacity=50,
            persistence_seconds=120.0,
            frame_skip=5,
            evidence_dir="evidence",
            evidence_count=4,
            log_level="ERROR",
            connect_timeout=0.1,
            initial_retry_delay=1.0,
            max_retry_delay=10.0,
        )

    def test_camera_session_lifecycle(self):
        """Test independent camera session start, status, and stop."""
        session = CameraSession(
            camera_id="CAM-01",
            stream_url="http://10.0.0.1:8080/video",
            name="North Gate",
            capacity=25,
            settings=self.settings,
        )
        self.assertEqual(session.camera_id, "CAM-01")
        self.assertEqual(session.capacity, 25)
        self.assertFalse(session.is_running)

        report = session.get_status_report()
        self.assertEqual(report["camera_id"], "CAM-01")
        self.assertEqual(report["worker_status"], "disconnected")

        def mock_loop():
            session._stop_event.wait(timeout=2.0)

        with patch.object(session, "_session_loop", side_effect=mock_loop):
            started = session.start()
            self.assertTrue(started)
            self.assertTrue(session.is_running)

            # Duplicate start prevention
            second_start = session.start()
            self.assertFalse(second_start)

            session.stop()
            self.assertFalse(session.is_running)

    def test_multi_camera_sync_from_backend(self):
        """Test supervisor synchronizes multiple cameras from backend registry."""
        worker = EdgeWorker(self.settings)
        mock_backend = MagicMock()
        mock_backend.get_all_cameras.return_value = [
            {
                "cameraId": "CAM-01",
                "name": "North Gate",
                "streamUrl": "http://192.168.1.101:8080/video",
                "isActive": True,
            },
            {
                "cameraId": "CAM-02",
                "name": "Library Entrance",
                "streamUrl": "http://192.168.1.102:8080/video",
                "isActive": True,
            },
            {
                "cameraId": "CAM-03",
                "name": "Cafeteria",
                "streamUrl": "http://192.168.1.103:8080/video",
                "isActive": True,
            },
        ]
        worker._backend_client = mock_backend

        # Run sync with mock session loops
        with patch.object(CameraSession, "start", return_value=True):
            worker.sync_cameras()
            self.assertEqual(len(worker.sessions), 3)
            self.assertIn("CAM-01", worker.sessions)
            self.assertIn("CAM-02", worker.sessions)
            self.assertIn("CAM-03", worker.sessions)

            # Simulate camera 2 removal from backend
            mock_backend.get_all_cameras.return_value = [
                {
                    "cameraId": "CAM-01",
                    "name": "North Gate",
                    "streamUrl": "http://192.168.1.101:8080/video",
                    "isActive": True,
                },
                {
                    "cameraId": "CAM-03",
                    "name": "Cafeteria",
                    "streamUrl": "http://192.168.1.103:8080/video",
                    "isActive": True,
                },
            ]
            worker.sync_cameras()
            self.assertEqual(len(worker.sessions), 2)
            self.assertNotIn("CAM-02", worker.sessions)
            self.assertIn("CAM-01", worker.sessions)
            self.assertIn("CAM-03", worker.sessions)

    def test_one_camera_disconnect_does_not_affect_others(self):
        """Failure / disconnect of CAM-02 does not alter CAM-01 status."""
        session1 = CameraSession(
            camera_id="CAM-01",
            stream_url="http://192.168.1.101:8080/video",
            settings=self.settings,
        )
        session2 = CameraSession(
            camera_id="CAM-02",
            stream_url="http://192.168.1.102:8080/video",
            settings=self.settings,
        )

        session1.camera_connected = True
        session1.status = "processing"

        mock_stream = MagicMock()
        mock_stream.tcp_verified = False
        mock_stream.http_verified = False
        session2._handle_disconnect("Host unreachable", mock_stream)

        self.assertEqual(session2.status, "reconnecting")
        self.assertFalse(session2.camera_connected)
        self.assertEqual(session2.consecutive_failures, 1)

        # session1 remains connected and processing
        self.assertTrue(session1.camera_connected)
        self.assertEqual(session1.status, "processing")
        self.assertEqual(session1.consecutive_failures, 0)


if __name__ == "__main__":
    unittest.main()
