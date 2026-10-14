# Clean Kadal — AI Model Training & Dataset Pipeline

This directory contains the complete pipeline for training, validating, and exporting a custom lightweight computer vision detector for floating waste and debris.

---

## 1. Target Object Categories

The model is trained on 6 specific physical classes:

| Class ID | Class Name | Description | Status in Interface |
|---|---|---|---|
| `0` | `plastic_bottle` | PET water/soft-drink bottles | Potential litter candidate |
| `1` | `plastic_cup` | Disposable plastic or styrofoam cups | Potential litter candidate |
| `2` | `plastic_wrapper` | Food snack wrappers, cellophane | Potential litter candidate |
| `3` | `plastic_bag` | Thin polythene carry bags | Potential litter candidate |
| `4` | `bottle_cap` | Small plastic caps | Potential litter candidate |
| `5` | `leaf` | Natural plant leaves, organic surface debris | Natural debris (non-litter) |

> **Important Distinction**: In the baseline (unfine-tuned) YOLOv8n-COCO detector, only generic `bottle` and `cup` classes exist. Clean Kadal **never** pretends a generic model is the custom Clean Kadal model. When running the baseline, labels are shown as `bottle` or `cup` and flagged as "potential litter candidate". Only after fine-tuning this custom pipeline will the specific classes above be recognized.

---

## 2. Dataset Collection Workflow (From Your Boat-Mounted Camera)

1. Mount your USB webcam onto your stationary boat model in the rectangular water tub.
2. Angle the camera looking **forward and downward** toward the water surface ahead of the boat.
3. Record distinct video clips (sessions) under different lighting conditions and with manual waves generated from different sides of the tub:
   - `session_01_morning_flat_water.mp4`
   - `session_02_morning_hand_waves_left.mp4`
   - `session_03_afternoon_hand_waves_right.mp4`
   - `session_04_shaded_mixed_waste.mp4`
4. Extract frames at ~1 frame per second (avoid extracting 30 identical frames per second):
   ```powershell
   # Using ffmpeg or OpenCV
   ffmpeg -i session_01.mp4 -r 1 datasets/raw_captures/session1_frame_%04d.jpg
   ```
5. Place all captured frames inside `datasets/raw_captures/`.

---

## 3. Image Annotation

Use open-source annotation tools:
- **CVAT** (Computer Vision Annotation Tool, local or web)
- **LabelImg** (standalone local tool: `pip install labelImg`)
- **Roboflow** (web interface, export as YOLOv8 PyTorch format)

Ensure classes match the exact 0-5 indices:
- Format: `class_id x_center y_center width height` (all normalized between 0.0 and 1.0).

---

## 4. Preventing Data Leakage Across Splits

Consecutive video frames from the same recording session look nearly identical. If frame 12 is in training and frame 13 is in testing, test metrics will be artificially inflated and invalid.

Use our session-aware splitter:
```powershell
.\venv\Scripts\python.exe ai_training/split_dataset.py
```
This script assigns whole recording sessions (e.g. Session 1 & 2 to `train`, Session 3 to `val`, Session 4 to `test`), ensuring real-world test evaluation.

---

## 5. Dataset Verification

Run the dataset integrity checker:
```powershell
.\venv\Scripts\python.exe ai_training/check_dataset.py
```
This script checks:
- Image readability (corrupted files).
- Missing annotation `.txt` files.
- Out-of-bounds coordinates ($<0$ or $>1$).
- Class instance balance.
- Emits an alert if dataset has fewer than 50 images.

---

## 6. Training (Transfer Learning)

Fine-tune the lightweight YOLOv8 nano model starting from pretrained weights:
```powershell
.\venv\Scripts\python.exe ai_training/train.py --epochs 50 --batch 16 --imgsz 640 --device cpu
```
*(If you have an NVIDIA GPU, pass `--device 0`).*

When training completes:
- Training metrics and confusion matrices are saved to `ai_training/runs/clean_kadal_custom/`.
- The best checkpoint is automatically copied to `models/custom_best.pt`.

---

## 7. Model Validation

Evaluate the trained model on unseen test sessions:
```powershell
.\venv\Scripts\python.exe ai_training/validate.py
```
Reports overall and per-class Precision, Recall, mAP@50, and mAP@50:95.

---

## 8. Exporting for Deployment

Export the trained model to ONNX:
```powershell
.\venv\Scripts\python.exe ai_training/export_model.py
```
The script:
1. Converts `custom_best.pt` to ONNX format.
2. Places `custom_best.onnx` into `models/`.
3. **Runs actual test inference** to verify the exported file works before confirming success.

---

## 9. Reloading in Clean Kadal Application

Once `models/custom_best.pt` or `models/custom_best.onnx` exists:
- Clean Kadal backend automatically loads it on startup.
- If the backend is already running, click **"Reload Model"** in the web dashboard or make a request to `POST /api/model/reload`.
- The interface will immediately switch status to:
  **"Clean Kadal Custom Detector (Custom-Trained Model Active)"** and display the 6 floating-waste classes.
