import React, { useRef, useEffect, useState, useCallback } from 'react';

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SAMPLE_IMAGE_URL = '/sample_floating_waste.jpg';

async function imageBlobToDataUrl(blob) {
  const mimeType = blob.type.split(';', 1)[0].trim().toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type "${mimeType || 'unknown'}". Use JPEG, PNG, or WebP.`);
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
        ? resolve()
        : reject(new Error('The selected file does not contain a decodable image.'));
      image.onerror = () => reject(new Error('The selected file does not contain a decodable image.'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
        reject(new Error('Could not encode the image as valid base64 image data.'));
        return;
      }
      resolve(dataUrl);
    };
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(blob);
  });
}

export default function LiveDemo({
  analysisData,
  onAnalyzeFrame,
  isProcessing,
  errorMessage,
  onClearError,
  cameraActive,
  setCameraActive,
  isSampleMode,
  setIsSampleMode,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const inferenceInProgressRef = useRef(false);
  const analysisCallbackRef = useRef(onAnalyzeFrame);

  const [activeImageSrc, setActiveImageSrc] = useState(null);
  const [internalError, setInternalError] = useState(null);
  const [videoInputs, setVideoInputs] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [isCameraSwitching, setIsCameraSwitching] = useState(false);
  const [overlayDimensions, setOverlayDimensions] = useState({ width: 640, height: 360 });

  useEffect(() => {
    analysisCallbackRef.current = onAnalyzeFrame;
  }, [onAnalyzeFrame]);

  const syncOverlayDimensions = useCallback((width, height) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay || !width || !height) return;
    if (overlay.width !== width) overlay.width = width;
    if (overlay.height !== height) overlay.height = height;
    setOverlayDimensions((current) => (
      current.width === width && current.height === height ? current : { width, height }
    ));
  }, []);

  // Stop Webcam helper
  const stopWebcam = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, [setCameraActive]);

  const refreshVideoInputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput');
    setVideoInputs(cameras);
    return cameras;
  }, []);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return undefined;

    const refresh = () => refreshVideoInputs().catch(() => {});
    refresh();
    mediaDevices.addEventListener?.('devicechange', refresh);
    return () => mediaDevices.removeEventListener?.('devicechange', refresh);
  }, [refreshVideoInputs]);

  useEffect(() => () => {
    const stream = videoRef.current?.srcObject;
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  // Start Webcam
  const handleStartCamera = async (deviceId = selectedCameraId) => {
    setInternalError(null);
    setActiveImageSrc(null);
    setIsSampleMode(false);
    setIsCameraSwitching(true);
    let nextStream = null;
    const previousStream = videoRef.current?.srcObject;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam API is not supported in this browser.');
      }

      const cameraAttempts = [];
      if (deviceId) {
        cameraAttempts.push({
          video: {
            deviceId: { ideal: deviceId },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 },
          },
          audio: false,
        });
      }
      cameraAttempts.push(
        { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }, audio: false },
        { video: true, audio: false }
      );

      let lastCameraError;
      for (const constraints of cameraAttempts) {
        try {
          nextStream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (cameraError) {
          lastCameraError = cameraError;
          // Permission denial is not solved by progressively looser constraints.
          if (cameraError.name === 'NotAllowedError' || cameraError.name === 'PermissionDeniedError') {
            throw cameraError;
          }
        }
      }
      if (!nextStream) throw lastCameraError || new Error('No usable camera was found.');

      if (videoRef.current) {
        videoRef.current.srcObject = nextStream;
        try {
          await videoRef.current.play();
        } catch (playError) {
          videoRef.current.srcObject = previousStream;
          nextStream.getTracks().forEach((track) => track.stop());
          throw playError;
        }
        if (previousStream && previousStream !== nextStream) {
          previousStream.getTracks().forEach((track) => track.stop());
        }
        const activeDeviceId = nextStream.getVideoTracks()[0]?.getSettings().deviceId || deviceId;
        setSelectedCameraId(activeDeviceId || '');
        setCameraActive(true);
        await refreshVideoInputs();
      }
    } catch (err) {
      console.warn('Camera error:', err);
      let msg = 'Could not access camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission denied. Enable camera in site settings or try the sample image below.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = deviceId
          ? 'The selected camera is unavailable. Reconnect it or choose another camera.'
          : 'No camera found. Click "Try Sample Image" to see AI detection.';
      } else if (err.name === 'OverconstrainedError') {
        msg = 'This camera does not support the requested settings. Try another camera or use the sample image.';
      } else if (err.name === 'NotReadableError') {
        msg = 'Camera is in use by another app. Try the sample image below.';
      }
      if (nextStream && videoRef.current?.srcObject !== nextStream) {
        nextStream.getTracks().forEach((track) => track.stop());
      }
      setInternalError(msg);
      if (!previousStream) setCameraActive(false);
    } finally {
      setIsCameraSwitching(false);
    }
  };

  const handleCameraChange = (event) => {
    const deviceId = event.target.value;
    if (cameraActive) {
      handleStartCamera(deviceId);
    } else {
      setSelectedCameraId(deviceId);
    }
  };

  // Stop Webcam
  const handleStopCamera = () => {
    stopWebcam();
  };

  // Keep at most one inference request in flight. Render backends can be CPU-bound;
  // queueing webcam frames faster than inference completes makes overlays stale.
  useEffect(() => {
    if (!cameraActive) return undefined;
    let active = true;
    let timeoutId;

    const analyzeNextFrame = async () => {
      if (!active) return;
      const video = videoRef.current;
      const captureCanvas = canvasRef.current;
      if (!video || !captureCanvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight || inferenceInProgressRef.current) {
        timeoutId = window.setTimeout(analyzeNextFrame, 300);
        return;
      }

      const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      captureCanvas.width = width;
      captureCanvas.height = height;
      const context = captureCanvas.getContext('2d');
      if (!context) {
        timeoutId = window.setTimeout(analyzeNextFrame, 500);
        return;
      }
      context.drawImage(video, 0, 0, width, height);
      syncOverlayDimensions(width, height);

      inferenceInProgressRef.current = true;
      try {
        await analysisCallbackRef.current(captureCanvas.toDataURL('image/jpeg', 0.82), false);
      } catch (error) {
        console.error('Camera frame analysis failed:', error);
      } finally {
        inferenceInProgressRef.current = false;
        if (active) timeoutId = window.setTimeout(analyzeNextFrame, 500);
      }
    };

    timeoutId = window.setTimeout(analyzeNextFrame, 250);
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [cameraActive, syncOverlayDimensions]);

  // Handle Image Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopWebcam();
    setIsSampleMode(true);
    setInternalError(null);
    try {
      const dataUrl = await imageBlobToDataUrl(file);
      setActiveImageSrc(dataUrl);
      setIsSampleMode(false);
      onAnalyzeFrame(dataUrl, true);
    } catch (err) {
      setInternalError(`Could not use image: ${err.message}`);
    }
    // Reset file input value so same file can be selected again
    e.target.value = '';
  };

  // Handle Try Sample Image
  const handleTrySampleImage = async () => {
    stopWebcam();
    setIsSampleMode(true);
    setInternalError(null);

    try {
      const response = await fetch(SAMPLE_IMAGE_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Sample image request returned HTTP ${response.status}.`);
      }
      const responseType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
      if (!SUPPORTED_IMAGE_TYPES.has(responseType)) {
        throw new Error(`Expected an image from ${SAMPLE_IMAGE_URL}, received "${responseType || 'unknown content type'}".`);
      }
      const blob = await response.blob();
      if (blob.type && blob.type.split(';', 1)[0].trim().toLowerCase() !== responseType) {
        throw new Error('The sample image response has inconsistent MIME types.');
      }
      const dataUrl = await imageBlobToDataUrl(blob);
      setActiveImageSrc(dataUrl);
      onAnalyzeFrame(dataUrl, true);
    } catch (err) {
      setActiveImageSrc(null);
      setInternalError(`Could not load sample image: ${err.message}`);
    }
  };

  // Draw detection bounding boxes on canvas overlay
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (analysisData && analysisData.detections && analysisData.detections.length > 0) {
      analysisData.detections.forEach((det, idx) => {
        const box = det.box;
        const bx = box.x_min * w;
        const by = box.y_min * h;
        const bw = (box.x_max - box.x_min) * w;
        const bh = (box.y_max - box.y_min) * h;

        // Bounding box border
        ctx.strokeStyle = '#14b8a6'; // Teal accent
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, by, bw, bh);

        // Semi-transparent box fill
        ctx.fillStyle = 'rgba(20, 184, 166, 0.15)';
        ctx.fillRect(bx, by, bw, bh);

        // Label Tag
        const labelText = `${det.class_name.replace('_', ' ')} · ${(det.confidence * 100).toFixed(0)}%`;
        ctx.font = 'bold 12px sans-serif';
        const textWidth = ctx.measureText(labelText).width;

        const tagHeight = 22;
        const tagY = Math.max(0, by - tagHeight);
        ctx.fillStyle = '#0f766e';
        ctx.fillRect(bx, tagY, textWidth + 12, tagHeight);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, bx + 6, tagY + 15);
        // Check if matching tracked object exists to show direction tag
        const matchingTrack = analysisData?.tracked_objects?.find(
          (t) => Math.abs(t.position[0] - (box.x_min + box.x_max) / 2) < 0.1 &&
                 Math.abs(t.position[1] - (box.y_min + box.y_max) / 2) < 0.1
        );

        if (matchingTrack) {
          const fromCode = matchingTrack.heading_compass || 'ORIGIN';
          const dirTag = `${matchingTrack.travelled_from?.split('·')[0]?.trim() || 'From Origin'} ➔ ${matchingTrack.navigating_towards?.split('➔')[0]?.trim() || 'Drifting'}`;
          ctx.font = '10px monospace';
          const dirTagWidth = ctx.measureText(dirTag).width;
          const dirTagY = by + bh + 4;
          if (dirTagY + 16 <= h) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.fillRect(bx, dirTagY, dirTagWidth + 8, 16);
            ctx.fillStyle = '#facc15';
            ctx.fillText(dirTag, bx + 4, dirTagY + 12);
          }
        }
      });
    }

    // Draw motion trails, origin entry points, and destination forecasts
    if (analysisData && analysisData.tracked_objects && analysisData.tracked_objects.length > 0) {
      analysisData.tracked_objects.forEach((obj) => {
        // 1. Origin Entry Point (Travelled From)
        if (obj.origin_position) {
          const ox = obj.origin_position[0] * w;
          const oy = obj.origin_position[1] * h;

          ctx.beginPath();
          ctx.arc(ox, oy, 4, 0, 2 * Math.PI);
          ctx.fillStyle = '#38bdf8'; // Sky blue origin
          ctx.fill();

          ctx.font = '9px sans-serif';
          ctx.fillStyle = '#38bdf8';
          ctx.fillText(`📍 Entry #${obj.track_id}`, ox + 6, oy - 2);
        }

        // 2. Motion Trail Polyline
        if (obj.history && obj.history.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)'; // Yellow trail
          ctx.lineWidth = 2;
          obj.history.forEach((pt, i) => {
            const hx = pt.x * w;
            const hy = pt.y * h;
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          });
          ctx.stroke();
        }

        // 3. Velocity Vector Arrow (Navigating Towards)
        if (obj.velocity && obj.speed > 0.005) {
          const cx = obj.position[0] * w;
          const cy = obj.position[1] * h;
          const tox = cx + obj.velocity[0] * 220;
          const toy = cy + obj.velocity[1] * 220;

          ctx.beginPath();
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 2.5;
          ctx.moveTo(cx, cy);
          ctx.lineTo(tox, toy);
          ctx.stroke();

          // Arrowhead
          const angle = Math.atan2(toy - cy, tox - cx);
          ctx.beginPath();
          ctx.fillStyle = '#facc15';
          ctx.moveTo(tox, toy);
          ctx.lineTo(tox - 7 * Math.cos(angle - Math.PI / 6), toy - 7 * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(tox - 7 * Math.cos(angle + Math.PI / 6), toy - 7 * Math.sin(angle + Math.PI / 6));
          ctx.fill();
        }

        // 4. Predicted Future Target (Destination)
        if (obj.predicted_position) {
          const px = obj.predicted_position[0] * w;
          const py = obj.predicted_position[1] * h;

          ctx.beginPath();
          ctx.arc(px, py, 5, 0, 2 * Math.PI);
          ctx.fillStyle = '#f43f5e'; // Rose destination
          ctx.fill();

          ctx.font = '9px sans-serif';
          ctx.fillStyle = '#f43f5e';
          ctx.fillText(`🧭 Target #${obj.track_id}`, px + 7, py + 3);
        }
      });
    }
  }, [analysisData, overlayDimensions]);

  const activeError = errorMessage || internalError;

  return (
    <section id="demo" className="demo-section">
      <div className="section-header">
        <h2 className="section-title">Live AI Demonstration</h2>
        <p className="section-subtitle">
          Feed live camera video or test an image to detect floating waste in real time.
        </p>
      </div>

      <div className="demo-card">
        {/* Top Control Bar */}
        <div className="demo-controls-bar">
          <div className="control-buttons">
            {!cameraActive ? (
              <button className="btn btn-primary" onClick={handleStartCamera}>
                📹 Start Camera
              </button>
            ) : (
              <button className="btn btn-danger" onClick={handleStopCamera}>
                ⏹ Stop Camera
              </button>
            )}

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              📁 Upload Image
            </button>

            <button
              className="btn btn-accent"
              onClick={handleTrySampleImage}
            >
              ⚡ Try Sample Image
            </button>

            {videoInputs.length > 1 && (
              <label className="camera-picker">
                <span className="camera-picker-label">Camera</span>
                <select
                  className="camera-picker-select"
                  aria-label="Select camera"
                  value={selectedCameraId}
                  onChange={handleCameraChange}
                  disabled={isCameraSwitching}
                >
                  <option value="">System default</option>
                  {videoInputs.map((device, index) => (
                    <option key={device.deviceId || `camera-${index}`} value={device.deviceId}>
                      {device.label || `Camera ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="demo-source-tag">
            {cameraActive && <span className="source-badge badge-live">● Live Camera Feed</span>}
            {!cameraActive && activeImageSrc && (
              <span className="source-badge badge-sample">
                {isSampleMode ? '🧪 Demonstration Image' : '📁 Uploaded Image'}
              </span>
            )}
            {!cameraActive && !activeImageSrc && (
              <span className="source-badge badge-idle">Ready to Start</span>
            )}
          </div>
        </div>

        {/* Error / Fallback Notification */}
        {activeError && (
          <div className="demo-alert">
            <span className="alert-icon">⚠️</span>
            <span className="alert-text">{activeError}</span>
            <button className="btn-sm btn-sample-action" onClick={handleTrySampleImage}>
              Load Sample Demo Image
            </button>
          </div>
        )}

        {/* Viewport Display Area */}
        <div className="demo-viewport">
          {/* Live Video Feed */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="viewport-media"
            onLoadedMetadata={(event) => syncOverlayDimensions(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
            style={{ display: cameraActive ? 'block' : 'none' }}
          />

          {/* Uploaded / Sample Static Image */}
          {!cameraActive && activeImageSrc && (
            <img
              src={activeImageSrc}
              alt="Demo Frame"
              className="viewport-media"
              onLoad={(event) => syncOverlayDimensions(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
            />
          )}

          {/* Idle Placeholder */}
          {!cameraActive && !activeImageSrc && (
            <div className="viewport-placeholder">
              <div className="placeholder-content">
                <span className="placeholder-icon">📷</span>
                <h3>No Media Active</h3>
                <p>Click <strong>Start Camera</strong> to view your physical model, or click <strong>Try Sample Image</strong> for an instant demo.</p>
                <div className="placeholder-actions">
                  <button className="btn btn-primary" onClick={handleStartCamera}>
                    Start Camera
                  </button>
                  <button className="btn btn-accent" onClick={handleTrySampleImage}>
                    Try Sample Image
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Hidden Canvas for Video Frame Capture */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Canvas for AI Overlays */}
          <canvas
            ref={overlayCanvasRef}
            width={overlayDimensions.width}
            height={overlayDimensions.height}
            className="viewport-overlay-canvas"
            style={{ display: (cameraActive || activeImageSrc) ? 'block' : 'none', objectFit: 'contain' }}
          />

          {/* Processing Spinner Overlay */}
          {isProcessing && (
            <div className="viewport-spinner-overlay">
              <div className="spinner"></div>
              <span>AI Analyzing Frame...</span>
            </div>
          )}
        </div>

        {/* Viewport Footer Information */}
        <div className="demo-footer">
          <div className="footer-legend">
            <span className="legend-item">
              <span className="legend-indicator legend-teal"></span> Detected Waste
            </span>
            <span className="legend-item">
              <span className="legend-indicator legend-yellow"></span> Motion Trajectory
            </span>
          </div>
          <div className="footer-note">
            Bounding boxes and labels are calculated directly by the lightweight YOLO detector.
          </div>
        </div>
      </div>
    </section>
  );
}
