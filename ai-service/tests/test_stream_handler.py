import unittest
from unittest.mock import MagicMock, patch

from utils.stream_handler import StreamHandler


class StreamHandlerTests(unittest.TestCase):
    def test_stream_handler_init(self):
        handler = StreamHandler(source="test_video.mp4", reconnect_delay=0.1, max_reconnect_attempts=3)
        self.assertEqual(handler.source, "test_video.mp4")
        self.assertFalse(handler.is_opened)

    def test_stream_handler_stop_releases_capture(self):
        handler = StreamHandler(source="test_video.mp4")
        mock_capture = MagicMock()
        mock_capture.isOpened.return_value = True
        handler.capture = mock_capture

        self.assertTrue(handler.is_opened)
        handler.stop()

        self.assertFalse(handler._running)
        mock_capture.release.assert_called_once()
        self.assertIsNone(handler.capture)

    @patch("cv2.VideoCapture")
    def test_reconnect_limit_raises_connection_error(self, mock_cv2_capture):
        # Always fail to open
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = False
        mock_cv2_capture.return_value = mock_cap

        handler = StreamHandler(
            source="rtsp://invalid-camera-feed",
            reconnect_delay=0.01,
            max_reconnect_attempts=2,
        )

        with self.assertRaises(ConnectionError) as ctx:
            for _ in handler.frames():
                pass

        self.assertIn("connection limit reached", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
