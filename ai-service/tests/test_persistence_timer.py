import unittest

from utils.timer_2min import PersistenceTimer


class PersistenceTimerTests(unittest.TestCase):
    def test_persistence_requires_configured_duration(self):
        timer = PersistenceTimer(duration_seconds=120.0)
        event_key = "cam-1:overcrowding"

        # Frame at t = 0
        self.assertFalse(timer.update(event_key, detected=True, now=0.0))

        # Frame at t = 60s
        self.assertFalse(timer.update(event_key, detected=True, now=60.0))

        # Frame at t = 119s
        self.assertFalse(timer.update(event_key, detected=True, now=119.0))

        # Frame at t = 120s (persisted for full 2 minutes)
        self.assertTrue(timer.update(event_key, detected=True, now=120.0))

        # Still detected at t = 125s
        self.assertTrue(timer.update(event_key, detected=True, now=125.0))

    def test_interruption_resets_timer(self):
        timer = PersistenceTimer(duration_seconds=120.0)
        event_key = "cam-1:overcrowding"

        # Active for 90s
        timer.update(event_key, detected=True, now=0.0)
        timer.update(event_key, detected=True, now=90.0)

        # Condition clears at t = 95s
        self.assertFalse(timer.update(event_key, detected=False, now=95.0))

        # Re-detected at t = 100s: clock must start over from t = 100s
        self.assertFalse(timer.update(event_key, detected=True, now=100.0))
        self.assertFalse(timer.update(event_key, detected=True, now=190.0))  # 90s elapsed since restart
        self.assertTrue(timer.update(event_key, detected=True, now=220.0))   # 120s elapsed since restart

    def test_clear_removes_all_state(self):
        timer = PersistenceTimer(duration_seconds=10.0)
        timer.update("cam-1", True, now=0.0)
        timer.update("cam-2", True, now=0.0)
        self.assertEqual(len(timer.active_since), 2)

        timer.clear()
        self.assertEqual(len(timer.active_since), 0)


if __name__ == "__main__":
    unittest.main()
