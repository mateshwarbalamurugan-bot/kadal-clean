import pytest
from backend.app.trajectory import TrajectoryPredictor
from backend.app.schemas import (
    TrackHistoryPoint,
    TrajectoryPredictionRequest,
    TrajectoryEvaluationRequest
)


def test_trajectory_linear_constant_velocity():
    predictor = TrajectoryPredictor()

    # Object moving linearly at vx = 0.05/sec, vy = 0.02/sec
    history = [
        TrackHistoryPoint(t=0.0, x=0.20, y=0.30),
        TrackHistoryPoint(t=1.0, x=0.25, y=0.32),
        TrackHistoryPoint(t=2.0, x=0.30, y=0.34),
    ]

    req = TrajectoryPredictionRequest(
        track_id=1,
        history=history,
        horizon_sec=1.0,
        method="constant_velocity"
    )

    res = predictor.predict(req)
    assert res.track_id == 1
    assert res.method_used == "constant_velocity"
    assert res.reliability == "reliable"
    assert pytest.approx(res.estimated_velocity[0], abs=0.005) == 0.05
    assert pytest.approx(res.estimated_velocity[1], abs=0.005) == 0.02
    # At t=3.0 (horizon=1.0s), pred_x should be 0.35, pred_y should be 0.36
    assert pytest.approx(res.predicted_position[0], abs=0.01) == 0.35
    assert pytest.approx(res.predicted_position[1], abs=0.01) == 0.36


def test_trajectory_stationary_object():
    predictor = TrajectoryPredictor()
    # Object stationary at x=0.5, y=0.5
    history = [
        TrackHistoryPoint(t=0.0, x=0.5, y=0.5),
        TrackHistoryPoint(t=1.0, x=0.5, y=0.5),
        TrackHistoryPoint(t=2.0, x=0.5, y=0.5),
    ]
    req = TrajectoryPredictionRequest(
        track_id=2,
        history=history,
        horizon_sec=1.5,
        method="constant_velocity"
    )
    res = predictor.predict(req)
    assert res.reliability == "tentative"
    assert res.predicted_position == [0.5, 0.5]


def test_trajectory_insufficient_history():
    predictor = TrajectoryPredictor()
    # Only 1 point
    history = [TrackHistoryPoint(t=0.0, x=0.1, y=0.1)]
    req = TrajectoryPredictionRequest(
        track_id=3,
        history=history,
        horizon_sec=1.0
    )
    res = predictor.predict(req)
    assert res.reliability == "insufficient_history"


def test_trajectory_wave_informed():
    predictor = TrajectoryPredictor()
    history = [
        TrackHistoryPoint(t=0.0, x=0.20, y=0.20),
        TrackHistoryPoint(t=1.0, x=0.22, y=0.20),
        TrackHistoryPoint(t=2.0, x=0.24, y=0.20),
    ]
    # Wave pushing downward [0.0, 0.1]
    req = TrajectoryPredictionRequest(
        track_id=4,
        history=history,
        horizon_sec=1.0,
        method="wave_informed",
        wave_vector=[0.0, 0.1],
        wave_reliability="reliable"
    )
    res = predictor.predict(req)
    assert res.method_used == "wave_informed"
    # vy should be influenced downwards (> 0)
    assert res.predicted_position[1] > 0.20
    assert "Experimental wave-informed" in res.disclaimer


def test_trajectory_evaluation():
    eval_req = TrajectoryEvaluationRequest(
        track_id=1,
        predicted_position=[0.40, 0.50],
        observed_position=[0.43, 0.54]
    )
    eval_res = TrajectoryPredictor.evaluate(eval_req)
    assert pytest.approx(eval_res.error_x, abs=0.001) == 0.03
    assert pytest.approx(eval_res.error_y, abs=0.001) == 0.04
    # 3-4-5 right triangle -> euclidean error = 0.05
    assert pytest.approx(eval_res.euclidean_error, abs=0.001) == 0.05
