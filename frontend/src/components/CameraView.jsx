import React, { useRef, useEffect, useState, useCallback } from 'react';

export default function CameraView({
  analysisActive,
  onStartAnalysis,
  onStopAnalysis,
  waterRegion,
  setWaterRegion,
  referenceRegion,
  setReferenceRegion,
  analysisData,
  onFrameCaptured,
  onError,
  cameraConsent,
  setCameraConsent,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);

  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [selectionMode, setSelectionMode] = useState(null); // 'water' | 'reference' | null
  const [dragStart, setDragStart] = useState(null);
  const [currentDrag, setCurrentDrag] = useState(null);

  // Enumerate video devices on mount
  useEffect(() => {
    async function getDevices() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          onError('Browser mediaDevices API not supported on this device/browser.');
          return;
        }
        const devList = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devList.filter((d) => d.kind === 'videoinput');
        setDevices(videoDevs);
        if (videoDevs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoDevs[0].deviceId);
        }
      } catch (err) {
        console.warn('Device enumeration error:', err);
      }
    }
    getDevices();
  }, [onError, selectedDeviceId]);

  // Start Webcam
  const handleStartCamera = async () => {
    try {
      if (!cameraConsent) {
        const proceed = window.confirm(
          'Clean Kadal requires camera access to process video frames for floating waste detection. ' +
          'Camera frames will be analyzed for scientific research and are not permanently saved on server. ' +
          'Allow camera access?'
        );
        if (!proceed) return;
        setCameraConsent(true);
      }

      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach((t) => t.stop());
      }

      const cameraAttempts = [];
      if (selectedDeviceId) {
        cameraAttempts.push({
          video: { deviceId: { ideal: selectedDeviceId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
          audio: false,
        });
      }
      cameraAttempts.push(
        { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }, audio: false },
        { video: true, audio: false }
      );

      let stream;
      let lastCameraError;
      for (const cameraConstraints of cameraAttempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
          break;
        } catch (cameraError) {
          lastCameraError = cameraError;
          if (cameraError.name === 'NotAllowedError' || cameraError.name === 'PermissionDeniedError') {
            throw cameraError;
          }
        }
      }
      if (!stream) throw lastCameraError || new Error('No usable camera was found.');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        onError('Camera permission denied by browser. Please enable webcam permission in browser site settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        onError('No camera hardware found on this computer.');
      } else if (err.name === 'OverconstrainedError') {
        onError('This camera does not support the requested settings. Try another camera or reduce the camera resolution.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        onError('Camera is already in use by another application or tab.');
      } else {
        onError(`Camera initialization error: ${err.message}`);
      }
      setCameraActive(false);
    }
  };

  // Stop Webcam
  const handleStopCamera = useCallback(() => {
    if (analysisActive) {
      onStopAnalysis();
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, [analysisActive, onStopAnalysis]);

  // Handle frame capture loop for analysis
  useEffect(() => {
    let timerId = null;
    if (cameraActive && analysisActive) {
      timerId = setInterval(() => {
        if (!videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const base64Data = canvas.toDataURL('image/jpeg', 0.8);
        onFrameCaptured(base64Data);
      }, 250); // 4 FPS analysis rate balances precision with local/remote latency
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [cameraActive, analysisActive, onFrameCaptured]);

  // Canvas Mouse Events for ROI selection
  const getCanvasCoords = (e) => {
    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handleMouseDown = (e) => {
    if (!selectionMode) return;
    const pt = getCanvasCoords(e);
    setDragStart(pt);
    setCurrentDrag(pt);
  };

  const handleMouseMove = (e) => {
    if (!dragStart) return;
    const pt = getCanvasCoords(e);
    setCurrentDrag(pt);
  };

  const handleMouseUp = () => {
    if (!dragStart || !currentDrag || !selectionMode) {
      setDragStart(null);
      setCurrentDrag(null);
      return;
    }

    const x_min = Math.min(dragStart.x, currentDrag.x);
    const y_min = Math.min(dragStart.y, currentDrag.y);
    const x_max = Math.max(dragStart.x, currentDrag.x);
    const y_max = Math.max(dragStart.y, currentDrag.y);

    if (x_max - x_min > 0.05 && y_max - y_min > 0.05) {
      const box = {
        x_min: Number(x_min.toFixed(4)),
        y_min: Number(y_min.toFixed(4)),
        x_max: Number(x_max.toFixed(4)),
        y_max: Number(y_max.toFixed(4)),
      };

      if (selectionMode === 'water') {
        setWaterRegion(box);
      } else if (selectionMode === 'reference') {
        setReferenceRegion(box);
      }
    } else {
      onError('Selected region too small. Drag a larger bounding rectangle.');
    }

    setDragStart(null);
    setCurrentDrag(null);
    setSelectionMode(null);
  };

  // Draw overlay graphics on canvas
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Draw Water Region Box (Cyan)
    if (waterRegion) {
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      const rx = waterRegion.x_min * w;
      const ry = waterRegion.y_min * h;
      const rw = (waterRegion.x_max - waterRegion.x_min) * w;
      const rh = (waterRegion.y_max - waterRegion.y_min) * h;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = '#00e5ff';
      ctx.font = '11px monospace';
      ctx.fillText('WATER ANALYSIS REGION', rx + 4, ry + 14);
    }

    // 2. Draw Stationary Reference Region (Amber)
    if (referenceRegion) {
      ctx.strokeStyle = '#ffb300';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      const rx = referenceRegion.x_min * w;
      const ry = referenceRegion.y_min * h;
      const rw = (referenceRegion.x_max - referenceRegion.x_min) * w;
      const rh = (referenceRegion.y_max - referenceRegion.y_min) * h;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255, 179, 0, 0.15)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = '#ffb300';
      ctx.font = '11px monospace';
      ctx.fillText('STATIONARY REF (TUB RIM)', rx + 4, ry + 14);
    }

    // 3. Draw active drag rectangle
    if (dragStart && currentDrag) {
      const rx = Math.min(dragStart.x, currentDrag.x) * w;
      const ry = Math.min(dragStart.y, currentDrag.y) * h;
      const rw = Math.abs(currentDrag.x - dragStart.x) * w;
      const rh = Math.abs(currentDrag.y - dragStart.y) * h;

      ctx.strokeStyle = selectionMode === 'water' ? '#00e5ff' : '#ffb300';
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
    }

    // 4. Draw detections and tracked objects
    if (analysisData && analysisData.tracked_objects) {
      analysisData.tracked_objects.forEach((obj) => {
        const bx = obj.box.x_min * w;
        const by = obj.box.y_min * h;
        const bw = (obj.box.x_max - obj.box.x_min) * w;
        const bh = (obj.box.y_max - obj.box.y_min) * h;

        // Bounding box color based on litter candidate status
        ctx.strokeStyle = obj.is_litter_candidate ? '#ff5252' : '#69f0ae';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);

        // Label tag
        const label = `ID:${obj.track_id} ${obj.class_name} (${(obj.confidence * 100).toFixed(0)}%)`;
        ctx.fillStyle = obj.is_litter_candidate ? 'rgba(255, 82, 82, 0.85)' : 'rgba(105, 240, 174, 0.85)';
        ctx.fillRect(bx, Math.max(0, by - 18), ctx.measureText(label).width + 8, 18);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(label, bx + 4, Math.max(13, by - 5));

        // Motion trail polyline
        if (obj.history && obj.history.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255, 235, 59, 0.8)';
          ctx.lineWidth = 2;
          obj.history.forEach((pt, i) => {
            const hx = pt.x * w;
            const hy = pt.y * h;
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          });
          ctx.stroke();
        }

        // Velocity arrow
        if (obj.velocity && obj.speed > 0.005) {
          const cx = obj.position[0] * w;
          const cy = obj.position[1] * h;
          const arrowScale = 250; // pixels per norm velocity unit
          const tox = cx + obj.velocity[0] * arrowScale;
          const toy = cy + obj.velocity[1] * arrowScale;

          ctx.beginPath();
          ctx.strokeStyle = '#ffeb3b';
          ctx.lineWidth = 2;
          ctx.moveTo(cx, cy);
          ctx.lineTo(tox, toy);
          ctx.stroke();

          // Arrow tip
          const angle = Math.atan2(toy - cy, tox - cx);
          ctx.beginPath();
          ctx.fillStyle = '#ffeb3b';
          ctx.moveTo(tox, toy);
          ctx.lineTo(tox - 8 * Math.cos(angle - Math.PI / 6), toy - 8 * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(tox - 8 * Math.cos(angle + Math.PI / 6), toy - 8 * Math.sin(angle + Math.PI / 6));
          ctx.fill();
        }

        // Predicted Future Position
        if (obj.predicted_position) {
          const px = obj.predicted_position[0] * w;
          const py = obj.predicted_position[1] * h;
          const cx = obj.position[0] * w;
          const cy = obj.position[1] * h;

          // Forecast dashed line
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255, 64, 129, 0.9)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.moveTo(cx, cy);
          ctx.lineTo(px, py);
          ctx.stroke();
          ctx.setLineDash([]);

          // Predicted point circle
          ctx.beginPath();
          ctx.arc(px, py, 5, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(255, 64, 129, 0.9)';
          ctx.fill();
          ctx.stroke();
          ctx.font = '10px monospace';
          ctx.fillStyle = '#ff4081';
          ctx.fillText(`+${obj.prediction_horizon_sec || 1.5}s`, px + 7, py + 3);
        }
      });
    }

    // 5. Draw Dominant Wave Arrow on Water Region if reliable
    if (analysisData && analysisData.wave_analysis && analysisData.wave_analysis.vector) {
      const wave = analysisData.wave_analysis;
      if (wave.reliability !== 'insufficient_data' && waterRegion) {
        const wcx = ((waterRegion.x_min + waterRegion.x_max) / 2) * w;
        const wcy = ((waterRegion.y_min + waterRegion.y_max) / 2) * h;
        const scale = 500;
        const wtox = wcx + wave.vector[0] * scale;
        const wtoy = wcy + wave.vector[1] * scale;

        ctx.beginPath();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 3;
        ctx.moveTo(wcx, wcy);
        ctx.lineTo(wtox, wtoy);
        ctx.stroke();

        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`WAVE: ${wave.dominant_direction_deg}° (${wave.reliability})`, wcx + 10, wcy - 10);
      }
    }
  }, [waterRegion, referenceRegion, dragStart, currentDrag, selectionMode, analysisData]);

  return (
    <div className="card camera-card">
      <div className="card-header">
        <h2>Live Boat Camera & Computer Vision Analysis</h2>
        <span className={`pill ${cameraActive ? 'pill-active' : 'pill-inactive'}`}>
          {cameraActive ? 'Camera Live' : 'Camera Stopped'}
        </span>
      </div>

      <div className="camera-controls-toolbar">
        <div className="control-group">
          <label htmlFor="camera-select">Select Camera:</label>
          <select
            id="camera-select"
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            disabled={cameraActive}
          >
            {devices.map((d, idx) => (
              <option key={d.deviceId || idx} value={d.deviceId}>
                {d.label || `Camera ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>

        <div className="button-group">
          {!cameraActive ? (
            <button className="btn btn-primary" onClick={handleStartCamera}>
              Start Camera
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleStopCamera}>
              Stop Camera
            </button>
          )}

          <button
            className={`btn ${selectionMode === 'water' ? 'btn-active-tool' : 'btn-secondary'}`}
            onClick={() => setSelectionMode(selectionMode === 'water' ? null : 'water')}
            disabled={!cameraActive}
          >
            {selectionMode === 'water' ? 'Cancel Water ROI' : 'Select Water Region'}
          </button>

          <button
            className={`btn ${selectionMode === 'reference' ? 'btn-active-tool' : 'btn-secondary'}`}
            onClick={() => setSelectionMode(selectionMode === 'reference' ? null : 'reference')}
            disabled={!cameraActive}
          >
            {selectionMode === 'reference' ? 'Cancel Ref ROI' : 'Select Reference Region (Tub Rim)'}
          </button>

          {!analysisActive ? (
            <button
              className="btn btn-success"
              onClick={onStartAnalysis}
              disabled={!cameraActive}
            >
              Start Analysis
            </button>
          ) : (
            <button className="btn btn-warning" onClick={onStopAnalysis}>
              Stop Analysis
            </button>
          )}

          <button
            className="btn btn-outline"
            onClick={() => {
              setWaterRegion(null);
              setReferenceRegion(null);
            }}
          >
            Reset Calibration
          </button>
        </div>
      </div>

      {selectionMode && (
        <div className="tool-instruction-banner">
          Click and drag on the camera view to mark the <strong>{selectionMode === 'water' ? 'Water Surface' : 'Stationary Tub Rim'}</strong>.
        </div>
      )}

      {/* Video & Canvas Container */}
      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-video-feed"
          style={{ display: cameraActive ? 'block' : 'none' }}
        />
        {!cameraActive && (
          <div className="video-placeholder">
            <p>Camera feed is inactive.</p>
            <p className="subtext">Select your boat camera and click "Start Camera" to begin.</p>
          </div>
        )}

        {/* Hidden capture canvas for extracting video frames */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Overlay drawing canvas */}
        <canvas
          ref={overlayCanvasRef}
          width={640}
          height={480}
          className="camera-overlay-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ cursor: selectionMode ? 'crosshair' : 'default' }}
        />
      </div>

      <div className="camera-footer-legend">
        <span><span className="legend-box legend-cyan"></span> Water Region</span>
        <span><span className="legend-box legend-amber"></span> Stationary Reference</span>
        <span><span className="legend-box legend-red"></span> Litter Candidate</span>
        <span><span className="legend-box legend-green"></span> Natural Debris (Leaf)</span>
        <span><span className="legend-box legend-yellow"></span> Motion Trail / Vector</span>
        <span><span className="legend-box legend-pink"></span> Predicted Horizon</span>
      </div>
    </div>
  );
}
