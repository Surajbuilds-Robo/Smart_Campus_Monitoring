import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from utils.screenshot_burst import ScreenshotBurst


class ScreenshotBurstTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_empty_frame_raises(self):
        burst = ScreenshotBurst(output_dir=self.temp_dir, count=2)
        with self.assertRaises(ValueError):
            burst.capture(None, "camera-01")

    @patch("cv2.imwrite", return_value=True)
    def test_capture_burst_metadata(self, _mock_imwrite):
        burst = ScreenshotBurst(
            output_dir=self.temp_dir,
            count=3,
            interval_seconds=0.01,
        )

        mock_frame = MagicMock()
        mock_frame.size = 1920 * 1080

        records = burst.capture(mock_frame, "camera-01")
        self.assertEqual(len(records), 3)
        self.assertEqual(records[0]["camera_id"], "camera-01")
        self.assertTrue(Path(records[0]["path"]).name.startswith("camera-01_"))


if __name__ == "__main__":
    unittest.main()
