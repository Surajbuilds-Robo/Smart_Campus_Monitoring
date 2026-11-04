from dataclasses import dataclass

from .person_detector import Detection


@dataclass(frozen=True)
class ParkingSpace:
    space_id: str
    polygon: tuple[tuple[int, int], ...]

    def __post_init__(self) -> None:
        if len(self.polygon) < 3:
            raise ValueError(
                f"Parking space {self.space_id} needs at least 3 points"
            )


@dataclass
class ParkingResult:
    space_id: str
    occupied: bool
    vehicle_overlap: float

    def to_dict(self) -> dict:
        return {
            "space_id": self.space_id,
            "occupied": self.occupied,
            "vehicle_overlap": round(self.vehicle_overlap, 4),
        }


class ParkingDetector:
    """
    Estimate parking occupancy from vehicle bounding boxes.

    Vehicle detections must come from a compatible vehicle detector.
    Polygon coordinates must use the same image dimensions as the frame.
    """

    def __init__(
        self,
        spaces: list[ParkingSpace],
        overlap_threshold: float = 0.20,
    ) -> None:
        if not 0.0 <= overlap_threshold <= 1.0:
            raise ValueError("overlap_threshold must be between 0 and 1")

        ids = [space.space_id for space in spaces]

        if len(ids) != len(set(ids)):
            raise ValueError("Parking space IDs must be unique")

        self.spaces = spaces
        self.overlap_threshold = overlap_threshold

    @staticmethod
    def _point_in_polygon(
        x: float,
        y: float,
        polygon: tuple[tuple[int, int], ...],
    ) -> bool:
        inside = False
        j = len(polygon) - 1

        for i, (xi, yi) in enumerate(polygon):
            xj, yj = polygon[j]

            crosses = (yi > y) != (yj > y)

            if crosses:
                intersection_x = (
                    (xj - xi) * (y - yi) / (yj - yi) + xi
                )

                if x < intersection_x:
                    inside = not inside

            j = i

        return inside

    @classmethod
    def _overlap_ratio(
        cls,
        bbox: tuple[int, int, int, int],
        polygon: tuple[tuple[int, int], ...],
        samples: int = 12,
    ) -> float:
        """
        Approximate the proportion of bounding-box sample points
        that fall inside a parking polygon.

        This is an approximation, not an exact geometric intersection.
        """
        x1, y1, x2, y2 = bbox

        if x2 <= x1 or y2 <= y1:
            return 0.0

        total = 0
        inside = 0

        for row in range(samples):
            y = y1 + (row + 0.5) * (y2 - y1) / samples

            for col in range(samples):
                x = x1 + (col + 0.5) * (x2 - x1) / samples
                total += 1

                if cls._point_in_polygon(x, y, polygon):
                    inside += 1

        return inside / total if total else 0.0

    def detect(
        self,
        vehicle_detections: list[Detection],
    ) -> list[ParkingResult]:
        results: list[ParkingResult] = []

        for space in self.spaces:
            maximum_overlap = 0.0

            for vehicle in vehicle_detections:
                overlap = self._overlap_ratio(
                    vehicle.bbox,
                    space.polygon,
                )
                maximum_overlap = max(maximum_overlap, overlap)

            results.append(
                ParkingResult(
                    space_id=space.space_id,
                    occupied=maximum_overlap >= self.overlap_threshold,
                    vehicle_overlap=maximum_overlap,
                )
            )

        return results