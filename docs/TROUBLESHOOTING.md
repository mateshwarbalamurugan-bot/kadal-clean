# Clean Kadal — Troubleshooting & FAQ

## 1. Camera Errors

### Problem: `NotAllowedError` or "Camera permission denied"
- **Cause**: Browser blocked camera access or site permissions are denied.
- **Fix**: Click the padlock or camera icon in your browser URL bar, change Camera permission to **Allow**, and refresh the webpage.

### Problem: `NotReadableError` or "Camera already in use"
- **Cause**: Another Windows application (such as the Windows Camera app, Zoom, Teams, or another browser tab) has an exclusive hardware lock on the webcam.
- **Fix**: Close any other applications using the webcam and click **Start Camera** again.

---

## 2. Backend & Network Errors

### Problem: "Backend unavailable at http://localhost:8000"
- **Cause**: The FastAPI Python backend is not running.
- **Fix**: Open a PowerShell window and run:
  ```powershell
  scripts\start_backend.bat
  ```
  Ensure `http://localhost:8000/health` returns `{"status": "healthy"}`.

### Problem: CORS Error when deployed
- **Cause**: Frontend domain is not permitted by backend CORS policy.
- **Fix**: In `backend/app/main.py`, the backend permits `*` origins by default. Ensure your environment variable `CORS_ORIGINS` includes your Vercel deployment URL.

---

## 3. Wave Analysis Errors

### Problem: "Water surface texture is too low" or "Wave direction unavailable"
- **Cause**: Water in the tub is completely flat, featureless, or saturated by overhead light reflection (specular glare).
- **Fix**:
  1. Generate gentle ripples by hand to create surface gradient variation.
  2. Adjust room lighting to reduce bright white reflection patches directly in front of the lens.
  3. Ensure the **Water Analysis Region** box covers the active ripple zone.

### Problem: "Camera motion compensation unavailable"
- **Cause**: No stationary reference region was selected, or the selected region contains only smooth, featureless plastic with no corners/features.
- **Fix**: Click **Select Reference Region (Tub Rim)** and select a textured area of the tub rim or place a piece of patterned tape on the edge of the tub to give the tracker stable features.
