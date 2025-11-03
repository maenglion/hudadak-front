// app.js
// 1) 외부 기준표 가져오기 (KOR, HUDADAK8 이런 거 여기 있다고 했잖아)
import { STANDARDS } from './js/standards.js';
import { renderForecast } from './js/forecast.js';

/* =========================================================
   0. 전역 상태
   ========================================================= */
const API_BASE = (window.__API_BASE__ ?? '').trim();
let CURRENT_STANDARD = 'KOR';   // 메뉴에서 라디오로 바꾸는 값
let LAST_COORD = null;          // 마지막으로 조회한 좌표 기억

/* =========================================================
   1. API URL 헬퍼
   ========================================================= */
const NEAREST_URL  = (lat, lon) =>
  `${API_BASE}/nearest?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
const FORECAST_URL = (lat, lon, h = 24) =>
  `${API_BASE}/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&horizon=${h}`;
const REVERSE_URL  = (lat, lon) =>
  `${API_BASE}/geo/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;

/* 오픈메테오 백업 */
const OM_AQ  = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const AQ_KEYS = 'pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide';
const OM_WX  = 'https://api.open-meteo.com/v1/forecast';

/* 상태바 색 고정 */
document.documentElement.style.setProperty('--mobile-status', 'rgba(51,51,51,.2)');

/* =========================================================
   2. 공통 유틸
   ========================================================= */
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

function nowKSTHour() {
  const d = new Date();
  const tz = d.getTime() + (9 * 60 - d.getTimezoneOffset()) * 60000;
  const k = new Date(tz);
  k.setMinutes(0, 0, 0);
  return k.toISOString().slice(0, 13); // 'YYYY-MM-DDTHH'
}

/* =========================================================
   3. 대기질 등급 계산 (4단계 기본)
   ========================================================= */
const LABEL_4 = { 1: '좋음', 2: '보통', 3: '나쁨', 4: '매우나쁨' };

const gradePM10 = (v) =>
  v == null ? null : v <= 30 ? 1 : v <= 80 ? 2 : v <= 150 ? 3 : 4;
const gradePM25 = (v) =>
  v == null ? null : v <= 15 ? 1 : v <= 35 ? 2 : v <= 75 ? 3 : 4;

function caiGrade(pm10, pm25) {
  const g10 = gradePM10(pm10);
  const g25 = gradePM25(pm25);
  if (g10 == null && g25 == null) return null;
  return Math.max(g10 ?? g25, g25 ?? g10);
}

/* 환경부 4단계 기준이 standards.js 에 있다고 가정 */
function caiGradeKOR(pm10, pm25) {
  const b = STANDARDS.KOR.breaks;
  const g10 =
    pm10 == null ? 1
    : pm10 <= b.pm10[0] ? 1
    : pm10 <= b.pm10[1] ? 2
    : pm10 <= b.pm10[2] ? 3
    : 4;
  const g25 =
    pm25 == null ? 1
    : pm25 <= b.pm25[0] ? 1
    : pm25 <= b.pm25[1] ? 2
    : pm25 <= b.pm25[2] ? 3
    : 4;
  return Math.max(g10, g25);
}

/* 점수 대충 */
function scoreFrom(air) {
  const p25 = air.pm25 ?? 0;
  const p10 = air.pm10 ?? 0;
  const s25 = Math.max(0, 100 - p25 * 1.2);
  const s10 = Math.max(0, 100 - p10 * 0.6);
  return Math.round(Math.max(0, Math.min(100, s25 * 0.6 + s10 * 0.4)));
}

/* =========================================================
   4. 애니메이션 유틸 (게이지)
   ========================================================= */
function drawRing(el, perc, color) {
  if (!el) return;
  const pct = Math.max(0, Math.min(1, perc)) * 100;
  el.style.background = `conic-gradient(${color} 0% ${pct}%, rgba(0,0,0,0) ${pct}% 100%)`;
}

