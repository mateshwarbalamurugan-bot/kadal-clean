"""Validate image/label pairs for a YOLO dataset described by a YAML file."""
from __future__ import annotations

import argparse
import os
from collections import Counter
from pathlib import Path

import cv2
import yaml

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
SPLITS = ("train", "val", "test")


def class_names_from_config(config: dict) -> list[str]:
    names = config.get("names", [])
    if isinstance(names, dict):
        return [str(names[key]) for key in sorted(names, key=lambda value: int(value))]
    if isinstance(names, list):
        return [str(name) for name in names]
    raise ValueError("Dataset YAML 'names' must be a list or numeric-keyed mapping")


def resolve_dataset_root(data_yaml: Path, config: dict) -> Path:
    value = Path(config.get("path", ".")).expanduser()
    return (value if value.is_absolute() else data_yaml.parent / value).resolve()


def split_directory(root: Path, config: dict, split: str) -> Path:
    value = config.get(split)
    if not value:
        return root / "images" / split
    if isinstance(value, list):
        raise ValueError(f"The integrity checker expects a single directory for split '{split}'")
    path = Path(value).expanduser()
    return path.resolve() if path.is_absolute() else (root / path).resolve()


def check_split(image_dir: Path, names: list[str]) -> dict:
    label_dir = Path(str(image_dir).replace(f"{os.sep}images{os.sep}", f"{os.sep}labels{os.sep}"))
    stats = {"images": 0, "labels": 0, "missing_labels": 0, "corrupt_images": 0,
             "corrupt_labels": 0, "box_errors": 0, "class_counts": Counter()}
    if not image_dir.is_dir():
        return stats

    images = sorted(p for p in image_dir.rglob("*") if p.suffix.lower() in IMAGE_EXTENSIONS)
    stats["images"] = len(images)
    for image_path in images:
        image = cv2.imread(str(image_path))
        if image is None:
            stats["corrupt_images"] += 1
            continue
        label_path = label_dir / f"{image_path.stem}.txt"
        if not label_path.is_file():
            stats["missing_labels"] += 1
            continue
        stats["labels"] += 1
        try:
            for line_number, line in enumerate(label_path.read_text(encoding="utf-8").splitlines(), 1):
                fields = line.split()
                if len(fields) != 5:
                    stats["corrupt_labels"] += 1
                    continue
                try:
                    class_id = int(fields[0])
                    cx, cy, width, height = map(float, fields[1:])
                except ValueError:
                    stats["corrupt_labels"] += 1
                    continue
                if not 0 <= class_id < len(names):
                    stats["corrupt_labels"] += 1
                    continue
                if not (0 <= cx <= 1 and 0 <= cy <= 1 and 0 < width <= 1 and 0 < height <= 1):
                    stats["box_errors"] += 1
                    continue
                stats["class_counts"][names[class_id]] += 1
        except OSError:
            stats["corrupt_labels"] += 1
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Check YOLO image/label pairs and normalized boxes.")
    parser.add_argument("--data", type=Path, default=Path(__file__).parent / "dataset.yaml", help="Dataset YAML")
    args = parser.parse_args()
    data_yaml = args.data.expanduser().resolve()
    if not data_yaml.is_file():
        parser.error(f"Dataset YAML not found: {data_yaml}")
    config = yaml.safe_load(data_yaml.read_text(encoding="utf-8")) or {}
    names = class_names_from_config(config)
    root = resolve_dataset_root(data_yaml, config)
    print(f"Dataset YAML: {data_yaml}\nDataset root: {root}\nClasses: {names}\n")

    totals = Counter()
    all_classes = Counter()
    for split in SPLITS:
        image_dir = split_directory(root, config, split)
        stats = check_split(image_dir, names)
        totals.update({key: stats[key] for key in ("images", "labels", "missing_labels", "corrupt_images", "corrupt_labels", "box_errors")})
        all_classes.update(stats["class_counts"])
        print(f"{split}: {stats['images']} images, {stats['labels']} labels, "
              f"{stats['missing_labels']} missing, {stats['corrupt_images']} corrupt images, "
              f"{stats['corrupt_labels']} corrupt labels, {stats['box_errors']} invalid boxes")
        for name in names:
            print(f"  {name}: {stats['class_counts'].get(name, 0)} boxes")

    if not totals["images"]:
        print("No images found in the declared dataset splits.")
        return 1
    print(f"\nTotal: {totals['images']} images, {sum(all_classes.values())} valid boxes")
    errors = totals["missing_labels"] + totals["corrupt_images"] + totals["corrupt_labels"] + totals["box_errors"]
    print("Dataset integrity: " + ("PASS" if errors == 0 else f"FAIL ({errors} issue(s))"))
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
