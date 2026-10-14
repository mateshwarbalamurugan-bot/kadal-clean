"""
Clean Kadal — Camera Motion Compensation Module
Estimates boat-mounted camera motion (shake, bobbing, tilt) using a user-selected
stationary reference region (e.g. tub rim or fixed marker) across consecutive frames.
"""
from typing import Optional, Tuple
import cv2
import numpy as np
from .schemas import BoundingBox, CameraMotionEstimate


class CameraMotionEstimator:
    def __init__(self, max_corners: int = 100, quality_level: float = 0.01, min_distance: float = 7.0):
        self.max_corners = max_corners
        self.quality_level = quality_level
        self.min_distance = min_distance
        self.prev_gray: Optional[np.ndarray] = None
        self.prev_pts: Optional[np.ndarray] = None

    def reset(self):
        """Reset motion tracking state."""
        self.prev_gray = None
        self.prev_pts = None

    def estimate_motion(
        self,
        current_gray: np.ndarray,
        reference_region: Optional[BoundingBox] = None
    ) -> CameraMotionEstimate:
        """
        Estimate camera displacement (dx, dy) in normalized image coordinates
        between previous frame and current frame within the reference region.
        """
        h, w = current_gray.shape[:2]

        if reference_region is None:
            self.prev_gray = current_gray.copy()
            self.prev_pts = None
            return CameraMotionEstimate(
                dx=0.0,
                dy=0.0,
                rotation_deg=0.0,
                status="unavailable",
                tracked_features=0,
                warning="No stationary reference region selected. Motion estimates may include camera bobbing or tilt."
            )

        # Convert normalized bounding box to pixel coordinates
        rx1 = max(0, int(reference_region.x_min * w))
        ry1 = max(0, int(reference_region.y_min * h))
        rx2 = min(w, int(reference_region.x_max * w))
        ry2 = min(h, int(reference_region.y_max * h))

        if (rx2 - rx1) < 20 or (ry2 - ry1) < 20:
            self.prev_gray = current_gray.copy()
            return CameraMotionEstimate(
                dx=0.0,
                dy=0.0,
                rotation_deg=0.0,
                status="unavailable",
                tracked_features=0,
                warning="Reference region too small to extract reliable stationary features (< 20x20 px)."
            )

        ref_mask = np.zeros((h, w), dtype=np.uint8)
        ref_mask[ry1:ry2, rx1:rx2] = 255

        if self.prev_gray is None:
            self.prev_gray = current_gray.copy()
            pts = cv2.goodFeaturesToTrack(
                self.prev_gray,
                mask=ref_mask,
                maxCorners=self.max_corners,
                qualityLevel=self.quality_level,
                minDistance=self.min_distance
            )
            self.prev_pts = pts
            return CameraMotionEstimate(
                dx=0.0,
                dy=0.0,
                rotation_deg=0.0,
                status="uncertain",
                tracked_features=0 if pts is None else len(pts),
                warning="First reference frame initialized. Compensation begins on next frame."
            )

        # Detect features if not already tracked
        if self.prev_pts is None or len(self.prev_pts) < 5:
            self.prev_pts = cv2.goodFeaturesToTrack(
                self.prev_gray,
                mask=ref_mask,
                maxCorners=self.max_corners,
                qualityLevel=self.quality_level,
                minDistance=self.min_distance
            )

        if self.prev_pts is None or len(self.prev_pts) < 4:
            self.prev_gray = current_gray.copy()
            self.prev_pts = None
            return CameraMotionEstimate(
                dx=0.0,
                dy=0.0,
                rotation_deg=0.0,
                status="unavailable",
                tracked_features=0,
                warning="Insufficient stationary features found on reference region (smooth or featureless surface)."
            )

        # Optical flow between previous and current frame
        curr_pts, status, err = cv2.calcOpticalFlowPyrLK(
            self.prev_gray,
            current_gray,
            self.prev_pts,
            None,
            winSize=(21, 21),
            maxLevel=3,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01)
        )

        valid_prev = self.prev_pts[status == 1]
        valid_curr = curr_pts[status == 1]

        self.prev_gray = current_gray.copy()
        # Refresh tracked points in mask
        self.prev_pts = cv2.goodFeaturesToTrack(
            self.prev_gray,
            mask=ref_mask,
            maxCorners=self.max_corners,
            qualityLevel=self.quality_level,
            minDistance=self.min_distance
        )

        if len(valid_prev) < 4:
            return CameraMotionEstimate(
                dx=0.0,
                dy=0.0,
                rotation_deg=0.0,
                status="uncertain",
                tracked_features=len(valid_prev),
                warning=f"Low feature match count ({len(valid_prev)} points). Motion estimate may be noisy."
            )

        # Estimate rigid affine transformation (dx, dy, rotation) using RANSAC
        try:
            matrix, inliers = cv2.estimateAffinePartial2D(valid_prev, valid_curr, method=cv2.RANSAC)
            if matrix is None or inliers is None or np.sum(inliers) < 4:
                # Fallback to robust median translation
                displacements = valid_curr - valid_prev
                dx_px = float(np.median(displacements[:, 0]))
                dy_px = float(np.median(displacements[:, 1]))
                rot_deg = 0.0
                status_str = "uncertain"
            else:
                dx_px = float(matrix[0, 2])
                dy_px = float(matrix[1, 2])
                # Rotation from affine matrix
                rot_rad = np.arctan2(matrix[1, 0], matrix[0, 0])
                rot_deg = float(np.degrees(rot_rad))
                inlier_ratio = np.sum(inliers) / len(valid_prev)
                status_str = "successful" if inlier_ratio >= 0.6 else "uncertain"
        except Exception:
            displacements = valid_curr - valid_prev
            dx_px = float(np.median(displacements[:, 0]))
            dy_px = float(np.median(displacements[:, 1]))
            rot_deg = 0.0
            status_str = "uncertain"

        # Normalize pixel displacement by frame dimensions
        dx_norm = float(dx_px / w)
        dy_norm = float(dy_px / h)

        return CameraMotionEstimate(
            dx=round(dx_norm, 5),
            dy=round(dy_norm, 5),
            rotation_deg=round(rot_deg, 2),
            status=status_str,
            tracked_features=int(len(valid_prev)),
            warning=None if status_str == "successful" else "Motion compensation uncertainty detected."
        )
