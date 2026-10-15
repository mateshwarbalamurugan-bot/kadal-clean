"""Import the official Floating Marine Litter Dataset v2 YOLO subset.

The archive is not committed to this repository. Download it from SEANOE and run:
    python ai_training/import_fml_dataset.py --archive /path/to/120969.zip
"""
from __future__ import annotations

import argparse
import json
import shutil
from collections import Counter
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

ARCHIVE_ROOT = "fml_version2/full_dataset"
SPLITS = ("train", "val", "test")
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
SOURCE_URL = "https://www.seanoe.org/data/00950/106148/"
SOURCE_DOI = "https://doi.org/10.17882/106148"
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"


def parse_args() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Import and validate FML Dataset v2 for YOLOv8.")
    parser.add_argument("--archive", type=Path, required=True, help="Path to the SEANOE 120969.zip archive")
    parser.add_argument(
        "--output", type=Path, default=project_root / "datasets" / "fml_v2",
        help="Output dataset directory (default: datasets/fml_v2)",
    )
    parser.add_argument("--overwrite", action="store_true", help="Replace an existing output directory")
    return parser.parse_args()


def validate_label_text(text: str, source_name: str) -> tuple[int, Counter[int]]:
    boxes = 0
    class_counts: Counter[int] = Counter()
    for line_number, line in enumerate(text.splitlines(), 1):
        fields = line.split()
        if len(fields) != 5:
            raise ValueError(f"{source_name}:{line_number}: expected 5 YOLO fields, got {len(fields)}")
        try:
            class_id = int(fields[0])
            cx, cy, width, height = map(float, fields[1:])
        except ValueError as exc:
            raise ValueError(f"{source_name}:{line_number}: invalid numeric label") from exc
        if class_id != 0:
            raise ValueError(f"{source_name}:{line_number}: expected single source class id 0, got {class_id}")
        if not (0 <= cx <= 1 and 0 <= cy <= 1 and 0 < width <= 1 and 0 < height <= 1):
            raise ValueError(f"{source_name}:{line_number}: normalized box outside valid range")
        boxes += 1
        class_counts[class_id] += 1
    return boxes, class_counts


def import_dataset(archive_path: Path, output_dir: Path, overwrite: bool = False) -> dict:
    archive_path = archive_path.expanduser().resolve()
    output_dir = output_dir.expanduser().resolve()
    if not archive_path.is_file():
        raise FileNotFoundError(f"Dataset archive not found: {archive_path}")
    if output_dir.exists() and any(output_dir.iterdir()):
        if not overwrite:
            raise FileExistsError(f"Output directory is not empty: {output_dir} (pass --overwrite to replace it)")
        shutil.rmtree(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)
    summary = {"images": {}, "boxes": {}, "empty_images": {}, "class_counts": {"garbage": 0}}
    seen_names: set[str] = set()

    with ZipFile(archive_path) as archive:
        archive_names = set(archive.namelist())
        for split in SPLITS:
            image_prefix = f"{ARCHIVE_ROOT}/images/{split}/"
            label_prefix = f"{ARCHIVE_ROOT}/labels/yolo_format/{split}/"
            image_members = sorted(
                name for name in archive_names
                if name.startswith(image_prefix) and PurePosixPath(name).suffix.lower() in IMAGE_SUFFIXES
            )
            if not image_members:
                raise ValueError(f"No images found for split '{split}' in archive")

            image_dir = output_dir / "images" / split
            label_dir = output_dir / "labels" / split
            image_dir.mkdir(parents=True, exist_ok=True)
            label_dir.mkdir(parents=True, exist_ok=True)
            box_count = 0
            empty_count = 0

            for image_member in image_members:
                filename = PurePosixPath(image_member).name
                stem = PurePosixPath(filename).stem
                if filename in seen_names:
                    raise ValueError(f"Duplicate image filename across dataset splits: {filename}")
                seen_names.add(filename)
                label_member = f"{label_prefix}{stem}.txt"
                if label_member not in archive_names:
                    raise ValueError(f"Missing YOLO label file for {image_member}")

                image_target = image_dir / filename
                label_target = label_dir / f"{stem}.txt"
                with archive.open(image_member) as source, image_target.open("wb") as target:
                    shutil.copyfileobj(source, target, length=1024 * 1024)
                with archive.open(label_member) as source:
                    label_text = source.read().decode("utf-8-sig")
                count, class_counts = validate_label_text(label_text, label_member)
                label_target.write_text(label_text, encoding="utf-8")
                box_count += count
                empty_count += count == 0
                summary["class_counts"]["garbage"] += class_counts[0]

            summary["images"][split] = len(image_members)
            summary["boxes"][split] = box_count
            summary["empty_images"][split] = empty_count
            print(f"{split}: {len(image_members)} images, {box_count} boxes, {empty_count} empty labels")

    if len(seen_names) != sum(summary["images"].values()):
        raise ValueError("Dataset contains duplicate image basenames")

    summary.update({
        "dataset": "Floating Marine Litter Dataset v2 (SEANOE)",
        "source": SOURCE_URL,
        "doi": SOURCE_DOI,
        "license": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        "license_url": LICENSE_URL,
        "classes": ["garbage"],
    })
    (output_dir / "dataset_metadata.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {sum(summary['images'].values())} images and {sum(summary['boxes'].values())} boxes to {output_dir}")
    print("Single source label: garbage. This dataset does not provide plastic-material subclasses.")
    return summary


def main() -> int:
    args = parse_args()
    try:
        import_dataset(args.archive, args.output, args.overwrite)
    except Exception as exc:
        print(f"Import failed: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
