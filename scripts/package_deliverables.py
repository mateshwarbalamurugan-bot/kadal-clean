"""
Clean Kadal -- Deliverable Packaging Script
Generates clean ZIP archives of project source code excluding virtual environments,
node_modules, caches, and build artifacts.
"""
import os
import zipfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

EXCLUDE_DIRS = {
    "node_modules",
    "venv",
    ".git",
    "__pycache__",
    ".pytest_cache",
    "dist",
    ".vite",
    "runs"
}

EXCLUDE_EXTENSIONS = {
    ".pyc",
    ".pyo",
    ".log",
    ".zip"
}


def should_exclude(path: Path) -> bool:
    for part in path.parts:
        if part in EXCLUDE_DIRS:
            return True
    if path.suffix in EXCLUDE_EXTENSIONS:
        return True
    return False


def create_zip(zip_filename: str, source_paths: list):
    zip_path = ROOT_DIR / zip_filename
    if zip_path.exists():
        zip_path.unlink()

    print(f"[*] Packaging {zip_filename}...")
    file_count = 0

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for src in source_paths:
            src_path = ROOT_DIR / src
            if src_path.is_file():
                if not should_exclude(src_path):
                    arcname = src_path.relative_to(ROOT_DIR)
                    zf.write(src_path, arcname)
                    file_count += 1
            elif src_path.is_dir():
                for root, dirs, files in os.walk(src_path):
                    # Filter out excluded directories in-place
                    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                    for f in files:
                        fp = Path(root) / f
                        if not should_exclude(fp):
                            arcname = fp.relative_to(ROOT_DIR)
                            zf.write(fp, arcname)
                            file_count += 1

    size_kb = zip_path.stat().st_size / 1024
    print(f"[OK] Created {zip_filename} ({file_count} files, {size_kb:.1f} KB)")


def main():
    print("=" * 70)
    print("Packaging Clean Kadal Source Deliverables")
    print("=" * 70)

    # 1. Complete Source
    create_zip("clean_kadal_complete_source.zip", [
        "frontend",
        "backend",
        "ai_training",
        "datasets",
        "models",
        "docs",
        "scripts",
        "README.md",
        ".gitignore",
        "pytest.ini"
    ])

    # 2. Frontend Only
    create_zip("clean_kadal_frontend.zip", [
        "frontend",
        "README.md"
    ])

    # 3. Backend Only
    create_zip("clean_kadal_backend.zip", [
        "backend",
        "models",
        "pytest.ini",
        "README.md"
    ])

    # 4. AI Training Pipeline Only
    create_zip("clean_kadal_ai_training.zip", [
        "ai_training",
        "datasets",
        "models",
        "README.md"
    ])

    print("\n[OK] All 4 deliverables created successfully!")


if __name__ == "__main__":
    main()

