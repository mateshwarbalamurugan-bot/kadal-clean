"""
Clean Kadal -- Session-Aware Dataset Splitter
Splits raw captured images and annotations into Train, Val, and Test sets
by SESSION (or video recording batch) to strictly prevent data leakage from
consecutive video frames into validation and test sets.
"""
import os
import shutil
import random
from pathlib import Path
from collections import defaultdict

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def split_dataset(
    raw_dir: Path,
    output_dir: Path,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    seed: int = 42
):
    random.seed(seed)
    assert abs((train_ratio + val_ratio + test_ratio) - 1.0) < 1e-4, "Ratios must sum to 1.0"

    print("=" * 70)
    print("Clean Kadal -- Session-Aware Dataset Splitter")
    print("=" * 70)

    # 1. Group images by session
    # A session can be represented by:
    # Option A: subfolders inside raw_captures/ (e.g. raw_captures/session_morning_01/*.jpg)
    # Option B: filename prefix (e.g. session1_0001.jpg, session2_0001.jpg)
    session_files = defaultdict(list)

    if not raw_dir.exists():
        print(f"[-] Raw captures directory not found: {raw_dir}")
        return

    # Check for subdirectories (session folders)
    subdirs = [d for d in raw_dir.iterdir() if d.is_dir()]
    if subdirs:
        print(f"[*] Found {len(subdirs)} session subdirectories.")
        for sdir in subdirs:
            session_name = sdir.name
            imgs = [f for f in sdir.iterdir() if f.suffix.lower() in IMAGE_EXTENSIONS]
            session_files[session_name].extend(imgs)
    else:
        # Group by filename prefix before underscore (e.g. 'session1_frame12.jpg' -> 'session1')
        print("[*] Grouping files by filename session prefix...")
        all_imgs = [f for f in raw_dir.iterdir() if f.suffix.lower() in IMAGE_EXTENSIONS]
        for img in all_imgs:
            if "_" in img.stem:
                session_prefix = img.stem.split("_")[0]
            else:
                session_prefix = "session_default"
            session_files[session_prefix].append(img)

    sessions = list(session_files.keys())
    print(f"[*] Total unique recording sessions identified: {len(sessions)}")
    for s in sessions:
        print(f"    - Session '{s}': {len(session_files[s])} frames")

    if not sessions:
        print("[!] No images found to split. Place images in datasets/raw_captures/")
        return

    # Shuffle sessions
    random.shuffle(sessions)

    # Split sessions across train, val, test
    n_sessions = len(sessions)
    if n_sessions >= 3:
        n_train = max(1, int(round(n_sessions * train_ratio)))
        n_val = max(1, int(round(n_sessions * val_ratio)))
        train_sessions = sessions[:n_train]
        val_sessions = sessions[n_train:n_train + n_val]
        test_sessions = sessions[n_train + n_val:]
        if not test_sessions:
            test_sessions = [val_sessions.pop()]
    else:
        print("[!] Fewer than 3 sessions available. Splitting frames directly while warning about leak risk.")
        all_frames = []
        for s in sessions:
            all_frames.extend(session_files[s])
        random.shuffle(all_frames)
        n = len(all_frames)
        n_tr = int(n * train_ratio)
        n_va = int(n * val_ratio)
        split_map = {
            "train": all_frames[:n_tr],
            "val": all_frames[n_tr:n_tr + n_va],
            "test": all_frames[n_tr + n_va:]
        }
        train_sessions, val_sessions, test_sessions = None, None, None

    if train_sessions is not None:
        split_map = {
            "train": [f for s in train_sessions for f in session_files[s]],
            "val": [f for s in val_sessions for f in session_files[s]],
            "test": [f for s in test_sessions for f in session_files[s]],
        }
        print(f"\n[OK] Train Sessions: {train_sessions} ({len(split_map['train'])} images)")
        print(f"[OK] Val Sessions:   {val_sessions} ({len(split_map['val'])} images)")
        print(f"[OK] Test Sessions:  {test_sessions} ({len(split_map['test'])} images)")

    # Copy files to datasets/images/<split> and copy matching annotations if present
    for split_name, img_list in split_map.items():
        dst_img_dir = output_dir / "images" / split_name
        dst_lbl_dir = output_dir / "labels" / split_name
        dst_img_dir.mkdir(parents=True, exist_ok=True)
        dst_lbl_dir.mkdir(parents=True, exist_ok=True)

        copied_count = 0
        for img_path in img_list:
            # Copy image
            target_img = dst_img_dir / img_path.name
            shutil.copy2(img_path, target_img)

            # Check if corresponding .txt annotation exists alongside image or in raw_dir
            potential_lbls = [
                img_path.with_suffix(".txt"),
                img_path.parent / f"{img_path.stem}.txt",
                raw_dir / f"{img_path.stem}.txt"
            ]
            for pl in potential_lbls:
                if pl.exists():
                    shutil.copy2(pl, dst_lbl_dir / f"{img_path.stem}.txt")
                    break
            copied_count += 1

        print(f"[*] Prepared {copied_count} images for split '{split_name}'.")

    print("\n[OK] Session-aware dataset split complete.")


if __name__ == "__main__":
    script_dir = Path(__file__).resolve().parent
    raw = script_dir.parent / "datasets" / "raw_captures"
    out = script_dir.parent / "datasets"
    split_dataset(raw, out)


