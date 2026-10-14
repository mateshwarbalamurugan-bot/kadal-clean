import pytest
import numpy as np
import cv2
from backend.app.camera_compensation import CameraMotionEstimator
from backend.app.schemas import BoundingBox


def test_camera_compensation_no_reference_region():
    estimator = CameraMotionEstimator()
    gray = np.zeros((480, 640), dtype=np.uint8)
    res = estimator.estimate_motion(gray, reference_region=None)

    assert res.status == "unavailable"
    assert res.dx == 0.0
    assert res.dy == 0.0
    assert "No stationary reference region selected" in res.warning


def test_camera_compensation_tiny_region():
    estimator = CameraMotionEstimator()
    gray = np.zeros((480, 640), dtype=np.uint8)
    tiny_box = BoundingBox(x_min=0.1, y_min=0.1, x_max=0.11, y_max=0.11)
    res = estimator.estimate_motion(gray, reference_region=tiny_box)

    assert res.status == "unavailable"
    assert "too small" in res.warning


def test_camera_compensation_synthetic_translation():
    estimator = CameraMotionEstimator()
    h, w = 480, 640

    # Create synthetic frame with clear corners in the top region
    frame1 = np.zeros((h, w), dtype=np.uint8)
    for y in range(20, 100, 20):
        for x in range(20, 200, 20):
            cv2.circle(frame1, (x, y), 3, 255, -1)

    ref_box = BoundingBox(x_min=0.0, y_min=0.0, x_max=0.4, y_max=0.25)

    # Frame 1 initializes
    res1 = estimator.estimate_motion(frame1, reference_region=ref_box)
    assert res1.status == "uncertain"
    assert res1.tracked_features > 0

    # Frame 2 shifted by dx = +6 px, dy = +4 px
    dx_shift, dy_shift = 6, 4
    M = np.float32([[1, 0, dx_shift], [0, 1, dy_shift]])
    frame2 = cv2.warpAffine(frame1, M, (w, h))

    res2 = estimator.estimate_motion(frame2, reference_region=ref_box)
    assert res2.status in ("successful", "uncertain")
    assert res2.tracked_features >= 4
    # Check normalized dx is close to 6/640 ≈ 0.00938
    expected_dx = dx_shift / w
    assert pytest.approx(res2.dx, abs=0.005) == expected_dx
