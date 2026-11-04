import unittest
from unittest.mock import MagicMock

from detector.crowd_detector import CrowdDetector
from detector.fall_violence_detector import EventCandidate, FallViolenceDetector
from detector.parking_detector import ParkingDetector, ParkingSpace
from detector.person_detector import Detection, PersonDetector


class DetectorTests(unittest.TestCase):
    def test_person_detector_with_mock_model(self):
        # Create a mock box
        mock_box = MagicMock()
        mock_box.cls.item.return_value = 0  # Person
        mock_box.conf.item.return_value = 0.88
        mock_box.xyxy = [[10.0, 20.0, 50.0, 100.0]]

        mock_result = MagicMock()
        mock_result.boxes = [mock_box]

        mock_yolo = MagicMock()
        mock_yolo.predict.return_value = [mock_result]

        detector = PersonDetector(confidence_threshold=0.5, model=mock_yolo)
        mock_frame = MagicMock()
        mock_frame.size = 1920 * 1080

        detections = detector.detect(mock_frame)
        self.assertEqual(len(detections), 1)
        self.assertEqual(detections[0].label, "person")
        self.assertEqual(detections[0].confidence, 0.88)
        self.assertEqual(detections[0].bbox, (10, 20, 50, 100))

    def test_vehicle_detection_with_mock_model(self):
        # Create a mock car box (class 2)
        mock_box = MagicMock()
        mock_box.cls.item.return_value = 2  # Car
        mock_box.conf.item.return_value = 0.92
        mock_box.xyxy = [[100.0, 150.0, 300.0, 250.0]]

        mock_result = MagicMock()
        mock_result.boxes = [mock_box]

        mock_yolo = MagicMock()
        mock_yolo.predict.return_value = [mock_result]

        detector = PersonDetector(confidence_threshold=0.5, model=mock_yolo)
        mock_frame = MagicMock()
        mock_frame.size = 1920 * 1080

        vehicles = detector.detect_vehicles(mock_frame)
        self.assertEqual(len(vehicles), 1)
        self.assertEqual(vehicles[0].label, "vehicle")
        self.assertEqual(vehicles[0].class_id, 2)

    def test_crowd_detector_thresholds(self):
        mock_person_detector = MagicMock()
        crowd_detector = CrowdDetector(
            person_detector=mock_person_detector,
            capacity=100,
            warning_threshold=0.70,
            critical_threshold=0.90,
        )

        # 50 people -> normal
        detections_50 = [Detection("person", 0.9, (0, 0, 1, 1), 0) for _ in range(50)]
        res_50 = crowd_detector.analyze_detections(detections_50)
        self.assertEqual(res_50.people_count, 50)
        self.assertEqual(res_50.level, "normal")

        # 75 people -> warning
        detections_75 = [Detection("person", 0.9, (0, 0, 1, 1), 0) for _ in range(75)]
        res_75 = crowd_detector.analyze_detections(detections_75)
        self.assertEqual(res_75.level, "warning")

        # 95 people -> critical
        detections_95 = [Detection("person", 0.9, (0, 0, 1, 1), 0) for _ in range(95)]
        res_95 = crowd_detector.analyze_detections(detections_95)
        self.assertEqual(res_95.level, "critical")

    def test_parking_detector_overlap(self):
        # Define a parking space from (0,0) to (100, 100)
        space = ParkingSpace(
            space_id="SPACE-1",
            polygon=((0, 0), (100, 0), (100, 100), (0, 100)),
        )

        detector = ParkingDetector(spaces=[space], overlap_threshold=0.25)

        # Vehicle inside space (10, 10, 90, 90)
        vehicle = Detection("vehicle", 0.9, (10, 10, 90, 90), 2)
        results = detector.detect([vehicle])

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].space_id, "SPACE-1")
        self.assertTrue(results[0].occupied)
        self.assertGreater(results[0].vehicle_overlap, 0.8)

        # Vehicle outside space (200, 200, 300, 300)
        vehicle_away = Detection("vehicle", 0.9, (200, 200, 300, 300), 2)
        results_empty = detector.detect([vehicle_away])
        self.assertFalse(results_empty[0].occupied)

    def test_missing_model_raises_file_not_found(self):
        with self.assertRaises(FileNotFoundError):
            FallViolenceDetector(model_path="non_existent_model_weights.pt")


if __name__ == "__main__":
    unittest.main()
