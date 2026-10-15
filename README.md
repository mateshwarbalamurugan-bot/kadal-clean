# Clean Kadal — floating-litter camera prototype

Clean Kadal is a webcam-based research prototype for observing floating litter. It combines a React/Vite dashboard, a local FastAPI inference service, a YOLO bottle detector, image-space object tracking and wave-flow estimates, and an optional Arduino Nano control panel.

The current custom checkpoint detects **bottles only**. Detection movement, wave flow, and accumulation zones are camera-frame estimates. They are not compass bearings, geolocation, calibrated physical current, collision avoidance, or certified autonomous navigation.

## Run the local camera demo on Windows

For the project in `D:\CleanKadal`, install backend and frontend dependencies once:

```powershell
cd D:\CleanKadal\backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

cd D:\CleanKadal\frontend
npm ci
```

Copy the separately provisioned checkpoint to:

```text
D:\CleanKadal\models\clean_kadal_bottle_v2.pt
```

Start the two local services and open the dashboard:

```powershell
cd D:\CleanKadal
.\scripts\start-local-demo.ps1
```

Keep both opened PowerShell windows running. Browse to `http://localhost:3000`. The browser page can request access to a webcam and, in a supported browser, a Nano attached to that same computer. The local frontend sends API calls to the laptop backend through Vite’s development proxy, keeping inference local. Vercel hosts the page but does not itself have access to your laptop’s hardware; a Vercel page still needs a reachable API endpoint for analysis.

Check the backend at `http://127.0.0.1:8000/health` and `http://127.0.0.1:8000/api/model/status`. The model status should identify `Clean Kadal Bottle Detector v2`, set `is_custom_trained` to `true`, and list `bottle` as its class. If the checkpoint is missing, the backend may report a generic COCO fallback instead.

## Tests and production build

From the project root:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend\tests -q
cd frontend
npm run build
```

Before using the Nano, follow [`docs/ARDUINO_SETUP.md`](docs/ARDUINO_SETUP.md), including the hardware power checks and bench tests. The dashboard’s browser motor guidance is opt-in and off by default.

## Model and data

- [`models/README.md`](models/README.md): checkpoint provenance, SHA-256, notebook metrics, and one-image inference smoke test.
- [`ai_training/README.md`](ai_training/README.md): local image annotation, session-separated splits, data audit, fine-tuning, validation, and export commands.
- [`docs/DATASET_EVALUATION.md`](docs/DATASET_EVALUATION.md): source-checked review of the notebook dataset and six public aquatic-litter dataset candidates, including label compatibility, access, and licenses.

The `.pt` model weights and most local training images are intentionally not committed to Git. Keep the original baseline unchanged, train candidates separately, and accept a candidate only after comparing it on an untouched local test set.

## Deployment

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): local-edge architecture, D-drive Windows setup, Vercel configuration, and deployment caveats.
- [`docs/ARDUINO_SETUP.md`](docs/ARDUINO_SETUP.md): classic Nano + TB6612FNG wiring, serial protocol, interlocks, and safe test sequence.
- [`docs/hardware-source-notes.md`](docs/hardware-source-notes.md): public sources checked for the board and motor-driver guidance.

The Vercel frontend and the webcam/backend are separate: Vercel serves the public site, while local operation on the boat should keep the camera frames and inference on the laptop. If using a hosted backend instead, configure an explicit HTTPS API URL and provision the model file securely; do not point production browser requests at `localhost`.
