"""
Clean Kadal — Object Detector Module
Executes inference on video frames, normalizes bounding box coordinates,
and labels litter candidates with honest provenance.
"""
from typing import List, Optional
import numpy as np
from .schemas import Detection, BoundingBox
from .model_loader import ModelManager, COCO_LITTER_CANDIDATE_CLASSES


class ObjectDetector:
    def __init__(self, model_manager: ModelManager):
        self.manager = model_manager

    def detect(self, img_bgr: np.ndarray, conf_threshold: float = 0.25) -> List[Detection]:
        """
        Runs object detection on the provided BGR image.
        Returns empty list if model is not loaded or no objects are found.
        """
        if self.manager.model is None or not self.manager.status.model_loaded:
            return []

        h, w = img_bgr.shape[:2]
        if h <= 0 or w <= 0:
            return []

        try:
            results = self.manager.model.predict(
                img_bgr,
                conf=conf_threshold,
                verbose=False
            )
        except Exception as exc:
            # Surface inference failures to the API layer; an empty list must not
            # silently masquerade as a successful no-detection result.
            raise RuntimeError("YOLO inference failed") from exc

        detections: List[Detection] = []
        is_custom = self.manager.status.is_custom_trained

        for r in results:
            boxes = r.boxes
            if boxes is None or len(boxes) == 0:
                continue

            for box in boxes:
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                xyxy = box.xyxy[0].cpu().numpy()

                x1_norm = max(0.0, min(1.0, float(xyxy[0] / w)))
                y1_norm = max(0.0, min(1.0, float(xyxy[1] / h)))
                x2_norm = max(0.0, min(1.0, float(xyxy[2] / w)))
                y2_norm = max(0.0, min(1.0, float(xyxy[3] / h)))

                # Lookup class name
                if hasattr(self.manager.model, "names") and cls_id in self.manager.model.names:
                    class_name = str(self.manager.model.names[cls_id])
                elif cls_id < len(self.manager.status.supported_classes):
                    class_name = str(self.manager.status.supported_classes[cls_id])
                else:
                    class_name = f"class_{cls_id}"

                # Evaluate potential litter candidate flag
                if is_custom:
                    # The current marine dataset uses one `garbage` class. It is a
                    # candidate label, not a material/subtype classification.
                    is_litter = class_name.lower() in {
                        "plastic_bottle", "plastic_cup", "plastic_wrapper",
                        "plastic_bag", "bottle_cap", "garbage", "marine_debris",
                    }
                else:
                    # In generic baseline COCO model, bottle and cup are potential litter candidates
                    is_litter = (class_name.lower() in COCO_LITTER_CANDIDATE_CLASSES)

                detections.append(Detection(
                    class_name=class_name,
                    confidence=round(conf, 3),
                    box=BoundingBox(
                        x_min=round(x1_norm, 4),
                        y_min=round(y1_norm, 4),
                        x_max=round(x2_norm, 4),
                        y_max=round(y2_norm, 4)
                    ),
                    is_litter_candidate=is_litter,
                    is_custom_class=is_custom
                ))

        return detections
