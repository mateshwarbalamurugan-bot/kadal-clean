"""Export a selected YOLO checkpoint and run a real-image inference smoke test."""
import argparse
import shutil
import sys
from pathlib import Path


def parse_args():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Export a Clean Kadal checkpoint to ONNX or TorchScript.")
    parser.add_argument("--weights", default=str(root / "models" / "clean_kadal_bottle_v2.pt"), help="Source checkpoint")
    parser.add_argument("--format", choices=("onnx", "torchscript"), default="onnx", help="Export format")
    parser.add_argument("--imgsz", type=int, default=1024, help="Export/inference image size")
    parser.add_argument("--test-image", default=str(root / "frontend" / "public" / "sample_floating_waste.jpg"), help="Real image for exported-model smoke test")
    return parser.parse_args()


def main():
    args = parse_args()
    weights = Path(args.weights).resolve()
    test_image = Path(args.test_image).resolve()
    if not weights.is_file():
        print(f"[!] Model checkpoint not found: {weights}")
        return 2
    if not test_image.is_file():
        print(f"[!] Test image not found: {test_image}; pass --test-image with a real image.")
        return 2

    try:
        from ultralytics import YOLO
        model = YOLO(str(weights))
        exported_path = Path(model.export(format=args.format, imgsz=args.imgsz, opset=12, simplify=False))
    except ImportError:
        print("[!] Ultralytics is missing. Install backend/requirements.txt first.")
        return 2
    except Exception as exc:
        print(f"[!] Export failed: {exc}")
        return 1

    models_dir = Path(__file__).resolve().parent.parent / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    final_dest = models_dir / exported_path.name
    if exported_path.resolve() != final_dest.resolve():
        shutil.copy2(exported_path, final_dest)

    try:
        exported_model = YOLO(str(final_dest))
        results = exported_model.predict(source=str(test_image), imgsz=args.imgsz, verbose=False)
    except Exception as exc:
        print(f"[!] Exported model was created but inference verification failed: {exc}")
        return 1
    count = len(results[0].boxes) if results else 0
    print(f"[OK] Exported artifact: {final_dest}")
    print(f"[OK] Real-image smoke test: {test_image.name}; predictions={count}; imgsz={args.imgsz}")
    print("This is an execution smoke test only; compare metrics on a held-out test split before deployment.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
