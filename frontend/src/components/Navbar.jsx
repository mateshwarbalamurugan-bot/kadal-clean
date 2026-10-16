import React from 'react';

export default function Navbar({ backendConnected, isCustomModel, isBrowserModelReady, isBrowserModelLoading }) {
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
          <span className={`status-indicator ${backendConnected || isBrowserModelReady || isBrowserModelLoading ? 'online' : 'offline'}`}>
            <span className="status-dot"></span>
            {isBrowserModelReady
              ? 'Browser AI Online'
              : isBrowserModelLoading
                ? 'Loading Browser AI'
                : backendConnected
                  ? (isCustomModel ? 'Custom AI Model Online' : 'Server AI Online')
                  : 'Browser AI Ready'}
          </span>
        </div>
      </div>
    </header>
  );
}
