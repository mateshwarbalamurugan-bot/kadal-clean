# Clean Kadal — AI-Based Floating Waste Detection and Water-Motion Analysis

A complete, working scientific research prototype and physical model platform designed for boat-mounted camera computer vision research in aquatic environments.

---

## 1. Physical Setup & Research Objectives

This prototype is built for a student physical experiment setup:
- A stationary boat model floating in a rectangular water tub.
- A USB camera mounted to the boat looking forward and downward toward the water surface.
- Plastic waste (bottles, cups, wrappers, bags, bottle caps) and comparison organic debris (fallen leaves) floating in the water.
- Manual hand-generated waves from different sides of the tub.
- Real-time video analysis:
  - Floating waste detection and tracking.
  - Camera-motion compensation for boat bobbing and tilt.
  - Optical wave-pattern direction estimation.
  - Short-term trajectory prediction (baseline constant-velocity vs wave-informed model).
  - 3x3 accumulation zone and dwell-time mapping.

---

## 2. Directory Structure

```
clean-kadal/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI application & REST endpoints
│   │   ├── schemas.py                 # Pydantic data schemas & telemetry types
│   │   ├── model_loader.py            # Custom vs baseline model lifecycle
│   │   ├── detector.py                # Object detection & litter candidate tagging
│   │   ├── tracker.py                 # Multi-object tracking & history maintenance
│   │   ├── camera_compensation.py     # Stationary reference optical flow & RANSAC
│   │   ├── wave_analysis.py           # Water-surface Farneback optical flow
│   │   ├── trajectory.py              # Constant-velocity & wave-informed prediction
│   │   └── accumulation.py            # 3x3 accumulation grid & dwell time analysis
│   ├── tests/                         # Pytest comprehensive test suite (25 tests)
│   ├── requirements.txt               # Pinned Python dependencies
│   ├── Dockerfile                     # Container deployment specification
│   └── render.yaml                    # Render hosting configuration
├── frontend/
│   ├── src/
│   │   ├── components/                # Modular React research UI cards
│   │   ├── services/api.js            # Backend API client
│   │   ├── utils/exportUtils.js       # CSV & JSON telemetry export generators
│   │   ├── App.jsx                    # Root application component
│   │   └── App.css                    # Scientific dashboard styling
│   ├── package.json                   # React + Vite dependencies
│   ├── vite.config.js                 # Vite bundler configuration
│   └── vercel.json                    # Vercel SPA routing rewrite rules
├── ai_training/
│   ├── dataset.yaml                   # YOLO 6-class dataset specification
│   ├── check_dataset.py               # Dataset integrity & class distribution checker
│   ├── split_dataset.py               # Session-aware splitter preventing data leakage
│   ├── augment_dataset.py             # Water reflection & ripple augmentation
│   ├── train.py                       # Transfer learning training script (YOLOv8n)
│   ├── validate.py                    # Per-class metric evaluation (mAP50, mAP50-95)
│   ├── export_model.py                # ONNX exporter with test inference verification
│   └── README.md                      # Detailed training documentation
├── datasets/                          # Directory structure for raw & annotated data
├── models/                            # Storage for custom and baseline weights
├── docs/                              # Scientific documentation & guides
├── scripts/                           # Windows helper batch scripts & packaging tool
├── pytest.ini                         # Pytest configuration
└── README.md                          # Master project documentation
```

---

## 3. Windows Setup & Installation (Python 3.10)

### Step 1: Open Project in PowerShell
```powershell
cd "d:\clean kadal"
```

### Step 2: Create Python 3.10 Virtual Environment
```powershell
py -3.10 -m venv venv
```

### Step 3: Install Backend Dependencies
```powershell
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

### Step 4: Install Frontend Dependencies
```powershell
cd frontend
npm install
cd ..
```

*(Alternatively, run `scripts\setup_windows.bat` to perform all steps automatically).*

---

## 4. Launching the Application

### Launch Backend (Terminal 1)
```powershell
.\venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
Or double-click `scripts\start_backend.bat`.
Verify health: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

### Launch Frontend (Terminal 2)
```powershell
cd frontend
npm run dev -- --port 3000
```
Or double-click `scripts\start_frontend.bat`.
Open in browser: [http://localhost:3000](http://localhost:3000)

---

## 5. Running Tests

Run the automated backend test suite:
```powershell
.\venv\Scripts\python.exe -m pytest -v
```
Or run `scripts\run_tests.bat`.

Build the frontend for production:
```powershell
cd frontend
npm run build
cd ..
```

---

## 6. Training the Custom Marine-Litter Model

The current custom detector recognizes one generic floating-litter class, `garbage`. It does not identify bottles, cups, wrappers, bags, caps, or material types. The training run also uses one supplemental, manually annotated project demo frame with three garbage boxes. Those six-class labels in `ai_training/dataset.yaml` are a template for a future, separately annotated dataset—not capabilities of the deployed model.

To reproduce the current training pipeline, download the Floating Marine Litter V2 archive from the [official dataset record](https://www.seanoe.org/data/00950/106148/), import its published splits, validate annotations, then fine-tune and evaluate:

```bash
python ai_training/import_fml_dataset.py --archive /path/to/120969.zip --limit-train 500 --limit-val 100 --limit-test 100 --seed 42
python ai_training/add_demo_sample.py
python ai_training/check_dataset.py --data ai_training/dataset_fml.yaml
python ai_training/train.py --data ai_training/dataset_fml.yaml --epochs 30 --batch 8 --imgsz 640 --device 0
python ai_training/validate.py --weights models/custom_best.pt --data ai_training/dataset_fml.yaml --split test
```

Use `--device cpu` on a CPU-only machine and reduce `--batch` if memory is limited. The backend automatically prefers `models/custom_best.pt` on startup. See [`docs/MARINE_DETECTOR.md`](docs/MARINE_DETECTOR.md) for dataset attribution, class limitations, and deployment notes. For future material-specific classes, use [`docs/DATASET_GUIDE.md`](docs/DATASET_GUIDE.md) and annotate each subtype from camera footage rather than relabeling generic `garbage` boxes.

---

## 7. Packaging Source Deliverables

Generate the 4 downloadable ZIP archives:
```powershell
.\venv\Scripts\python.exe scripts/package_deliverables.py
```
This produces:
- `clean_kadal_complete_source.zip`
- `clean_kadal_frontend.zip`
- `clean_kadal_backend.zip`
- `clean_kadal_ai_training.zip`
