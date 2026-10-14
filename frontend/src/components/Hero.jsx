import React from 'react';

export default function Hero({ onStartDemo }) {
  return (
    <section id="home" className="hero-section">
      <div className="hero-content">
        <div className="hero-pill">Hackathon Prototype · Computer Vision in Aquatic Environments</div>
        <h1 className="hero-title">
          Clean Kadal — AI-Powered Ocean Waste Detection
        </h1>
        <p className="hero-subtitle">
          Detect floating waste, track its movement, and identify potential waste accumulation areas using computer vision.
        </p>

        <div className="hero-actions">
          <button className="btn btn-primary btn-large" onClick={onStartDemo}>
            Start Demo ↓
          </button>
        </div>

        <div className="hero-highlights">
          <div className="highlight-item">
            <span className="highlight-icon">🎯</span>
            <span className="highlight-text">Real-Time Object Detection</span>
          </div>
          <div className="highlight-item">
            <span className="highlight-icon">🌊</span>
            <span className="highlight-text">Wave Motion & Drift Tracking</span>
          </div>
          <div className="highlight-item">
            <span className="highlight-icon">📍</span>
            <span className="highlight-text">Accumulation Hotspot Mapping</span>
          </div>
        </div>
      </div>
    </section>
  );
}
