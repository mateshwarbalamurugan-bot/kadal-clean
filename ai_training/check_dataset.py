"""
Clean Kadal -- Dataset Integrity & Class Distribution Verification Script
Checks image/label pairs, verifies normalized bounding box format [0, 1],
counts instances per class, and alerts if dataset is insufficient for training.
"""
import os
import sys
from pathlib import Path
from collections import Counter
import cv2

CLASSES = [
    "plastic_bottle",
    "plastic_cup",
    "plastic_wrapper",
    "plastic_bag",
    "bottle_cap",
    "leaf"
]

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def check_split(dataset_root: Path, split_name: str) -> dict:
    img_dir = dataset_root / "images" / split_name
    lbl_dir = dataset_root / "labels" / split_name

    stats = {
        "images": 0,
        "labels": 0,
        "missing_labels": 0,
        "corrupt_images": 0,
        "corrupt_labels": 0,
        "class_counts": Counter(),
        "box_errors": 0
    }

    if not img_dir.exists():
        print(f"[-] Directory not found: {img_dir}")
        return stats

    image_files = [f for f in img_dir.iterdir() if f.suffix.lower() in IMAGE_EXTENSIONS]
    stats["images"] = len(image_files)

    for img_path in image_files:
        # Check image readability
        img = cv2.imread(str(img_path))
        if img is None:
            stats["corrupt_images"] += 1
            print(f"[!] Warning: Corrupt or unreadable image: {img_path.name}")
            continue

        lbl_path = lbl_dir / f"{img_path.stem}.txt"
        if not lbl_path.exists():
            stats["missing_labels"] += 1
            continue

        stats["labels"] += 1
        try:
            with open(lbl_path, "r", encoding="utf-8") as f:
                lines = f.readlines()

            for line_no, line in enumerate(lines, 1):
                parts = line.strip().split()
                if not parts:
                    continue
                if len(parts) != 5:
                    stats["corrupt_labels"] += 1
                    print(f"[!] Invalid line format in {lbl_path.name}:{line_no} -> '{line.strip()}'")
                    continue

                cls_id = int(parts[0])
                cx, cy, bw, bh = map(float, parts[1:])

                if cls_id < 0 or cls_id >= len(CLASSES):
                    stats["corrupt_labels"] += 1
                    print(f"[!] Invalid class_id {cls_id} in {lbl_path.name}:{line_no}")
                    continue

                if not (0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0 and 0.0 < bw <= 1.0 and 0.0 < bh <= 1.0):
                    stats["box_errors"] += 1
                    print(f"[!] Out-of-bounds bounding box in {lbl_path.name}:{line_no}: [{cx}, {cy}, {bw}, {bh}]")
                    continue

                stats["class_counts"][CLASSES[cls_id]] += 1

        except Exception as e:
            stats["corrupt_labels"] += 1
            print(f"[!] Error reading label {lbl_path.name}: {e}")

    return stats


def main():
    print("=" * 70)
    print("Clean Kadal -- Dataset Integrity & Class Distribution Verification")
    print("=" * 70)

    script_dir = Path(__file__).resolve().parent
    dataset_root = script_dir.parent / "datasets"

    print(f"Dataset Root: {dataset_root.resolve()}\n")

    splits = ["train", "val", "test"]
    overall_images = 0
    overall_classes = Counter()

    for split in splits:
        print(f"--- Checking Split: '{split}' ---")
        stats = check_split(dataset_root, split)
        overall_images += stats["images"]
        overall_classes += stats["class_counts"]

        print(f"  Images Found:        {stats['images']}")
        print(f"  Annotation Files:    {stats['labels']}")
        print(f"  Missing Labels:      {stats['missing_labels']}")
        print(f"  Corrupt Images:      {stats['corrupt_images']}")
        print(f"  Corrupt Label Lines: {stats['corrupt_labels']}")
        print(f"  Out-of-Bounds Boxes: {stats['box_errors']}")
        print("  Class Instances:")
        if stats["class_counts"]:
            for cls_name in CLASSES:
                count = stats["class_counts"].get(cls_name, 0)
                print(f"    - {cls_name:18s}: {count}")
        else:
            print("    (No annotations found in this split)")
        print()

    print("=" * 70)
    print("DATASET SUMMARY & READINESS ASSESSMENT")
    print("=" * 70)
    print(f"Total Images Across All Splits: {overall_images}")
    print("Total Annotated Instances:")
    for cls_name in CLASSES:
        count = overall_classes.get(cls_name, 0)
        status_flag = "[OK]" if count >= 30 else "[LOW DATA]"
        print(f"  {cls_name:18s}: {count:5d}  {status_flag}")

    print("\nReadiness Assessment:")
    if overall_images == 0:
        print("[!] No images found in datasets/. Place captured boat-camera images in datasets/raw_captures,")
        print("    annotate with CVAT/Roboflow/LabelImg, and run split_dataset.py before training.")
        return 1
    elif overall_images < 50:
        print(f"[!] Warning: Dataset contains only {overall_images} images. Model training is technically possible")
        print("    but generalization will be weak (< 50 images). Recommend collecting at least 100-200 frames.")
        return 0
    else:
        print(f"[OK] Dataset contains {overall_images} images. Ready for transfer learning fine-tuning.")
        return 0


if __name__ == "__main__":
    sys.exit(main())


