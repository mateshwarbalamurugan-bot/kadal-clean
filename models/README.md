# Clean Kadal — Model Storage Directory

This directory stores detector weights for the Clean Kadal application.

## Model Loading Hierarchy

When the backend starts up or when `POST /api/model/reload` is invoked:

1. **Custom-Trained Model (Highest Priority)**:
   - Looks for `models/custom_best.pt` or `models/custom_best.onnx`.
   - If present, loads custom Clean Kadal floating waste detector with classes:
     `plastic_bottle`, `plastic_cup`, `plastic_wrapper`, `plastic_bag`, `bottle_cap`, `leaf`.
   - Displays: `Model Type: Custom Clean Kadal Model`.

2. **Pretrained Baseline (Fallback)**:
   - If custom weights are not present, looks for `models/yolov8n.pt` or downloads `yolov8n.pt` from Ultralytics.
   - Loads general-purpose COCO baseline.
   - Detects `bottle` and `cup` as potential litter candidates.
   - Displays: `Model Type: Pretrained Baseline (Custom model not trained or not available)`.

3. **No Weights Available**:
   - If neither is found and internet download fails, system enters graceful standby:
     `Model Loaded: False (Waiting for weights)`.

> **Honesty Principle**: No fake or fabricated trained weights are shipped in this repository. Train your custom model using `ai_training/` on your real boat camera frames.
