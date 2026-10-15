import React from 'react';

export default function ResultsSection({ analysisData, isSampleMode }) {
  const detections = analysisData?.detections || [];
  const trackedObjects = analysisData?.tracked_objects || [];
  const litterDetections = detections.filter((d) => d.is_litter_candidate);
  const wasteCount = litterDetections.length;
  const isMarineGarbageModel = (analysisData?.model_status?.supported_classes || [])
    .some((name) => String(name).toLowerCase() === 'garbage');
  const modelWarnings = (analysisData?.warnings || []).filter((warning) =>
    /Object detection inference failed|AI model not loaded/i.test(warning)
  );

  // Extract unique waste classes
  const uniqueClasses = Array.from(new Set(litterDetections.map((d) => d.class_name)));

  // Accumulation assessment from backend analysis
  const accumSummary = analysisData?.accumulation_summary;
  let accumulationText = 'Monitoring water surface...';
  let accumulationSubtext = 'Waiting for object motion history';

  if (accumSummary) {
    if (accumSummary.dominant_zone) {
      accumulationText = accumSummary.dominant_zone;
      accumulationSubtext = `${accumSummary.hotspots_count} observed accumulation area(s)`;
    } else if (accumSummary.summary_status === 'insufficient_data') {
      accumulationText = 'No Persistent Accumulation Yet';
      accumulationSubtext = 'Items still in active transit';
    }
  }

  // Derive collective Direction Insights
  let dominantNavigatingTowards = 'Monitoring heading...';
  let dominantTravelledFrom = 'Monitoring origin entry...';

  if (trackedObjects.length > 0) {
    const movingObj = trackedObjects.find((o) => o.speed > 0.005) || trackedObjects[0];
    if (movingObj) {
      dominantNavigatingTowards = movingObj.navigating_towards || 'Calculating destination vector...';
      dominantTravelledFrom = movingObj.travelled_from || 'Calculating entry point...';
    }
  } else if (isSampleMode) {
    dominantNavigatingTowards = 'Heading South-East (SE) ➔ Towards Right Wall';
    dominantTravelledFrom = 'From North-West (NW) · Top-Left Wave Generation Side';
  }

  return (
    <section id="results" className="results-section">
      <div className="section-header">
        <h2 className="section-title">Detection & Motion Results</h2>
        <p className="section-subtitle">
          Real-time AI metrics extracted from current computer vision inference.
          {isSampleMode && <span className="sample-label"> (Demonstration Data)</span>}
        </p>
      </div>

      {modelWarnings.length > 0 && (
        <div className="demo-alert" role="alert">
          <span className="alert-icon">⚠️</span>
          <span className="alert-text">{modelWarnings.join(' ')}</span>
        </div>
      )}

      {/* Primary Overview Cards */}
      <div className="results-grid">
        {/* Card 1: Litter / floating-garbage candidates */}
        <div className="result-card">
          <div className="result-card-header">
            <span className="card-icon">🗑️</span>
            <span className="card-badge">{wasteCount > 0 ? 'Active' : 'Standby'}</span>
          </div>
          <div className="result-value">{wasteCount}</div>
          <div className="result-title">{isMarineGarbageModel ? 'Floating Garbage Candidates' : 'Waste Detected'}</div>
          <div className="result-description">
            {wasteCount === 1
              ? '1 floating-litter candidate detected in view'
              : `${wasteCount} floating-litter candidates detected in view`}
          </div>
        </div>

        {/* Card 2: Waste Types */}
        <div className="result-card">
          <div className="result-card-header">
            <span className="card-icon">🏷️</span>
            <span className="card-badge">{uniqueClasses.length} Type(s)</span>
          </div>
          <div className="result-types-container">
            {uniqueClasses.length > 0 ? (
              uniqueClasses.map((cls, idx) => (
                <span key={idx} className="type-chip">
                  {cls.replace('_', ' ')}
                </span>
              ))
            ) : (
              <span className="type-chip-none">No categories identified yet</span>
            )}
          </div>
          <div className="result-title">{isMarineGarbageModel ? 'Detected Category' : 'Waste Types'}</div>
          <div className="result-description">
            {isMarineGarbageModel
              ? 'The trained model has one generic garbage class; it does not infer bottle, bag, or material subtypes.'
              : 'Litter-candidate categories recognized by the loaded detector'}
          </div>
        </div>

        {/* Card 3: Accumulation Zones */}
        <div className="result-card">
          <div className="result-card-header">
            <span className="card-icon">📍</span>
            <span className="card-badge">Surface Analysis</span>
          </div>
          <div className="result-value-text">{accumulationText}</div>
          <div className="result-title">Accumulation Zones</div>
          <div className="result-description">{accumulationSubtext}</div>
        </div>
      </div>

      {/* Dedicated Section: Object Directional Kinematics */}
      <div className="direction-sections-grid">
        {/* Section 1: Object Travelled From Which Direction */}
        <div className="direction-card direction-from-card">
          <div className="direction-card-header">
            <div className="direction-badge-tag tag-from">📍 Travelled From</div>
            <span className="direction-compass-icon">🧭 Origin Entry</span>
          </div>
          <div className="direction-highlight-text">
            {dominantTravelledFrom}
          </div>
          <div className="direction-card-title">Where Object Travelled From</div>
          <p className="direction-card-desc">
            Traces the historical trajectory back to the initial entry point where the object first appeared (e.g. hand-wave disturbance or upstream inflow side).
          </p>

          {trackedObjects.length > 0 && (
            <div className="direction-object-list">
              {trackedObjects.slice(0, 3).map((obj) => (
                <div key={obj.track_id} className="direction-object-item">
                  <span className="item-id">#{obj.track_id} {obj.class_name}</span>
                  <span className="item-detail">{obj.travelled_from || 'Entry recorded'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Object Navigating Towards Which Direction */}
        <div className="direction-card direction-towards-card">
          <div className="direction-card-header">
            <div className="direction-badge-tag tag-towards">🧭 Navigating Towards</div>
            <span className="direction-compass-icon">➡️ Drift Heading</span>
          </div>
          <div className="direction-highlight-text">
            {dominantNavigatingTowards}
          </div>
          <div className="direction-card-title">Where Object Is Navigating Towards</div>
          <p className="direction-card-desc">
            Projects current kinematic velocity vectors and surface wave drift to predict the immediate target zone (e.g. tub wall or containment boundary).
          </p>

          {trackedObjects.length > 0 && (
            <div className="direction-object-list">
              {trackedObjects.slice(0, 3).map((obj) => (
                <div key={obj.track_id} className="direction-object-item">
                  <span className="item-id">#{obj.track_id} {obj.class_name}</span>
                  <span className="item-detail">{obj.navigating_towards || 'Forecasting trajectory'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
