"""
Clean Kadal — Model Loader Module
Manages model lifecycle, strictly distinguishing between custom-trained Clean Kadal
floating waste detectors and generic pretrained baseline models (e.g. YOLOv8n COCO).
Never fabricates custom classes when running a generic baseline.
"""
import os
from typing import List, Optional, Tuple, Any
from .schemas import ModelStatus

CUSTOM_CLASSES = [
    "plastic_bottle",
    "plastic_cup",
    "plastic_wrapper",
    "plastic_bag",
    "bottle_cap",
    "leaf"
]

# Baseline COCO classes that are considered potential litter candidates
COCO_LITTER_CANDIDATE_CLASSES = {"bottle", "cup"}


class ModelManager:
    def __init__(self, models_dir: Optional[str] = None):
        if models_dir is None:
            # Default to <workspace>/models
            current_dir = os.path.dirname(os.path.abspath(__file__))
            self.models_dir = os.path.abspath(os.path.join(current_dir, "..", "..", "models"))
        else:
            self.models_dir = os.path.abspath(models_dir)

        self.model: Any = None
        self.status = ModelStatus(
            model_loaded=False,
            model_name="None",
            model_type="none",
            is_custom_trained=False,
            supported_classes=[],
            weights_path="None",
            device="cpu",
            status_message="Model initialization pending.",
            confidence_threshold=0.25
        )

    def load_model(self) -> ModelStatus:
        """
        Attempts to load:
        1. Custom trained Clean Kadal model ('custom_best.pt' or 'custom_best.onnx')
        2. Pretrained baseline YOLOv8n detector ('yolov8n.pt')
        """
        custom_pt = os.path.join(self.models_dir, "custom_best.pt")
        custom_onnx = os.path.join(self.models_dir, "custom_best.onnx")
        baseline_pt = os.path.join(self.models_dir, "yolov8n.pt")

        try:
            from ultralytics import YOLO
        except ImportError:
            self.status = ModelStatus(
                model_loaded=False,
                model_name="Unavailable",
                model_type="none",
                is_custom_trained=False,
                supported_classes=[],
                weights_path="None",
                device="cpu",
                status_message="Ultralytics YOLO library not installed in Python environment."
            )
            return self.status

        # 1. Check for custom-trained model
        if os.path.exists(custom_pt):
            try:
                self.model = YOLO(custom_pt)
                # Read names from model
                names = list(self.model.names.values()) if hasattr(self.model, "names") else CUSTOM_CLASSES
                self.status = ModelStatus(
                    model_loaded=True,
                    model_name="Clean Kadal Custom Detector",
                    model_type="custom_trained",
                    is_custom_trained=True,
                    supported_classes=names,
                    weights_path=custom_pt,
                    device="cpu",
                    status_message="Custom Clean Kadal floating waste model loaded successfully."
                )
                return self.status
            except Exception as e:
                pass

        if os.path.exists(custom_onnx):
            try:
                self.model = YOLO(custom_onnx)
                names = list(self.model.names.values()) if hasattr(self.model, "names") else CUSTOM_CLASSES
                self.status = ModelStatus(
                    model_loaded=True,
                    model_name="Clean Kadal Custom ONNX Detector",
                    model_type="custom_trained",
                    is_custom_trained=True,
                    supported_classes=names,
                    weights_path=custom_onnx,
                    device="cpu",
                    status_message="Custom Clean Kadal ONNX floating waste model loaded successfully."
                )
                return self.status
            except Exception as e:
                pass

        # 2. Check or download baseline YOLOv8n detector
        target_baseline = baseline_pt if os.path.exists(baseline_pt) else "yolov8n.pt"
        try:
            self.model = YOLO(target_baseline)
            names = list(self.model.names.values()) if hasattr(self.model, "names") else []
            self.status = ModelStatus(
                model_loaded=True,
                model_name="YOLOv8n (Pretrained COCO Baseline)",
                model_type="pretrained_baseline",
                is_custom_trained=False,
                supported_classes=names,
                weights_path=str(target_baseline),
                device="cpu",
                status_message=(
                    "Pretrained COCO baseline loaded. Custom model not yet trained or not available. "
                    "Detects generic 'bottle' and 'cup' as potential litter candidates only. "
                    "Train custom model using ai_training/ to enable floating waste classes "
                    "(plastic_bottle, plastic_wrapper, plastic_bag, bottle_cap, leaf)."
                )
            )
            return self.status
        except Exception as e:
            self.model = None
            self.status = ModelStatus(
                model_loaded=False,
                model_name="Model Loading Error",
                model_type="none",
                is_custom_trained=False,
                supported_classes=[],
                weights_path="None",
                device="cpu",
                status_message=(
                    f"Failed to load baseline or custom weights: {str(e)}. "
                    "Place weights in models/ or connect to internet to download YOLOv8n baseline."
                )
            )
            return self.status

    def get_status(self) -> ModelStatus:
        return self.status
