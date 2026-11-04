import os
import unittest
from unittest.mock import patch

from config import load_settings


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.valid_env = {
            "AI_SERVICE_TOKEN": "test_ai_token_12345",
            "CONFIDENCE_THRESHOLD": "0.45",
            "CROWD_CAPACITY": "150",
            "FRAME_SKIP": "3",
            "PERSISTENCE_SECONDS": "120",
            "EVIDENCE_COUNT": "4",
            "CAMERA_SOURCE": "test_feed.mp4",
            "CAMERA_ID": "cam-test-1",
            "BACKEND_URL": "http://localhost:5000",
            "PERSON_MODEL_PATH": "yolov8n.pt",
            "LOG_LEVEL": "DEBUG",
        }

    def test_load_settings_valid(self):
        with patch.dict(os.environ, self.valid_env, clear=True):
            settings = load_settings()
            self.assertEqual(settings.ai_service_token, "test_ai_token_12345")
            self.assertEqual(settings.confidence_threshold, 0.45)
            self.assertEqual(settings.crowd_capacity, 150)
            self.assertEqual(settings.frame_skip, 3)
            self.assertEqual(settings.persistence_seconds, 120.0)
            self.assertEqual(settings.camera_id, "cam-test-1")
            self.assertEqual(settings.log_level, "DEBUG")

    def test_missing_token_raises_error(self):
        env = self.valid_env.copy()
        env["AI_SERVICE_TOKEN"] = ""
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ValueError) as ctx:
                load_settings()
            self.assertIn("AI_SERVICE_TOKEN", str(ctx.exception))

    def test_invalid_confidence_raises_error(self):
        env = self.valid_env.copy()
        env["CONFIDENCE_THRESHOLD"] = "1.5"
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ValueError):
                load_settings()

    def test_negative_capacity_raises_error(self):
        env = self.valid_env.copy()
        env["CROWD_CAPACITY"] = "-10"
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ValueError):
                load_settings()


if __name__ == "__main__":
    unittest.main()
