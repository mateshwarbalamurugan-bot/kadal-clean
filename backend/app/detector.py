"""
Clean Kadal — Object Detector Module
Runs YOLO inference on real frames, normalizes bounding boxes, and preserves
honest model provenance for custom and generic baseline predictions.
"""
from typing import List
import numpy as np

from .schemas import Detection, BoundingBox
from .model_loader import (
    COCO_LITTER_CANDIDATE_CLASSES,
    CUSTOM_LITTER_CANDIDATE_CLASSES,
    ModelManager,
)


class ObjectDetector:
    def __init__(self, model_manager: ModelManager):
        self.manager = model_manager

    def detect(self, img_bgr: np.ndarray, conf_threshold: float = 0.25) -> List[Detection]:
        """Run actual model inference on a BGR frame and return normalized detections."""
        if self.manager.model is None or not self.manager.status.model_loaded:
            return []

        height, width = img_bgr.shape[:2]
        if height <= 0 or width <= 0:
            return []

        try:
            results = self.manager.model.predict(
                img_bgr,
                conf=conf_threshold,
                imgsz=self.manager.status.inference_size,
                verbose=False,
            )
        except Exception:
            # A bad frame/inference failure should not crash the API request loop.
            return []

        detections: List[Detection] = []
        is_custom = self.manager.status.is_custom_trained

        for result in results:
            boxes = result.boxes
            if boxes is None or len(boxes) == 0:
                continue

            for box in boxes:
                class_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                xyxy = box.xyxy[0].cpu().numpy()

                x1 = max(0.0, min(1.0, float(xyxy[0] / width)))
                y1 = max(0.0, min(1.0, float(xyxy[1] / height)))
                x2 = max(0.0, min(1.0, float(xyxy[2] / width)))
                y2 = max(0.0, min(1.0, float(xyxy[3] / height)))

                names = getattr(self.manager.model, "names", {})
                if isinstance(names, dict) and class_id in names:
                    class_name = str(names[class_id])
                elif isinstance(names, (list, tuple)) and class_id < len(names):
                    class_name = str(names[class_id])
                elif class_id < len(self.manager.status.supported_classes):
                    class_name = str(self.manager.status.supported_classes[class_id])
                else:
                    class_name = f"class_{class_id}"

                normalized_name = class_name.strip().lower().replace(" ", "_")
                if is_custom:
                    is_litter_candidate = normalized_name in CUSTOM_LITTER_CANDIDATE_CLASSES
                else:
                    is_litter_candidate = class_name.strip().lower() in COCO_LITTER_CANDIDATE_CLASSES

                # Do not count or track unrelated COCO classes (for example people,
                # cars, or buildings) as aquatic waste candidates.
                if not is_litter_candidate:
                    continue

                detections.append(Detection(
                    class_name=class_name,
                    confidence=round(confidence, 3),
                    box=BoundingBox(
                        x_min=round(x1, 4),
                        y_min=round(y1, 4),
                        x_max=round(x2, 4),
                        y_max=round(y2, 4),
                    ),
                    is_litter_candidate=is_litter_candidate,
                    is_custom_class=is_custom,
                ))

        return detections
