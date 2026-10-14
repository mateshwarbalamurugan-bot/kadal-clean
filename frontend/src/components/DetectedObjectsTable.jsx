import React from 'react';

export default function DetectedObjectsTable({ trackedObjects = [] }) {
  return (
    <div className="card table-card">
      <div className="card-header">
        <h2>Detected Floating Objects & Motion History</h2>
        <span className="count-badge">{trackedObjects.length} active tracks</span>
      </div>

      {trackedObjects.length === 0 ? (
        <div className="empty-state-message">
          No supported objects detected.
          <span className="subtext">
            Ensure objects are floating in the illuminated water area and the detector is active.
          </span>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Track ID</th>
                <th>Class</th>
                <th>Travelled From</th>
                <th>Navigating Towards</th>
                <th>Speed (norm/s)</th>
                <th>Duration</th>
                <th>Confidence</th>
                <th>Reliability</th>
              </tr>
            </thead>
            <tbody>
              {trackedObjects.map((obj) => (
                <tr key={obj.track_id}>
                  <td><strong>#{obj.track_id}</strong></td>
                  <td>
                    <code>{obj.class_name}</code>
                    {obj.is_litter_candidate && (
                      <span className="badge badge-warning" style={{ marginLeft: '4px' }}>Litter</span>
                    )}
                  </td>
                  <td>
                    <span className="origin-tag" style={{ color: '#38bdf8' }}>
                      {obj.travelled_from || 'Initial Entry'}
                    </span>
                  </td>
                  <td>
                    <span className="heading-tag" style={{ color: '#facc15' }}>
                      {obj.navigating_towards || 'Calculating...'}
                    </span>
                  </td>
                  <td>{obj.speed ? obj.speed.toFixed(3) : '0.000'}</td>
                  <td>{obj.track_duration_sec.toFixed(1)}s</td>
                  <td>{(obj.confidence * 100).toFixed(0)}%</td>
                  <td>
                    <span className={`status-tag tag-${obj.prediction_reliability || 'tentative'}`}>
                      {obj.prediction_reliability || 'insufficient_history'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
