import pytest
import numpy as np
import cv2
from backend.app.wave_analysis import WavePatternAnalyzer
from backend.app.schemas import BoundingBox, CameraMotionEstimate


def test_wave_analysis_no_water_region():
    analyzer = WavePatternAnalyzer()
    gray = np.zeros((480, 640), dtype=np.uint8)
    res = analyzer.analyze(gray, water_region=None)

    assert res.reliability == "insufficient_data"
    assert res.dominant_direction_deg is None
    assert "No water analysis region defined" in res.disclaimer
    assert "Not measured" in res.wind_direction


def test_wave_analysis_featureless_water():
    analyzer = WavePatternAnalyzer()
    # Completely flat grey image (zero texture variance)
    gray = np.ones((480, 640), dtype=np.uint8) * 128
    water_box = BoundingBox(x_min=0.1, y_min=0.1, x_max=0.9, y_max=0.9)
    res = analyzer.analyze(gray, water_region=water_box)

    assert res.reliability == "insufficient_data"
    assert "texture is too low" in res.disclaimer


def test_wave_analysis_synthetic_motion_field():
    analyzer = WavePatternAnalyzer()
    h, w = 480, 640

    # Create synthetic textured surface (sinusoidal wave pattern)
    x = np.linspace(0, 10 * np.pi, w)
    y = np.linspace(0, 10 * np.pi, h)
    xx, yy = np.meshgrid(x, y)
    frame1 = ((np.sin(xx) * np.cos(yy) + 1.0) * 127).astype(np.uint8)

    water_box = BoundingBox(x_min=0.1, y_min=0.1, x_max=0.9, y_max=0.9)

    # Frame 1 initializes
    res1 = analyzer.analyze(frame1, water_region=water_box)
    assert res1.reliability == "insufficient_data"
    assert "First water frame" in res1.disclaimer

    # Frame 2 shifted to the right by 2 pixels (u = +2, v = 0)
    # Direction should be ~0 degrees (or ~360)
    dx_shift, dy_shift = 3, 0
    M = np.float32([[1, 0, dx_shift], [0, 1, dy_shift]])
    frame2 = cv2.warpAffine(frame1, M, (w, h))

    res2 = analyzer.analyze(frame2, water_region=water_box)
    assert res2.usable_measurements > 0
    # Vector vx should be positive
    assert res2.vector[0] > 0.0
    # Angle around 0 deg (modulo 360)
    assert (res2.dominant_direction_deg < 25.0 or res2.dominant_direction_deg > 335.0)


def test_wave_analysis_manual_wind_input():
    analyzer = WavePatternAnalyzer()
    gray = np.zeros((480, 640), dtype=np.uint8)
    res = analyzer.analyze(gray, water_region=None, manual_wind_direction="North-East (NE)")
    assert "Manual entry: North-East (NE)" in res.wind_direction
