import React from 'react';

export default function Navbar({ backendConnected, isCustomModel }) {
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand" onClick={() => scrollTo('home')}>
          <span className="brand-icon">🌊</span>
          <span className="brand-title">Clean Kadal</span>
        </div>

        <nav className="navbar-links">
          <button className="nav-link" onClick={() => scrollTo('home')}>Home</button>
          <button className="nav-link" onClick={() => scrollTo('demo')}>Live Demo</button>
          <button className="nav-link" onClick={() => scrollTo('results')}>Results</button>
        </nav>

        <div className="navbar-status">
          <span className={`status-indicator ${backendConnected ? 'online' : 'offline'}`}>
            <span className="status-dot"></span>
            {backendConnected
              ? (isCustomModel ? 'Custom AI Model Online' : 'Baseline AI Engine Online')
              : 'AI Engine Offline'}
          </span>
        </div>
      </div>
    </header>
  );
}
