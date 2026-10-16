import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import LiveDemo from './components/LiveDemo';
import ResultsSection from './components/ResultsSection';
import MovementInsights from './components/MovementInsights';
import AdvancedAnalysis from './components/AdvancedAnalysis';
import ArduinoControlPanel from './components/ArduinoControlPanel';

import {
  checkBackendHealth,
  getModelStatus,
  reloadModelWeights,
} from './services/api';
import { detectInBrowser, resetBrowserTracker } from './services/browserDetector';

import './App.css';

export default function App() {
  const [backendConnected, setBackendConnected] = useState(false);
  const [modelStatus, setModelStatus] = useState(null);
  const [browserModelReady, setBrowserModelReady] = useState(false);
  const [browserModelLoading, setBrowserModelLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Demo Modes
  const [cameraActive, setCameraActive] = useState(false);
  const [isSampleMode, setIsSampleMode] = useState(false);

  // Analysis Telemetry
  const [analysisData, setAnalysisData] = useState(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.25);
  const [analysisTelemetry, setAnalysisTelemetry] = useState({ latencyMs: null, inferenceFps: null, lastProcessedAt: null });
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const [manualWindDirection, setManualWindDirection] = useState('');
  const frameRequestActiveRef = useRef(false);
  const frameRequestPromiseRef = useRef(Promise.resolve());
  const previousFrameCompletionRef = useRef(null);

  // Trajectory & Advanced Settings
  const [predictionHorizon, setPredictionHorizon] = useState(1.5);
  const [predictionMethod, setPredictionMethod] = useState('constant_velocity');
  const [trajectoryEvaluations, setTrajectoryEvaluations] = useState([]);
  const [pendingForecasts, setPendingForecasts] = useState([]);

  // Experiment Recording Session
  const [isRecording, setIsRecording] = useState(false);
  const [currentSession, setCurrentSession] = useState(null);

  // Check Backend Health & Fetch Model Status on Mount
  useEffect(() => {
    let isMounted = true;
    async function checkHealth() {
      try {
        await checkBackendHealth();
        if (isMounted) {
          setBackendConnected(true);
          setErrorMessage(null);
          const status = await getModelStatus();
          setModelStatus(status);
        }
      } catch (err) {
        if (isMounted) {
          setBackendConnected(false);
          // Browser-local bottle inference remains available if the hosted API is offline.
          setModelStatus(null);
        }
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Run bottle detection in the user's browser; live analysis must not depend on the
  // low-memory hosted API, which can be restarted by repeated PyTorch inference.
  const handleAnalyzeFrame = useCallback(
    async (base64Image, isStaticImage = false) => {
      if (!isStaticImage && frameRequestActiveRef.current) return null;
      if (isStaticImage && frameRequestActiveRef.current) await frameRequestPromiseRef.current;
      if (frameRequestActiveRef.current) return null;
      frameRequestActiveRef.current = true;
      let releaseFrameRequest;
      frameRequestPromiseRef.current = new Promise((resolve) => { releaseFrameRequest = resolve; });
      const startedAt = performance.now();
      const now = Date.now() / 1000.0;

      if (isStaticImage) setIsProcessing(true);
      if (!browserModelReady) setBrowserModelLoading(true);

      try {
        const result = await detectInBrowser(base64Image, {
          confidenceThreshold,
          isStaticImage,
          timestamp: now,
          predictionHorizonSec: predictionHorizon,
        });
        setBrowserModelReady(true);
        const completedAt = performance.now();
        const completedWallTime = Date.now();
        setAnalysisData(result);
        setErrorMessage(null);
        const frameDeltaMs = !isStaticImage && previousFrameCompletionRef.current !== null
          ? completedWallTime - previousFrameCompletionRef.current
          : null;
        setAnalysisTelemetry({
          latencyMs: Math.round(completedAt - startedAt),
          inferenceFps: frameDeltaMs > 0 ? Math.round((1000 / frameDeltaMs) * 10) / 10 : null,
          lastProcessedAt: completedWallTime,
        });
        if (!isStaticImage) previousFrameCompletionRef.current = completedWallTime;
        if (!isStaticImage) {
          setTelemetryHistory((previous) => [...previous, {
            timestamp: result.timestamp || now,
            detectionCount: (result.detections || []).filter((detection) => detection.is_litter_candidate).length,
            visibleTracks: (result.tracked_objects || []).length,
            waveMagnitude: result.wave_analysis?.reliability === 'reliable' ? result.wave_analysis.magnitude : null,
            waveReliability: result.wave_analysis?.reliability || 'insufficient_data',
          }].slice(-120));
        }

        // Update trajectory evaluation only from temporal live tracking results.
        if (!isStaticImage && result.tracked_objects && result.tracked_objects.length > 0) {
          const updatedPending = [...pendingForecasts];
          const newEvaluations = [];
          result.tracked_objects.forEach((obj) => {
            for (let i = updatedPending.length - 1; i >= 0; i--) {
              const forecast = updatedPending[i];
              if (forecast.track_id === obj.track_id && now >= forecast.target_t) {
                const dx = obj.position[0] - forecast.predicted[0];
                const dy = obj.position[1] - forecast.predicted[1];
                newEvaluations.push({
                  track_id: obj.track_id,
                  method: forecast.method,
                  predicted: forecast.predicted,
                  observed: obj.position,
                  error: Math.sqrt(dx * dx + dy * dy),
                  evaluated_at: now,
                });
                updatedPending.splice(i, 1);
              }
            }
            if (obj.predicted_position && obj.prediction_reliability === 'reliable') {
              const exists = updatedPending.some((forecast) => forecast.track_id === obj.track_id);
              if (!exists) updatedPending.push({
                track_id: obj.track_id,
                method: predictionMethod,
                predicted: obj.predicted_position,
                target_t: now + (obj.prediction_horizon_sec || predictionHorizon),
              });
            }
          });
          setPendingForecasts(updatedPending);
          if (newEvaluations.length > 0) setTrajectoryEvaluations((prev) => [...prev, ...newEvaluations]);
        }

        // Bound the in-memory experiment log; this remains local to the browser session.
        if (isRecording && currentSession) {
          setCurrentSession((prev) => ({
            ...prev,
            duration_sec: Math.round(now - prev.start_time),
            records: [...prev.records, {
              timestamp: now,
              tracked_objects: result.tracked_objects,
              detections: result.detections,
              wave_analysis: result.wave_analysis,
              camera_motion: result.camera_motion,
            }].slice(-10000),
          }));
        }
        return result;
      } catch (err) {
        setErrorMessage(`Browser bottle detector failed: ${err.message}. Check your internet connection for the first-run model download, then retry in a recent Chrome or Edge browser.`);
        return null;
      } finally {
        setBrowserModelLoading(false);
        frameRequestActiveRef.current = false;
        releaseFrameRequest?.();
        if (isStaticImage) setIsProcessing(false);
      }
    },
    [predictionHorizon, predictionMethod, confidenceThreshold, pendingForecasts, isRecording, currentSession, browserModelReady]
  );

  const handleClearAnalysis = useCallback(() => {
    setAnalysisData(null);
    setPendingForecasts([]);
    setTrajectoryEvaluations([]);
    setTelemetryHistory([]);
    setAnalysisTelemetry({ latencyMs: null, inferenceFps: null, lastProcessedAt: null });
    previousFrameCompletionRef.current = null;
    setErrorMessage(null);
    resetBrowserTracker();
  }, []);

  // Model Reload Handler
  const handleReloadModel = async () => {
    try {
      const updated = await reloadModelWeights();
      setModelStatus(updated);
      alert(`Model reloaded successfully: ${updated.model_name}`);
    } catch (err) {
      alert(`Model reload failed: ${err.message}`);
    }
  };

  // Experiment Recording Session Handlers
  const handleStartRecording = () => {
    const sessionId = `EXP_${new Date().toISOString().replace(/[:.-]/g, '_').slice(0, 19)}`;
    setCurrentSession({
      id: sessionId,
      start_time: Date.now() / 1000.0,
      duration_sec: 0,
      model_name: modelStatus?.model_name || 'unknown',
      model_type: modelStatus?.model_type || 'unknown',
      records: [],
    });
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
  };

  const handleScrollToDemo = () => {
    const el = document.getElementById('demo');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="app-shell">
      {/* 1. Header with 3 Anchor Links & Status */}
      <Navbar
        backendConnected={backendConnected}
        isCustomModel={modelStatus?.is_custom_trained}
        isBrowserModelReady={browserModelReady}
        isBrowserModelLoading={browserModelLoading}
      />

      <main className="main-wrapper">
        {/* 2. Hero Introduction */}
        <Hero onStartDemo={handleScrollToDemo} />

        {/* 3. Live Demo Viewport (Main Focus) */}
        <LiveDemo
          analysisData={analysisData}
          onAnalyzeFrame={handleAnalyzeFrame}
          isProcessing={isProcessing}
          errorMessage={errorMessage}
          onClearError={() => setErrorMessage(null)}
          cameraActive={cameraActive}
          setCameraActive={setCameraActive}
          isSampleMode={isSampleMode}
          setIsSampleMode={setIsSampleMode}
          onClearAnalysis={handleClearAnalysis}
          confidenceThreshold={confidenceThreshold}
          setConfidenceThreshold={setConfidenceThreshold}
          analysisTelemetry={analysisTelemetry}
          modelStatus={modelStatus}
          backendConnected={backendConnected}
          browserModelLoading={browserModelLoading}
        />

        {/* 4. Three Core Result Cards */}
        <ResultsSection
          analysisData={analysisData}
          isSampleMode={isSampleMode}
        />

        {/* 5. Movement & Wave Insights */}
        <MovementInsights
          analysisData={analysisData}
        />

        {/* 6. Expandable Advanced Analysis & Telemetry */}
        <AdvancedAnalysis
          analysisData={analysisData}
          modelStatus={modelStatus}
          onReloadModel={handleReloadModel}
          predictionMethod={predictionMethod}
          setPredictionMethod={setPredictionMethod}
          predictionHorizon={predictionHorizon}
          setPredictionHorizon={setPredictionHorizon}
          trajectoryEvaluations={trajectoryEvaluations}
          telemetryHistory={telemetryHistory}
          manualWindDirection={manualWindDirection}
          onUpdateManualWind={setManualWindDirection}
          isRecording={isRecording}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          currentSession={currentSession}
        />

        <ArduinoControlPanel
          analysisData={analysisData}
          cameraActive={cameraActive}
          modelStatus={modelStatus}
          confidenceThreshold={confidenceThreshold}
          errorMessage={errorMessage}
        />
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <span>🌊 <strong>Clean Kadal</strong> — AI-Powered Ocean Waste Detection</span>
          <span className="footer-hackathon-tag">Hackathon Demo Edition</span>
        </div>
      </footer>
    </div>
  );
}
