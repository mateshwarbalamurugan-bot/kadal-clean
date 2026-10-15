"""Evaluate a YOLO checkpoint on a declared validation or held-out test split."""
import argparse
import sys
from pathlib import Path


def parse_args():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Evaluate a Clean Kadal detector on a YOLO dataset split.")
    parser.add_argument("--weights", default=str(root / "models" / "clean_kadal_bottle_v2.pt"), help="Checkpoint to evaluate")
    parser.add_argument("--data", default=str(Path(__file__).resolve().parent / "dataset.yaml"), help="Ultralytics dataset YAML")
    parser.add_argument("--split", choices=("test", "val"), default="test", help="Use test only for final held-out reporting")
    parser.add_argument("--imgsz", type=int, default=1024, help="Inference image size")
    parser.add_argument("--device", default="cpu", help="Use cpu or a CUDA device such as 0")
    return parser.parse_args()


def main():
    args = parse_args()
    weights = Path(args.weights).resolve()
    data = Path(args.data).resolve()
    if not weights.is_file():
        print(f"[!] Model checkpoint not found: {weights}")
        return 2
    if not data.is_file():
        print(f"[!] Dataset YAML not found: {data}")
        return 2
    try:
        from ultralytics import YOLO
        model = YOLO(str(weights))
        metrics = model.val(data=str(data), split=args.split, imgsz=args.imgsz, device=args.device, verbose=True)
    except ImportError:
        print("[!] Ultralytics is missing. Install backend/requirements.txt first.")
        return 2
    except Exception as exc:
        print(f"[!] Evaluation failed: {exc}")
        return 1

    print("\nDETECTION PERFORMANCE REPORT")
    print(f"Checkpoint: {weights}")
    print(f"Dataset: {data} | split={args.split} | imgsz={args.imgsz} | device={args.device}")
    print(f"Precision:    {metrics.box.mp:.4f}")
    print(f"Recall:       {metrics.box.mr:.4f}")
    print(f"mAP@0.50:     {metrics.box.map50:.4f}")
    print(f"mAP@0.50:0.95:{metrics.box.map:.4f}")
    for index, name in enumerate(model.names.values()):
        if index < len(metrics.box.maps):
            print(f"mAP@0.50:0.95 {name}: {metrics.box.maps[index]:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
