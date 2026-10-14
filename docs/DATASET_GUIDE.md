# Clean Kadal — Dataset Collection and Annotation Guide

## 1. Directory Structure

```
datasets/
├── raw_captures/          <-- Place raw video frame captures here
│   ├── session_01/        <-- Subfolders for session isolation
│   └── session_02/
├── images/
│   ├── train/             <-- Train split images (.jpg)
│   ├── val/               <-- Validation split images (.jpg)
│   └── test/              <-- Test split images (.jpg)
└── labels/
    ├── train/             <-- Train annotations (.txt in YOLO format)
    ├── val/               <-- Validation annotations (.txt)
    └── test/              <-- Test annotations (.txt)
```

## 2. Target Classes

Ensure all annotations adhere strictly to the 6 target categories:
- `0`: `plastic_bottle`
- `1`: `plastic_cup`
- `2`: `plastic_wrapper`
- `3`: `plastic_bag`
- `4`: `bottle_cap`
- `5`: `leaf`

## 3. YOLO Annotation Format

Each bounding box is represented in a single line inside a `.txt` file with identical stem to its corresponding image:
```
<class_id> <x_center> <y_center> <width> <height>
```
All 4 coordinates must be normalized to $[0.0, 1.0]$:
```
0 0.4521 0.6120 0.1240 0.2100
5 0.7812 0.3204 0.0890 0.0760
```

## 4. Preventing Data Leakage

Never use random frame-level shuffling for video data!
If you extract 30 frames per second, frames $t$ and $t+1$ are identical. A random split would place frame $t$ into training and $t+1$ into testing, giving a false 99% test accuracy that fails completely in the real world.

Always use:
```powershell
.\venv\Scripts\python.exe ai_training/split_dataset.py
```
This script splits whole recording sessions or camera angles, preserving true testing independence.

## 5. Integrity Verification

Always run before training:
```powershell
.\venv\Scripts\python.exe ai_training/check_dataset.py
```
This script verifies:
- Uncorrupted JPEG/PNG files.
- Matching `.txt` files.
- Bounding box coordinates within $[0, 1]$.
- Distribution of instances across all 6 classes.
