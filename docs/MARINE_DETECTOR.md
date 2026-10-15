# Clean Kadal marine-litter detector

## What the deployed custom model detects

The custom model is fine-tuned for floating marine litter on water surfaces. The public training source supplies **one object class, `garbage`**. It does not label bottles, bags, wrappers, caps, or material composition separately. The current development run also includes one supplemental, manually annotated project demo frame with three visible litter boxes. The detector can identify floating-garbage candidates and draw boxes, but it cannot truthfully report a waste subtype. Add more locally captured, manually reviewed, class-specific annotations before promising subtype classification.

The model is a transfer-learning baseline, not a claim of field certification. Detection performance varies with camera angle, water reflections, distance, lighting, target size, and differences between the source imagery and a deployed webcam. Review the held-out metrics and validate on the actual camera before operational use.

## Dataset source and attribution

- Lazzerini, G., Ferreira, F., & Ridolfi, A. (2025), *Floating Marine Litter Dataset*, SEANOE, [dataset record](https://www.seanoe.org/data/00950/106148/), [DOI](https://doi.org/10.17882/106148).
- Dataset record reports approximately 5,500 floating-litter images and 14,000 bounding boxes. Its V2 archive includes a pre-split YOLO export; the archive's `full_dataset` split contains 5,299 images and 16,457 boxes in one `garbage` category.
- The record declares [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Preserve the citation and license when redistributing derived materials. The raw dataset is not committed to this repository.

## Prepare and train

1. Download the V2 ZIP (`data/120969.zip`) from the SEANOE record.
2. Import its official train/validation/test splits. For a small reproducible CPU run, use the seeded per-split limits shown here; omit the limits to import the full dataset:

   ```bash
   python ai_training/import_fml_dataset.py --archive /path/to/120969.zip --limit-train 500 --limit-val 100 --limit-test 100 --seed 42
   python ai_training/add_demo_sample.py
   python ai_training/check_dataset.py --data ai_training/dataset_fml.yaml
   python ai_training/train.py --data ai_training/dataset_fml.yaml --weights yolov8n.pt --epochs 30 --batch 8 --imgsz 640 --device 0
   python ai_training/validate.py --weights models/custom_best.pt --data ai_training/dataset_fml.yaml --split test
   ```

   Use `--device cpu` on a CPU-only machine and lower `--batch` if memory is limited. The supplemental image is already part of the public frontend assets; its one-class annotation is tracked at `ai_training/annotations/website_sample_floating_waste.txt`. The importer records the seeded selected filenames and the supplemental example in local metadata. Training creates `models/custom_best.pt`; the backend prefers this checkpoint over its generic COCO baseline.

The importer keeps the source's official split boundaries and checks every normalized YOLO box. `datasets/fml_v2/` is local training data and is ignored by Git.

## Deploy

The backend loads `models/custom_best.pt` automatically on startup (or after `/api/model/reload`). The GitHub-to-Render workflow can deploy that checkpoint when the model file is present in the repository. The Vercel frontend calls the configured Render backend; the website URL remains <https://clean-kadal.vercel.app>.

## Training and software license note

The dataset's declared license is CC BY 4.0. Ultralytics states that its YOLO code, models, training pipelines, and fine-tuned models are AGPL-3.0 by default; its [official licensing page](https://www.ultralytics.com/license) says a proprietary closed-source deployment requires an Enterprise License. Review the current upstream terms for this project's actual distribution and deployment before commercial use. This is a licensing notice, not legal advice.
