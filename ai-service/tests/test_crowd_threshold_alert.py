import unittest
import numpy as np
import cv2
from config import Settings
from rules.alert_rules import AlertRules, AlertRuleConfig
from worker import CameraSession

class TestCrowdThresholdAlert(unittest.TestCase):
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
            crowd_alert_threshold=4,
        )
        self.config = AlertRuleConfig(crowd_alert_threshold=4)
        self.engine = AlertRules(self.config)

    def test_default_threshold_is_four(self):
        self.assertEqual(self.settings.crowd_alert_threshold, 4)
        self.assertEqual(self.config.crowd_alert_threshold, 4)

    def test_zero_to_four_people_does_not_trigger_incident(self):
        for count in [0, 1, 2, 3, 4]:
            candidate = self.engine.evaluate(
                event_type="crowd_overcrowding",
                camera_id="CAM-01",
                confidence=0.95,
                metadata={"people_count": count, "threshold": 4},
            )
            self.assertIsNone(
                candidate,
                f"Count of {count} must not trigger crowd alert when threshold is 4",
            )

    def test_five_people_triggers_incident(self):
        candidate = self.engine.evaluate(
            event_type="crowd_overcrowding",
            camera_id="CAM-01",
            confidence=0.92,
            metadata={"people_count": 5, "threshold": 4},
        )
        self.assertIsNotNone(candidate, "Count of 5 must trigger crowd alert")
        self.assertEqual(candidate.camera_id, "CAM-01")
        self.assertEqual(candidate.event_type, "crowd_overcrowding")
        self.assertIn("5", candidate.message)
        self.assertIn("4", candidate.message)

    def test_six_or_more_people_triggers_incident(self):
        for count in [6, 10, 25]:
            candidate = self.engine.evaluate(
                event_type="crowd_overcrowding",
                camera_id="CAM-02",
                confidence=0.88,
                metadata={"people_count": count, "threshold": 4},
            )
            self.assertIsNotNone(candidate, f"Count of {count} must trigger crowd alert")
            self.assertEqual(candidate.event_type, "crowd_overcrowding")
            self.assertIn(str(count), candidate.message)

    def test_camera_session_immediate_trigger_and_deduplication(self):
        session = CameraSession(
            camera_id="CAM-01",
            stream_url="rtsp://test",
            name="North Gate",
            capacity=25,
            settings=self.settings,
        )
        self.assertEqual(session.crowd_alert_threshold, 4)
        self.assertFalse(session.is_crowd_alert_active)

        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

        # 1. Four people: does not trigger
        cand1, img1 = session.process_crowd_observation(4, 0.9, dummy_frame)
        self.assertIsNone(cand1)
        self.assertIsNone(img1)
        self.assertFalse(session.is_crowd_alert_active)

        # 2. Five people: triggers immediately with base64 evidence frame
        cand2, img2 = session.process_crowd_observation(5, 0.95, dummy_frame)
        self.assertIsNotNone(cand2)
        self.assertTrue(session.is_crowd_alert_active)
        self.assertIsNotNone(img2)
        self.assertTrue(len(img2) > 0)
        self.assertEqual(cand2.event_type, "crowd_overcrowding")
        self.assertIn("5", cand2.message)

        # 3. Repeated qualifying frames (6 people, 7 people): deduplicated, no new candidate
        cand3, img3 = session.process_crowd_observation(6, 0.96, dummy_frame)
        self.assertIsNone(cand3, "Repeated qualifying frame must not produce duplicate alert")
        self.assertIsNone(img3)
        cand4, img4 = session.process_crowd_observation(7, 0.94, dummy_frame)
        self.assertIsNone(cand4, "Repeated qualifying frame must not produce duplicate alert")
        self.assertIsNone(img4)
        self.assertTrue(session.is_crowd_alert_active)

        # 4. Stream disconnect: active alert flag must be preserved
        session.camera_connected = False
        self.assertTrue(session.is_crowd_alert_active)

        # 5. Missing / None telemetry: condition does not reset
        cand_none, img_none = session.process_crowd_observation(None, 0.0, None)
        self.assertIsNone(cand_none)
        self.assertTrue(session.is_crowd_alert_active)

        # 6. Fresh frame returns to <= 4 people: resets condition
        cand_reset, img_reset = session.process_crowd_observation(3, 0.85, dummy_frame)
        self.assertIsNone(cand_reset)
        self.assertFalse(session.is_crowd_alert_active, "Count <= threshold must reset crowd alert state")

        # 7. Subsequent qualifying frame (5+ people): triggers new candidate
        cand_next, img_next = session.process_crowd_observation(5, 0.92, dummy_frame)
        self.assertIsNotNone(cand_next, "Subsequent transition above threshold must trigger a new alert")
        self.assertIsNotNone(img_next)
        self.assertTrue(session.is_crowd_alert_active)

if __name__ == "__main__":
    unittest.main()
