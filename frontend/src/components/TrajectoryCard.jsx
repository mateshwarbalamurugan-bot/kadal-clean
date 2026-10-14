import React from 'react';

export default function TrajectoryCard({
  predictionMethod,
  setPredictionMethod,
  predictionHorizon,
  setPredictionHorizon,
  trajectoryEvaluations = [],
}) {
  return (
    <div className="card trajectory-card">
      <div className="card-header">
        <h2>Object Trajectory Prediction & Error Evaluation</h2>
      </div>

      <div className="trajectory-settings-row">
        <div className="setting-item">
          <label>Prediction Method:</label>
          <div className="radio-options">
            <label>
              <input
                type="radio"
                name="traj_method"
                value="constant_velocity"
                checked={predictionMethod === 'constant_velocity'}
                onChange={(e) => setPredictionMethod(e.target.value)}
              />
              Baseline Constant-Velocity
            </label>
            <label>
              <input
                type="radio"
                name="traj_method"
                value="wave_informed"
                checked={predictionMethod === 'wave_informed'}
                onChange={(e) => setPredictionMethod(e.target.value)}
              />
              Experimental Wave-Informed
            </label>
          </div>
        </div>

        <div className="setting-item">
          <label>Prediction Horizon:</label>
          <select
            value={predictionHorizon}
            onChange={(e) => setPredictionHorizon(parseFloat(e.target.value))}
          >
            <option value={1.0}>1.0 second</option>
            <option value={1.5}>1.5 seconds</option>
            <option value={2.0}>2.0 seconds</option>
            <option value={3.0}>3.0 seconds</option>
          </select>
        </div>
      </div>

      <div className="trajectory-eval-section">
        <h3>Empirical Prediction Error Log (Elapsed Forecasts)</h3>
        {trajectoryEvaluations.length === 0 ? (
          <p className="subtext">
            No trajectory verification cycles completed yet. Errors are automatically calculated
            when predicted future timestamps match subsequent observed positions.
          </p>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Method</th>
                  <th>Predicted (x, y)</th>
                  <th>Observed (x, y)</th>
                  <th>Euclidean Error (norm)</th>
                </tr>
              </thead>
              <tbody>
                {trajectoryEvaluations.slice(-5).map((ev, i) => (
                  <tr key={i}>
                    <td>#{ev.track_id}</td>
                    <td><code>{ev.method}</code></td>
                    <td>({ev.predicted[0].toFixed(2)}, {ev.predicted[1].toFixed(2)})</td>
                    <td>({ev.observed[0].toFixed(2)}, {ev.observed[1].toFixed(2)})</td>
                    <td>
                      <span className={ev.error < 0.05 ? 'text-success' : 'text-warning'}>
                        {ev.error.toFixed(4)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="research-disclaimer">
        <strong>Modularity Note:</strong> The baseline constant-velocity model serves as a control group.
        The wave-informed model couples surface flow vectors with object momentum to evaluate whether
        wave motion improves short-term drift forecast accuracy.
      </div>
    </div>
  );
}
