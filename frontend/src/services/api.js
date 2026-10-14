/**
 * Clean Kadal — Backend API Service
 * Configured via VITE_API_BASE_URL (defaults to http://localhost:8000)
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    throw new Error(`Backend unavailable at ${API_BASE}. Ensure the Python backend is running.`);
  }
}

export async function getModelStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/model/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    throw new Error(`Failed to fetch model status: ${err.message}`);
  }
}

export async function reloadModelWeights() {
  try {
    const res = await fetch(`${API_BASE}/api/model/reload`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    throw new Error(`Failed to reload model: ${err.message}`);
  }
}

export async function resetBackendTracker() {
  try {
    const res = await fetch(`${API_BASE}/api/tracker/reset`, { method: 'POST' });
    return await res.json();
  } catch (err) {
    console.warn('Tracker reset warning:', err);
  }
}

export async function sendFrameForAnalysis(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/analyze/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Frame analysis error: HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    throw new Error(`Analysis request failed: ${err.message}`);
  }
}

export async function predictTrajectory(payload) {
  const res = await fetch(`${API_BASE}/api/analyze/trajectory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Trajectory prediction failed');
  }
  return await res.json();
}

export async function evaluateTrajectory(payload) {
  const res = await fetch(`${API_BASE}/api/analyze/trajectory/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Trajectory evaluation failed');
  return await res.json();
}

export async function analyzeAccumulation(payload) {
  const res = await fetch(`${API_BASE}/api/analyze/accumulation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Accumulation analysis failed');
  return await res.json();
}
