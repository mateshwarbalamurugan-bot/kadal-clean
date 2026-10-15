# Clean Kadal deployment and competition demo

## Recommended architecture

- **Vercel:** hosts the public React/Vite dashboard at [https://clean-kadal.vercel.app](https://clean-kadal.vercel.app).
- **Laptop or boat-side computer:** accesses its attached webcam, runs the custom model through the local FastAPI service, and communicates with the Nano over Web Serial.
- **Arduino Nano:** applies validated motor commands and retains local stop, PWM-limit, and communication-timeout behavior.
- **GitHub:** stores source and configuration. The `.pt` model checkpoint and training datasets are intentionally excluded.

A supported browser can request permission for a webcam or Web Serial device physically attached to the computer viewing the page. The Vercel server itself cannot access that local USB hardware. AI analysis also needs a reachable backend: use the local Vite dashboard for laptop/edge inference, or configure a separately deployed HTTPS API for hosted analysis.

## Local Windows demo (recommended for the boat)

These instructions assume the project folder is `D:\CleanKadal` and the custom checkpoint has been copied separately to `D:\CleanKadal\models\clean_kadal_bottle_v2.pt`. The `.pt` file is not part of the Git branch. Compare its SHA-256 with [`models/README.md`](../models/README.md) before using it.

### 1. Install the backend environment

In PowerShell:

```powershell
cd D:\CleanKadal\backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

PyTorch and Ultralytics make the first install large. Keep the laptop plugged into power. If the Python launcher does not have Python 3.11 installed, install it or use a compatible Python version supported by the dependency set.

### 2. Install frontend dependencies

In a second PowerShell window:

```powershell
cd D:\CleanKadal\frontend
npm ci
```

The local Vite server runs at `http://localhost:3000` and proxies `/health` and `/api/*` to FastAPI at `127.0.0.1:8000`. The blank `VITE_API_BASE_URL` in the local example is intentional; Vite’s same-origin proxy is used for local development.

### 3. Start both services

From the project root, run:

```powershell
cd D:\CleanKadal
.\scripts\start-local-demo.ps1
```

The script opens the backend and frontend in separate terminal windows and opens the local dashboard. Keep both windows running. For manual startup, use one PowerShell window for the backend:

```powershell
cd D:\CleanKadal\backend
$env:ALLOWED_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000'
$env:CLEAN_KADAL_MODEL_PATH = 'D:\CleanKadal\models\clean_kadal_bottle_v2.pt'
$env:CLEAN_KADAL_IMAGE_SIZE = '1024'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another PowerShell window:

```powershell
cd D:\CleanKadal\frontend
npm run dev -- --host 127.0.0.1
```

Open `http://localhost:3000`. Verify the backend and model:

- `http://127.0.0.1:8000/health` — backend health response.
- `http://127.0.0.1:8000/api/model/status` — should show `Clean Kadal Bottle Detector v2`, `is_custom_trained: true`, and the single supported class `bottle`.
- `http://127.0.0.1:8000/docs` — interactive FastAPI API documentation.

The model detects **bottles only**. The laptop’s CPU/GPU and camera should be tested before the event; the sandbox timing in the model report is not a guarantee for the target computer.

## Vercel frontend

The GitHub repository is connected to the `clean-kadal` Vercel project. A push to a feature branch can produce a Vercel Preview; a successful Preview does **not** change the production branch. Review the Preview before merging.

For the existing Vite project, confirm these Vercel project settings:

- **Root Directory:** `frontend`
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Environment variable:** `VITE_API_BASE_URL` = the actual public HTTPS backend base URL, without `/health` or another path suffix.
- Set the variable for **Production** and **Preview** as appropriate, then redeploy; Vite embeds it at build time.

Production builds intentionally do not fall back to `localhost`, because a visitor’s `localhost` is the visitor’s own computer. If no hosted backend is configured, the hosted UI may open but AI analysis will report that the backend URL is not configured. For on-boat local inference, use the local Vite page and its local API proxy instead.

Both Vercel and Render use HTTPS, which is required for browser camera and Web Serial APIs on non-localhost origins. The browser requests camera permission when **Start Camera** is pressed. If multiple cameras are listed, select the USB webcam; device names may appear only after permission is granted. Web Serial is supported in compatible Chrome/Edge browsers and requires a deliberate user connection.

## Optional hosted backend on Render

The model checkpoint is not in Git. A Render service will not receive the custom model unless you securely provision the file and point `CLEAN_KADAL_MODEL_PATH` to it. Do not make a private Drive file public to pass a URL to Render. Free/low-memory instances may not have enough RAM for PyTorch/Ultralytics; the local edge setup is the recommended competition path.

Choose **one** of the following Render service configurations.

### Render Python web service

- **Root Directory:** `backend`
- **Environment:** Python
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Health Check Path:** `/health`

### Render Docker web service

- **Docker Build Context Directory:** `backend/` (relative to the repository root)
- **Dockerfile Path:** `backend/Dockerfile` (relative to the repository root)
- **Docker Command:** leave blank so the Dockerfile `CMD` runs.

The Dockerfile installs the OpenCV system libraries, including `libgl1`, and listens on Render’s injected `$PORT` (with a `10000` fallback). In Render’s **Dockerfile Path** field, enter only `backend/Dockerfile`; do not paste a shell command such as `/bin/sh -c 'uvicorn …'` into that path field.

Configure backend environment variables as needed:

- `ALLOWED_ORIGINS`: comma-separated, exact Vercel production and approved Preview origins.
- `CLEAN_KADAL_MODEL_PATH`: path to a securely provisioned checkpoint file.
- `CLEAN_KADAL_IMAGE_SIZE`: optional inference image size; validate accuracy and latency after changing it.
- `CLEAN_KADAL_CONFIDENCE_THRESHOLD`: optional backend default; live UI can send a per-frame threshold.

After deployment, test `<actual-render-url>/health` and `/api/model/status`. Configure `VITE_API_BASE_URL` in Vercel using the actual Render URL only after the backend health check succeeds. Ensure the deployed model status reports the custom bottle checkpoint; otherwise the service may be using the generic COCO fallback.

## Build and tests

From the repository root in PowerShell:

```powershell
cd frontend
npm ci
npm run build
cd ..
backend\.venv\Scripts\python.exe -m pytest backend\tests -q
```

For the competition checklist and troubleshooting, see [`COMPETITION_DEMO.md`](COMPETITION_DEMO.md). For Arduino compile, upload, wiring, and manual hardware checks, see [`ARDUINO_SETUP.md`](ARDUINO_SETUP.md). Model provenance and smoke-test evidence are in [`models/README.md`](../models/README.md); source-checked dataset comparisons are in [`DATASET_EVALUATION.md`](DATASET_EVALUATION.md).
