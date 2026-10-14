"""
Clean Kadal — FastAPI Backend
AI-Based Floating Waste Detection and Water-Motion Analysis Research Service
"""
import base64
import time
from typing import Dict, Any, List
import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .schemas import (
    ModelStatus,
    FrameAnalysisRequest,
    FrameAnalysisResponse,
    TrajectoryPredictionRequest,
    TrajectoryPredictionResponse,
    TrajectoryEvaluationRequest,
    TrajectoryEvaluationResponse,
    AccumulationAnalysisRequest,
    AccumulationAnalysisResponse,
    AccumulationTrackInput
)
from .model_loader import ModelManager
from .detector import ObjectDetector
from .tracker import ObjectTracker
from .camera_compensation import CameraMotionEstimator
from .wave_analysis import WavePatternAnalyzer
from .trajectory import TrajectoryPredictor
from .accumulation import AccumulationAnalyzer

# Initialize FastAPI application
app = FastAPI(
    title="Clean Kadal Research API",
    description="Scientific API for floating waste detection, camera-motion compensation, "
                "surface wave-pattern analysis, trajectory prediction, and accumulation mapping.",
    version="1.0.0"
)

# CORS configuration for local development and production deployments (e.g., Vercel)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core analytics and CV engine singletons
model_mgr = ModelManager()
# Attempt initial model loading at startup
model_mgr.load_model()

detector = ObjectDetector(model_mgr)
tracker = ObjectTracker()
camera_compensator = CameraMotionEstimator()
wave_analyzer = WavePatternAnalyzer()
trajectory_predictor = TrajectoryPredictor()
accumulation_analyzer = AccumulationAnalyzer()


@app.get("/health", tags=["System"])
def health_check() -> Dict[str, Any]:
    """Health check endpoint for Render, container orchestrators, and frontend connectivity check."""
    return {
        "status": "healthy",
        "service": "Clean Kadal Research Backend",
        "version": "1.0.0",
        "model_loaded": model_mgr.status.model_loaded,
        "model_type": model_mgr.status.model_type,
        "timestamp": time.time()
    }


@app.get("/api/model/status", response_model=ModelStatus, tags=["AI Model"])
def get_model_status() -> ModelStatus:
    """Returns current model status: whether custom or baseline is active, and supported classes."""
    return model_mgr.get_status()


@app.post("/api/model/reload", response_model=ModelStatus, tags=["AI Model"])
def reload_model() -> ModelStatus:
    """Reloads model weights from models/ directory if custom weights were added or updated."""
    return model_mgr.load_model()


@app.post("/api/tracker/reset", tags=["Tracking"])
def reset_tracker() -> Dict[str, str]:
    """Resets tracking IDs and camera compensation states for a new experiment session."""
    tracker.reset()
    camera_compensator.reset()
    wave_analyzer.reset()
    return {"message": "Tracker, camera motion estimator, and wave analyzer state reset successfully."}


@app.post("/api/analyze/frame", response_model=FrameAnalysisResponse, tags=["Video Analysis"])
def analyze_frame(req: FrameAnalysisRequest) -> FrameAnalysisResponse:
    """
    Core real-time frame processing endpoint:
    1. Decodes client camera frame (not retained or written to disk).
    2. Runs object detector.
    3. Estimates boat camera motion using the stationary reference region.
    4. Analyzes surface wave patterns within the selected water region.
    5. Updates multi-object tracks, velocities, and trajectory forecasts.
    """
    warnings: List[str] = []

    # 1. Decode base64 image
    try:
        if "," in req.image_base64:
            payload = req.image_base64.split(",", 1)[1]
        else:
            payload = req.image_base64

        img_bytes = base64.b64decode(payload)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            raise ValueError("cv2.imdecode returned None")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid base64 image data: {str(e)}"
        )

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # 2. Run object detector
    detections = detector.detect(img_bgr, conf_threshold=model_mgr.status.confidence_threshold)
    if not model_mgr.status.model_loaded:
        warnings.append("AI model not loaded. Detection is currently inactive.")

    # 3. Estimate camera motion from stationary reference
    camera_motion = camera_compensator.estimate_motion(gray, req.reference_region)
    if camera_motion.warning:
        warnings.append(camera_motion.warning)

    # 4. Analyze wave-pattern motion in water region
    object_boxes = [d.box for d in detections]
    wave_res = wave_analyzer.analyze(
        current_gray=gray,
        water_region=req.water_region,
        object_boxes=object_boxes,
        camera_motion=camera_motion,
        manual_wind_direction=req.manual_wind_direction
    )

    # 5. Update object tracker and compute trajectory projections
    tracked_objects = tracker.update(
        detections=detections,
        timestamp=req.timestamp,
        horizon_sec=req.prediction_horizon_sec,
        prediction_method=req.prediction_method,
        wave_vector=wave_res.vector if wave_res.reliability == "reliable" else None,
        wave_reliability=wave_res.reliability
    )

    # 6. Optional inline accumulation summary if tracks exist
    accum_summary = None
    if tracker.active_tracks:
        track_inputs = [
            AccumulationTrackInput(
                track_id=t.track_id,
                positions=t.history,
                predicted_position=t.predicted_position
            )
            for t in tracker.active_tracks.values()
        ]
        accum_req = AccumulationAnalysisRequest(
            grid_rows=3,
            grid_cols=3,
            tracks=track_inputs,
            water_region=req.water_region
        )
        accum_summary = accumulation_analyzer.analyze(accum_req)

    return FrameAnalysisResponse(
        timestamp=req.timestamp,
        model_status=model_mgr.get_status(),
        detections=detections,
        tracked_objects=tracked_objects,
        camera_motion=camera_motion,
        wave_analysis=wave_res,
        accumulation_summary=accum_summary,
        warnings=warnings
    )


@app.post("/api/analyze/trajectory", response_model=TrajectoryPredictionResponse, tags=["Trajectory"])
def analyze_trajectory(req: TrajectoryPredictionRequest) -> TrajectoryPredictionResponse:
    """Computes future object trajectory position based on tracking history points."""
    if len(req.history) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trajectory analysis requires at least 2 chronological observation points."
        )

    # Check chronological ordering
    for i in range(1, len(req.history)):
        if req.history[i].t < req.history[i - 1].t:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Timestamps must be non-decreasing: point {i} ({req.history[i].t}) < point {i-1} ({req.history[i-1].t})"
            )

    return trajectory_predictor.predict(req)


@app.post("/api/analyze/trajectory/evaluate", response_model=TrajectoryEvaluationResponse, tags=["Trajectory"])
def evaluate_trajectory(req: TrajectoryEvaluationRequest) -> TrajectoryEvaluationResponse:
    """Evaluates prediction error between predicted and subsequent observed position."""
    return trajectory_predictor.evaluate(req)


@app.post("/api/analyze/accumulation", response_model=AccumulationAnalysisResponse, tags=["Accumulation"])
def analyze_accumulation(req: AccumulationAnalysisRequest) -> AccumulationAnalysisResponse:
    """Computes dwell time and accumulation statistics across a 3x3 grid."""
    if req.grid_rows < 2 or req.grid_cols < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Grid dimensions must be at least 2x2."
        )
    return accumulation_analyzer.analyze(req)
