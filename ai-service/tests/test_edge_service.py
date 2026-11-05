import unittest
from unittest.mock import MagicMock

from config import Settings
from detector.person_detector import Detection
from main import check_system_readiness, run_edge_service


class EdgeServiceIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(
            camera_source="test.mp4",
            camera_id="cam-gate-1",
            backend_url="http://localhost:5000",
            ai_service_token="test_token",
            person_model_path="yolov8n.pt",
            confidence_threshold=0.35,
            crowd_capacity=10,
            persistence_seconds=0.0,  # 0 for immediate verification in test
            frame_skip=1,
            evidence_dir="temp_evidence",
            evidence_count=1,
            log_level="ERROR",
        )

    def test_run_edge_service_bounded_loop(self):
        mock_frame = MagicMock()
        mock_frame.size = 1000

        mock_stream = MagicMock()
        mock_stream.frames.return_value = [mock_frame, mock_frame, mock_frame]
        mock_stream.__enter__.return_value = mock_stream

        mock_detector = MagicMock()
        # Return 15 people (capacity is 10, so ratio = 1.5, triggers critical overcrowding)
        mock_detector.detect.return_value = [
            Detection("person", 0.9, (0, 0, 10, 10), 0) for _ in range(15)
        ]

        mock_backend = MagicMock()
        mock_backend.send_event.return_value = {"accepted": True}

        result = run_edge_service(
            settings=self.settings,
            stop_after_frames=2,
            stream_handler=mock_stream,
            person_detector=mock_detector,
            backend_client=mock_backend,
        )

        self.assertGreaterEqual(result["frames_processed"], 2)
        self.assertEqual(result["events_submitted"], 1)
        mock_backend.send_event.assert_called_once()

    def test_check_system_readiness(self):
        readiness = check_system_readiness(self.settings)
        self.assertEqual(readiness["camera_id"], "cam-gate-1")
        self.assertEqual(readiness["frame_skip"], 1)
        self.assertIn("backend_reachable", readiness)


if __name__ == "__main__":
    unittest.main()
