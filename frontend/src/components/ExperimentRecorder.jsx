import React, { useState, useEffect } from 'react';
import { exportExperimentToCSV, exportExperimentToJSON } from '../utils/exportUtils';

export default function ExperimentRecorder({
  isRecording,
  onStartRecording,
  onStopRecording,
  currentSession,
}) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    let interval = null;
    if (isRecording) {
      interval = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSec(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  const recordCount = currentSession?.records?.length || 0;

  return (
    <div className="card recorder-card">
      <div className="card-header">
        <h2>Experiment Recording & Telemetry Export</h2>
        <span className={`pill ${isRecording ? 'pill-active' : 'pill-inactive'}`}>
          {isRecording ? `Recording (${elapsedSec}s)` : 'Standby'}
        </span>
      </div>

      <p className="section-description">
        Records high-resolution numerical logs (tracking IDs, normalized positions, velocities,
        camera motion, wave directions, and accumulation grids) for scientific evaluation.
      </p>

      <div className="recorder-stats-row">
        <div className="stat-box">
          <span className="stat-label">Experiment ID</span>
          <span className="stat-value">{currentSession ? currentSession.id : '—'}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Logged Observations</span>
          <span className="stat-value">{recordCount}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Session Duration</span>
          <span className="stat-value">{isRecording ? `${elapsedSec}s` : `${currentSession?.duration_sec || 0}s`}</span>
        </div>
      </div>

      <div className="recorder-actions-row">
        {!isRecording ? (
          <button className="btn btn-primary" onClick={onStartRecording}>
            Start Experiment Recording
          </button>
        ) : (
          <button className="btn btn-danger" onClick={onStopRecording}>
            Stop Recording
          </button>
        )}

        <button
          className="btn btn-secondary"
          onClick={() => exportExperimentToCSV(currentSession)}
          disabled={recordCount === 0 || isRecording}
        >
          Export CSV (Tabular Telemetry)
        </button>

        <button
          className="btn btn-secondary"
          onClick={() => exportExperimentToJSON(currentSession)}
          disabled={recordCount === 0 || isRecording}
        >
          Export JSON (Full Session Data)
        </button>
      </div>

      <div className="research-disclaimer">
        <strong>Privacy & Research Integrity:</strong> All experiment exports contain genuine measured
        telemetry recorded during your live session. No dummy values or simulated trajectories are generated.
      </div>
    </div>
  );
}
