import React, { useState } from 'react';

export default function ModelStatusCard({ modelStatus, onReloadModel }) {
  const [reloading, setReloading] = useState(false);

  const handleReload = async () => {
    setReloading(true);
    try {
      await onReloadModel();
    } finally {
      setReloading(false);
    }
  };

  const isCustom = modelStatus?.is_custom_trained;

  return (
    <div className="card model-card">
      <div className="card-header">
        <h2>AI Model Architecture & Runtime Status</h2>
        <button
          className="btn btn-sm btn-outline"
          onClick={handleReload}
          disabled={reloading}
        >
          {reloading ? 'Reloading...' : 'Reload Model Weights'}
        </button>
      </div>

      <div className="model-details-grid">
        <div className="detail-item">
          <span className="detail-label">Active Model:</span>
          <span className="detail-value">{modelStatus?.model_name || 'Loading...'}</span>
        </div>

        <div className="detail-item">
          <span className="detail-label">Model Provenance:</span>
          <span className="detail-value">
            {isCustom ? (
              <span className="badge badge-success">Custom-Trained Clean Kadal Model</span>
            ) : (
              <span className="badge badge-warning">Generic Pretrained Baseline (COCO)</span>
            )}
          </span>
        </div>

        <div className="detail-item">
          <span className="detail-label">Weights Source:</span>
          <span className="detail-value"><code>{modelStatus?.weights_path || 'None'}</code></span>
        </div>

        <div className="detail-item">
          <span className="detail-label">Compute Device:</span>
          <span className="detail-value"><code>{modelStatus?.device || 'cpu'}</code></span>
        </div>
      </div>

      <div className="status-message-box">
        <strong>Runtime Status:</strong> {modelStatus?.status_message || 'Initializing model loader...'}
      </div>

      <div className="classes-section">
        <h3>Supported Target Classes ({modelStatus?.supported_classes?.length || 0}):</h3>
        <div className="classes-chips">
          {modelStatus?.supported_classes?.slice(0, 15).map((cls, i) => (
            <span
              key={i}
              className={`chip ${
                cls.includes('bottle') || cls.includes('cup') || cls.includes('wrapper') || cls.includes('bag')
                  ? 'chip-litter'
                  : 'chip-default'
              }`}
            >
              {cls}
            </span>
          ))}
          {modelStatus?.supported_classes?.length > 15 && (
            <span className="chip chip-more">
              +{modelStatus.supported_classes.length - 15} more COCO classes
            </span>
          )}
        </div>
      </div>

      <div className="limitations-box">
        <h4>Physical & Algorithmic Limitations:</h4>
        <ul>
          <li>
            <strong>Baseline vs Custom:</strong> The COCO baseline detector only recognizes generic <code>bottle</code> and <code>cup</code>.
            Plastic wrappers, plastic bags, bottle caps, and leaves require training via <code>ai_training/train.py</code>.
          </li>
          <li>
            <strong>Camera Bobbing:</strong> Uncompensated camera motion will skew optical surface flow. Always designate a stationary tub rim region.
          </li>
          <li>
            <strong>Wind Drift:</strong> Wind is not measured by the camera. Manual wind notes may be recorded in the wave card.
          </li>
        </ul>
      </div>
    </div>
  );
}
