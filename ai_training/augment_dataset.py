"""
Clean Kadal -- Dataset Augmentation Script
Applies domain-specific augmentations suitable for water-surface environments:
- Sun glare and water specular reflections
- Water ripple blur and motion blur
- Ambient lighting / exposure variations
- Small boat-tilt rotations
"""
import random
from pathlib import Path
import cv2
import numpy as np

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def add_specular_glare(image: np.ndarray) -> np.ndarray:
    """Simulates water-surface specular sun reflection patches."""
    h, w = image.shape[:2]
    glare = image.copy()
    num_spots = random.randint(1, 3)
    for _ in range(num_spots):
        center_x = random.randint(int(w * 0.2), int(w * 0.8))
        center_y = random.randint(int(h * 0.2), int(h * 0.8))
        radius = random.randint(15, 45)
        color = (240, 245, 255)
        overlay = glare.copy()
        cv2.circle(overlay, (center_x, center_y), radius, color, -1)
        cv2.GaussianBlur(overlay, (25, 25), 0, overlay)
        alpha = random.uniform(0.2, 0.45)
        glare = cv2.addWeighted(overlay, alpha, glare, 1.0 - alpha, 0)
    return glare


def adjust_exposure(image: np.ndarray) -> np.ndarray:
    """Simulates varying ambient light from bright overhead sun to shaded tub conditions."""
    gamma = random.uniform(0.65, 1.45)
    inv_gamma = 1.0 / gamma
    table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
    return cv2.LUT(image, table)


def apply_water_motion_blur(image: np.ndarray) -> np.ndarray:
    """Simulates camera shake or wave ripple blur."""
    size = random.choice([3, 5])
    kernel = np.zeros((size, size))
    kernel[int((size - 1) / 2), :] = np.ones(size)
    kernel = kernel / size
    return cv2.filter2D(image, -1, kernel)


def augment_split(img_dir: Path, lbl_dir: Path, num_augmented_copies: int = 1):
    """Generates augmented images and keeps identical normalized bounding boxes for lighting/glare transforms."""
    if not img_dir.exists():
        print(f"[-] Directory not found: {img_dir}")
        return

    images = [f for f in img_dir.iterdir() if f.suffix.lower() in IMAGE_EXTENSIONS and "_aug" not in f.stem]
    print(f"[*] Processing {len(images)} base images in {img_dir.name}...")

    augmented_count = 0
    for img_path in images:
        img = cv2.imread(str(img_path))
        if img is None:
            continue

        lbl_path = lbl_dir / f"{img_path.stem}.txt"
        lbl_content = ""
        if lbl_path.exists():
            with open(lbl_path, "r", encoding="utf-8") as f:
                lbl_content = f.read()

        for copy_idx in range(1, num_augmented_copies + 1):
            aug_img = img.copy()

            # Randomly apply domain transforms
            if random.random() > 0.4:
                aug_img = adjust_exposure(aug_img)
            if random.random() > 0.4:
                aug_img = add_specular_glare(aug_img)
            if random.random() > 0.5:
                aug_img = apply_water_motion_blur(aug_img)

            out_stem = f"{img_path.stem}_aug{copy_idx}"
            out_img_path = img_dir / f"{out_stem}{img_path.suffix}"
            cv2.imwrite(str(out_img_path), aug_img)

            if lbl_content:
                out_lbl_path = lbl_dir / f"{out_stem}.txt"
                with open(out_lbl_path, "w", encoding="utf-8") as f:
                    f.write(lbl_content)

            augmented_count += 1

    print(f"[OK] Created {augmented_count} augmented samples for {img_dir.name}.")


if __name__ == "__main__":
    script_dir = Path(__file__).resolve().parent
    datasets = script_dir.parent / "datasets"
    augment_split(datasets / "images" / "train", datasets / "labels" / "train", num_augmented_copies=2)


