"""
Clean Kadal -- Model Export and Verification Script
Exports trained PyTorch model (.pt) to ONNX format, and verifies the exported
artifact by running actual test inference before declaring export successful.
"""
import sys
import argparse
from pathlib import Path
import numpy as np


def parse_args():
    parser = argparse.ArgumentParser(description="Export Clean Kadal model to ONNX.")
    parser.add_argument(
        "--weights",
        type=str,
        default=str(Path(__file__).parent.parent / "models" / "custom_best.pt"),
        help="Path to trained PyTorch weights (default: models/custom_best.pt)"
    )
    parser.add_argument(
        "--format",
        type=str,
        default="onnx",
        choices=["onnx", "torchscript"],
        help="Export format (default: onnx)"
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=640,
        help="Input image size (default: 640)"
    )
    return parser.parse_args()


def main():
    args = parse_args()
    print("=" * 70)
    print("Clean Kadal -- Model Export & Verification Pipeline")
    print("=" * 70)
    print(f"Source weights: {args.weights}")
    print(f"Export format:  {args.format}")
    print(f"Image size:     {args.imgsz}")
    print("=" * 70)

    weights_path = Path(args.weights).resolve()
    if not weights_path.exists():
        print(f"[!] Error: Model file not found at: {weights_path}")
        print("    Train the model first using: python ai_training/train.py")
        sys.exit(1)

    try:
        from ultralytics import YOLO
    except ImportError:
        print("[!] Ultralytics library not found in Python environment.")
        sys.exit(1)

    print("[1/3] Loading PyTorch model...")
    model = YOLO(str(weights_path))

    print(f"[2/3] Exporting to {args.format.upper()}...")
    try:
        exported_path_str = model.export(
            format=args.format,
            imgsz=args.imgsz,
            opset=12,
            simplify=False
        )
        exported_path = Path(exported_path_str)
        print(f"[OK] Model exported to: {exported_path}")
    except Exception as e:
        print(f"[!] Export failed: {e}")
        sys.exit(1)

    # Copy to models/ directory if not already there
    target_models_dir = Path(__file__).parent.parent / "models"
    target_models_dir.mkdir(parents=True, exist_ok=True)
    final_dest = target_models_dir / exported_path.name
    if exported_path.resolve() != final_dest.resolve():
        import shutil
        shutil.copy2(exported_path, final_dest)
        print(f"[OK] Copied to application models folder: {final_dest}")

    # Step 3: VERIFICATION - Run real test inference on exported model
    print("[3/3] Verifying exported model with real test inference...")
    try:
        verification_model = YOLO(str(final_dest))
        # Create a blank test image (640x640x3)
        dummy_img = np.zeros((args.imgsz, args.imgsz, 3), dtype=np.uint8)
        results = verification_model.predict(dummy_img, verbose=False)
        print("[OK] Verification successful: Exported model executed inference without errors.")
        print(f"[OK] Model ready for deployment at: {final_dest}")
    except Exception as e:
        print(f"[!] Verification warning/error: {e}")
        print("    The model was exported, but verification inference failed.")
        sys.exit(1)

    print("=" * 70)


if __name__ == "__main__":
    main()


