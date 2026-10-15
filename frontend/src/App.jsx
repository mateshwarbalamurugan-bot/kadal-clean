import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import LiveDemo from './components/LiveDemo';
import ResultsSection from './components/ResultsSection';
import MovementInsights from './components/MovementInsights';
import AdvancedAnalysis from './components/AdvancedAnalysis';

import {
  checkBackendHealth,
  getModelStatus,
  reloadModelWeights,
  sendFrameForAnalysis,
  resetBackendTracker,
} from './services/api';

import './App.css';

export default function App() {
  const [backendConnected, setBackendConnected] = useState(false);
  const [modelStatus, setModelStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Demo Modes
  const [cameraActive, setCameraActive] = useState(false);
  const [isSampleMode, setIsSampleMode] = useState(false);

  // Analysis Telemetry
  const [analysisData, setAnalysisData] = useState(null);

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
          setErrorMessage(err.message || 'AI Backend is starting or offline. Ensure backend is running.');
        }
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 6000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Frame Analysis Handler (called by LiveDemo on camera frame or image upload)
  const handleAnalyzeFrame = useCallback(
    async (base64Image, isStaticImage = false) => {
      const now = Date.now() / 1000.0;

      const payload = {
        image_base64: base64Image,
        timestamp: now,
        prediction_horizon_sec: predictionHorizon,
        prediction_method: predictionMethod,
      };

      if (isStaticImage) {
        setIsProcessing(true);
      }

      try {
        const result = await sendFrameForAnalysis(payload);
        setAnalysisData(result);
        setErrorMessage(null);

        // Update Trajectory Evaluation loop
        if (result.tracked_objects && result.tracked_objects.length > 0) {
          const updatedPending = [...pendingForecasts];
          const newEvaluations = [];

          result.tracked_objects.forEach((obj) => {
            for (let i = updatedPending.length - 1; i >= 0; i--) {
              const forecast = updatedPending[i];
              if (forecast.track_id === obj.track_id && now >= forecast.target_t) {
                const dx = obj.position[0] - forecast.predicted[0];
                const dy = obj.position[1] - forecast.predicted[1];
                const err = Math.sqrt(dx * dx + dy * dy);

                newEvaluations.push({
                  track_id: obj.track_id,
                  method: forecast.method,
                  predicted: forecast.predicted,
                  observed: obj.position,
                  error: err,
                  evaluated_at: now,
                });
                updatedPending.splice(i, 1);
              }
            }

            if (obj.predicted_position && obj.prediction_reliability === 'reliable') {
              const exists = updatedPending.some((p) => p.track_id === obj.track_id);
              if (!exists) {
                updatedPending.push({
                  track_id: obj.track_id,
                  method: predictionMethod,
                  predicted: obj.predicted_position,
                  target_t: now + (obj.prediction_horizon_sec || predictionHorizon),
                });
              }
            }
          });

          setPendingForecasts(updatedPending);
          if (newEvaluations.length > 0) {
            setTrajectoryEvaluations((prev) => [...prev, ...newEvaluations]);
          }
        }

        // Record observation in active experiment
        if (isRecording && currentSession) {
          setCurrentSession((prev) => ({
            ...prev,
            duration_sec: Math.round(now - prev.start_time),
            records: [
              ...prev.records,
              {
                timestamp: now,
                tracked_objects: result.tracked_objects,
                detections: result.detections,
                wave_analysis: result.wave_analysis,
                camera_motion: result.camera_motion,
              },
            ],
          }));
        }
      } catch (err) {
        setErrorMessage(err.message);
      } finally {
        if (isStaticImage) {
          setIsProcessing(false);
        }
      }
    },
    [predictionHorizon, predictionMethod, pendingForecasts, isRecording, currentSession]
  );

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
          isRecording={isRecording}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          currentSession={currentSession}
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
