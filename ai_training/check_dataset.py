"""Audit a YOLO dataset described by an Ultralytics YAML file."""
import argparse
import hashlib
import sys
from pathlib import Path

import cv2

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def parse_args():
    parser = argparse.ArgumentParser(description="Check YOLO images, labels, classes, boxes, and split leakage.")
    parser.add_argument("--data", default=str(Path(__file__).resolve().parent / "dataset.yaml"), help="Dataset YAML")
    return parser.parse_args()


def image_paths_for(value, root):
    entries = value if isinstance(value, list) else [value]
    result = []
    for entry in entries:
        path = Path(entry)
        path = path if path.is_absolute() else root / path
        if path.is_dir():
            result.extend(item for item in path.rglob("*") if item.suffix.lower() in IMAGE_EXTENSIONS)
        elif path.is_file() and path.suffix.lower() in {".txt", ".csv"}:
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                image = Path(line)
                result.append(image if image.is_absolute() else root / image)
        elif path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            result.append(path)
    return sorted(set(item.resolve() for item in result))


def label_path_for(image_path):
    parts = list(image_path.parts)
    for index, part in enumerate(parts):
        if part.lower() == "images":
            parts[index] = "labels"
            return Path(*parts).with_suffix(".txt")
    return image_path.with_suffix(".txt")


def class_names(config):
    names = config.get("names", {})
    if isinstance(names, list):
        return {index: name for index, name in enumerate(names)}
    return {int(key): value for key, value in names.items()}


def main():
    args = parse_args()
    yaml_path = Path(args.data).resolve()
    if not yaml_path.is_file():
        print(f"[!] Dataset YAML not found: {yaml_path}")
        return 2
    try:
        import yaml
        config = yaml.safe_load(yaml_path.read_text(encoding="utf-8-sig")) or {}
    except Exception as exc:
        print(f"[!] Could not parse dataset YAML: {exc}")
        return 2

    root = Path(config.get("path") or yaml_path.parent)
    if not root.is_absolute():
        root = (yaml_path.parent / root).resolve()
    names = class_names(config)
    if not names:
        print("[!] Dataset YAML has no class names.")
        return 2

    print(f"Dataset YAML: {yaml_path}")
    print(f"Dataset root: {root}")
    print(f"Classes: {names}")
    total_images = 0
    errors = 0
    split_hashes = {}
    total_counts = {class_id: 0 for class_id in names}

    for split in ("train", "val", "test"):
        split_value = config.get(split)
        if not split_value:
            print(f"\n{split}: not configured")
            continue
        images = image_paths_for(split_value, root)
        per_class = {class_id: 0 for class_id in names}
        missing_labels = corrupt_images = corrupt_labels = bad_boxes = duplicates = 0
        for image in images:
            pixels = cv2.imread(str(image))
            if pixels is None:
                corrupt_images += 1
                continue
            digest = hashlib.sha256(image.read_bytes()).hexdigest()
            if digest in split_hashes and split_hashes[digest] != split:
                duplicates += 1
            else:
                split_hashes[digest] = split

            label = label_path_for(image)
            if not label.is_file():
                missing_labels += 1
                continue
            try:
                for line_number, line in enumerate(label.read_text(encoding="utf-8").splitlines(), 1):
                    fields = line.split()
                    if not fields:
                        continue  # An intentionally empty label file is a valid negative image.
                    if len(fields) != 5:
                        corrupt_labels += 1
                        continue
                    class_id = int(fields[0])
                    cx, cy, width, height = map(float, fields[1:])
                    valid = (
                        class_id in names and 0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0
                        and 0.0 < width <= 1.0 and 0.0 < height <= 1.0
                        and cx - width / 2 >= 0.0 and cx + width / 2 <= 1.0
                        and cy - height / 2 >= 0.0 and cy + height / 2 <= 1.0
                    )
                    if not valid:
                        bad_boxes += 1
                        continue
                    per_class[class_id] += 1
                    total_counts[class_id] += 1
            except (OSError, ValueError):
                corrupt_labels += 1

        total_images += len(images)
        errors += missing_labels + corrupt_images + corrupt_labels + bad_boxes + duplicates
        print(f"\n{split}: {len(images)} images")
        print(f"  missing label files: {missing_labels}; unreadable images: {corrupt_images}; malformed labels: {corrupt_labels}; invalid boxes/classes: {bad_boxes}; exact cross-split duplicates: {duplicates}")
        for class_id, name in names.items():
            print(f"  class {class_id} ({name}): {per_class[class_id]} boxes")
        if split == "test" and not images:
            print("  WARNING: no held-out test images; do not report validation metrics as test results.")

    print(f"\nTotal images: {total_images}")
    print("Total boxes: " + ", ".join(f"{names[k]}={v}" for k, v in total_counts.items()))
    if errors:
        print("[!] Dataset audit found issues. Fix them before training.")
        return 1
    print("[OK] No missing labels, unreadable images, invalid boxes, or exact cross-split duplicates found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
