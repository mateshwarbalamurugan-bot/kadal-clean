import React from 'react';

export default function ErrorBanner({ errors = [], warnings = [], onDismissError }) {
  if (errors.length === 0 && warnings.length === 0) return null;

  return (
    <div className="error-banner-container">
      {errors.map((err, idx) => (
        <div key={`err-${idx}`} className="alert-box alert-error">
          <div className="alert-content">
            <strong>System Error:</strong> {err}
          </div>
          {onDismissError && (
            <button className="btn-dismiss" onClick={() => onDismissError(idx)}>
              ✕
            </button>
          )}
        </div>
      ))}

      {warnings.map((warn, idx) => (
        <div key={`warn-${idx}`} className="alert-box alert-warning">
          <div className="alert-content">
            <strong>Research Notice:</strong> {warn}
          </div>
        </div>
      ))}
    </div>
  );
}
