import React from 'react';

export default function Header({ backendConnected, modelStatus }) {
  const isCustom = modelStatus?.is_custom_trained;

  return (
    <header className="app-header">
      <div className="header-top">
        <h1 className="project-title">
          Clean Kadal — AI-Based Floating Waste Detection and Water-Motion Analysis
        </h1>
        <div className="header-badges">
          <span className={`status-badge ${backendConnected ? 'badge-success' : 'badge-danger'}`}>
            Backend: {backendConnected ? 'Online' : 'Offline'}
          </span>
          <span className={`status-badge ${isCustom ? 'badge-primary' : 'badge-warning'}`}>
            Model: {isCustom ? 'Custom Clean Kadal' : 'Baseline COCO (Generic)'}
          </span>
        </div>
      </div>
      <p className="project-subtitle">
        Physical Boat-Mounted Camera Model · Real-Time Detection · Camera Motion Compensation · Wave Flow & Trajectory Prediction
      </p>
    </header>
  );
}