function animateRing(el, toPerc, color = '#b0d4cb', duration = 650) {
  if (!el) return;
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

/* =========================================================
   5. API 호출
   ========================================================= */
async function fetchNearest(lat, lon) {
  try {
    return await getJSON(NEAREST_URL(lat, lon));
  } catch (e) {
    console.warn('[nearest] backend fail → open-meteo fallback', e);

    const u = `${OM_AQ}?latitude=${lat}&longitude=${lon}&hourly=${AQ_KEYS}&timezone=Asia%2FSeoul`;
    const j = await getJSON(u);
    const h = j.hourly ?? {};
    const times = h.time ?? [];
    const curHour = nowKSTHour(); // 'YYYY-MM-DDTHH'
    const idx = Math.max(0, times.findLastIndex((ts) => ts <= curHour));

    const pick = (k) => (h[k] || [])[idx] ?? null;

    return {
      provider: 'OPENMETEO',
      name: `Open-Meteo(${lat.toFixed(2)},${lon.toFixed(2)})`,
      display_ts: times[idx] ? `${times[idx]}:00` : null,
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
    console.warn('[forecast] backend fail → open-meteo fallback', e);
    const aqU = `${OM_AQ}?latitude=${lat}&longitude=${lon}&hourly=${AQ_KEYS}&timezone=Asia%2FSeoul`;
    const wxU = `${OM_WX}?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m,precipitation&timezone=Asia%2FSeoul`;

    const [aq, wx] = await Promise.all([getJSON(aqU), getJSON(wxU)]);
    const t = aq.hourly?.time ?? [];
    const start = Math.max(0, t.findLastIndex((ts) => ts <= nowKSTHour()));
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
        source_kind: 'model',
      });
    }

    return {
      station: { name: '모델 예보 (Open-Meteo)' },
      issued_at: hourly[0]?.ts ?? null,
      hourly,
    };
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

/* =========================================================
   6. 렌더러
   ========================================================= */
function renderGauge(air) {
  const { pm10 = 0, pm25 = 0, display_ts } = air;

  const pm10Ring = document.querySelector('.ring-pm10-fill');
  const pm25Ring = document.querySelector('.ring-pm25-fill');

  const pm10Perc = Math.min(1, pm10 / 150);
  const pm25Perc = Math.min(1, pm25 / 75);

  animateRing(pm10Ring, pm10Perc, '#b0d4cb', 700);
  animateRing(pm25Ring, pm25Perc, '#df7f59', 700);

  const pm10El = document.getElementById('pm10-unit');
  const pm25El = document.getElementById('pm25-unit');
  if (pm10El) pm10El.textContent = `${pm10}µg/m³`;
  if (pm25El) pm25El.textContent = `${pm25}µg/m³`;

  const tsRow = document.querySelector('.timestamp-row');
  if (tsRow && display_ts) {
    // 네가 나중에 날짜/시간 쪼개서 넣어도 됨
  }
}

function renderGases(air) {
  // 대충 max, 필요하면 standards로 바꿔
  const MAX_SO2 = 180;
  const MAX_CO  = 20;   // ppm
  const MAX_O3  = 200;
  const MAX_NO2 = 200;

  // SO2
  const so2Val = document.getElementById('gas-so2-value');
  const so2Bar = document.getElementById('gas-so2-bar');
  const so2 = air.so2;
  if (so2Val) so2Val.textContent = so2 != null ? Math.round(so2) : '--';
  if (so2Bar) so2Bar.style.width = so2 != null ? Math.min(100, (so2 / MAX_SO2) * 100) + '%' : '0%';

  // CO
  const coVal = document.getElementById('gas-co-value');
  const coBar = document.getElementById('gas-co-bar');
  const co = air.co;
  if (coVal) coVal.textContent = co != null ? (Math.round(co * 10) / 10) : '--';
  if (coBar) coBar.style.width = co != null ? Math.min(100, (co / MAX_CO) * 100) + '%' : '0%';

  // O3
  const o3Val = document.getElementById('gas-o3-value');
  const o3Bar = document.getElementById('gas-o3-bar');
  const o3 = air.o3;
  if (o3Val) o3Val.textContent = o3 != null ? Math.round(o3) : '--';
  if (o3Bar) o3Bar.style.width = o3 != null ? Math.min(100, (o3 / MAX_O3) * 100) + '%' : '0%';

  // NO2
  const no2Val = document.getElementById('gas-no2-value');
  const no2Bar = document.getElementById('gas-no2-bar');
  const no2 = air.no2;
  if (no2Val) no2Val.textContent = no2 != null ? Math.round(no2) : '--';
  if (no2Bar) no2Bar.style.width = no2 != null ? Math.min(100, (no2 / MAX_NO2) * 100) + '%' : '0%';
}

/* 예보 뱃지 선택 */
function pickBadgeSrcFrom(sourceKind = 'model') {
  const k = String(sourceKind || '').toLowerCase();
  if (k === 'observed' || k === 'station' || k === 'obs')
    return './assets/forecast-badges-observed.svg';
  if (k === 'model' || k === 'modeled')
    return './assets/forecast-badges-model.svg';
  if (k === 'interp' || k === 'interpolated')
    return './assets/forecast-badges-interp.svg';
  if (k === 'fail' || k === 'error')
    return './assets/forecast-badges-fail.svg';
  return './assets/forecast-badges-ai.svg';
}

function renderForecast(forecast) {
  const grid = document.getElementById('forecast-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const hours = Array.isArray(forecast?.hourly)
    ? forecast.hourly.slice(0, 10)
    : [];

  hours.forEach((h) => {
    const d = new Date((h.ts || '').replace(' ', 'T'));
    const hh = isNaN(d.getTime())
      ? (h.ts || '')
      : String(d.getHours()).padStart(2, '0') + ':00';

    const g = h.grade ?? caiGrade(h.pm10, h.pm25) ?? 2;
    const label = LABEL_4[g] || '-';

    const badgeSrc = pickBadgeSrcFrom(h.source_kind || forecast.source_kind || 'model');

    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      <div class="forecast-card-header">
        <span class="forecast-date">${hh}</span>
        <img class="forecast-badge" src="${badgeSrc}" alt="예보 소스">
      </div>
      <div class="forecast-card-body">
        <img class="forecast-icon" src="./assets/forecast-01-sun.svg" alt="날씨 아이콘">
        <p class="forecast-description">
          <strong>${label}</strong> · 바람 ${h.wind_spd ?? '-'} m/s<br>
          초미세먼지 ${h.pm25 ?? '-'} · 미세먼지 ${h.pm10 ?? '-'}
        </p>
      </div>
    `;
    grid.appendChild(card);
  });

  if (!hours.length) {
    const empty = document.createElement('div');
    empty.className = 'forecast-card';
    empty.innerHTML = `
      <div class="forecast-card-header">
        <span class="forecast-date">예보 없음</span>
        <img class="forecast-badge" src="./assets/forecast-badges-ai.svg" alt="예보 소스">
      </div>
      <div class="forecast-card-body">
        <p class="forecast-description">예보 데이터를 불러오지 못했습니다.</p>
      </div>
    `;
    grid.appendChild(empty);
  }
}

function renderHeaderByStandard(air) {
  const header = document.getElementById('app-header');
  if (!header) return;

  // 기존 클래스 날리고
  header.classList.remove(
    'App-header--excellent',
    'App-header--good',
    'App-header--fair',
    'App-header--moderate',
    'App-header--poor',
    'App-header--unhealthy',
    'App-header--severe',
    'App-header--hazardous'
  );

  let bandLabel = '—';
  if (CURRENT_STANDARD === 'KOR') {
    const g = caiGradeKOR(air.pm10, air.pm25); // 1~4
    const map4to8 = { 1: 'good', 2: 'moderate', 3: 'unhealthy', 4: 'hazardous' };
    const cls = map4to8[g];
    if (cls) header.classList.add(`App-header--${cls}`);
    bandLabel = LABEL_4[g] || '—';
  } else {
    // HUDADAK8 / WHO8
    const std = STANDARDS.HUDADAK8;
    if (std) {
      const pm25 = air.pm25 ?? null;
      const pm10 = air.pm10 ?? null;
      const findIdx = (v, arr) => {
        if (v == null) return arr.length - 1;
        for (let i = 0; i < arr.length; i++) {
          if (v <= arr[i]) return i;
        }
        return arr.length - 1;
      };
      const i25 = findIdx(pm25, std.breaks.pm25);
      const i10 = findIdx(pm10, std.breaks.pm10);
      const idx  = Math.max(i25, i10);
      const band = std.bands[idx] ?? std.bands[std.bands.length - 1];
      if (band?.key) header.classList.add(`App-header--${band.key}`);
      bandLabel = band?.label ?? '—';
    }
  }

  const title = document.getElementById('hero-grade-label');
  if (title) title.textContent = bandLabel;
  const scoreEl = document.getElementById('hero-score');
  if (scoreEl) scoreEl.textContent = `${scoreFrom(air)}점`;
}

/* 메인 렌더 묶음 */
function renderMain(air) {
  renderHeaderByStandard(air);
  renderGauge(air);
  renderGases(air);
}

/* =========================================================
   7. 탭 / 메뉴 / 검색 바인딩
   ========================================================= */
  function activateTab(name) {
    // 1) 버튼 상태
    tabs.forEach(t => {
      t.classList.toggle('tab-item--active', t.dataset.tab === name);
    });

    // 2) 패널 표시
    Object.entries(panels).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle('tab-panel--active', key === name);
    });

    // 3) svg 바꿔끼우기
    if (bar) {
      bar.src = (name === 'air')
        ? './assets/tab-select-left.svg'
        : './assets/tab-select-right.svg';
    }
  }

  // 클릭 바인딩
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      const key = t.dataset.tab;
      if (!key) return;
      activateTab(key);
    });
  });


 const first = document.querySelector('.tab-item.tab-item--active')?.dataset.tab || 'air';
  activateTab(first);

function bindSideMenu() {
  const overlay = document.querySelector('.slide-menu-overlay');
  const logoBtn = document.querySelector('.logo-text');
  const locationBtn = document.querySelector('.location-button');

  if (logoBtn && overlay) {
    logoBtn.addEventListener('click', () => {
      overlay.style.display = 'block';
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  }

  if (locationBtn) {
    // 나중에 검색 오버레이 열기
  }

  // 기준 바꾸기
  document.querySelectorAll('input[name="standard"]').forEach((r) => {
    r.addEventListener('change', async (e) => {
      const v = e.target.value;
      if (v === 'cai') CURRENT_STANDARD = 'KOR';
      else CURRENT_STANDARD = 'HUDADAK8';
      if (LAST_COORD) {
        const air = await fetchNearest(LAST_COORD.lat, LAST_COORD.lon);
        renderMain(air);
      }
    });
  });
}

/* =========================================================
   8. 위치 → 전체 업데이트
   ========================================================= */
async function updateAll(lat, lon) {
  LAST_COORD = { lat, lon };

  const air = await fetchNearest(lat, lon);
  renderMain(air);

  const place = await resolvePlaceName(lat, lon);
  const locBtn = document.getElementById('location-button');
  if (locBtn) locBtn.textContent = place || air.name || '—';

 const f = await fetchForecast(lat, lon, 24);
renderForecast(f, { address: place, lat, lon });
}

function initLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => updateAll(pos.coords.latitude, pos.coords.longitude),
      ()    => updateAll(37.5665, 126.9780) // 서울
    );
  } else {
    updateAll(37.5665, 126.9780);
  }
}

/* =========================================================
   9. 시작
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  bindTabs();
  initLocation();   // 너 원래 쓰던 위치 불러오기
});