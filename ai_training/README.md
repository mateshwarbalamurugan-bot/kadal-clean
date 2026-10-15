# Clean Kadal model training

The recovered production checkpoint is a **single-class `bottle` detector**. The repository does not contain model weights or your captured training images. The `.pt` checkpoint is distributed separately and is ignored by Git. See [`models/README.md`](../models/README.md) for its exact hash and baseline metrics.

## 1. Set up the Windows environment

Open PowerShell in the project folder on D:, for example:

```powershell
cd D:\CleanKadal\backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

If PowerShell blocks environment activation, call `D:\CleanKadal\backend\.venv\Scripts\python.exe` directly. Place the separately provisioned checkpoint here:

```text
D:\CleanKadal\models\clean_kadal_bottle_v2.pt
```

Check the file against the SHA-256 in `models/README.md` before training.

## 2. Capture and label local images

Store images from **separate capture sessions** in separate folders, such as:

```text
D:\CleanKadal\datasets\raw_captures\session_01\frame_0001.jpg
D:\CleanKadal\datasets\raw_captures\session_01\frame_0001.txt
D:\CleanKadal\datasets\raw_captures\session_02\...
D:\CleanKadal\datasets\raw_captures\session_03\...
```

Use CVAT, LabelImg, or Roboflow to export YOLO detection labels. Each `.txt` row must be `class_id x_center y_center width height`, normalized from 0 to 1. The default local YAML has only class ID `0: bottle`. Do not label bags, foam, vegetation, glare, reflections, shoreline objects, or other broad “floating waste” as bottles. For a target-free frame, create an intentional empty `.txt` file; do not leave the label missing. Capture at least three distinct sessions/days/viewpoints so train, validation, and test can be separated without putting neighboring frames from one video into different splits.

Split by session, then audit the result:

```powershell
cd D:\CleanKadal
.\backend\.venv\Scripts\python.exe ai_training\split_dataset.py
.\backend\.venv\Scripts\python.exe ai_training\check_dataset.py
```

The splitter writes to `datasets\local-split\` and refuses to split fewer than three sessions. It refuses to replace a non-empty output directory unless you explicitly pass `--overwrite`; use that only if you intend to discard the generated split and recreate it.

## 3. Fine-tune a candidate checkpoint

The default YAML is `ai_training\dataset.yaml`; it points to the session-separated local data. On a supported NVIDIA GPU:

```powershell
.\backend\.venv\Scripts\python.exe ai_training\train.py --epochs 50 --batch 8 --imgsz 1024 --device 0
```

On CPU (much slower):

```powershell
.\backend\.venv\Scripts\python.exe ai_training\train.py --epochs 50 --batch 2 --imgsz 640 --device cpu
```

The training script checks that the YAML and train/validation images exist. It starts from `models\clean_kadal_bottle_v2.pt` and writes the best candidate to `models\clean_kadal_bottle_candidate.pt`. It does not replace the baseline checkpoint. Training takes substantial time; use a local GPU or Colab for a competition deadline and keep the project’s held-out test data out of training.

To use a separate Ultralytics dataset YAML, pass it explicitly:

```powershell
.\backend\.venv\Scripts\python.exe ai_training\check_dataset.py --data D:\CleanKadal\datasets\flow-img-v3\data.yaml
.\backend\.venv\Scripts\python.exe ai_training\train.py --data D:\CleanKadal\datasets\flow-img-v3\data.yaml --weights D:\CleanKadal\models\clean_kadal_bottle_v2.pt --device 0
```

Check class names and class-ID ordering in that dataset YAML before training. The supplied Flow-Img v3 model was already trained on its original data, so a meaningful improvement experiment should include new local camera examples. Do not merge broad classes from another dataset into the `bottle` class without relabeling.

## 4. Compare baseline and candidate on the same held-out test split

Run the audit first. Then compare both checkpoints with the **same** data YAML, test split, image size, and device:

```powershell
.\backend\.venv\Scripts\python.exe ai_training\validate.py --weights models\clean_kadal_bottle_v2.pt --data ai_training\dataset.yaml --split test --imgsz 1024 --device 0
.\backend\.venv\Scripts\python.exe ai_training\validate.py --weights models\clean_kadal_bottle_candidate.pt --data ai_training\dataset.yaml --split test --imgsz 1024 --device 0
```

Record precision, recall, mAP@0.50, and mAP@0.50:0.95. Review false positives on target-free water and difficult cases, not only aggregate mAP. Do not deploy a candidate merely because training completed. Keep the baseline if the candidate does not improve local held-out behavior.

## 5. Optional model export

After selecting a candidate, export and run an image inference smoke test:

```powershell
.\backend\.venv\Scripts\python.exe ai_training\export_model.py --weights models\clean_kadal_bottle_candidate.pt --format onnx --imgsz 1024
```

This creates an ONNX artifact and executes inference on the bundled sample image. That verifies the export can run; it is not a metric comparison. The backend currently uses PyTorch weights unless its model loader is explicitly configured for the exported format.

## Important limits

- The current detector recognizes **bottles only**. The COCO fallback is generic and is not water-trained.
- The notebook’s recorded 799-image results are the current documented benchmark. The one-image smoke-test result in `models/README.md` is only a sanity check.
- A model trained in a small test tank may not generalize to open water. Keep site/session-separated local test images and report their results separately.
- Dataset licenses differ. See [`docs/DATASET_EVALUATION.md`](../docs/DATASET_EVALUATION.md) before downloading, training on, or redistributing third-party data.
