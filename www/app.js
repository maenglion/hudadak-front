// /app.js
import { STANDARDS } from './js/standards.js';

const API_BASE = (window.__API_BASE__ ?? '').trim();
const NEAREST_URL  = (lat,lon)=> `${API_BASE}/nearest?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
const FORECAST_URL = (lat,lon,h=24)=> `${API_BASE}/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&horizon=${h}`;
const REVERSE_URL  = (lat,lon)=> `${API_BASE}/geo/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;

const OM_AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const AQ_KEYS = 'pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide';
const OM_WX = 'https://api.open-meteo.com/v1/forecast';

// 상태바는 고정
document.documentElement.style.setProperty('--mobile-status', 'rgba(51,51,51,.2)');

/* ──────────────────────────────
 * 1. 공통 유틸
 * ────────────────────────────── */
function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

async function getJSON(url, opt = {}) {
  const r = await fetch(url, { cache: 'no-store', ...opt });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// 4단계 텍스트
const LABEL = { 1: '좋음', 2: '보통', 3: '나쁨', 4: '매우나쁨' };

// 시간
function nowKSTHour() {
  const d = new Date();
  const tz = d.getTime() + (9 * 60 - d.getTimezoneOffset()) * 60000;
  const k = new Date(tz);
  k.setMinutes(0, 0, 0);
  return `${k.toISOString().slice(0, 13)}:${k.toISOString().slice(14, 16)}`;
}

// 4단계 단독 계산용
const gradePM10 = (v) =>
  v == null ? null : v <= 30 ? 1 : v <= 80 ? 2 : v <= 150 ? 3 : 4;
const gradePM25 = (v) =>
  v == null ? null : v <= 15 ? 1 : v <= 35 ? 2 : v <= 75 ? 3 : 4;

// “둘 중 더 나쁜 거” CAI
function caiGrade(pm10, pm25) {
  const g10 = gradePM10(pm10);
  const g25 = gradePM25(pm25);
  if (g10 == null && g25 == null) return null;
  return Math.max(g10 ?? g25, g25 ?? g10);
}

// STANDARDS.KOR 기준 4단계
function caiGradeKOR(pm10, pm25) {
  const b = STANDARDS.KOR.breaks;
  const g10 =
    pm10 == null
      ? 1
      : pm10 <= b.pm10[0]
      ? 1
      : pm10 <= b.pm10[1]
      ? 2
      : pm10 <= b.pm10[2]
      ? 3
      : 4;
  const g25 =
    pm25 == null
      ? 1
      : pm25 <= b.pm25[0]
      ? 1
      : pm25 <= b.pm25[1]
      ? 2
      : pm25 <= b.pm25[2]
      ? 3
      : 4;
  return Math.max(g10, g25);
}

// 네가 쓰던 점수
function scoreFrom(air) {
  const p25 = air.pm25 ?? 0,
    p10 = air.pm10 ?? 0;
  const s25 = Math.max(0, 100 - p25 * 1.2);
  const s10 = Math.max(0, 100 - p10 * 0.6);
  return Math.round(
    Math.max(0, Math.min(100, s25 * 0.6 + s10 * 0.4))
  );
}

/* ──────────────────────────────
 * 2. 게이지 애니메이션
 * ────────────────────────────── */
function drawRing(el, perc, color) {
  if (!el) return;
  const pct = Math.max(0, Math.min(1, perc)) * 100;
  el.style.background = `conic-gradient(${color} 0% ${pct}%, rgba(0,0,0,0) ${pct}% 100%)`;
}

function animateRing(el, toPerc, color = '#b0d4cb', duration = 650) {
  const start = performance.now();
  const from = 0;
  function frame(ts) {
    const t = Math.min(1, (ts - start) / duration);
    const cur = from + (toPerc - from) * t;
    drawRing(el, cur, color);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function animateValue(el, toValue, unitText = '', duration = 600, dp = 1) {
  if (!el) return;
  const start = performance.now();
  const from = 0;
  function frame(ts) {
    const t = Math.min(1, (ts - start) / duration);
    const val = from + (toValue - from) * t;
    el.textContent = `${val.toFixed(dp)}${unitText}`;
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ──────────────────────────────
 * 3. API
 * ────────────────────────────── */
async function fetchNearest(lat, lon) {
  try {
    return await getJSON(NEAREST_URL(lat, lon));
  } catch (e) {
    console.warn('[nearest] backend failed → fallback', e);
    const u = `${OM_AQ}?latitude=${lat}&longitude=${lon}&hourly=${AQ_KEYS}&timezone=Asia%2FSeoul`;
    const j = await getJSON(u);
    const h = j.hourly ?? {};
    const t = h.time ?? [];
    const idx = Math.max(0, t.findLastIndex((ts) => ts <= nowKSTHour()));
    const pick = (k) => (h[k] || [])[idx] ?? null;
    return {
      provider: 'OPENMETEO',
      name: `OpenMeteo(${Number(lat).toFixed(2)},${Number(lon).toFixed(2)})`,
      display_ts: t[idx] ? `${t[idx]}:00` : null,
      pm10: pick('pm10'),
      pm25: pick('pm2_5'),
      o3: pick('ozone'),
      no2: pick('nitrogen_dioxide'),
      so2: pick('sulphur_dioxide'),
      co: pick('carbon_monoxide'),
      source_kind: 'model',
      lat,
      lon,
      station: { name: 'Open-Meteo', provider: 'OPENMETEO', kind: 'model' },
      badges: ['위성/모델 분석'],
      cai_grade: caiGrade(pick('pm10'), pick('pm2_5')),
    };
  }
}

async function fetchForecast(lat, lon, horizon = 24) {
  try {
    return await getJSON(FORECAST_URL(lat, lon, horizon));
  } catch (e) {
    console.warn('[forecast] backend failed → fallback', e);
    const aqU = `${OM_AQ}?latitude=${lat}&longitude=${lon}&hourly=${AQ_KEYS}&timezone=Asia%2FSeoul`;
    const wxU = `${OM_WX}?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m,precipitation&timezone=Asia%2FSeoul`;

    const [aq, wx] = await Promise.all([getJSON(aqU), getJSON(wxU)]);
    const t = aq.hourly?.time ?? [];
    const start = Math.max(
      0,
      t.findLastIndex((ts) => ts <= nowKSTHour())
    );
    const end = Math.min(t.length, start + horizon);

    const hourly = [];
    for (let i = start; i < end; i++) {
      const pm10 = aq.hourly?.pm10?.[i] ?? null;
      const pm25 = aq.hourly?.pm2_5?.[i] ?? null;

      hourly.push({
        ts: `${t[i]}:00`,
        pm10,
        pm25,
        grade: caiGrade(pm10, pm25) ?? 2,
        wind_spd: wx.hourly?.wind_speed_10m?.[i] ?? null,
        wind_dir: wx.hourly?.wind_direction_10m?.[i] ?? null,
        precip: wx.hourly?.precipitation?.[i] ?? null,
      });
    }

    return {
      station: { name: '모델 예보 (Open-Meteo)' },
      horizon: `${hourly.length}h`,
      issued_at: hourly[0]?.ts ?? null,
      hourly,
    };
  }
}

/* ──────────────────────────────
 * 4. 렌더
 * ────────────────────────────── */
function renderGauge(data) {
  const { pm10 = 0, pm25 = 0, display_ts, cai_grade } = data;
  const g = cai_grade ?? caiGrade(pm10, pm25) ?? 2;

  const pm10Ring = document.querySelector('.ring-pm10-fill');
  const pm25Ring = document.querySelector('.ring-pm25-fill');

  const pm10Perc = Math.min(1, pm10 / 150);
  const pm25Perc = Math.min(1, pm25 / 75);

  animateRing(pm10Ring, pm10Perc, '#b0d4cb', 700);
  animateRing(pm25Ring, pm25Perc, '#df7f59', 700);

  const pm10El = document.getElementById('pm10-value');
  const pm25El = document.getElementById('pm25-value');
  if (pm10El) animateValue(pm10El, pm10, ' µg/m³', 600, 1);
  if (pm25El) animateValue(pm25El, pm25, ' µg/m³', 600, 1);

  const tsEl = document.querySelector('.timestamp');
  if (tsEl) tsEl.textContent = display_ts ? `${display_ts} 업데이트` : '';

  // hero 4단계 색 클래스 있으면 채우기
  const hero = document.querySelector('.hero-section');
  if (hero) {
    hero.classList.remove('grade-1', 'grade-2', 'grade-3', 'grade-4');
    hero.classList.add(`grade-${g}`);
  }
}

function renderLinearBars(d) {
  const wrap = document.getElementById('linear-bars-container');
  if (!wrap) return;
  wrap.innerHTML = '';
  const items = [
    { k: 'so2', label: '아황산가스 SO₂', unit: 'µg/m³' },
    { k: 'co', label: '일산화탄소 CO', unit: 'µg/m³' },
    { k: 'o3', label: '오존 O₃', unit: 'µg/m³' },
    { k: 'no2', label: '이산화질소 NO₂', unit: 'µg/m³' },
  ];
  items.forEach((it) => {
    const v = d[it.k];
    const el = document.createElement('div');
    el.className = 'linear-bar-item';
    el.innerHTML = `
      <div class="bar-label">${it.label}</div>
      <div class="bar-wrapper"><div class="bar-fill" style="width:${
        v == null ? 0 : Math.min(100, (Number(v) / 180) * 100)
      }%"></div></div>
      <div class="bar-value">${v != null ? Math.round(v) : '--'} ${it.unit}</div>
    `;
    wrap.appendChild(el);
  });
}

function renderForecast(f) {
  const grid = document.getElementById('forecast-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const take = (f.hourly || []).slice(0, 10);
  take.forEach((h) => {
    const dt = new Date(h.ts.replace(' ', 'T'));
    const hh = `${String(dt.getHours()).padStart(2, '0')}:00`;
    const g = h.grade ?? caiGrade(h.pm10, h.pm25) ?? 2;

    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      <div class="forecast-day">${hh}</div>
      <div class="forecast-icon">🔮</div>
      <div class="forecast-temp">
        <div><strong>${LABEL[g]}</strong> · 바람 ${h.wind_spd != null ? h.wind_spd : '-'} m/s</div>
        <div class="forecast-desc">초미세먼지 ${h.pm25 != null ? h.pm25 : '-'} · 미세먼지 ${
      h.pm10 != null ? h.pm10 : '-'
    }</div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderMain(air) {
  if (!air) return;
  renderGauge(air);
  renderLinearBars(air);

  const placeEl = document.getElementById('station-name');
  if (placeEl) placeEl.textContent = air.station?.name || air.name || '—';

  // 4단계 텍스트 + 그라데이션
  const gradeEl = document.getElementById('hero-grade-label');
  if (gradeEl) {
    const korGrade = caiGradeKOR(air.pm10, air.pm25);
    const band = STANDARDS.KOR.bands[korGrade - 1];
    gradeEl.textContent = band?.label || '—';

    // 대형 카드 그라데이션 직접 덮기
    const bgComp =
      document.querySelector('.summary_background_component .Rectangle-32') ||
      document.querySelector('.summary_background_component.Rectangle-32');
    if (bgComp && band?.gradient) {
      const { top, bottom } = band.gradient;
      bgComp.style.backgroundImage = `linear-gradient(to bottom, ${top} 27%, ${bottom})`;
    }

    // 부모 클래스도 달아주기 (CSS에서 쓰는 경우)
    const summaryRoot = document.querySelector('.summary_background_component');
    if (summaryRoot) {
      summaryRoot.classList.remove(
        'excellent',
        'good',
        'fair',
        'moderate',
        'poor',
        'unhealthy',
        'severe',
        'hazardous'
      );
      // 4단계를 8단계 이름으로 매핑
      const map4to8 = {
        1: 'good',
        2: 'moderate',
        3: 'unhealthy',
        4: 'hazardous',
      };
      const cls = map4to8[korGrade];
      if (cls) summaryRoot.classList.add(cls);
    }
  }

  const scoreEl = document.getElementById('hero-score');
  if (scoreEl) {
    animateValue(scoreEl, scoreFrom(air), '', 700, 0);
  }

  const descEl = document.getElementById('hero-desc');
  if (descEl) {
    descEl.textContent =
      air.cai_value != null ? `지수 ${air.cai_value}` : '오늘의 대기질 총평입니다.';
  }
}

/* ──────────────────────────────
 * 5. 지오/검색
 * ────────────────────────────── */
async function geocode(q) {
  const m = String(q || '')
    .trim()
    .match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return { lat: +m[1], lon: +m[2], address: `${m[1]},${m[2]}` };
  try {
    const r = await fetch(
      `${API_BASE}/geo/address?q=${encodeURIComponent(q)}`,
      { cache: 'no-store' }
    );
    if (r.ok) return await r.json();
  } catch (e) {
    // ignore
  }
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    q
  )}&count=1&language=ko`;
  const j = await fetch(u, { cache: 'no-store' }).then((r) => r.json());
  const hit = j?.results?.[0];
  if (!hit) throw new Error('no result');
  return {
    lat: hit.latitude,
    lon: hit.longitude,
    address: [hit.country, hit.admin1, hit.name].filter(Boolean).join(' · '),
  };
}

async function doSearch(q) {
  if (!q) return;
  try {
    const g = await geocode(q);
    const inp = document.getElementById('location-input');
    if (inp) inp.value = g.address;
    await updateAll(g.lat, g.lon);
  } catch (e) {
    alert('주소를 찾지 못했습니다.');
  }
}

async function resolvePlaceName(lat, lon) {
  try {
    const j = await getJSON(REVERSE_URL(lat, lon));
    return j?.address || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

/* ──────────────────────────────
 * 6. 전체 업데이트
 * ────────────────────────────── */
async function updateAll(lat, lon) {
  const air = await fetchNearest(lat, lon);
  renderMain(air);
  const place = await resolvePlaceName(lat, lon);
  const sta = document.getElementById('station-name');
  if (sta) sta.textContent = place || air.name || '—';
  const f = await fetchForecast(lat, lon, 24);
  renderForecast(f);
}

/* ──────────────────────────────
 * 7. UI 바인딩
 * ────────────────────────────── */
function bindTabs() {
  const btns = Array.from(
    document.querySelectorAll('.tab-button, .tab-item')
  );
  const panes = Array.from(document.querySelectorAll('.tab-content'));
  if (!btns.length || !panes.length) return;

  const activate = (key) => {
    btns.forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
    panes.forEach((p) => {
      const isTarget = p.id === `tab-${key}`;
      p.classList.toggle('active', isTarget);
      if (isTarget) {
        p.classList.remove('fade-in');
        requestAnimationFrame(() => p.classList.add('fade-in'));
      }
    });
  };

  btns.forEach((btn) =>
    btn.addEventListener('click', () => activate(btn.dataset.tab))
  );
  const initial =
    document.querySelector('.tab-button.active, .tab-item.tab-item--active')
      ?.dataset.tab || btns[0]?.dataset.tab;
  if (initial) activate(initial);
}

function bindUIEvents() {
  const logo = document.querySelector('.logo-text, #app-logo');
  const overlay = document.querySelector('.slide-menu-overlay');
  logo?.addEventListener('click', () => {
    if (overlay) overlay.style.display = 'block';
  });
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.style.display = 'none';
  });

  const notify = document.querySelector('.notification-icon');
  notify?.addEventListener('click', () => initLocation());

  const inp = document.getElementById('location-input');
  if (inp) {
    const autoSearch = debounce(() => doSearch(inp.value || ''), 350);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch(inp.value || '');
    });
    inp.addEventListener('input', autoSearch);
  }
}

/* ──────────────────────────────
 * 8. 위치
 * ────────────────────────────── */
function initLocation() {
  const urlParams = new URLSearchParams(window.location.search);
  const lat = urlParams.get('lat');
  const lon = urlParams.get('lon');

  if (lat && lon) {
    updateAll(parseFloat(lat), parseFloat(lon));
  } else {
    navigator.geolocation.getCurrentPosition(
      (pos) => updateAll(pos.coords.latitude, pos.coords.longitude),
      () => updateAll(37.5665, 126.978),
    );
  }
}

/* ──────────────────────────────
 * 9. 부트
 * ────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  console.log('[app] boot');
  bindTabs();
  bindUIEvents();
  initLocation();
});
