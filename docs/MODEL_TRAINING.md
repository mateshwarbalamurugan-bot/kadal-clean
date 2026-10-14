# Clean Kadal — Custom Model Training Pipeline

## 1. Overview

Clean Kadal uses transfer learning on top of Ultralytics YOLOv8 nano (`yolov8n.pt`).
Training from random weights is avoided because floating-waste datasets collected in college projects are typically small (100–500 images). Pretrained feature representations of edges, textures, and contours drastically accelerate convergence.

---

## 2. Command-Line Training Workflow (Windows)

Ensure your virtual environment is active:
```powershell
.\venv\Scripts\Activate.ps1
```

### Step 1: Check Dataset Integrity
```powershell
python ai_training/check_dataset.py
```
Ensures all labels are valid and reports class frequencies.

### Step 2: Fine-Tune the Model
```powershell
python ai_training/train.py --epochs 50 --batch 16 --imgsz 640 --device cpu
```
*Note: If your laptop has an NVIDIA GPU with CUDA, specify `--device 0`.*

### Step 3: Evaluate on Unseen Test Split
```powershell
python ai_training/validate.py
```
Reports per-class Precision, Recall, and mAP@50:95.

### Step 4: Export and Verify Model
```powershell
python ai_training/export_model.py
```
This exports the model to ONNX, places `models/custom_best.onnx` in the models directory, and runs a test inference pass to verify the export before confirming success.

---

## 3. Integrating with Clean Kadal

Once `custom_best.pt` or `custom_best.onnx` is located in `models/`:
1. Start or switch to the Clean Kadal dashboard.
2. Click **Reload Model Weights** in the AI Model Card.
3. The dashboard will update from `Baseline COCO` to `Clean Kadal Custom Detector`, enabling the 6 floating-waste classes.
