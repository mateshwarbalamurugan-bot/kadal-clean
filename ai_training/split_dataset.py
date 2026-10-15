"""Split annotated camera captures by whole session to reduce temporal leakage."""
import argparse
import random
import shutil
import sys
from collections import defaultdict
from pathlib import Path

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def parse_args():
    project_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Split labeled images by recording session.")
    parser.add_argument("--raw-dir", default=str(project_root / "datasets" / "raw_captures"), help="Session subfolders, or files named with session prefixes")
    parser.add_argument("--output-dir", default=str(project_root / "datasets" / "local-split"), help="Output Ultralytics dataset folder")
    parser.add_argument("--seed", type=int, default=42, help="Deterministic session shuffle seed")
    parser.add_argument("--overwrite", action="store_true", help="Replace the existing output folder; this deletes only that folder")
    return parser.parse_args()


def allocate_sessions(sessions, rng):
    rng.shuffle(sessions)
    count = len(sessions)
    if count < 3:
        raise ValueError(f"Need at least 3 distinct capture sessions; found {count}. Do not split neighboring video frames randomly.")
    train_count = max(1, round(count * 0.70))
    val_count = max(1, round(count * 0.15))
    test_count = count - train_count - val_count
    while test_count < 1:
        if train_count > 1:
            train_count -= 1
        elif val_count > 1:
            val_count -= 1
        test_count = count - train_count - val_count
    return {
        "train": sessions[:train_count],
        "val": sessions[train_count:train_count + val_count],
        "test": sessions[train_count + val_count:],
    }


def find_label(image, raw_dir):
    sibling = image.with_suffix(".txt")
    root_sibling = raw_dir / f"{image.stem}.txt"
    if sibling.is_file():
        return sibling
    if root_sibling.is_file():
        return root_sibling
    return None


def main():
    args = parse_args()
    raw_dir = Path(args.raw_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    if not raw_dir.is_dir():
        print(f"[!] Raw capture directory not found: {raw_dir}")
        return 2

    sessions = defaultdict(list)
    session_folders = [path for path in raw_dir.iterdir() if path.is_dir()]
    if session_folders:
        for folder in sorted(session_folders):
            images = [p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]
            if images:
                sessions[folder.name].extend(images)
    else:
        for image in raw_dir.iterdir():
            if image.is_file() and image.suffix.lower() in IMAGE_EXTENSIONS:
                session = image.stem.split("_", 1)[0] if "_" in image.stem else "unassigned"
                sessions[session].append(image)

    missing = [image for images in sessions.values() for image in images if find_label(image, raw_dir) is None]
    if missing:
        examples = ", ".join(str(path) for path in missing[:5])
        print(f"[!] {len(missing)} images have no matching YOLO .txt label. Label them first; negative images need an intentional empty .txt file.")
        print(f"    Examples: {examples}")
        return 2

    try:
        split_sessions = allocate_sessions(list(sessions), random.Random(args.seed))
    except ValueError as exc:
        print(f"[!] {exc}")
        print("    Capture at least three distinct sessions/days/camera setups, then run this command again.")
        return 2

    if output_dir.exists() and any(output_dir.iterdir()):
        if not args.overwrite:
            print(f"[!] Output folder is not empty: {output_dir}")
            print("    Choose a new --output-dir or pass --overwrite to replace this folder.")
            return 2
        shutil.rmtree(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Dataset split seed: {args.seed}")
    for split, session_names in split_sessions.items():
        count = sum(len(sessions[name]) for name in session_names)
        print(f"{split}: {session_names} ({count} images)")
        image_dest = output_dir / "images" / split
        label_dest = output_dir / "labels" / split
        image_dest.mkdir(parents=True, exist_ok=True)
        label_dest.mkdir(parents=True, exist_ok=True)
        for session_name in session_names:
            safe_prefix = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in session_name)
            for image in sessions[session_name]:
                target_stem = f"{safe_prefix}__{image.stem}"
                shutil.copy2(image, image_dest / f"{target_stem}{image.suffix.lower()}")
                shutil.copy2(find_label(image, raw_dir), label_dest / f"{target_stem}.txt")

    print(f"[OK] Session split written to: {output_dir}")
    print("Audit it with: python ai_training/check_dataset.py")
    print("Keep the test session untouched until final model comparison.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
