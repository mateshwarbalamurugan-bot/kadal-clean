import React, { useState } from 'react';

export default function WaveAnalysisCard({
  waveData,
  cameraMotion,
  manualWind,
  onUpdateManualWind,
}) {
  const [editingWind, setEditingWind] = useState(false);
  const [windInput, setWindInput] = useState(manualWind || '');

  const wave = waveData || {
    dominant_direction_deg: null,
    vector: [0.0, 0.0],
    magnitude: 0.0,
    usable_measurements: 0,
    reliability: 'insufficient_data',
    camera_compensation_status: 'unavailable',
    disclaimer: 'No wave analysis data available.',
    wind_direction: 'Not measured (camera-only system)',
  };

  const cam = cameraMotion || {
    dx: 0.0,
    dy: 0.0,
    rotation_deg: 0.0,
    status: 'unavailable',
    tracked_features: 0,
  };

  const handleSaveWind = (e) => {
    e.preventDefault();
    onUpdateManualWind(windInput);
    setEditingWind(false);
  };

  return (
    <div className="card wave-card">
      <div className="card-header">
        <h2>Water Wave-Pattern Motion Analysis</h2>
        <span className={`status-tag tag-${wave.reliability}`}>
          {wave.reliability === 'reliable' ? 'Reliable Flow' : wave.reliability === 'low_confidence' ? 'Low Confidence' : 'Insufficient Data'}
        </span>
      </div>

      <div className="metric-grid">
        <div className="metric-box">
          <span className="metric-label">Dominant Direction</span>
          <span className="metric-value">
            {wave.dominant_direction_deg !== null && wave.dominant_direction_deg !== undefined
              ? `${wave.dominant_direction_deg.toFixed(1)}°`
              : '—'}
          </span>
          <span className="metric-subtext">Optical surface propagation</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Motion Vector</span>
          <span className="metric-value">
            {wave.vector ? `[${wave.vector[0].toFixed(3)}, ${wave.vector[1].toFixed(3)}]` : '[0, 0]'}
          </span>
          <span className="metric-subtext">Normalized (vx, vy)</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Usable Flow Vectors</span>
          <span className="metric-value">{wave.usable_measurements || 0}</span>
          <span className="metric-subtext">Threshold: ≥ 15 vectors</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Camera Motion (Bobbing)</span>
          <span className="metric-value">
            {cam.status === 'successful' ? 'Compensated' : cam.status === 'uncertain' ? 'Uncertain' : 'Unavailable'}
          </span>
          <span className="metric-subtext">
            dx: {cam.dx.toFixed(4)}, dy: {cam.dy.toFixed(4)} ({cam.tracked_features} pts)
          </span>
        </div>
      </div>

      {/* Wind Observation Section */}
      <div className="wind-observation-section">
        <div className="wind-header">
          <strong>Wind Observation:</strong>
          <span>{wave.wind_direction}</span>
          {!editingWind ? (
            <button className="btn-link" onClick={() => setEditingWind(true)}>
              [Edit Manual Input]
            </button>
          ) : (
            <button className="btn-link" onClick={() => setEditingWind(false)}>
              [Cancel]
            </button>
          )}
        </div>

        {editingWind && (
          <form className="wind-input-form" onSubmit={handleSaveWind}>
            <input
              type="text"
              placeholder="e.g. North-East from room window, Gentle breeze"
              value={windInput}
              onChange={(e) => setWindInput(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-primary">Save Observation</button>
          </form>
        )}
      </div>

      <div className="research-disclaimer">
        <strong>Physical Note:</strong> {wave.disclaimer}
      </div>
    </div>
  );
}
