# Clean Kadal deployment and competition demo

## Recommended live-demo architecture

- **Vercel:** public dashboard and primary site: [https://clean-kadal.vercel.app](https://clean-kadal.vercel.app)
- **Laptop/boat-side computer:** USB webcam, custom model inference, local FastAPI service, and Web Serial connection to the Nano
- **Arduino Nano:** local motor safety, PWM, timeout, and stop behavior
- **GitHub:** source and feature branch; the `.pt` model binary is intentionally excluded from Git

The page runs in the visitor’s browser, so a supported browser can request permission to use a webcam or Web Serial device attached to that same computer—even when the page is hosted on Vercel. The Vercel server itself cannot access those local peripherals. Camera analysis also requires a reachable backend: the deployed page needs a hosted HTTPS API, while the local Vite page below proxies requests to FastAPI on the laptop. Use the local Vite dashboard for the boat-side demo when you want inference to stay on the laptop.

## Local Windows demo (recommended for the boat)

Assume the project is in `D:\CleanKadal`. Copy the supplied `clean_kadal_bottle_v2.pt` into `D:\CleanKadal\models\clean_kadal_bottle_v2.pt` (the checkpoint is not committed to Git).

### 1. Create the backend environment

In PowerShell:

```powershell
cd D:\CleanKadal\backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The first install is large because PyTorch and Ultralytics are included. Keep the laptop plugged into power.

### 2. Install frontend dependencies

In a second PowerShell window:

```powershell
cd D:\CleanKadal\frontend
npm ci
```

The local Vite dev server uses port 3000 and proxies `/health` and `/api/*` to FastAPI at `127.0.0.1:8000`, keeping the browser's local API access same-origin.

### 3. Start both services

From the project root, run:

```powershell
.\scripts\start-local-demo.ps1
```

It opens backend and frontend terminal windows and visits the local dashboard. For manual startup, in one PowerShell window:

```powershell
cd D:\CleanKadal\backend
$env:ALLOWED_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000'
$env:CLEAN_KADAL_MODEL_PATH = 'D:\CleanKadal\models\clean_kadal_bottle_v2.pt'
$env:CLEAN_KADAL_IMAGE_SIZE = '1024'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another window:

```powershell
cd D:\CleanKadal\frontend
npm run dev -- --host 127.0.0.1
```

Open `http://localhost:3000`. Check `http://127.0.0.1:8000/health`; `/api/model/status` should report `Clean Kadal Bottle Detector v2`, `is_custom_trained: true`, and class `bottle`.

## Vercel frontend

The existing GitHub repository is associated with the Vercel app, but the Vercel connector was not enabled for this session. A feature-branch push may trigger a Vercel Preview if the existing Git connection is configured; do not treat a push as a production deployment until the Preview URL is opened and checked. Production is intentionally left unchanged until the branch is approved/merged.

For an optional hosted backend, deploy the existing Python service separately and set the actual public HTTPS URL in Vercel:

- `VITE_API_BASE_URL` = the deployed backend base URL, without `/health`
- Backend `ALLOWED_ORIGINS` = `https://clean-kadal.vercel.app` plus exact approved Preview origins
- Backend `CLEAN_KADAL_MODEL_PATH` = path to a securely provisioned checkpoint

### Render configuration

Choose **one** service type in Render.

For a **Python** web service, set Root Directory to `backend`, Build Command to `pip install -r requirements.txt`, Start Command to `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, and Health Check Path to `/health`. Render supplies `PORT`; do not replace it with a fixed port.

For a **Docker** web service, set Docker Build Context Directory to `backend` and Dockerfile Path to `backend/Dockerfile` (the path is relative to the repository root). Leave Docker Command blank so the Dockerfile’s `CMD` runs. The path field must contain a file path, not a shell command such as `/bin/sh -c ...`; that mix-up caused the earlier Dockerfile-path validation error. The repository Dockerfile now binds to Render’s `$PORT` with a `10000` fallback.

Set backend `ALLOWED_ORIGINS` to a comma-separated list of the exact Vercel production and Preview origins used by the app. Set `CLEAN_KADAL_MODEL_PATH` only if the checkpoint has been securely provisioned on the service. The `.pt` file is not in Git, and the Render service must be able to access it at startup. Render’s low-memory plans may not have enough RAM for PyTorch/Ultralytics; the local edge setup above avoids that dependency for the physical demo. Do not make a private Drive model public just to supply a service URL.

## Build and tests

From the repository root:

```powershell
cd frontend
npm ci
npm run build
cd ..
backend\.venv\Scripts\python.exe -m pytest backend\tests -q
```

For a day-of demo checklist and troubleshooting, see `docs/COMPETITION_DEMO.md`. For Arduino compile, upload, and manual hardware checks, see `docs/ARDUINO_SETUP.md`. Model provenance and smoke-test evidence are in `models/README.md`; source-checked dataset comparisons and recommendations are in `docs/DATASET_EVALUATION.md`.
