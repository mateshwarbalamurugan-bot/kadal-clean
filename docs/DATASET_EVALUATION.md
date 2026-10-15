# Aquatic litter datasets: integration assessment

## Current Clean Kadal baseline

The supplied `CleanKadal.ipynb` and retrieved `clean_kadal_bottle_v2.pt` checkpoint identify a YOLOv8n-based, **single-class `bottle` detector**. The archive named by the notebook is Flow-Img v3 in YOLO format and is marked CC BY 4.0. This is the dataset behind the existing model, not evidence that the model recognizes every kind of litter. The checkpoint’s saved 799-image test metrics are precision 0.8659, recall 0.8141, mAP@50 0.8683, and mAP@50–95 0.4201; they are the notebook’s results, not a newly reproduced full test run. See [`models/README.md`](../models/README.md) for the checkpoint hash and a separate one-image inference smoke test. [1]

## Candidate datasets

### Flow-Img v3 — existing model data

The archive retrieved from the user’s connected Drive contains **1,999 images** with matching YOLO label files: 960 train, 240 validation, and 799 test. Its embedded `data.yaml` lists one class, `bottle`, and CC BY 4.0. This is the most directly compatible source for reproducing the current model, but it does not establish performance on other debris categories or Clean Kadal’s local camera and water conditions. Preserve the 799-image test split; do not merge it into training. [1] [2]

### Floating Marine Litter (FML) Dataset

FML is a strong additional water-surface candidate because it uses first-person imagery from a camera mounted on an unmanned surface vehicle. SEANOE reports about 5,500 optical images and 14,000 bounding boxes. The companion project repository describes roughly 5,300 images, a generic `garbage` label, and different annotation/count details, so the exact archive version and label mapping must be audited before use. The data is CC BY 4.0 and the record offers public downloads, but archives are large (about 2 GB and 4 GB). It is useful for supplementary pretraining or benchmarking, not as bottle-specific ground truth unless its boxes are relabeled. [3] [4] [5]

### Floating Waste and Aquatic Vegetation Image Dataset from Turbid Rivers (Mendeley, Version 2)

This public CC BY 4.0 dataset contains 1,577 images and 5,792 boxes from turbid rivers in Banjarmasin, Indonesia. It has two broad classes—floating waste and river vegetation—in YOLO format, with 1,104/315/158 train/validation/test images. It is the most practically accessible river-water supplement among the reviewed sources. Its classes are not compatible with the current `bottle` output as-is; verify the included class-ID mapping, select or relabel only semantically compatible examples, and retain local negative water images for false-positive testing. Its viewpoint and daytime, single-region collection limit transfer claims. The public ZIP is listed at about 1.64 GB. [6]

### IWHR_AI_Lable_Floater_V1

The Figshare record and associated paper describe 3,000 inland-water images with 23,692 floating-object boxes. The release uses Pascal VOC-style XML annotations and one broad `floater` class; examples include bottles, bags, cans, vegetation, and accumulated debris, but those are not separate labels. The public record reports an Apache 2.0 license and a package of about 2.32 GB. It is relevant for water-surface localization pretraining, but cannot support material-specific litter labels without relabeling. Its collection is concentrated in one Beijing canal/ditch area, and the paper notes small-object and reflection challenges. [7] [8] [9]

### FloW: Floating Waste Detection in Inland Waters

FloW-Img contains 2,000 annotated images and 5,271 floating-waste instances, plus 200 short unannotated video sequences. Its subject is close to this project, especially small floating objects and reflection handling. However, the provider requires an application for access; no dataset license or redistribution terms were stated in the reviewed official materials. The annotation export format and exact class token also need checking after access. Treat it as a promising future source only after receiving usable files and written terms; do not make it a competition-day dependency. [10] [11] [12]

### NASA Marine Debris Dataset for Object Detection in PlanetScope Imagery

