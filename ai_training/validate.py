"""
Clean Kadal -- Model Validation & Evaluation Script
Evaluates model on the test split and reports per-class metrics:
Precision, Recall, mAP@0.50, and mAP@0.50:0.95.
"""
import sys
import argparse
import tempfile
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate Clean Kadal detector on test set.")
    parser.add_argument(
        "--weights",
        type=str,
        default=str(Path(__file__).parent.parent / "models" / "custom_best.pt"),
        help="Path to trained weights (default: models/custom_best.pt)"
    )
    parser.add_argument(
        "--data",
        type=str,
        default=str(Path(__file__).parent / "dataset.yaml"),
        help="Path to dataset.yaml"
    )
    parser.add_argument(
        "--split",
        type=str,
        default="test",
        help="Dataset split to evaluate ('test' or 'val')"
    )
    return parser.parse_args()


def main():
    args = parse_args()
    print("=" * 70)
    print("Clean Kadal -- Model Evaluation & Metric Reporting")
    print("=" * 70)
    print(f"Model weights: {args.weights}")
    print(f"Dataset config: {args.data}")
    print(f"Split:          {args.split}")
    print("=" * 70)

    weights_path = Path(args.weights).resolve()
    if not weights_path.exists():
        print(f"[!] Model file not found at: {weights_path}")
        print("    If you haven't trained a custom model yet, train it using:")
        print("    python ai_training/train.py")
        sys.exit(1)

    try:
        from ultralytics import YOLO
    except ImportError:
        print("[!] Ultralytics library not found in Python environment.")
        sys.exit(1)

    try:
        import yaml
        dataset_yaml = Path(args.data).expanduser().resolve()
        config = yaml.safe_load(dataset_yaml.read_text(encoding="utf-8")) or {}
        root = Path(config.get("path", ".")).expanduser()
        if not root.is_absolute():
            root = (dataset_yaml.parent / root).resolve()
        config["path"] = str(root)
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", encoding="utf-8", delete=False) as temp_file:
            yaml.safe_dump(config, temp_file, sort_keys=False)
            runtime_data_yaml = Path(temp_file.name)
    except Exception as exc:
        print(f"[!] Could not resolve dataset configuration: {exc}")
        sys.exit(1)

    model = YOLO(str(weights_path))

    print("[*] Running evaluation on the requested split...")
    try:
        metrics = model.val(data=str(runtime_data_yaml), split=args.split, verbose=True)
    finally:
        runtime_data_yaml.unlink(missing_ok=True)

    print("\n" + "=" * 70)
    print("DETECTION PERFORMANCE REPORT")
    print("=" * 70)
    print(f"Overall mAP@0.50:      {metrics.box.map50:.4f}")
    print(f"Overall mAP@0.50:0.95: {metrics.box.map:.4f}")
    print(f"Overall Precision:     {metrics.box.mp:.4f}")
    print(f"Overall Recall:        {metrics.box.mr:.4f}")
    print("=" * 70)

    # Class-wise metrics if available
    if hasattr(metrics.box, "maps") and metrics.box.maps is not None:
        print("Per-Class mAP@0.50:0.95:")
        for idx, cls_name in enumerate(model.names.values()):
            if idx < len(metrics.box.maps):
                print(f"  - {cls_name:20s}: {metrics.box.maps[idx]:.4f}")


if __name__ == "__main__":
    main()

