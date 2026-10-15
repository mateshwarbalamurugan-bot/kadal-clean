import base64
import pytest
import numpy as np
import cv2
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_get_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "Clean Kadal" in data["service"]
    assert "model_loaded" in data


def test_get_status_alias():
    response = client.get("/status")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_production_frontend_origin_is_allowed_by_cors():
    response = client.options(
        "/api/analyze/frame",
        headers={
            "Origin": "https://clean-kadal.vercel.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://clean-kadal.vercel.app"


def test_vercel_preview_origin_is_allowed_by_cors():
    origin = "https://clean-kadal-git-feature-matcom1.vercel.app"
    response = client.options(
        "/api/analyze/frame",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_get_model_status():
    response = client.get("/api/model/status")
    assert response.status_code == 200
    data = response.json()
    assert "model_type" in data
    assert "supported_classes" in data
    assert "is_custom_trained" in data


def test_trajectory_endpoint_valid():
    payload = {
        "track_id": 10,
        "history": [
            {"t": 1.0, "x": 0.2, "y": 0.2},
            {"t": 2.0, "x": 0.3, "y": 0.25},
            {"t": 3.0, "x": 0.4, "y": 0.30}
        ],
        "horizon_sec": 1.5,
        "method": "constant_velocity"
    }
    response = client.post("/api/analyze/trajectory", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["track_id"] == 10
    assert len(data["predicted_position"]) == 2
    assert data["reliability"] == "reliable"


def test_trajectory_endpoint_invalid_timestamps():
    payload = {
        "track_id": 11,
        "history": [
            {"t": 3.0, "x": 0.2, "y": 0.2},
            {"t": 2.0, "x": 0.3, "y": 0.25}  # non-chronological!
        ],
        "horizon_sec": 1.5,
        "method": "constant_velocity"
    }
    response = client.post("/api/analyze/trajectory", json=payload)
    assert response.status_code == 400
    assert "Timestamps must be non-decreasing" in response.json()["detail"]


def test_trajectory_evaluation_endpoint():
    payload = {
        "track_id": 12,
        "predicted_position": [0.5, 0.5],
        "observed_position": [0.53, 0.54]
    }
    response = client.post("/api/analyze/trajectory/evaluate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert pytest.approx(data["euclidean_error"], abs=0.001) == 0.05


def test_accumulation_endpoint():
    payload = {
        "grid_rows": 3,
        "grid_cols": 3,
        "tracks": [
            {
                "track_id": 1,
                "positions": [
                    {"t": 0.0, "x": 0.1, "y": 0.1},
                    {"t": 1.0, "x": 0.1, "y": 0.1}
                ]
            }
        ]
    }
    response = client.post("/api/analyze/accumulation", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["grid"]) == 3
    assert "summary_status" in data


def test_frame_analysis_endpoint_synthetic():
    # Create synthetic frame and encode to base64
    img = np.zeros((240, 320, 3), dtype=np.uint8)
    cv2.circle(img, (160, 120), 30, (255, 255, 255), -1)
    _, buf = cv2.imencode(".jpg", img)
    b64_str = base64.b64encode(buf).decode("utf-8")

    payload = {
        "image_base64": f"data:image/jpeg;base64,{b64_str}",
        "timestamp": 12345.0,
        "water_region": {
            "x_min": 0.1,
            "y_min": 0.1,
            "x_max": 0.9,
            "y_max": 0.9
        },
        "prediction_horizon_sec": 1.5,
        "prediction_method": "constant_velocity"
    }

    response = client.post("/api/analyze/frame", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "detections" in data
    assert "tracked_objects" in data
    assert "wave_analysis" in data
    assert "camera_motion" in data


def test_static_image_disables_temporal_outputs():
    img = np.zeros((120, 160, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    b64_str = base64.b64encode(buf).decode("utf-8")
    response = client.post("/api/analyze/frame", json={
        "image_base64": f"data:image/jpeg;base64,{b64_str}",
        "timestamp": 12346.0,
        "is_static_image": True,
    })

    assert response.status_code == 200
    data = response.json()
    assert data["tracked_objects"] == []
    assert data["accumulation_summary"] is None
    assert data["camera_motion"]["status"] == "unavailable"
    assert data["wave_analysis"]["reliability"] == "insufficient_data"
    assert any("Static image" in warning for warning in data["warnings"])


def test_frame_analysis_rejects_html_data_url():
    payload = {
        "image_base64": "data:text/html; charset=utf-8;base64,PGh0bWw+PC9odG1sPg==",
        "timestamp": 12345.0,
    }
    response = client.post("/api/analyze/frame", json=payload)
    assert response.status_code == 400
    assert "Only base64 data URLs" in response.json()["detail"]


def test_frame_analysis_rejects_declared_mime_that_does_not_match_bytes():
    image = np.zeros((32, 32, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    payload = {
        "image_base64": "data:image/jpeg;base64," + base64.b64encode(encoded).decode("ascii"),
        "timestamp": 12345.0,
    }
    response = client.post("/api/analyze/frame", json=payload)
    assert response.status_code == 400
    assert "does not match the image bytes" in response.json()["detail"]


def test_tracker_reset_endpoint():
    response = client.post("/api/tracker/reset")
    assert response.status_code == 200
    assert "reset successfully" in response.json()["message"]
