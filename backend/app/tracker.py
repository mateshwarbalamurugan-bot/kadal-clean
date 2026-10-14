"""
Clean Kadal — Object Tracker Module
Centroid and IoU-based multi-object tracker that maintains track identities,
timestamped observation histories, image-space velocities, and motion trails.
"""
from typing import List, Dict, Optional, Tuple
import math
from .schemas import (
    Detection,
    TrackedObject,
    TrackHistoryPoint,
    TrajectoryPredictionRequest
)
from .trajectory import TrajectoryPredictor


class ObjectTracker:
    def __init__(
        self,
        max_distance_threshold: float = 0.12,  # normalized image distance
        max_missed_frames: int = 20,
        max_history_len: int = 30
    ):
        self.max_distance_threshold = max_distance_threshold
        self.max_missed_frames = max_missed_frames
        self.max_history_len = max_history_len
        self.next_track_id = 1
        self.active_tracks: Dict[int, TrackedObject] = {}
        self.predictor = TrajectoryPredictor()

    def reset(self):
        """Reset all active tracks and reset ID counter."""
        self.next_track_id = 1
        self.active_tracks.clear()

    @staticmethod
    def _box_center(box) -> Tuple[float, float]:
        cx = (box.x_min + box.x_max) / 2.0
        cy = (box.y_min + box.y_max) / 2.0
        return cx, cy

    @staticmethod
    def _distance(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)

    def update(
        self,
        detections: List[Detection],
        timestamp: float,
        horizon_sec: float = 1.5,
        prediction_method: str = "constant_velocity",
        wave_vector: Optional[List[float]] = None,
        wave_reliability: Optional[str] = None
    ) -> List[TrackedObject]:
        """
        Associate detections to active tracks, create new tracks for unassociated detections,
        update motion histories and trajectory predictions, and age out inactive tracks.
        """
        matched_track_ids = set()
        matched_det_indices = set()

        # If there are active tracks and detections, associate using greedy nearest-neighbor
        if self.active_tracks and detections:
            cost_matrix = []
            track_ids = list(self.active_tracks.keys())

            for tid in track_ids:
                track = self.active_tracks[tid]
                t_center = (track.position[0], track.position[1])
                row = []
                for det in detections:
                    d_center = self._box_center(det.box)
                    dist = self._distance(t_center, d_center)
                    # Class mismatch penalty
                    if det.class_name != track.class_name:
                        dist += 0.25
                    row.append(dist)
                cost_matrix.append(row)

            # Greedy match lowest cost pairs
            flat_matches = []
            for t_idx, row in enumerate(cost_matrix):
                for d_idx, dist in enumerate(row):
                    if dist <= self.max_distance_threshold:
                        flat_matches.append((dist, t_idx, d_idx))

            flat_matches.sort(key=lambda x: x[0])

            for dist, t_idx, d_idx in flat_matches:
                tid = track_ids[t_idx]
                if tid not in matched_track_ids and d_idx not in matched_det_indices:
                    det = detections[d_idx]
                    self._update_track(
                        tid=tid,
                        det=det,
                        timestamp=timestamp,
                        horizon_sec=horizon_sec,
                        prediction_method=prediction_method,
                        wave_vector=wave_vector,
                        wave_reliability=wave_reliability
                    )
                    matched_track_ids.add(tid)
                    matched_det_indices.add(d_idx)

        # Unmatched detections become new tracks
        for d_idx, det in enumerate(detections):
            if d_idx not in matched_det_indices:
                new_tid = self._create_track(
                    det=det,
                    timestamp=timestamp,
                    horizon_sec=horizon_sec,
                    prediction_method=prediction_method,
                    wave_vector=wave_vector,
                    wave_reliability=wave_reliability
                )
                matched_track_ids.add(new_tid)

        # Update missed frames for unmatched active tracks and prune lost tracks
        dead_tracks = []
        for tid, track in self.active_tracks.items():
            if tid not in matched_track_ids:
                track.missed_frames += 1
                if track.missed_frames > self.max_missed_frames:
                    dead_tracks.append(tid)

        for tid in dead_tracks:
            del self.active_tracks[tid]

        # Return list of currently visible tracks (missed_frames == 0)
        return [t for t in self.active_tracks.values() if t.missed_frames == 0]

    @staticmethod
    def _get_zone_name(x: float, y: float) -> str:
        if x < 0.33 and y < 0.33:
            return "Top-Left Corner (NW)"
        elif x > 0.66 and y < 0.33:
            return "Top-Right Corner (NE)"
        elif x < 0.33 and y > 0.66:
            return "Bottom-Left Corner (SW)"
        elif x > 0.66 and y > 0.66:
            return "Bottom-Right Corner (SE)"
        elif y < 0.25:
            return "Top Wall / Hand-Wave Inflow (North)"
        elif y > 0.75:
            return "Bottom Wall (South)"
        elif x < 0.25:
            return "Left Wall (West)"
        elif x > 0.75:
            return "Right Wall (East)"
        else:
            return "Center Water Basin"

    @staticmethod
    def _angle_to_compass(angle_deg: float) -> Tuple[str, str]:
        sectors = [
            (22.5, 67.5, "SE", "South-East (Towards Bottom-Right)"),
            (67.5, 112.5, "S", "South (Towards Bottom Wall)"),
            (112.5, 157.5, "SW", "South-West (Towards Bottom-Left)"),
            (157.5, 202.5, "W", "West (Towards Left Wall)"),
            (202.5, 247.5, "NW", "North-West (Towards Top-Left)"),
            (247.5, 292.5, "N", "North (Towards Top Wall)"),
            (292.5, 337.5, "NE", "North-East (Towards Top-Right)"),
        ]
        for low, high, code, label in sectors:
            if low <= angle_deg < high:
                return code, label
        return "E", "East (Towards Right Wall)"

    def _apply_direction_semantics(self, track: TrackedObject, vx: float, vy: float, speed: float):
        x0 = track.history[0].x
        y0 = track.history[0].y
        x_curr = track.position[0]
        y_curr = track.position[1]
        dx_total = x_curr - x0
        dy_total = y_curr - y0
        dist_total = math.sqrt(dx_total ** 2 + dy_total ** 2)

        origin_zone = self._get_zone_name(x0, y0)
        track.origin_position = [x0, y0]

        # 1. Travelled From Direction & Origin Sector
        if dist_total >= 0.02:
            origin_angle = (math.degrees(math.atan2(-dy_total, -dx_total))) % 360.0
            code, label = self._angle_to_compass(origin_angle)
            track.travelled_from = f"From {code} ({label.split('(')[0].strip()}) · Origin: {origin_zone}"
        else:
            track.travelled_from = f"Originated at {origin_zone} (x={x0:.2f}, y={y0:.2f})"

        # 2. Navigating Towards Direction & Destination Sector
        if speed >= 0.005:
            heading_angle = (math.degrees(math.atan2(vy, vx))) % 360.0
            code, label = self._angle_to_compass(heading_angle)
            track.heading_compass = code
            dest_zone = self._get_zone_name(
                track.predicted_position[0], track.predicted_position[1]
            ) if track.predicted_position else "Ahead"
            track.navigating_towards = f"Heading {code} ({label}) ➔ Towards {dest_zone}"
        else:
            track.heading_compass = "STATIONARY"
            track.navigating_towards = f"Stationary / In-place drift within {origin_zone}"

    def _create_track(
        self,
        det: Detection,
        timestamp: float,
        horizon_sec: float,
        prediction_method: str,
        wave_vector: Optional[List[float]],
        wave_reliability: Optional[str]
    ):
        cx, cy = self._box_center(det.box)
        tid = self.next_track_id
        self.next_track_id += 1

        history = [TrackHistoryPoint(t=timestamp, x=round(cx, 4), y=round(cy, 4))]
        origin_zone = self._get_zone_name(cx, cy)

        track = TrackedObject(
            track_id=tid,
            class_name=det.class_name,
            confidence=round(det.confidence, 3),
            box=det.box,
            position=[round(cx, 4), round(cy, 4)],
            velocity=[0.0, 0.0],
            speed=0.0,
            direction_deg=None,
            track_duration_sec=0.0,
            history=history,
            is_litter_candidate=det.is_litter_candidate,
            predicted_position=None,
            prediction_horizon_sec=horizon_sec,
            prediction_reliability="insufficient_history",
            missed_frames=0,
            travelled_from=f"Initial observation at {origin_zone}",
            navigating_towards="Monitoring initial trajectory...",
            origin_position=[round(cx, 4), round(cy, 4)],
            heading_compass="NEW"
        )
        self.active_tracks[tid] = track
        return tid

    def _update_track(
        self,
        tid: int,
        det: Detection,
        timestamp: float,
        horizon_sec: float,
        prediction_method: str,
        wave_vector: Optional[List[float]],
        wave_reliability: Optional[str]
    ):
        track = self.active_tracks[tid]
        cx, cy = self._box_center(det.box)

        # Append to history
        new_pt = TrackHistoryPoint(t=timestamp, x=round(cx, 4), y=round(cy, 4))
        track.history.append(new_pt)
        if len(track.history) > self.max_history_len:
            track.history.pop(0)

        track.box = det.box
        track.confidence = round(det.confidence, 3)
        track.position = [round(cx, 4), round(cy, 4)]
        track.is_litter_candidate = det.is_litter_candidate
        track.missed_frames = 0

        # Calculate track duration
        t_start = track.history[0].t
        track.track_duration_sec = round(timestamp - t_start, 2)

        # Estimate velocity
        vx, vy, speed, dir_deg = self.predictor.compute_velocity(track.history)
        track.velocity = [vx, vy]
        track.speed = speed
        track.direction_deg = dir_deg

        # Compute trajectory prediction
        pred_req = TrajectoryPredictionRequest(
            track_id=tid,
            history=track.history,
            horizon_sec=horizon_sec,
            method=prediction_method,
            wave_vector=wave_vector,
            wave_reliability=wave_reliability
        )
        pred_res = self.predictor.predict(pred_req)
        track.predicted_position = pred_res.predicted_position
        track.prediction_horizon_sec = horizon_sec
        track.prediction_reliability = pred_res.reliability

        # Calculate semantic directions (travelled from & navigating towards)
        self._apply_direction_semantics(track, vx, vy, speed)
