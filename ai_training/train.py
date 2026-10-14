"""
Clean Kadal -- Custom AI Model Training Script
Fine-tunes a lightweight nano YOLO detector (transfer learning) on floating-waste data.
Saves best checkpoint, exports evaluation metrics, and places best weights into models/custom_best.pt.
"""
import os
import sys
import argparse
import shutil
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(
        description="Fine-tune YOLO detector for Clean Kadal floating waste detection."
    )
    parser.add_argument(
        "--data",
        type=str,
        default=str(Path(__file__).parent / "dataset.yaml"),
        help="Path to dataset.yaml"
    )
    parser.add_argument(
        "--weights",
        type=str,
        default="yolov8n.pt",
        help="Pretrained baseline weights to fine-tune from (e.g. yolov8n.pt)"
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=50,
        help="Number of training epochs (default: 50)"
    )
    parser.add_argument(
        "--batch",
        type=int,
        default=16,
        help="Batch size (default: 16; use 8 if low GPU/CPU memory)"
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=640,
        help="Input image resolution (default: 640)"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cpu",
        help="Device to train on ('cpu' or '0' for CUDA GPU)"
    )
    parser.add_argument(
        "--project",
        type=str,
        default=str(Path(__file__).parent / "runs"),
        help="Directory to save training run logs and checkpoints"
    )
    parser.add_argument(
        "--name",
        type=str,
        default="clean_kadal_custom",
        help="Run name"
    )
    return parser.parse_args()


def main():
    args = parse_args()
    print("=" * 70)
    print("Clean Kadal -- Custom AI Model Training Pipeline")
    print("=" * 70)
    print(f"Dataset config: {args.data}")
    print(f"Base weights:   {args.weights}")
    print(f"Epochs:         {args.epochs}")
    print(f"Batch size:     {args.batch}")
    print(f"Image size:     {args.imgsz}")
    print(f"Device:         {args.device}")
    print("=" * 70)

    # 1. Validate dataset existence
    data_yaml = Path(args.data).resolve()
    if not data_yaml.exists():
        print(f"[!] Error: Dataset configuration file not found at: {data_yaml}")
        sys.exit(1)

    # 2. Check if train images exist
    dataset_dir = data_yaml.parent.parent / "datasets" / "images" / "train"
    train_images = list(dataset_dir.glob("*.jpg")) + list(dataset_dir.glob("*.png"))
    if not train_images:
        print(f"[!] Error: No training images found in: {dataset_dir}")
        print("    Please collect boat-camera images, label them in datasets/labels/train,")
        print("    and verify them using: python ai_training/check_dataset.py")
        sys.exit(1)

    print(f"[OK] Found {len(train_images)} training images. Starting Ultralytics YOLO training...\n")

    try:
        from ultralytics import YOLO
    except ImportError:
        print("[!] Error: Ultralytics library not found in Python environment.")
        print("    Please run: pip install ultralytics torch torchvision")
        sys.exit(1)

    # 3. Load lightweight pretrained model for transfer learning
    try:
        model = YOLO(args.weights)
    except Exception as e:
        print(f"[!] Error loading base weights '{args.weights}': {e}")
        print("    Internet connection is required on first run to download pretrained weights.")
        sys.exit(1)

    # 4. Execute fine-tuning
    results = model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        device=args.device,
        project=args.project,
        name=args.name,
        exist_ok=True,
        pretrained=True,
        optimizer="auto",
        verbose=True,
        # Domain augmentations
        degrees=10.0,
        flipud=0.0,
        fliplr=0.5,
        mosaic=1.0,
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4
    )

    # 5. Check and copy best weights
    best_weights = Path(args.project) / args.name / "weights" / "best.pt"
    models_dir = Path(__file__).parent.parent / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    target_custom_weights = models_dir / "custom_best.pt"

    if best_weights.exists():
        shutil.copy2(best_weights, target_custom_weights)
        print("\n" + "=" * 70)
        print("[OK] TRAINING COMPLETED SUCCESSFULLY!")
        print(f"[OK] Best checkpoint saved to: {best_weights}")
        print(f"[OK] Deployed custom model to: {target_custom_weights}")
        print("=" * 70)
        print("Next steps:")
        print("  1. Validate model metrics:  python ai_training/validate.py")
        print("  2. Export model for deploy: python ai_training/export_model.py")
        print("  3. Restart or reload Clean Kadal backend to load your custom model.")
    else:
        print(f"\n[!] Training finished, but best.pt was not found at {best_weights}")


if __name__ == "__main__":
    main()


