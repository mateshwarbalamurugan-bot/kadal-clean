/**
 * Clean Kadal — Backend API Service
 * Configured via VITE_API_BASE_URL. Local development defaults to localhost;
 * production builds require a deployed HTTPS backend URL.
 */

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
const API_BASE = configuredApiBase.replace(/\/+$/, '');

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function apiUrl(path) {
  if (!API_BASE && !import.meta.env.DEV) {
    throw new Error(
      'Backend URL is not configured. Set VITE_API_BASE_URL in Vercel to the public HTTPS URL of your deployed backend, then redeploy.'
    );
  }
  return `${API_BASE}${path}`;
}

export async function checkBackendHealth() {
  try {
    const res = await fetchWithTimeout(apiUrl('/health'), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    }, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    if (err.message?.includes('VITE_API_BASE_URL')) throw err;
    throw new Error(`Backend unavailable at ${API_BASE || 'the local Vite proxy'}. Ensure the Python backend is running.`);
  }
}

export async function getModelStatus() {
  try {
    const res = await fetchWithTimeout(apiUrl('/api/model/status'), {}, 10000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    throw new Error(`Failed to fetch model status: ${err.message}`);
  }
}

export async function reloadModelWeights() {
  try {
    const res = await fetchWithTimeout(apiUrl('/api/model/reload'), { method: 'POST' }, 90000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    throw new Error(`Failed to reload model: ${err.message}`);
  }
}

export async function resetBackendTracker() {
  try {
    const res = await fetchWithTimeout(apiUrl('/api/tracker/reset'), { method: 'POST' }, 10000);
    return await res.json();
  } catch (err) {
    console.warn('Tracker reset warning:', err);
  }
}

export async function sendFrameForAnalysis(payload) {
  try {
    const res = await fetchWithTimeout(apiUrl('/api/analyze/frame'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 30000);
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
  const res = await fetch(apiUrl('/api/analyze/trajectory'), {
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
  const res = await fetch(apiUrl('/api/analyze/trajectory/evaluate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Trajectory evaluation failed');
  return await res.json();
}

export async function analyzeAccumulation(payload) {
  const res = await fetch(apiUrl('/api/analyze/accumulation'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Accumulation analysis failed');
  return await res.json();
}