NASA’s release reports 1,370 manually labeled debris boxes on 256×256 PlanetScope satellite chips at approximately 3 m resolution. The released model uses a generic `marine_debris` class; the catalog notes that floating objects may include natural materials such as algae and sargassum as well as artificial debris. The source is publicly accessible, but its CC BY-NC 4.0 license prohibits commercial reuse without separate permission. Its coarse satellite viewpoint and focus on aggregated flotsam make it a poor direct match for a boat-mounted webcam and individual bottle detection. Keep it out of the main training path unless the license and task purpose are confirmed. [13] [14] [15]

### TACO: Trash Annotations in Context

The current official repository snapshot contains 1,500 images, 4,784 annotations, and 60 litter categories with COCO-style instance annotations. Its scenes are general outdoor/in-context litter rather than a balanced water-surface dataset, so it may help with general appearance transfer but not establish floating-waste performance. Annotation licensing is CC BY 4.0, while image files may have different source-specific licenses; check and retain each image’s license before download, redistribution, or training use. It is not a drop-in dataset for the current one-class bottle model. [16] [17] [18]

## Practical recommendation

Keep the retrieved bottle checkpoint as the baseline. Do **not** combine broad `floater`, `garbage`, `floating waste`, `vegetation`, and `marine_debris` labels and then describe the result as bottle detection. First build a Clean Kadal dataset from the actual camera and target environment, including target-free water and hard negatives such as glare, reflections, vegetation, foam, shoreline objects, and partially submerged litter. Split by capture session/video and, where possible, by site or day to avoid near-duplicate leakage.

For a small, testable fine-tuning experiment, start with the existing Flow-Img v3 data plus compatible, manually checked local bottle labels. Keep an untouched local test split. A broader “floating litter” model is a separate model-definition decision: map each source class deliberately, document exclusions, and evaluate each source and local holdout separately. A candidate checkpoint is saved as `clean_kadal_bottle_candidate.pt`; the training script does not overwrite the baseline. Accept a candidate only if local held-out precision/recall and false-positive behavior improve. No new fine-tuning was run in this session because no suitable training GPU/runtime was connected.

## Sources

[1]: https://universe.roboflow.com/small-objects-5irpk/flow-img/dataset/3 "Flow-Img v3 dataset record"
[2]: https://creativecommons.org/licenses/by/4.0/ "Creative Commons Attribution 4.0 International"
[3]: https://www.seanoe.org/data/00950/106148/ "SEANOE Floating Marine Litter dataset record"
[4]: https://github.com/glazzerini/fml "FML companion project repository"
[5]: https://doi.org/10.17882/106148 "Floating Marine Litter dataset DOI"
[6]: https://data.mendeley.com/datasets/j26w4m645z/2 "Floating Waste and Aquatic Vegetation Image Dataset from Turbid Rivers, Version 2"
[7]: https://www.nature.com/articles/s41597-025-04594-9 "IWHR floater dataset paper"
[8]: https://api.figshare.com/v2/articles/27376851 "IWHR dataset public record metadata"
[9]: https://www.apache.org/licenses/LICENSE-2.0.html "Apache License 2.0"
[10]: https://openaccess.thecvf.com/content/ICCV2021/papers/Cheng_FloW_A_Dataset_and_Benchmark_for_Floating_Waste_Detection_in_ICCV_2021_paper.pdf "FloW dataset paper"
[11]: https://github.com/ORCAUBOAT/FloW-Dataset "FloW official repository"
[12]: https://www.orcauboat.com/datasets/FloW/Introduction "FloW official access information"
[13]: https://github.com/NASA-IMPACT/marine_debris_ML "NASA Marine Debris model and dataset repository"
[14]: https://cmr.earthdata.nasa.gov/search/concepts/C2781412735-MLHUB.html "NASA Earthdata Common Metadata Repository record"
[15]: https://creativecommons.org/licenses/by-nc/4.0/ "Creative Commons Attribution-NonCommercial 4.0 International"
[16]: http://tacodataset.org/ "TACO dataset website"
[17]: https://github.com/pedropro/TACO "TACO official repository"
[18]: https://arxiv.org/html/2003.06975v2 "TACO: Trash Annotations in Context paper"
