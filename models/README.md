# Clean Kadal model weights

## Active custom checkpoint

The backend prioritizes `models/clean_kadal_bottle_v2.pt`. This is the actual custom checkpoint retrieved from the project’s connected Google Drive and referenced by `CleanKadal.ipynb`. The file is 6,588,202 bytes and is intentionally excluded from Git by the repository’s `*.pt` ignore rule.

- **Model:** YOLOv8n-based `Clean Kadal Bottle Detector v2`
- **Class:** `bottle` only
- **Notebook settings:** image size 1024, batch size 8, up to 50 epochs; notebook output reports early stopping at epoch 40
- **Notebook-reported held-out test split:** 799 images
- **Notebook metrics:** precision 0.8659, recall 0.8141, mAP@50 0.8683, mAP@50–95 0.4201
- **SHA-256:** `fb39241b53650857d2d2f71ab454c44076df892339f196d7cdab5ec43de23da4`

The metrics above are recorded by the supplied notebook, not independently reproduced in this session. They do not establish field accuracy across all water conditions, camera distances, lighting, glare, or weather. The checkpoint does **not** detect all litter categories.

## Independent inference smoke test

The checkpoint was run on one raw labeled image from the supplied Flow-Img v3 test split. This is a narrow inference sanity check, not a benchmark or a new dataset-level score.

The exact Flow-Img smoke-test image is bundled as `frontend/public/sample_flowimg_v3_bottle.jpg` and is used by the website’s **Try Sample Image** button because it is labeled for this model. The image was posted to `/api/analyze/frame` through FastAPI: the route returned HTTP 200, loaded the custom `bottle` checkpoint, and serialized eight detections. With `is_static_image` set, tracking, camera motion, wave motion, and accumulation were correctly reported as unavailable. The separate repository-provided `sample_floating_waste.jpg` was also accepted by the API but returned zero detections in one local run, so it is not the default demo image. These single-image checks are not accuracy benchmarks.

- At **1024 px**, the model returned 8 boxes for 8 labeled objects. A one-to-one box match at IoU ≥ 0.50 matched all 8; mean IoU of those matched boxes was 0.692. After one warm-up, five repeated CPU `YOLO.predict` calls had median latency 103.7 ms and mean latency 104.4 ms.
- At **640 px**, it returned 10 boxes for the same 8 labeled objects. All 8 ground-truth objects matched at IoU ≥ 0.50; there were 2 additional unmatched predictions, and matched-box mean IoU was 0.680. After warm-up, median CPU latency was 59.5 ms and mean latency was 57.6 ms.

These timings were measured on the sandbox CPU, on one repeated image, without FastAPI/network/camera overhead. They are not an FPS guarantee for the competition laptop. The result does not establish generalization or replace the notebook’s full test set. Test the target laptop with the actual webcam before the demonstration.

## Install and configure locally

Copy `clean_kadal_bottle_v2.pt` into this directory. It is ignored by Git and should be distributed separately or placed in secure model storage. Alternatively, set `CLEAN_KADAL_MODEL_PATH` to its absolute path.

For the Windows project folder `D:\CleanKadal`, the expected default is:

```text
D:\CleanKadal\models\clean_kadal_bottle_v2.pt
```

The model loader prioritizes `CLEAN_KADAL_MODEL_PATH`, then `models/clean_kadal_bottle_v2.pt`, then legacy `custom_best.pt` / ONNX candidates. For v2, inference defaults to image size 1024 to match training. Override with `CLEAN_KADAL_IMAGE_SIZE` only after validating accuracy and latency on the target hardware. Confidence defaults to 0.25 (`CLEAN_KADAL_CONFIDENCE_THRESHOLD`); the live UI can override it per frame.

Check that `/api/model/status` reports `is_custom_trained: true`, model name `Clean Kadal Bottle Detector v2`, and supported class `bottle` before enabling target guidance.

## Candidate fine-tuning

`ai_training/train.py` uses this checkpoint as its starting point and writes a separate `models/clean_kadal_bottle_candidate.pt`; it does not overwrite the baseline. Validate candidates on an untouched Clean Kadal-local test split before pointing `CLEAN_KADAL_MODEL_PATH` at a candidate. Dataset options, compatibility notes, and licenses are in [`docs/DATASET_EVALUATION.md`](../docs/DATASET_EVALUATION.md).

## Baseline fallback

If no custom checkpoint can be loaded, the backend falls back to `yolov8n.pt` (COCO-pretrained). This is a generic baseline, not a Clean Kadal or water-surface-trained model. The runtime status explicitly reports which model is active.
