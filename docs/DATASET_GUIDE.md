# Clean Kadal — Dataset Collection and Annotation Guide

## Current model versus future labels

The current custom model is trained on floating marine litter with a single class, `garbage`. It does not distinguish a bottle from a bag, wrapper, cap, or organic material. The six-class taxonomy below is only a proposed schema for a future model trained on newly annotated images. The public FML dataset's generic labels must not be relabeled as these specific categories.

For the current model's source dataset, importer, license, and reproducible commands, see [`MARINE_DETECTOR.md`](MARINE_DETECTOR.md) and [`../ai_training/README.md`](../ai_training/README.md).

## Suggested future annotation folders

For locally captured, subtype-labeled footage, organize images and YOLO labels into disjoint splits:

```text
datasets/custom/
├── images/{train,val,test}/
└── labels/{train,val,test}/
```

Use whole recording sessions or camera setups as split groups. Never place adjacent frames from the same recording in both training and test sets. Keep raw captures separately and do not commit them to Git.

## Suggested future taxonomy

Use this mapping only if annotators can reliably distinguish each category and the dataset YAML is configured with the matching names and IDs:

- `0`: `plastic_bottle`
- `1`: `plastic_cup`
- `2`: `plastic_wrapper`
- `3`: `plastic_bag`
- `4`: `bottle_cap`
- `5`: `leaf`

A class's presence in this list does not mean the current model recognizes it. Consider whether `leaf` is a useful debris class for the intended application, and include a separate `other_floating_debris` class only when there are enough reviewed examples.

## YOLO annotation format

Each image has a matching `.txt` file with the same basename. Each non-empty line is:

```text
<class_id> <x_center> <y_center> <width> <height>
```

Coordinates are normalized to `[0.0, 1.0]`; width and height must be greater than zero. Empty label files represent verified images with no annotated target.

## Prevent data leakage and verify labels

Split full sessions, dates, or camera configurations rather than randomly splitting adjacent frames. Inspect box placement and category consistency before training. Run the checker against the YAML for the specific dataset:

```bash
python ai_training/check_dataset.py --data ai_training/dataset_fml.yaml
# Or, for a separately prepared six-class dataset:
python ai_training/check_dataset.py --data ai_training/dataset.yaml
```

The checker decodes each image, verifies a matching label file, validates class IDs against that YAML, and rejects malformed or out-of-range boxes.
