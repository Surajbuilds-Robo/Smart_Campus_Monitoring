import unittest
from unittest.mock import MagicMock, patch

from config import Settings
from utils.stream_handler import StreamHandler
from worker import EdgeWorker


class StreamResilienceTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(
            camera_source="http://192.0.2.1:8080/video",  # RFC 5737 TEST-NET (unroutable)
            camera_id="CAM-TEST",
            backend_url="http://localhost:5000",
            ai_service_token="test_token_12345678901234567890123456",
            person_model_path="yolov8n.pt",
            confidence_threshold=0.35,
            crowd_capacity=100,
            persistence_seconds=120.0,
            frame_skip=5,
            evidence_dir="evidence",
            evidence_count=4,
            log_level="ERROR",
            connect_timeout=0.1,
            initial_retry_delay=2.0,
            max_retry_delay=16.0,
        )

    def test_tcp_probe_fails_cleanly_on_unreachable_endpoint(self):
        """Pre-flight TCP check fails cleanly without invoking OpenCV/FFmpeg."""
        handler = StreamHandler("http://127.0.0.1:59999/video", connect_timeout=0.1)
        ok, err = handler.probe_tcp()
        self.assertFalse(ok)
        self.assertTrue("refused" in str(err).lower() or "timed out" in str(err).lower() or "failed" in str(err).lower())


    def test_tcp_probe_bypassed_for_local_video_file(self):
        """Local video files and device integers bypass network TCP probe."""
        handler = StreamHandler("test_video.mp4")
        ok, err = handler.probe_tcp()
        self.assertTrue(ok)
        self.assertIsNone(err)

    def test_open_aborts_early_when_tcp_fails(self):
        """When TCP connection fails, open() returns False immediately without launching VideoCapture."""
        handler = StreamHandler("http://127.0.0.1:59999/video", connect_timeout=0.1)
        with patch("cv2.VideoCapture") as mock_cap:
            opened = handler.open()
            self.assertFalse(opened)
            mock_cap.assert_not_called()
            self.assertFalse(handler.tcp_verified)

    def test_exponential_backoff_progression(self):
        """Successive disconnects scale retry delay by 1.5x up to max_retry_delay."""
        worker = EdgeWorker(self.settings)
        mock_stream = MagicMock()
        mock_stream.tcp_verified = False
        mock_stream.http_verified = False

        worker._handle_disconnect("Connection refused", mock_stream)
        self.assertEqual(worker.consecutive_failures, 1)
        self.assertAlmostEqual(worker.current_retry_delay, 2.0)

        worker._handle_disconnect("Connection refused", mock_stream)
        self.assertEqual(worker.consecutive_failures, 2)
        self.assertAlmostEqual(worker.current_retry_delay, 3.0)

        worker._handle_disconnect("Connection refused", mock_stream)
        self.assertEqual(worker.consecutive_failures, 3)
        self.assertAlmostEqual(worker.current_retry_delay, 4.5)

    def test_source_resolution_precedence(self):
        """Worker checks reachability when backend and env URLs disagree."""
        worker = EdgeWorker(self.settings)
        mock_backend = MagicMock()
        mock_backend.get_camera_config.return_value = {
            "streamUrl": "http://10.112.164.88:8080/video"
        }

        with patch.object(StreamHandler, "probe_tcp", return_value=(True, None)):
            # When env source is probed reachable, it takes precedence over disagreeing backend
            source = worker._resolve_source(mock_backend)
            self.assertEqual(source, self.settings.camera_source)

    def test_readiness_report_diagnostics_schema(self):
        """Diagnostics expose tcp_verified, http_verified, consecutive_failures, next_retry_delay."""
        worker = EdgeWorker(self.settings)
        worker.consecutive_failures = 3
        worker.last_error = "TCP connection refused"

        report = worker.get_readiness_report()
        self.assertIn("camera", report)
        self.assertIn("tcp_verified", report["camera"])
        self.assertIn("http_verified", report["camera"])
        self.assertEqual(report["camera"]["consecutive_failures"], 3)
        self.assertEqual(report["camera"]["error"], "TCP connection refused")

        status = worker.get_status_report()
        self.assertIn("next_retry_delay", status)
        self.assertIn("has_valid_frame", status)


if __name__ == "__main__":
    unittest.main()
