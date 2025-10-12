// www/js/apiClient.js
import { API_BASE } from './constants.js';

const TIMEOUT_MS = 8000;

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

export async function fetchForecast(lat, lon) {
  const url = `${API_BASE}/forecast?lat=${lat}&lon=${lon}`;
  const res = await withTimeout(fetch(url, { mode: 'cors', credentials: 'omit' }));
  if (!res.ok) throw new Error(`forecast ${res.status}`);
  return res.json();
}

export async function fetchNearestAir(lat, lon) {
  const url = `${API_BASE}/air/nearest?lat=${lat}&lon=${lon}`;
  const res = await withTimeout(fetch(url, { mode: 'cors', credentials: 'omit' }));
  if (!res.ok) throw new Error(`nearest ${res.status}`);
  return res.json();
}
