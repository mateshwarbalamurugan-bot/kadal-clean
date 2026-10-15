import React from 'react';

export default function ResultsSection({ analysisData, isSampleMode }) {
  const detections = (analysisData?.detections || []).filter((detection) => detection.is_litter_candidate);
  const trackedObjects = analysisData?.tracked_objects || [];
  const wasteCount = detections.length;

  // Count only model outputs explicitly marked as litter candidates.
  const classCounts = detections.reduce((counts, detection) => {
    counts[detection.class_name] = (counts[detection.class_name] || 0) + 1;
    return counts;
  }, {});
  const uniqueClasses = Object.keys(classCounts);
  const isStaticResult = analysisData?.warnings?.some((warning) => warning.startsWith('Static image:'));

  // Accumulation assessment from backend analysis
  const accumSummary = analysisData?.accumulation_summary;
  let accumulationText = !analysisData ? 'No analysis yet' : isStaticResult ? 'Not measured from a still image' : 'No accumulation summary yet';
  let accumulationSubtext = !analysisData
    ? 'Start the camera or analyze an image to see detections.'
    : isStaticResult
      ? 'Repeated live tracks over time are required; no geographic location is inferred.'
      : 'Keep the camera running to build tracked observations.';

  if (accumSummary) {
    if (accumSummary.dominant_zone) {
      accumulationText = accumSummary.dominant_zone;
      accumulationSubtext = `${accumSummary.hotspots_count} observed accumulation area(s)`;
    } else if (accumSummary.summary_status === 'insufficient_data') {
      accumulationText = 'Insufficient Observation History';
      accumulationSubtext = 'Repeated tracks over time are required; no geographic location is inferred.';
    }
  }

  // Derive collective Direction Insights
  let dominantNavigatingTowards = isStaticResult ? 'Not measured from a still image' : 'Waiting for a tracked target';
  let dominantTravelledFrom = isStaticResult ? 'Not measured from a still image' : 'Waiting for track history';

  if (trackedObjects.length > 0) {
    const movingObj = trackedObjects.find((o) => o.speed > 0.005) || trackedObjects[0];
    if (movingObj) {
      dominantNavigatingTowards = movingObj.navigating_towards || 'Calculating destination vector...';
      dominantTravelledFrom = movingObj.travelled_from || 'Calculating entry point...';
    }
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

      {/* Primary Overview Cards */}
      <div className="results-grid">
        {/* Card 1: Waste Detected */}
        <div className="result-card">
          <div className="result-card-header">
            <span className="card-icon">🗑️</span>
            <span className="card-badge">{wasteCount > 0 ? 'Active' : 'Standby'}</span>
          </div>
          <div className="result-value">{wasteCount}</div>
          <div className="result-title">Waste Detected</div>
          <div className="result-description">
            {wasteCount === 1
              ? '1 floating waste candidate detected in view'
              : `${wasteCount} floating waste items detected in view`}
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
                uniqueClasses.map((cls) => (
                  <span key={cls} className="type-chip">
                  {cls.replace('_', ' ')} × {classCounts[cls]}
                </span>
              ))
            ) : (
              <span className="type-chip-none">No categories identified yet</span>
            )}
          </div>
          <div className="result-title">Waste Types</div>
          <div className="result-description">
            Categories recognized by loaded lightweight detector
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
            <div className="direction-badge-tag tag-from">📍 Observed From</div>
            <span className="direction-compass-icon">Image-space origin</span>
          </div>
          <div className="direction-highlight-text">
            {dominantTravelledFrom}
          </div>
          <div className="direction-card-title">Estimated Origin in Frame</div>
          <p className="direction-card-desc">
            Shows the first observed image location and relative frame direction. It does not identify a physical entry point, upstream flow, or compass bearing.
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
            <div className="direction-badge-tag tag-towards">➡️ Image-Space Motion</div>
            <span className="direction-compass-icon">Short-term estimate</span>
          </div>
          <div className="direction-highlight-text">
            {dominantNavigatingTowards}
          </div>
          <div className="direction-card-title">Estimated Motion in Frame</div>
          <p className="direction-card-desc">
            Projects recent image-space motion, optionally using a reliable surface-flow estimate. This is not a real-world route, current speed, or physical boundary prediction.
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
