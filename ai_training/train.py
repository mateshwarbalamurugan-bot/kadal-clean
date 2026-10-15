"""
Clean Kadal -- Custom AI Model Training Script
Fine-tunes a lightweight YOLO detector on floating-marine-litter data and copies
its best checkpoint to models/custom_best.pt for backend auto-loading.
"""
import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def parse_args():
    parser = argparse.ArgumentParser(description="Fine-tune a YOLO detector for Clean Kadal.")
    parser.add_argument("--data", type=str, default=str(Path(__file__).parent / "dataset.yaml"), help="Dataset YAML")
    parser.add_argument("--weights", type=str, default="yolov8n.pt", help="Pretrained model/checkpoint")
    parser.add_argument("--epochs", type=int, default=50, help="Maximum epochs")
    parser.add_argument("--batch", type=int, default=8, help="Batch size; reduce for CPU or limited memory")
    parser.add_argument("--imgsz", type=int, default=640, help="Training image size")
    parser.add_argument("--device", type=str, default="cpu", help="cpu or CUDA device index (for example 0)")
    parser.add_argument("--workers", type=int, default=4, help="Data-loader workers")
    parser.add_argument("--patience", type=int, default=10, help="Early-stopping patience")
    parser.add_argument("--seed", type=int, default=42, help="Reproducible training seed")
    parser.add_argument("--fraction", type=float, default=1.0, help="Training fraction (1.0 uses all train images)")
    parser.add_argument("--project", type=str, default=str(Path(__file__).parent / "runs"), help="Training outputs")
    parser.add_argument("--name", type=str, default="clean_kadal_marine", help="Run name")
    return parser.parse_args()


def load_and_resolve_dataset_config(data_yaml: Path):
    try:
        import yaml
    except ImportError as exc:
        raise RuntimeError("PyYAML is required; install Ultralytics training dependencies first.") from exc

    config = yaml.safe_load(data_yaml.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise ValueError(f"Dataset YAML must contain a mapping: {data_yaml}")
    root_value = config.get("path", ".")
    root = Path(root_value).expanduser()
    if not root.is_absolute():
        root = (data_yaml.parent / root).resolve()
    else:
        root = root.resolve()

    train_value = config.get("train", "images/train")
    train_values = train_value if isinstance(train_value, list) else [train_value]
    train_directories = []
    for value in train_values:
        candidate = Path(value).expanduser()
        train_directories.append(candidate.resolve() if candidate.is_absolute() else (root / candidate).resolve())
    train_images = sorted(
        image for directory in train_directories if directory.is_dir()
        for image in directory.rglob("*") if image.suffix.lower() in IMAGE_EXTENSIONS
    )
    if not train_images:
        expected = ", ".join(str(path) for path in train_directories)
        raise FileNotFoundError(f"No training images found under: {expected}")

    # Ultralytics resolves relative 'path' values against its own datasets root. Write
    # a temporary YAML with the absolute root so this CLI is independent of cwd.
    config["path"] = str(root)
    return config, root, train_images


def main():
    args = parse_args()
    if args.epochs < 1 or args.batch < 1 or args.imgsz < 32:
        raise SystemExit("epochs and batch must be positive; imgsz must be at least 32")
    if not 0 < args.fraction <= 1:
        raise SystemExit("--fraction must be greater than 0 and at most 1")

    data_yaml = Path(args.data).expanduser().resolve()
    if not data_yaml.is_file():
        raise SystemExit(f"Dataset configuration file not found: {data_yaml}")
    try:
        config, dataset_root, train_images = load_and_resolve_dataset_config(data_yaml)
    except Exception as exc:
        raise SystemExit(f"Dataset check failed: {exc}") from exc

    print("=" * 70)
    print("Clean Kadal -- Custom Marine-Litter YOLO Training")
    print("=" * 70)
    print(f"Dataset config: {data_yaml}")
    print(f"Dataset root:   {dataset_root}")
    print(f"Classes:        {config.get('names', 'not declared')}")
    print(f"Train images:   {len(train_images)}")
    print(f"Base weights:   {args.weights}")
    print(f"Epochs/batch:   {args.epochs}/{args.batch}")
    print(f"Image size:     {args.imgsz}")
    print(f"Device/workers: {args.device}/{args.workers}")
    print(f"Train fraction: {args.fraction}")
    print("=" * 70)

    try:
        import yaml
        from ultralytics import YOLO
    except ImportError as exc:
        raise SystemExit("Ultralytics/PyYAML is unavailable. Install with: pip install ultralytics torch torchvision") from exc

    with tempfile.NamedTemporaryFile("w", suffix=".yaml", encoding="utf-8", delete=False) as temp_file:
        yaml.safe_dump(config, temp_file, sort_keys=False)
        runtime_data_yaml = Path(temp_file.name)

    try:
        model = YOLO(args.weights)
        model.train(
            data=str(runtime_data_yaml),
            epochs=args.epochs,
            batch=args.batch,
            imgsz=args.imgsz,
            device=args.device,
            workers=args.workers,
            patience=args.patience,
            seed=args.seed,
            fraction=args.fraction,
            project=str(Path(args.project).expanduser().resolve()),
            name=args.name,
            exist_ok=True,
            pretrained=True,
            optimizer="auto",
            verbose=True,
            degrees=5.0,
            flipud=0.0,
            fliplr=0.5,
            mosaic=1.0,
            close_mosaic=min(10, max(0, args.epochs - 1)),
            hsv_h=0.015,
            hsv_s=0.7,
            hsv_v=0.4,
        )
    finally:
        runtime_data_yaml.unlink(missing_ok=True)

    run_dir = Path(args.project).expanduser().resolve() / args.name
    best_weights = run_dir / "weights" / "best.pt"
    if not best_weights.is_file():
        raise SystemExit(f"Training ended without a best checkpoint: {best_weights}")

    models_dir = Path(__file__).resolve().parent.parent / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    target_weights = models_dir / "custom_best.pt"
    shutil.copy2(best_weights, target_weights)
    print("\nTRAINING COMPLETED")
    print(f"Best checkpoint: {best_weights}")
    print(f"Backend checkpoint: {target_weights}")
    print("Next: validate with the same dataset YAML, then run backend tests and reload/deploy the backend.")


if __name__ == "__main__":
    main()
