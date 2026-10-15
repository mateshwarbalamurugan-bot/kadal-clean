# Clean Kadal — Model Training

## Current production target

The current custom model is a single-class floating-marine-litter detector (`garbage`) trained from a public water-surface dataset. It does not distinguish bottles, bags, wrappers, or material type. The historic six-class YAML is a template only; class-specific predictions require properly labelled examples for each class.

## Reproduce training

See [`ai_training/README.md`](../ai_training/README.md) for the current dataset import, integrity checks, fine-tuning, held-out validation, and deployment steps. The full procedure and dataset attribution are in [`MARINE_DETECTOR.md`](MARINE_DETECTOR.md).

The key commands are:

```bash
python ai_training/import_fml_dataset.py --archive /path/to/120969.zip
python ai_training/check_dataset.py --data ai_training/dataset_fml.yaml
python ai_training/train.py --data ai_training/dataset_fml.yaml --epochs 30 --batch 8 --imgsz 640 --device 0
python ai_training/validate.py --weights models/custom_best.pt --data ai_training/dataset_fml.yaml --split test
```

The importer preserves the dataset publisher's train/validation/test boundaries. A custom checkpoint is placed at `models/custom_best.pt`, which the backend prefers to its generic pretrained baseline at startup. Avoid evaluating on training frames; validate on footage from the intended camera before operational use.
