"""
Clean Kadal — Pydantic Schemas for API Requests, Responses, and Tracking Data
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    x_min: float = Field(..., ge=0.0, le=1.0, description="Normalized top-left x [0, 1]")
    y_min: float = Field(..., ge=0.0, le=1.0, description="Normalized top-left y [0, 1]")
    x_max: float = Field(..., ge=0.0, le=1.0, description="Normalized bottom-right x [0, 1]")
    y_max: float = Field(..., ge=0.0, le=1.0, description="Normalized bottom-right y [0, 1]")


class Detection(BaseModel):
    class_name: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    box: BoundingBox
    is_litter_candidate: bool = Field(
        False,
        description="True if object is considered a potential litter candidate"
    )
    is_custom_class: bool = Field(
        False,
        description="True if detected by custom Clean Kadal floating waste model"
    )


class TrackHistoryPoint(BaseModel):
    t: float = Field(..., description="POSIX timestamp in seconds")
    x: float = Field(..., description="Normalized center x")
    y: float = Field(..., description="Normalized center y")


class TrackedObject(BaseModel):
    track_id: int
    class_name: str
    confidence: float
    box: BoundingBox
    position: List[float] = Field(..., description="Normalized [center_x, center_y]")
    velocity: List[float] = Field(..., description="Estimated [vx, vy] in norm units/sec")
    speed: float = Field(..., description="Euclidean speed in norm units/sec")
    direction_deg: Optional[float] = Field(None, description="Compass/image angle in degrees (0=right, 90=down)")
    track_duration_sec: float = Field(..., ge=0.0)
    history: List[TrackHistoryPoint] = Field(default_factory=list)
    is_litter_candidate: bool = False
    predicted_position: Optional[List[float]] = None
    prediction_horizon_sec: Optional[float] = None
    prediction_reliability: Optional[str] = Field(
        None,
        description="'reliable', 'tentative', or 'insufficient_history'"
    )
    missed_frames: int = 0
    travelled_from: Optional[str] = Field(
        None,
        description="Estimated origin direction and physical entry zone (where object travelled from)"
    )
    navigating_towards: Optional[str] = Field(
        None,
        description="Estimated navigation heading and destination zone (where object is navigating towards)"
    )
    origin_position: Optional[List[float]] = Field(
        None,
        description="First observed position [x0, y0]"
    )
    heading_compass: Optional[str] = Field(
        None,
        description="Compass heading abbreviation (e.g. 'SE', 'NW')"
    )


class ModelStatus(BaseModel):
    model_loaded: bool
    model_name: str
    model_type: str = Field(..., description="'custom_trained', 'pretrained_baseline', or 'none'")
    is_custom_trained: bool
    supported_classes: List[str]
    weights_path: str
    device: str
    status_message: str
    confidence_threshold: float = 0.25


class CameraMotionEstimate(BaseModel):
    dx: float = Field(0.0, description="Camera displacement dx in normalized units")
    dy: float = Field(0.0, description="Camera displacement dy in normalized units")
    rotation_deg: float = Field(0.0, description="Estimated camera roll rotation")
    status: str = Field("unavailable", description="'successful', 'uncertain', or 'unavailable'")
    tracked_features: int = 0
    warning: Optional[str] = None


class WaveAnalysisResult(BaseModel):
    dominant_direction_deg: Optional[float] = Field(None, description="Dominant wave propagation direction in degrees")
    vector: List[float] = Field(default_factory=lambda: [0.0, 0.0], description="Estimated wave vector [vx, vy]")
    magnitude: float = 0.0
    usable_measurements: int = 0
    reliability: str = Field("insufficient_data", description="'reliable', 'low_confidence', or 'insufficient_data'")
    camera_compensation_status: str = "unavailable"
    disclaimer: str = (
        "Visible surface-pattern propagation is an optical estimate and is not necessarily "
        "equal to physical water current velocity or floating object drift."
    )
    wind_direction: str = "Not measured (camera-only system; requires external anemometer or manual entry)"


class TrajectoryPredictionRequest(BaseModel):
    track_id: int
    history: List[TrackHistoryPoint]
    horizon_sec: float = Field(1.5, ge=0.1, le=10.0)
    method: str = Field("constant_velocity", description="'constant_velocity' or 'wave_informed'")
    wave_vector: Optional[List[float]] = None
    wave_reliability: Optional[str] = None


class TrajectoryPredictionResponse(BaseModel):
    track_id: int
    method_used: str
    predicted_position: List[float]
    horizon_sec: float
    estimated_velocity: List[float]
    speed: float
    direction_deg: Optional[float]
    reliability: str = Field(..., description="'reliable', 'tentative', or 'insufficient_history'")
    disclaimer: str


class TrajectoryEvaluationRequest(BaseModel):
    track_id: int
    predicted_position: List[float]
    observed_position: List[float]


class TrajectoryEvaluationResponse(BaseModel):
    track_id: int
    euclidean_error: float
    error_x: float
    error_y: float


class AccumulationCell(BaseModel):
    row: int
    col: int
    unique_objects_count: int
    total_dwell_time_sec: float
    entry_count: int
    classification: str = Field(
        "none",
        description="'none', 'tentative_candidate', 'observed_accumulation', or 'predicted_accumulation'"
    )
    is_corner_or_wall: bool = False


class AccumulationTrackInput(BaseModel):
    track_id: int
    positions: List[TrackHistoryPoint]
    predicted_position: Optional[List[float]] = None


class AccumulationAnalysisRequest(BaseModel):
    grid_rows: int = Field(3, ge=2, le=10)
    grid_cols: int = Field(3, ge=2, le=10)
    tracks: List[AccumulationTrackInput]
    water_region: Optional[BoundingBox] = None
    threshold_dwell_sec: float = Field(5.0, ge=1.0)
    threshold_unique_objects: int = Field(2, ge=1)


class AccumulationAnalysisResponse(BaseModel):
    grid: List[List[AccumulationCell]]
    summary_status: str = Field("insufficient_data", description="'sufficient_data' or 'insufficient_data'")
    message: str
    hotspots_count: int
    dominant_zone: Optional[str] = None


class FrameAnalysisRequest(BaseModel):
    image_base64: str
    timestamp: float
    water_region: Optional[BoundingBox] = None
    reference_region: Optional[BoundingBox] = None
    prediction_horizon_sec: float = 1.5
    prediction_method: str = "constant_velocity"
    manual_wind_direction: Optional[str] = None


class FrameAnalysisResponse(BaseModel):
    timestamp: float
    model_status: ModelStatus
    detections: List[Detection]
    tracked_objects: List[TrackedObject]
    camera_motion: CameraMotionEstimate
    wave_analysis: WaveAnalysisResult
    accumulation_summary: Optional[AccumulationAnalysisResponse] = None
    warnings: List[str] = Field(default_factory=list)
