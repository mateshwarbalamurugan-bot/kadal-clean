import React from 'react';

export default function MovementInsights({ analysisData }) {
  const waveData = analysisData?.wave_analysis;
  const trackedCount = analysisData?.tracked_objects?.length || 0;

  return (
    <section className="insights-section">
      <div className="section-header">
        <h2 className="section-title">Movement & Wave Insights</h2>
        <p className="section-subtitle">
          Optical estimates from the camera view; directions are relative to the frame, not compass bearings.
        </p>
      </div>

      <div className="insights-grid">
        {/* Insight 1: Object Tracking */}
        <div className="insight-card">
          <div className="insight-header">
            <span className="insight-icon">🔍</span>
            <h3>Object Tracking</h3>
          </div>
          <p className="insight-text">
            Associates likely litter detections across consecutive frames and estimates image-space motion. Track IDs are approximate, not guaranteed identities.
          </p>
          <div className="insight-metric">
            Status: <strong>{trackedCount > 0 ? `${trackedCount} Active Track(s)` : 'Awaiting Objects'}</strong>
          </div>
        </div>

        {/* Insight 2: Wave Analysis */}
        <div className="insight-card">
          <div className="insight-header">
            <span className="insight-icon">🌊</span>
            <h3>Wave Analysis</h3>
          </div>
          <p className="insight-text">
            Estimates visible surface-pattern motion from consecutive frames. Camera compensation can be uncertain under glare, reflections, or camera shake.
          </p>
          <div className="insight-metric">
            Dominant image-space direction: <strong>{waveData?.dominant_direction_deg !== null && waveData?.dominant_direction_deg !== undefined ? `${waveData.dominant_direction_deg.toFixed(0)}°` : 'No estimate'}</strong>
          </div>
        </div>

        {/* Insight 3: Trajectory Prediction */}
        <div className="insight-card">
          <div className="insight-header">
            <span className="insight-icon">➡️</span>
            <h3>Trajectory Prediction</h3>
          </div>
          <p className="insight-text">
            Estimates short-term drift direction 1 to 2 seconds into the future based on recorded velocity history and surface motion.
          </p>
          <div className="insight-metric">
            Horizon: <strong>1.5s Forecast Window</strong>
          </div>
        </div>

        {/* Insight 4: Accumulation Analysis */}
        <div className="insight-card">
          <div className="insight-header">
            <span className="insight-icon">🧱</span>
            <h3>Accumulation Analysis</h3>
          </div>
          <p className="insight-text">
            Summarizes observed dwell time in a normalized image grid; it does not identify real shorelines or physical barriers.
          </p>
          <div className="insight-metric">
            Threshold: <strong>≥ 5.0s Dwell Time</strong>
          </div>
        </div>
      </div>

      <div className="insights-disclaimer">
        <strong>Scientific notice:</strong> Direction, speed, and drift forecasts are image-space estimates. They do not provide compass bearing, physical distance, current speed, or guaranteed ocean-drift outcomes.
      </div>
    </section>
  );
}
