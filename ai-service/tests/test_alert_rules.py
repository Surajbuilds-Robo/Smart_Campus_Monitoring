import unittest

from rules.alert_rules import AlertRuleConfig, AlertRules
from rules.severity_rules import SeverityConfig, SeverityRules


class AlertRulesTests(unittest.TestCase):
    def setUp(self):
        self.rules = AlertRules()

    def test_low_confidence_is_ignored(self):
        result = self.rules.evaluate(
            "fall",
            "camera-01",
            0.30,
        )
        self.assertIsNone(result)

    def test_critical_crowd_candidate(self):
        result = self.rules.evaluate(
            "crowd_overcrowding",
            "camera-01",
            0.90,
            {"occupancy_ratio": 0.95},
        )

        self.assertIsNotNone(result)
        self.assertEqual(result.severity, "critical")
        self.assertTrue(result.requires_human_review)
        self.assertEqual(result.to_dict()["status"], "candidate")

    def test_warning_crowd_candidate(self):
        result = self.rules.evaluate(
            "crowd_overcrowding",
            "camera-01",
            0.80,
            {"occupancy_ratio": 0.75},
        )

        self.assertIsNotNone(result)
        self.assertEqual(result.severity, "warning")

    def test_unknown_event_is_ignored(self):
        self.assertIsNone(
            self.rules.evaluate("unknown_event", "camera-01", 0.95)
        )

    def test_missing_camera_id_is_rejected(self):
        with self.assertRaises(ValueError):
            self.rules.evaluate("fall", "", 0.90)

    def test_invalid_confidence_is_rejected(self):
        with self.assertRaises(ValueError):
            self.rules.evaluate("fall", "camera-01", 1.50)

    def test_invalid_configuration_is_rejected(self):
        with self.assertRaises(ValueError):
            AlertRuleConfig(
                crowd_warning_threshold=0.95,
                crowd_critical_threshold=0.80,
            )


class SeverityRulesTests(unittest.TestCase):
    def setUp(self):
        self.rules = SeverityRules()

    def test_violence_is_critical(self):
        self.assertEqual(
            self.rules.classify("violence", 0.95),
            "critical",
        )

    def test_fall_is_high(self):
        self.assertEqual(
            self.rules.classify("fall", 0.90),
            "high",
        )

    def test_low_confidence_is_info(self):
        self.assertEqual(
            self.rules.classify("parking_violation", 0.30),
            "info",
        )

    def test_critical_crowd(self):
        self.assertEqual(
            self.rules.classify(
                "crowd_overcrowding",
                0.95,
                {"occupancy_ratio": 0.95},
            ),
            "critical",
        )

    def test_invalid_severity_configuration_is_rejected(self):
        with self.assertRaises(ValueError):
            SeverityConfig(low_confidence_threshold=1.5)


if __name__ == "__main__":
    unittest.main()