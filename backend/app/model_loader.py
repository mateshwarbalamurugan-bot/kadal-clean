"""
Clean Kadal — Model Loader Module
Loads the user's trained Clean Kadal bottle detector first, then compatible custom
checkpoints, and finally the generic COCO baseline. Model provenance and scope are
reported explicitly; a baseline is never presented as a custom aquatic-waste model.
"""
import os
from pathlib import Path
from typing import Any, List, Optional

from .schemas import ModelStatus

CUSTOM_CLASSES = [
    "plastic_bottle",
    "plastic_cup",
    "plastic_wrapper",
    "plastic_bag",
    "bottle_cap",
    "leaf",
]

# Only these generic COCO classes are weak litter candidates in baseline mode.
COCO_LITTER_CANDIDATE_CLASSES = {"bottle", "cup"}
CUSTOM_LITTER_CANDIDATE_CLASSES = {
    "plastic_bottle",
    "bottle",
    "plastic_cup",
    "cup",
    "plastic_wrapper",
    "wrapper",
    "plastic_bag",
    "bag",
    "bottle_cap",
}


class ModelManager:
    def __init__(self, models_dir: Optional[str] = None):
        if models_dir is None:
            current_dir = Path(__file__).resolve().parent
            self.models_dir = (current_dir.parent.parent / "models").resolve()
        else:
            self.models_dir = Path(models_dir).resolve()

        self.model: Any = None
        self._confidence_threshold = self._read_float_env(
            "CLEAN_KADAL_CONFIDENCE_THRESHOLD", 0.25, minimum=0.05, maximum=0.95
        )
        self._configured_image_size = self._read_int_env(
            "CLEAN_KADAL_IMAGE_SIZE", minimum=320, maximum=1536
        )
        self.status = self._empty_status(
            model_name="None",
            status_message="Model initialization pending.",
        )

    @staticmethod
    def _read_float_env(name: str, fallback: float, minimum: float, maximum: float) -> float:
        try:
            value = float(os.getenv(name, fallback))
        except (TypeError, ValueError):
            value = fallback
        return min(maximum, max(minimum, value))

    @staticmethod
    def _read_int_env(name: str, minimum: int, maximum: int) -> Optional[int]:
        value = os.getenv(name)
        if value is None or not value.strip():
            return None
        try:
            parsed = int(value)
        except ValueError:
            return None
        return min(maximum, max(minimum, parsed))

    def _empty_status(self, model_name: str, status_message: str) -> ModelStatus:
        return ModelStatus(
            model_loaded=False,
            model_name=model_name,
            model_type="none",
            is_custom_trained=False,
            supported_classes=[],
            weights_path="None",
            device="cpu",
            status_message=status_message,
            confidence_threshold=self._confidence_threshold,
            inference_size=self._configured_image_size or 640,
        )

    @staticmethod
    def _model_names(model: Any) -> List[str]:
        names = getattr(model, "names", None)
        if isinstance(names, dict):
            return [str(names[key]) for key in sorted(names)]
        if isinstance(names, (list, tuple)):
            return [str(name) for name in names]
        return []

    def _custom_candidates(self) -> List[Path]:
        candidates: List[Path] = []
        configured = os.getenv("CLEAN_KADAL_MODEL_PATH", "").strip()
        if configured:
            configured_path = Path(configured).expanduser()
            if not configured_path.is_absolute():
                configured_path = Path.cwd() / configured_path
            candidates.append(configured_path.resolve())

        # The exact Colab-exported v2 checkpoint is deliberately first.
        candidates.extend([
            self.models_dir / "clean_kadal_bottle_v2.pt",
            self.models_dir / "custom_best.pt",
            self.models_dir / "clean_kadal_bottle_v2.onnx",
            self.models_dir / "custom_best.onnx",
        ])
        unique: List[Path] = []
        seen = set()
        for path in candidates:
            resolved = path.resolve()
            if resolved not in seen:
                seen.add(resolved)
                unique.append(resolved)
        return unique

    def load_model(self) -> ModelStatus:
        """Load a configured custom model first, then fall back to YOLOv8n COCO."""
        try:
            from ultralytics import YOLO
        except ImportError:
            self.model = None
            self.status = self._empty_status(
                model_name="Unavailable",
                status_message=(
                    "Ultralytics is not installed. Install backend/requirements.txt, "
                    "then restart the backend."
                ),
            )
            return self.status

        failed_custom_loads: List[str] = []
        for weights in self._custom_candidates():
            if not weights.is_file():
                continue
            try:
                model = YOLO(str(weights))
                names = self._model_names(model) or CUSTOM_CLASSES
                image_size = self._configured_image_size or (
                    1024 if "bottle_v2" in weights.name.lower() else 640
                )
                if set(name.strip().lower() for name in names) == {"bottle"}:
                    message = (
                        "Clean Kadal custom bottle detector v2 loaded. This checkpoint "
                        "was trained for the single class 'bottle'; it does not classify "
                        "bags, wrappers, caps, cups, or organic debris."
                    )
                    display_name = "Clean Kadal Bottle Detector v2"
                else:
                    message = "Custom Clean Kadal detector loaded from the configured weights file."
                    display_name = "Clean Kadal Custom Detector"

                self.model = model
                self.status = ModelStatus(
                    model_loaded=True,
                    model_name=display_name,
                    model_type="custom_trained",
                    is_custom_trained=True,
                    supported_classes=names,
                    weights_path=str(weights),
                    device="cpu",
                    status_message=message,
                    confidence_threshold=self._confidence_threshold,
                    inference_size=image_size,
                )
                return self.status
            except Exception as exc:
                failed_custom_loads.append(f"{weights.name}: {str(exc)[:240]}")

        baseline_path = self.models_dir / "yolov8n.pt"
        target_baseline = str(baseline_path) if baseline_path.is_file() else "yolov8n.pt"
        try:
            model = YOLO(target_baseline)
            names = self._model_names(model)
            fallback_note = ""
            if failed_custom_loads:
                fallback_note = " Custom checkpoint could not be loaded: " + "; ".join(failed_custom_loads)
            self.model = model
            self.status = ModelStatus(
                model_loaded=True,
                model_name="YOLOv8n (Pretrained COCO Baseline)",
                model_type="pretrained_baseline",
                is_custom_trained=False,
                supported_classes=names,
                weights_path=target_baseline,
                device="cpu",
                status_message=(
                    "Pretrained COCO baseline active; it detects generic COCO objects "
                    "such as bottles and cups, not Clean Kadal-specific water-surface classes. "
                    "Place clean_kadal_bottle_v2.pt or custom_best.pt in models/ to use the "
                    "custom detector." + fallback_note
                ),
                confidence_threshold=self._confidence_threshold,
                inference_size=self._configured_image_size or 640,
            )
            return self.status
        except Exception as exc:
            self.model = None
            custom_note = (" Custom model errors: " + "; ".join(failed_custom_loads)) if failed_custom_loads else ""
            self.status = self._empty_status(
                model_name="Model Loading Error",
                status_message=(
                    f"Could not load custom or baseline detector: {str(exc)[:300]}.{custom_note} "
                    "Check the weights path and install backend requirements."
                ),
            )
            return self.status

    def get_status(self) -> ModelStatus:
        return self.status
