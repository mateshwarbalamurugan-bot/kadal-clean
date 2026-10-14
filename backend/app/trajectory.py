"""
Clean Kadal — Trajectory Prediction and Evaluation Module
Estimates object velocity in normalized image space from timestamped tracking history
and predicts future positions using either constant-velocity projection or experimental
wave-informed motion modeling.
"""
from typing import List, Optional, Tuple
import math
from .schemas import (
    TrackHistoryPoint,
    TrajectoryPredictionRequest,
    TrajectoryPredictionResponse,
    TrajectoryEvaluationRequest,
    TrajectoryEvaluationResponse
)


class TrajectoryPredictor:
    def __init__(self, min_history_points: int = 3, min_history_duration_sec: float = 0.25):
        self.min_history_points = min_history_points
        self.min_history_duration_sec = min_history_duration_sec

    def compute_velocity(self, history: List[TrackHistoryPoint]) -> Tuple[float, float, float, Optional[float]]:
        """
        Computes velocity [vx, vy] (norm units/sec), speed, and direction (deg)
        using linear regression or weighted finite difference over chronological history.
        """
        if len(history) < 2:
            return 0.0, 0.0, 0.0, None

        # Verify chronological order
        sorted_hist = sorted(history, key=lambda p: p.t)
        dt_total = sorted_hist[-1].t - sorted_hist[0].t
        if dt_total <= 1e-4:
            return 0.0, 0.0, 0.0, None

        # Use recent window (up to last 10 points) for responsive velocity
        window = sorted_hist[-10:] if len(sorted_hist) > 10 else sorted_hist
        n = len(window)
        t0 = window[0].t
        ts = [p.t - t0 for p in window]
        xs = [p.x for p in window]
        ys = [p.y for p in window]

        # Linear least-squares slope for x and y over time
        t_mean = sum(ts) / n
        x_mean = sum(xs) / n
        y_mean = sum(ys) / n

        denom = sum((t - t_mean) ** 2 for t in ts)
        if denom < 1e-6:
            # Fallback to simple endpoint difference
            dt = window[-1].t - window[0].t
            if dt < 1e-4:
                return 0.0, 0.0, 0.0, None
            vx = (window[-1].x - window[0].x) / dt
            vy = (window[-1].y - window[0].y) / dt
        else:
            vx = sum((ts[i] - t_mean) * (xs[i] - x_mean) for i in range(n)) / denom
            vy = sum((ts[i] - t_mean) * (ys[i] - y_mean) for i in range(n)) / denom

        speed = math.sqrt(vx ** 2 + vy ** 2)
        if speed > 1e-5:
            # Angle in degrees: 0 deg = right (+x), 90 deg = down (+y in image space)
            angle_rad = math.atan2(vy, vx)
            direction_deg = (math.degrees(angle_rad)) % 360.0
        else:
            direction_deg = None

        return round(vx, 5), round(vy, 5), round(speed, 5), (round(direction_deg, 1) if direction_deg is not None else None)

    def predict(self, req: TrajectoryPredictionRequest) -> TrajectoryPredictionResponse:
        """
        Predicts future position at t + horizon_sec based on history and chosen method.
        """
        if not req.history:
            return TrajectoryPredictionResponse(
                track_id=req.track_id,
                method_used=req.method,
                predicted_position=[0.0, 0.0],
                horizon_sec=req.horizon_sec,
                estimated_velocity=[0.0, 0.0],
                speed=0.0,
                direction_deg=None,
                reliability="insufficient_history",
                disclaimer="No tracking history supplied. Cannot compute trajectory prediction."
            )

        sorted_hist = sorted(req.history, key=lambda p: p.t)
        curr_x = sorted_hist[-1].x
        curr_y = sorted_hist[-1].y
        dt_span = sorted_hist[-1].t - sorted_hist[0].t

        vx, vy, speed, dir_deg = self.compute_velocity(sorted_hist)

        # Check reliability
        if len(sorted_hist) < self.min_history_points or dt_span < self.min_history_duration_sec:
            reliability = "insufficient_history"
        elif speed < 0.005:
            reliability = "tentative"  # Stationary or near-stationary object
        else:
            reliability = "reliable"

        # Apply prediction model
        if req.method == "wave_informed" and req.wave_vector and req.wave_reliability == "reliable":
            # Experimental wave-informed model: conservative wave-drift coupling alpha = 0.25
            alpha = 0.25
            # wave_vector is [w_vx, w_vy] in norm units/frame or norm units/sec
            w_vx, w_vy = req.wave_vector[0], req.wave_vector[1]
            pred_vx = vx + alpha * w_vx
            pred_vy = vy + alpha * w_vy
            method_used = "wave_informed"
            disclaimer = (
                "Experimental wave-informed trajectory: combines observed object momentum with "
                "measured surface wave propagation vector. Note: physical drift depends on object buoyancy "
                "and does not always match wave propagation direction."
            )
        else:
            pred_vx = vx
            pred_vy = vy
            method_used = "constant_velocity"
            disclaimer = (
                "Baseline linear constant-velocity projection: assumes observed velocity remains constant "
                f"over the {req.horizon_sec}s prediction horizon without external disturbances."
            )

        # Project future position
        pred_x = curr_x + pred_vx * req.horizon_sec
        pred_y = curr_y + pred_vy * req.horizon_sec

        # Clamp to normalized image coordinate bounds [0.0, 1.0]
        clamped_x = max(0.0, min(1.0, pred_x))
        clamped_y = max(0.0, min(1.0, pred_y))

        return TrajectoryPredictionResponse(
            track_id=req.track_id,
            method_used=method_used,
            predicted_position=[round(clamped_x, 4), round(clamped_y, 4)],
            horizon_sec=req.horizon_sec,
            estimated_velocity=[round(pred_vx, 5), round(pred_vy, 5)],
            speed=round(speed, 5),
            direction_deg=dir_deg,
            reliability=reliability,
            disclaimer=disclaimer
        )

    @staticmethod
    def evaluate(req: TrajectoryEvaluationRequest) -> TrajectoryEvaluationResponse:
        """
        Evaluates prediction accuracy when future observation is acquired.
        """
        err_x = req.observed_position[0] - req.predicted_position[0]
        err_y = req.observed_position[1] - req.predicted_position[1]
        euclidean_err = math.sqrt(err_x ** 2 + err_y ** 2)

        return TrajectoryEvaluationResponse(
            track_id=req.track_id,
            euclidean_error=round(euclidean_err, 4),
            error_x=round(err_x, 4),
            error_y=round(err_y, 4)
        )
