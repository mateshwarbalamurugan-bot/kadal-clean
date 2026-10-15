import React, { useRef, useEffect, useState, useCallback } from 'react';

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SAMPLE_IMAGE_URL = '/sample_flowimg_v3_bottle.jpg';

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
  onClearAnalysis,
  confidenceThreshold,
  setConfidenceThreshold,
  analysisTelemetry,
}) {
  const videoRef = useRef(null);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [activeImageSrc, setActiveImageSrc] = useState(null);
  const [internalError, setInternalError] = useState(null);
  const [videoInputs, setVideoInputs] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [isCameraSwitching, setIsCameraSwitching] = useState(false);
  const inferenceInFlightRef = useRef(false);

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

  useEffect(() => {
    if (!cameraActive) return undefined;
    const stream = videoRef.current?.srcObject;
    if (!stream) return undefined;
    const tracks = stream.getVideoTracks();
    const onTrackEnded = () => {
      stopWebcam();
      setInternalError('Camera disconnected. Reconnect the webcam and start the camera again.');
    };
    tracks.forEach((track) => track.addEventListener('ended', onTrackEnded));
    return () => tracks.forEach((track) => track.removeEventListener('ended', onTrackEnded));
  }, [cameraActive, stopWebcam]);

  // Start Webcam
  const handleStartCamera = async (deviceId = selectedCameraId) => {
    setInternalError(null);
    setActiveImageSrc(null);
    setIsSampleMode(false);
    onClearAnalysis();
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
            deviceId: { exact: deviceId },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 },
          },
          audio: false,
        });
        cameraAttempts.push({
          video: { deviceId: { ideal: deviceId }, frameRate: { ideal: 15 } },
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
        msg = 'The selected camera is unavailable. Reconnect it or choose another camera.';
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

  // Periodic capture loop when camera is active
  useEffect(() => {
    let intervalId = null;
    if (cameraActive) {
      intervalId = setInterval(() => {
        if (!videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const base64Data = canvas.toDataURL('image/jpeg', 0.8);
        if (inferenceInFlightRef.current) return;
        inferenceInFlightRef.current = true;
        Promise.resolve(onAnalyzeFrame(base64Data, false))
          .catch(() => {})
          .finally(() => { inferenceInFlightRef.current = false; });
      }, 350); // ~3 FPS smooth stream analysis
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [cameraActive, onAnalyzeFrame]);

  // Handle Image Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopWebcam();
    setIsSampleMode(false);
    setInternalError(null);
    onClearAnalysis();

    try {
      const dataUrl = await imageBlobToDataUrl(file);
      setActiveImageSrc(dataUrl);
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
    onClearAnalysis();

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

  // Draw overlays within the same object-fit:contain content rectangle as the source media.
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const viewport = canvas?.parentElement;
    if (!canvas || !viewport) return undefined;

    const draw = () => {
      const w = Math.max(1, Math.floor(viewport.clientWidth));
      const h = Math.max(1, Math.floor(viewport.clientHeight));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);

      const sourceWidth = cameraActive ? videoRef.current?.videoWidth : imageRef.current?.naturalWidth;
      const sourceHeight = cameraActive ? videoRef.current?.videoHeight : imageRef.current?.naturalHeight;
      const scale = sourceWidth > 0 && sourceHeight > 0
        ? Math.min(w / sourceWidth, h / sourceHeight)
        : 1;
      const contentWidth = sourceWidth > 0 ? sourceWidth * scale : w;
      const contentHeight = sourceHeight > 0 ? sourceHeight * scale : h;
      const offsetX = (w - contentWidth) / 2;
      const offsetY = (h - contentHeight) / 2;
      const mapPoint = (x, y) => [offsetX + x * contentWidth, offsetY + y * contentHeight];

      (analysisData?.detections || []).filter((det) => det.is_litter_candidate).forEach((det) => {
        const box = det.box;
        const [bx, by] = mapPoint(box.x_min, box.y_min);
        const bw = (box.x_max - box.x_min) * contentWidth;
        const bh = (box.y_max - box.y_min) * contentHeight;
        ctx.strokeStyle = '#14b8a6';
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = 'rgba(20, 184, 166, 0.15)';
        ctx.fillRect(bx, by, bw, bh);

        const labelText = `${det.class_name.replace('_', ' ')} · ${(det.confidence * 100).toFixed(0)}%`;
        ctx.font = 'bold 12px sans-serif';
        const textWidth = ctx.measureText(labelText).width;
        const tagHeight = 22;
        const tagY = Math.max(0, by - tagHeight);
        ctx.fillStyle = '#0f766e';
        ctx.fillRect(bx, tagY, textWidth + 12, tagHeight);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, bx + 6, tagY + 15);

        const centerX = (box.x_min + box.x_max) / 2;
        const centerY = (box.y_min + box.y_max) / 2;
        const matchingTrack = analysisData?.tracked_objects?.find((track) =>
          Math.abs(track.position[0] - centerX) < 0.1 && Math.abs(track.position[1] - centerY) < 0.1
        );
        if (matchingTrack) {
          const dirTag = `${matchingTrack.travelled_from?.split('·')[0]?.trim() || 'Origin'} ➔ ${matchingTrack.navigating_towards?.split('➔')[0]?.trim() || 'Drifting'}`;
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

      (analysisData?.tracked_objects || []).forEach((obj) => {
        if (obj.origin_position) {
          const [ox, oy] = mapPoint(obj.origin_position[0], obj.origin_position[1]);
          ctx.beginPath(); ctx.arc(ox, oy, 4, 0, 2 * Math.PI); ctx.fillStyle = '#38bdf8'; ctx.fill();
          ctx.font = '9px sans-serif'; ctx.fillStyle = '#38bdf8'; ctx.fillText(`Entry #${obj.track_id}`, ox + 6, oy - 2);
        }
        if (obj.history?.length > 1) {
          ctx.beginPath(); ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)'; ctx.lineWidth = 2;
          obj.history.forEach((point, index) => {
            const [x, y] = mapPoint(point.x, point.y);
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.stroke();
        }
        if (obj.velocity && obj.speed > 0.005) {
          const [cx, cy] = mapPoint(obj.position[0], obj.position[1]);
          const tox = cx + obj.velocity[0] * contentWidth * 0.35;
          const toy = cy + obj.velocity[1] * contentHeight * 0.35;
          ctx.beginPath(); ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2.5; ctx.moveTo(cx, cy); ctx.lineTo(tox, toy); ctx.stroke();
          const angle = Math.atan2(toy - cy, tox - cx);
          ctx.beginPath(); ctx.fillStyle = '#facc15'; ctx.moveTo(tox, toy);
          ctx.lineTo(tox - 7 * Math.cos(angle - Math.PI / 6), toy - 7 * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(tox - 7 * Math.cos(angle + Math.PI / 6), toy - 7 * Math.sin(angle + Math.PI / 6)); ctx.fill();
        }
        if (obj.predicted_position) {
          const [px, py] = mapPoint(obj.predicted_position[0], obj.predicted_position[1]);
          ctx.beginPath(); ctx.arc(px, py, 5, 0, 2 * Math.PI); ctx.fillStyle = '#f43f5e'; ctx.fill();
          ctx.font = '9px sans-serif'; ctx.fillStyle = '#f43f5e'; ctx.fillText(`Target #${obj.track_id}`, px + 7, py + 3);
        }
      });
    };

    draw();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    observer?.observe(viewport);
    window.addEventListener('resize', draw);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [analysisData, cameraActive, activeImageSrc]);

  const activeError = errorMessage || internalError;

  return (
    <section id="demo" className="demo-section">
      <div className="section-header">
        <h2 className="section-title">Live AI Demonstration</h2>
          <p className="section-subtitle">
          Analyze live camera frames or a still image. Detection is class-limited; motion estimates require consecutive frames.
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
              accept="image/jpeg,image/png,image/webp"
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
                {isSampleMode ? 'Licensed Dataset Sample · Not Live' : '📁 Uploaded Image'}
              </span>
            )}
            {!cameraActive && !activeImageSrc && (
              <span className="source-badge badge-idle">Ready to Start</span>
            )}
          </div>
        </div>

        <div className="demo-telemetry-bar">
          <label className="confidence-control" htmlFor="confidence-threshold">
            <span>Minimum confidence: <strong>{Math.round(confidenceThreshold * 100)}%</strong></span>
            <input
              id="confidence-threshold"
              type="range"
              min="0.05"
              max="0.95"
              step="0.05"
              value={confidenceThreshold}
              onChange={(event) => setConfidenceThreshold(Number(event.target.value))}
            />
          </label>
          <div className="analysis-telemetry" aria-live="polite">
            <span>Model: <strong>{analysisData?.model_status?.model_name || 'Waiting for backend'}</strong></span>
            <span>Inference: <strong>{analysisTelemetry?.latencyMs == null ? '—' : `${analysisTelemetry.latencyMs} ms`}</strong></span>
            <span>Rate: <strong>{analysisTelemetry?.inferenceFps == null ? '—' : `${analysisTelemetry.inferenceFps} FPS`}</strong></span>
            <span>Current candidates: <strong>{(analysisData?.detections || []).filter((item) => item.is_litter_candidate).length}</strong></span>
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
            style={{ display: cameraActive ? 'block' : 'none' }}
          />

          {/* Uploaded / Sample Static Image */}
          {!cameraActive && activeImageSrc && (
            <img
              ref={imageRef}
              src={activeImageSrc}
              alt="Demo Frame"
              className="viewport-media"
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
            width={640}
            height={480}
            className="viewport-overlay-canvas"
            style={{ display: (cameraActive || activeImageSrc) ? 'block' : 'none' }}
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
            {isSampleMode
              ? <>Labeled Flow-Img v3 demo image (CC BY 4.0); not live footage or evidence of field performance. See <a href="/ATTRIBUTION.txt" target="_blank" rel="noreferrer">image attribution</a>.</>
              : 'Boxes show real model predictions. Direction and wave estimates require consecutive live frames.'}
          </div>
        </div>
      </div>
    </section>
  );
}
