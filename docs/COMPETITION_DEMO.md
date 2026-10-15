# Competition-day Clean Kadal demo checklist

## Before leaving for the venue

- Confirm the project is in `D:\CleanKadal` and the custom checkpoint is at `D:\CleanKadal\models\clean_kadal_bottle_v2.pt`. Compare its SHA-256 with [`models/README.md`](../models/README.md).
- Run the local startup instructions in [`DEPLOYMENT.md`](DEPLOYMENT.md) once, using the exact webcam and laptop planned for the demo.
- Keep the laptop plugged in. Disable sleep while plugged in, and bring the webcam cable, Nano USB cable, battery disconnect switch, and any required drivers.
- Test the camera feed and AI analysis with both a still sample and several minutes of live video. Confirm which camera entry is the external USB webcam.
- If the Nano is part of the demo, do a restrained bench test with propellers removed, a physical motor-battery disconnect, and the safety steps in [`ARDUINO_SETUP.md`](ARDUINO_SETUP.md). Do not rely on software emergency stop as the only power cut-off.

## Start the demo

1. In PowerShell, launch both local services:

   ```powershell
   cd D:\CleanKadal
   .\scripts\start-local-demo.ps1
   ```

2. Leave both service windows open and browse to `http://localhost:3000`.
3. Confirm `http://127.0.0.1:8000/health` returns a healthy status.
4. Confirm `http://127.0.0.1:8000/api/model/status` identifies `Clean Kadal Bottle Detector v2`, reports `is_custom_trained: true`, and lists only `bottle`.
5. In the dashboard, select the external webcam, allow camera permission, and verify that the preview updates when the view changes.
6. Run a sample-image check, then start live camera analysis. Confirm new detections and telemetry update; do not interpret one still image as wave motion, tracking history, or an accumulation measurement.
7. Only if the Nano is required, connect it after the camera and model checks pass. Wait for the serial-ready handshake. Start with the motor battery disconnected; follow the separate Arduino safe-test sequence.
8. If you record an experiment, export CSV and JSON from the dashboard before refreshing or closing the tab; session records are held in browser memory and are not persisted to a database.

## Troubleshooting

- **Camera preview works but no AI analysis appears:** confirm the local FastAPI window is still running and `/health` responds. The public Vercel page needs a reachable API; the Vite localhost page is preconfigured to proxy to the laptop backend.
- **Wrong camera opens:** stop the stream, choose the external webcam in the camera selector, and restart. If it is not listed, reconnect the USB camera, allow browser permissions, then refresh the local dashboard.
- **AI engine reports offline or model is not custom:** inspect `/api/model/status`. Verify that `clean_kadal_bottle_v2.pt` exists in the expected path, has the manifest SHA-256, and that the backend virtual environment has Ultralytics installed. Restart the backend after changing its model path.
- **No detections:** the custom checkpoint recognizes bottles only. Check the confidence threshold, camera focus/exposure, target size, water glare, and distance. First verify the provided sample image, then adjust one setting at a time. A failure to detect another litter type is expected with this checkpoint.
- **Slow or intermittent frames:** close GPU/CPU-heavy apps, reduce the camera’s resolution, and measure the actual laptop. If you choose to set `CLEAN_KADAL_IMAGE_SIZE=640`, re-check detections on the same test samples; a smaller input can affect small-object results.
- **Arduino controls are locked:** use Chrome or Edge at `http://localhost:3000`, grant Web Serial permission, and wait for the firmware status handshake. The panel also requires a healthy camera and custom model before supervised guidance can be enabled.
- **Motor behavior is unexpected:** release the control, press the physical battery switch, and stop the demo. Do not continue troubleshooting with the propellers attached or the boat unsecured.

## Scope and evidence

The model checkpoint’s notebook metrics are documented in [`models/README.md`](../models/README.md). They are not a guarantee of performance on the venue’s water or camera. The separately recorded single-image smoke test is not a benchmark. The current analytics are camera-frame estimates and do not provide GPS position, physical distance, compass bearing, calibrated water velocity, collision avoidance, or certified autonomous boat control.

The firmware was compiled in the development environment for an Arduino Nano/ATmega328P target. This does **not** mean it has been uploaded to or physically tested on your exact board, driver, motors, or battery. Complete the wiring and bench checklist before applying motor power.
