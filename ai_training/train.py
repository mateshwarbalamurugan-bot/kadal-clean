"""Fine-tune the Clean Kadal bottle detector without replacing the baseline."""
import argparse
import shutil
import sys
from pathlib import Path

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def parse_args():
    project_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Fine-tune a YOLO detector for Clean Kadal.")
    parser.add_argument("--data", default=str(Path(__file__).resolve().parent / "dataset.yaml"), help="Ultralytics dataset YAML")
    parser.add_argument("--weights", default=str(project_root / "models" / "clean_kadal_bottle_v2.pt"), help="Starting checkpoint")
    parser.add_argument("--epochs", type=int, default=50, help="Maximum training epochs")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=1024, help="Square training image size")
    parser.add_argument("--device", default="cpu", help="Use cpu or a CUDA device such as 0")
    parser.add_argument("--project", default=str(Path(__file__).resolve().parent / "runs"), help="Ultralytics run directory")
    parser.add_argument("--name", default="clean_kadal_candidate", help="Training-run name")
    parser.add_argument("--output-weights", default=str(project_root / "models" / "clean_kadal_bottle_candidate.pt"), help="Candidate output path; baseline is never overwritten")
    return parser.parse_args()


def split_paths(config, split, dataset_root):
    value = config.get(split)
    if not value:
        return []
    entries = value if isinstance(value, list) else [value]
    return [Path(entry) if Path(entry).is_absolute() else dataset_root / entry for entry in entries]


def count_images(paths, dataset_root):
    count = 0
    for path in paths:
        if path.is_dir():
            count += sum(item.suffix.lower() in IMAGE_EXTENSIONS for item in path.rglob("*"))
        elif path.is_file() and path.suffix.lower() in {".txt", ".csv"}:
            for line in path.read_text(encoding="utf-8").splitlines():
                item = line.strip()
                if not item or item.startswith("#"):
                    continue
                candidate = Path(item)
                candidate = candidate if candidate.is_absolute() else dataset_root / candidate
                count += int(candidate.suffix.lower() in IMAGE_EXTENSIONS and candidate.is_file())
        elif path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            count += 1
    return count


def main():
    args = parse_args()
    if args.epochs < 1 or args.batch < 1 or args.imgsz < 320:
        print("[!] epochs and batch must be positive; imgsz must be at least 320.")
        return 2

    data_yaml = Path(args.data).resolve()
    weights = Path(args.weights).resolve()
    if not data_yaml.is_file():
        print(f"[!] Dataset YAML not found: {data_yaml}")
        return 2
    if not weights.is_file():
        print(f"[!] Starting weights not found: {weights}")
        print("    Copy clean_kadal_bottle_v2.pt into models/ or pass --weights.")
        return 2

    try:
        import yaml
        config = yaml.safe_load(data_yaml.read_text(encoding="utf-8-sig")) or {}
    except Exception as exc:
        print(f"[!] Cannot parse dataset YAML: {exc}")
        return 2

    dataset_root = Path(config.get("path") or data_yaml.parent)
    if not dataset_root.is_absolute():
        dataset_root = (data_yaml.parent / dataset_root).resolve()
    train_paths = split_paths(config, "train", dataset_root)
    val_paths = split_paths(config, "val", dataset_root)
    train_count = count_images(train_paths, dataset_root)
    val_count = count_images(val_paths, dataset_root)
    if not train_count or not val_count:
        print(f"[!] Training requires readable train and val images. Found train={train_count}, val={val_count}.")
        print(f"    Dataset root: {dataset_root}; train paths: {train_paths}; val paths: {val_paths}")
        print("    Run check_dataset.py first. Keep the test split untouched until final evaluation.")
        return 2

    print("Clean Kadal YOLO fine-tuning preflight")
    print(f"  Dataset: {data_yaml}")
    print(f"  Classes: {config.get('names', 'not listed')}")
    print(f"  Images: train={train_count}, val={val_count}")
    print(f"  Starting weights: {weights}")
    print(f"  Device / epochs / batch / imgsz: {args.device} / {args.epochs} / {args.batch} / {args.imgsz}")
    print("  Output: candidate checkpoint; the baseline file will not be overwritten.")

    try:
        from ultralytics import YOLO
        model = YOLO(str(weights))
        model.train(
            data=str(data_yaml), epochs=args.epochs, batch=args.batch,
            imgsz=args.imgsz, device=args.device, project=args.project,
            name=args.name, exist_ok=True, pretrained=True, optimizer="auto",
            verbose=True, degrees=10.0, flipud=0.0, fliplr=0.5,
            mosaic=1.0, hsv_h=0.015, hsv_s=0.7, hsv_v=0.4,
        )
    except ImportError:
        print("[!] Ultralytics is missing. Install backend/requirements.txt first.")
        return 2
    except Exception as exc:
        print(f"[!] Training failed: {exc}")
        return 1

    best_weights = Path(args.project).resolve() / args.name / "weights" / "best.pt"
    if not best_weights.is_file():
        print(f"[!] Training ended but best.pt was not found: {best_weights}")
        return 1
    output_weights = Path(args.output_weights).resolve()
    output_weights.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best_weights, output_weights)
    print(f"[OK] Candidate checkpoint saved: {output_weights}")
    print("Next: validate on an untouched test set, compare with the baseline, then export only if the candidate is better.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
