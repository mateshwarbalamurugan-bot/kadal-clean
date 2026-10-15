import React from 'react';

const CHART_WIDTH = 600;
const CHART_HEIGHT = 170;
const PADDING = { left: 30, right: 12, top: 12, bottom: 28 };

function chartPoints(values, maxValue) {
  if (!values.length) return '';
  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const denom = Math.max(values.length - 1, 1);
  return values.map((value, index) => {
    const x = PADDING.left + (index / denom) * innerWidth;
    const y = PADDING.top + innerHeight - (value / maxValue) * innerHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function TrendChart({ title, values, stroke, unit, description }) {
  const usableValues = values.filter((value) => Number.isFinite(value));
  const maxValue = Math.max(1, ...usableValues);
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const gridYs = [0, 0.5, 1].map((fraction) => PADDING.top + innerHeight * fraction);
  const lastValue = usableValues.length ? usableValues[usableValues.length - 1] : null;

  return (
    <div className="trend-chart-card">
      <div className="trend-chart-heading">
        <h3>{title}</h3>
        <strong>{lastValue == null ? '—' : `${lastValue.toFixed(2)} ${unit}`}</strong>
      </div>
      <svg className="trend-chart-svg" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`${title}, last ${values.length} live observations`}>
        {gridYs.map((y, index) => (
          <line key={index} x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={y} y2={y} className="trend-grid-line" />
        ))}
        <text x="3" y={PADDING.top + 4} className="trend-axis-label">{maxValue.toFixed(maxValue < 10 ? 1 : 0)}</text>
        <text x="18" y={CHART_HEIGHT - PADDING.bottom + 4} className="trend-axis-label">0</text>
        {usableValues.length > 1 && (
          <polyline points={chartPoints(usableValues, maxValue)} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {usableValues.length === 1 && (() => {
          const [x, y] = chartPoints(usableValues, maxValue).split(',').map(Number);
          return <circle cx={x} cy={y} r="4" fill={stroke} />;
        })()}
        {usableValues.length === 0 && <text x={CHART_WIDTH / 2} y={CHART_HEIGHT / 2} textAnchor="middle" className="trend-empty-label">No measurements yet</text>}
      </svg>
      <p>{description}</p>
    </div>
  );
}

export default function TelemetryHistory({ history = [] }) {
  const latest = history[history.length - 1];
  const first = history[0];
  const detectionCounts = history.map((item) => item.detectionCount);
  const waveMagnitudes = history.map((item) => item.waveMagnitude);
  const firstLabel = first?.timestamp ? new Date(first.timestamp * 1000).toLocaleTimeString() : '—';
  const latestLabel = latest?.timestamp ? new Date(latest.timestamp * 1000).toLocaleTimeString() : '—';

  return (
    <div className="card telemetry-history-card">
      <div className="card-header">
        <h2>Recent Live Observation Trends</h2>
        <span className="count-badge">{history.length} / 120 frames</span>
      </div>
      <p className="section-description">
        Client-side rolling history from real live inference results. It keeps the newest 120 processed frames in this browser session.
      </p>
      <div className="trend-chart-grid">
        <TrendChart
          title="Litter candidates per frame"
          values={detectionCounts}
          stroke="#2dd4bf"
          unit="objects"
          description="Current-frame detections marked by the loaded model; the same visible object may appear in later frames."
        />
        <TrendChart
          title="Reliable surface optical-flow magnitude"
          values={waveMagnitudes}
          stroke="#60a5fa"
          unit="relative"
          description="Only reliable optical-flow measurements are plotted. Relative image motion is not physical current speed or wave height."
        />
      </div>
      <div className="trend-history-footnote">
        Observation window: {firstLabel}–{latestLabel}. Visible track count is returned per frame; track IDs are approximate and are not summed as unique lifetime objects.
      </div>
    </div>
  );
}
