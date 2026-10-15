# Clean Kadal — marine-litter model training

The current custom detector is fine-tuned to recognize **one class: `garbage`**, using floating-litter images of water surfaces plus one supplemental manually labeled project demo frame. The labels do **not** distinguish bottles, cups, wrappers, bags, caps, or plastic from organic debris. The six-class `dataset.yaml` remains a template for a future manually annotated dataset; it is not the model currently being deployed.

## Current model data source

The reproducible public source is Lazzerini, Ferreira & Ridolfi, *Floating Marine Litter Dataset*, SEANOE (2025), [dataset record](https://www.seanoe.org/data/00950/106148/), [DOI 10.17882/106148](https://doi.org/10.17882/106148). The record declares **CC BY 4.0**. The v2 archive contains official train/validation/test YOLO splits, with a single `garbage` category. Keep the required attribution with derived weights; do not commit the multi-gigabyte archive or extracted dataset.

## Prepare the dataset

1. Download the V2 archive (`data/120969.zip`) from the dataset record.
2. Import and validate the official splits:

   ```bash
   python ai_training/import_fml_dataset.py --archive /path/to/120969.zip
   python ai_training/add_demo_sample.py
   python ai_training/check_dataset.py --data ai_training/dataset_fml.yaml
   ```

The importer writes images and labels to `datasets/fml_v2/`, verifies normalized YOLO boxes, records attribution metadata, and preserves the publisher's split boundaries. To reproduce the smaller, deterministic CPU development subset, pass `--limit-train 500 --limit-val 100 --limit-test 100 --seed 42 --overwrite` to the import command. The selected image names and sample settings are recorded in `dataset_metadata.json`.

## Train and validate

Install the training dependencies (the backend itself does not need to change):

```bash
python -m pip install ultralytics torch torchvision pyyaml
```

Fine-tune the nano model and evaluate on the untouched test split:

```bash
python ai_training/train.py \
  --data ai_training/dataset_fml.yaml \
  --weights yolov8n.pt \
  --epochs 30 --batch 8 --imgsz 640 --device 0

python ai_training/validate.py \
  --weights models/custom_best.pt \
  --data ai_training/dataset_fml.yaml \
  --split test
```

Use `--device cpu` on CPU-only machines and reduce `--batch` if memory is limited. `train.py` resolves dataset paths from the YAML, supports an early-stopping patience, and copies the best checkpoint to `models/custom_best.pt`. `check_dataset.py` validates every declared split and prints class counts.

## Add material-specific classes

To teach `plastic_bottle`, `plastic_bag`, `wrapper`, etc., collect representative camera footage, annotate each object with the intended taxonomy, and create a matching YOLO dataset YAML. Split entire recording sessions—not adjacent frames—across train/validation/test. Do not relabel the current generic `garbage` boxes as specific plastic types; the source does not provide those labels.

## Deployment

The backend prefers `models/custom_best.pt` to the general COCO baseline and exposes the active class list at `/api/model/status`. It reports inference failures as warnings rather than silently treating model errors as successful no-detection frames. After updating weights on an already running backend, call `POST /api/model/reload`; normal GitHub-to-Render deployment loads the checkpoint on startup.

For dataset citation, model limitations, and deployment notes, see [`docs/MARINE_DETECTOR.md`](../docs/MARINE_DETECTOR.md).
