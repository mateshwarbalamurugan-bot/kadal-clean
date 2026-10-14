"""
Clean Kadal — Wave Pattern Direction Estimation Module
Analyzes water-surface texture movement using optical flow on the selected water region,
masks out detected floating waste objects, compensates for estimated camera motion,
and calculates the dominant wave propagation vector with strict reliability thresholds.
"""
from typing import List, Optional, Tuple
import cv2
import numpy as np
from .schemas import BoundingBox, WaveAnalysisResult, CameraMotionEstimate


class WavePatternAnalyzer:
    def __init__(
        self,
        min_gradient_variance: float = 12.0,
        flow_coherence_threshold: float = 0.45,
        min_usable_vectors: int = 15
    ):
        self.min_gradient_variance = min_gradient_variance
        self.flow_coherence_threshold = flow_coherence_threshold
        self.min_usable_vectors = min_usable_vectors
        self.prev_water_gray: Optional[np.ndarray] = None
        self.prev_water_roi_coords: Optional[Tuple[int, int, int, int]] = None

    def reset(self):
        """Reset temporal state."""
        self.prev_water_gray = None
        self.prev_water_roi_coords = None

    def analyze(
        self,
        current_gray: np.ndarray,
        water_region: Optional[BoundingBox],
        object_boxes: Optional[List[BoundingBox]] = None,
        camera_motion: Optional[CameraMotionEstimate] = None,
        manual_wind_direction: Optional[str] = None
    ) -> WaveAnalysisResult:
        """
        Analyze wave-pattern motion in the water region across consecutive frames.
        """
        h, w = current_gray.shape[:2]
        wind_text = (
            f"Manual entry: {manual_wind_direction}"
            if manual_wind_direction
            else "Not measured (camera-only system; requires external anemometer or manual entry)"
        )
        comp_status = camera_motion.status if camera_motion else "unavailable"

        if water_region is None:
            self.prev_water_gray = None
            return WaveAnalysisResult(
                dominant_direction_deg=None,
                vector=[0.0, 0.0],
                magnitude=0.0,
                usable_measurements=0,
                reliability="insufficient_data",
                camera_compensation_status=comp_status,
                disclaimer=(
                    "No water analysis region defined. Please select the visible water region "
                    "in the camera view to enable wave analysis."
                ),
                wind_direction=wind_text
            )

        wx1 = max(0, int(water_region.x_min * w))
        wy1 = max(0, int(water_region.y_min * h))
        wx2 = min(w, int(water_region.x_max * w))
        wy2 = min(h, int(water_region.y_max * h))

        if (wx2 - wx1) < 40 or (wy2 - wy1) < 40:
            self.prev_water_gray = None
            return WaveAnalysisResult(
                dominant_direction_deg=None,
                vector=[0.0, 0.0],
                magnitude=0.0,
                usable_measurements=0,
                reliability="insufficient_data",
                camera_compensation_status=comp_status,
                disclaimer="Selected water region is too small (< 40x40 px) for optical wave tracking.",
                wind_direction=wind_text
            )

        current_water_gray = current_gray[wy1:wy2, wx1:wx2].copy()

        # Check surface texture variance (featureless or glare-saturated water cannot provide reliable flow)
        variance = float(np.var(current_water_gray))
        if variance < self.min_gradient_variance:
            self.prev_water_gray = current_water_gray
            self.prev_water_roi_coords = (wx1, wy1, wx2, wy2)
            return WaveAnalysisResult(
                dominant_direction_deg=None,
                vector=[0.0, 0.0],
                magnitude=0.0,
                usable_measurements=0,
                reliability="insufficient_data",
                camera_compensation_status=comp_status,
                disclaimer=(
                    f"Water surface texture is too low (variance={variance:.1f} < {self.min_gradient_variance}). "
                    "Wave direction unavailable or low confidence due to smooth water or glare."
                ),
                wind_direction=wind_text
            )

        # Check if previous frame of matching dimension exists
        if (
            self.prev_water_gray is None
            or self.prev_water_gray.shape != current_water_gray.shape
            or self.prev_water_roi_coords != (wx1, wy1, wx2, wy2)
        ):
            self.prev_water_gray = current_water_gray
            self.prev_water_roi_coords = (wx1, wy1, wx2, wy2)
            return WaveAnalysisResult(
                dominant_direction_deg=None,
                vector=[0.0, 0.0],
                magnitude=0.0,
                usable_measurements=0,
                reliability="insufficient_data",
                camera_compensation_status=comp_status,
                disclaimer="First water frame captured. Temporal wave flow estimation requires consecutive frames.",
                wind_direction=wind_text
            )

        # Mask out detected floating waste objects so their movement does not corrupt water wave estimates
        water_mask = np.ones(current_water_gray.shape, dtype=np.uint8) * 255
        if object_boxes:
            for box in object_boxes:
                bx1 = max(0, int(box.x_min * w) - wx1)
                by1 = max(0, int(box.y_min * h) - wy1)
                bx2 = min(wx2 - wx1, int(box.x_max * w) - wx1)
                by2 = min(wy2 - wy1, int(box.y_max * h) - wy1)
                if bx2 > bx1 and by2 > by1:
                    water_mask[by1:by2, bx1:bx2] = 0

        # Compute dense optical flow using Gunner Farneback method
        try:
            flow = cv2.calcOpticalFlowFarneback(
                self.prev_water_gray,
                current_water_gray,
                None,
                pyr_scale=0.5,
                levels=3,
                winsize=15,
                iterations=3,
                poly_n=5,
                poly_sigma=1.2,
                flags=0
            )
        except Exception as e:
            self.prev_water_gray = current_water_gray
            return WaveAnalysisResult(
                dominant_direction_deg=None,
                vector=[0.0, 0.0],
                magnitude=0.0,
                usable_measurements=0,
                reliability="insufficient_data",
                camera_compensation_status=comp_status,
                disclaimer=f"Optical flow calculation error: {str(e)}",
                wind_direction=wind_text
            )

        self.prev_water_gray = current_water_gray

        # Extract flow vectors in valid masked water region
        u = flow[..., 0]  # horizontal velocity in pixels/frame
        v = flow[..., 1]  # vertical velocity in pixels/frame

        valid_indices = (water_mask > 0)
        u_valid = u[valid_indices]
        v_valid = v[valid_indices]

        # Compensate for camera displacement if available
        if camera_motion and camera_motion.status in ("successful", "uncertain"):
            # camera_motion.dx, dy are normalized by total image width/height
            cam_dx_px = camera_motion.dx * w
            cam_dy_px = camera_motion.dy * h
            u_valid = u_valid - cam_dx_px
            v_valid = v_valid - cam_dy_px

        magnitudes = np.sqrt(u_valid ** 2 + v_valid ** 2)

        # Filter out static noise (<0.3 px) and crazy flow spikes (>30 px)
        usable_mask = (magnitudes >= 0.3) & (magnitudes <= 30.0)
        usable_u = u_valid[usable_mask]
        usable_v = v_valid[usable_mask]
        usable_mags = magnitudes[usable_mask]
        usable_count = int(len(usable_u))

        if usable_count < self.min_usable_vectors:
            return WaveAnalysisResult(
                dominant_direction_deg=None,
                vector=[0.0, 0.0],
                magnitude=0.0,
                usable_measurements=usable_count,
                reliability="insufficient_data",
                camera_compensation_status=comp_status,
                disclaimer=(
                    f"Insufficient usable water motion vectors ({usable_count} < {self.min_usable_vectors}). "
                    "Wave motion is either stagnant or below optical flow detection threshold."
                ),
                wind_direction=wind_text
            )

        # Calculate directional angles in degrees [0, 360)
        # Note: 0 deg = +x (right), 90 deg = +y (down in image coordinates)
        angles_rad = np.arctan2(usable_v, usable_u)
        angles_deg = (np.degrees(angles_rad)) % 360.0

        # Mean resultant vector (circular statistics)
        mean_u = float(np.mean(usable_u))
        mean_v = float(np.mean(usable_v))
        mean_mag = float(np.sqrt(mean_u ** 2 + mean_v ** 2))

        # Vector coherence: ratio of mean vector magnitude to mean scalar speed
        scalar_speed = float(np.mean(usable_mags))
        coherence = (mean_mag / scalar_speed) if scalar_speed > 1e-4 else 0.0

        # Dominant direction in degrees
        dom_angle_rad = np.arctan2(mean_v, mean_u)
        dom_angle_deg = float((np.degrees(dom_angle_rad)) % 360.0)

        # Normalize vector to image coordinate scale
        norm_vx = float(mean_u / w)
        norm_vy = float(mean_v / h)
        norm_mag = float(np.sqrt(norm_vx ** 2 + norm_vy ** 2))

        # Evaluate reliability
        if coherence >= self.flow_coherence_threshold and usable_count >= 50 and comp_status != "uncertain":
            rel_status = "reliable"
        elif coherence >= 0.25 and usable_count >= self.min_usable_vectors:
            rel_status = "low_confidence"
        else:
            rel_status = "low_confidence"

        return WaveAnalysisResult(
            dominant_direction_deg=round(dom_angle_deg, 1),
            vector=[round(norm_vx, 5), round(norm_vy, 5)],
            magnitude=round(norm_mag, 5),
            usable_measurements=usable_count,
            reliability=rel_status,
            camera_compensation_status=comp_status,
            disclaimer=(
                "Visible surface-pattern propagation is an optical estimate and is not necessarily "
                "equal to physical water current velocity or floating object drift."
            ),
            wind_direction=wind_text
        )
