"""Add the project's public floating-waste demo frame to the FML training set.

The source image is already tracked at frontend/public/sample_floating_waste.jpg;
its manual YOLO labels are tracked in ai_training/annotations/. The copied dataset
and generated metadata remain under the ignored datasets/ directory.
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import cv2
import numpy as np

from import_fml_dataset import validate_label_text

IMAGE_NAME = "website_sample_floating_waste.jpg"
ANNOTATION_NAME = "website_sample_floating_waste.txt"


def parse_args() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Add the public demo frame as a supplemental one-class training example.")
    parser.add_argument("--dataset", type=Path, default=project_root / "datasets" / "fml_v2", help="Imported dataset root")
    return parser.parse_args()


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    dataset_root = Path(parse_args().dataset).expanduser().resolve()
    source_image = project_root / "frontend" / "public" / "sample_floating_waste.jpg"
    annotation = project_root / "ai_training" / "annotations" / ANNOTATION_NAME
    if not source_image.is_file() or not annotation.is_file():
        raise SystemExit(f"Demo image/annotation missing: {source_image} / {annotation}")
    raw = source_image.read_bytes()
    if not raw.startswith(b"\xff\xd8"):
        raise SystemExit(f"Demo asset is not encoded as JPEG bytes: {source_image}")
    decoded = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        raise SystemExit(f"OpenCV could not decode the demo image: {source_image}")
    label_text = annotation.read_text(encoding="utf-8")
    box_count, class_counts = validate_label_text(label_text, str(annotation))
    if box_count < 1 or set(class_counts) != {0}:
        raise SystemExit("Supplemental demo annotation must contain class 0 (garbage) boxes")

    image_target = dataset_root / "images" / "train" / IMAGE_NAME
    label_target = dataset_root / "labels" / "train" / f"{Path(IMAGE_NAME).stem}.txt"
    if not image_target.parent.is_dir() or not label_target.parent.is_dir():
        raise SystemExit(f"Dataset train folders missing under {dataset_root}; import FML first")
    shutil.copy2(source_image, image_target)
    shutil.copy2(annotation, label_target)

    metadata_path = dataset_root / "dataset_metadata.json"
    if metadata_path.is_file():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    else:
        metadata = {}
    supplemental = metadata.setdefault("supplemental_images", [])
    already_recorded = any(item.get("image") == IMAGE_NAME for item in supplemental if isinstance(item, dict))
    if not already_recorded:
        counts = metadata.setdefault("images", {})
        counts["train"] = int(counts.get("train", 0)) + 1
        box_counts = metadata.setdefault("boxes", {})
        box_counts["train"] = int(box_counts.get("train", 0)) + box_count
        class_totals = metadata.setdefault("class_counts", {})
        class_totals["garbage"] = int(class_totals.get("garbage", 0)) + box_count
        supplemental.append({
            "image": IMAGE_NAME,
            "source": "frontend/public/sample_floating_waste.jpg",
            "annotation": "ai_training/annotations/website_sample_floating_waste.txt",
            "boxes": box_count,
            "note": "Manually annotated project demo frame; supplemental training example, not part of the SEANOE test split.",
        })
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    print(f"Added {IMAGE_NAME} to {dataset_root}/images/train with {box_count} garbage boxes.")
    print("The raw image remains the existing public project asset; no extra image copy is committed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
