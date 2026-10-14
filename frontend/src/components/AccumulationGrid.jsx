import React from 'react';

export default function AccumulationGrid({ accumulationData }) {
  const data = accumulationData || {
    grid: [
      [{ row: 0, col: 0, unique_objects_count: 0, total_dwell_time_sec: 0, classification: 'none', is_corner_or_wall: true },
       { row: 0, col: 1, unique_objects_count: 0, total_dwell_time_sec: 0, classification: 'none', is_corner_or_wall: true },
       { row: 0, col: 2, unique_objects_count: 0, total_dwell_time_sec: 0, classification: 'none', is_corner_or_wall: true }],
      [{ row: 1, col: 0, unique_objects_count: 0, total_dwell_time_sec: 0, classification: 'none', is_corner_or_wall: true },
       { row: 1, col: 1, unique_objects_count: 0, total_dwell_time_sec: 0, classification: 'none', is_corner_or_wall: false },
       { row: 1, col: 2, unique_objects_count: 0, total_dwell_time_sec: 0, classification: 'none', is_corner_or_wall: true }],
      [{ row: 2, col: 0, unique_objects_count: 0, total_dwell_time_sec: 0, classification: 'none', is_corner_or_wall: true },
       { row: 2, col: 1, unique_objects_count: 0, total_dwell_time_sec: 0, classification: 'none', is_corner_or_wall: true },
       { row: 2, col: 2, unique_objects_count: 0, total_dwell_time_sec: 0, classification: 'none', is_corner_or_wall: true }]
    ],
    summary_status: 'insufficient_data',
    message: 'Insufficient data to identify accumulation. Run experiment with tracked floating objects.',
    hotspots_count: 0,
    dominant_zone: null,
  };

  const getCellClass = (cell) => {
    switch (cell.classification) {
      case 'observed_accumulation':
        return 'cell-accumulation';
      case 'tentative_candidate':
        return 'cell-candidate';
      case 'predicted_accumulation':
        return 'cell-predicted';
      default:
        return 'cell-normal';
    }
  };

  const getCellBadge = (cell) => {
    switch (cell.classification) {
      case 'observed_accumulation':
        return <span className="badge badge-danger">Hotspot</span>;
      case 'tentative_candidate':
        return <span className="badge badge-warning">Candidate</span>;
      case 'predicted_accumulation':
        return <span className="badge badge-primary">Predicted</span>;
      default:
        return null;
    }
  };

  return (
    <div className="card accumulation-card">
      <div className="card-header">
        <h2>Water Surface Accumulation-Zone Grid (3×3)</h2>
        <span className="count-badge">{data.hotspots_count} observed hotspot(s)</span>
      </div>

      <p className="section-description">
        Divides the selected water area into 9 zones to monitor dwell times, object concentration,
        and tub wall/corner accumulation traps.
      </p>

      {data.summary_status === 'insufficient_data' && (
        <div className="notice-box">
          <strong>Notice:</strong> {data.message}
        </div>
      )}

      <div className="grid-3x3-container">
        {data.grid.map((rowCells, rIdx) => (
          <div key={`r-${rIdx}`} className="grid-3x3-row">
            {rowCells.map((cell, cIdx) => (
              <div
                key={`c-${rIdx}-${cIdx}`}
                className={`grid-cell ${getCellClass(cell)}`}
              >
                <div className="cell-header">
                  <span className="cell-coord">[{rIdx + 1}, {cIdx + 1}]</span>
                  {cell.is_corner_or_wall && <span className="cell-wall-tag">Wall</span>}
                </div>
                <div className="cell-metric">
                  <strong>{cell.unique_objects_count}</strong> objs
                </div>
                <div className="cell-submetric">
                  {cell.total_dwell_time_sec.toFixed(1)}s dwell
                </div>
                <div className="cell-status">
                  {getCellBadge(cell)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="grid-legend">
        <span><span className="legend-box legend-danger"></span> Observed Accumulation (≥2 objs & ≥5s)</span>
        <span><span className="legend-box legend-warning"></span> Tentative Candidate</span>
        <span><span className="legend-box legend-primary"></span> Predicted Accumulation</span>
      </div>

      {data.dominant_zone && (
        <div className="summary-banner">
          <strong>Primary Accumulation Zone:</strong> {data.dominant_zone}
        </div>
      )}
    </div>
  );
}
