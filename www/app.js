import { STANDARDS } from './js/standards.js';

const API_BASE = (window.__API_BASE__ ?? '').trim();
const NEAREST_URL  = (lat,lon)=> `${API_BASE}/nearest?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
const FORECAST_URL = (lat,lon,h=24)=> `${API_BASE}/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&horizon=${h}`;
const REVERSE_URL  = (lat,lon)=> `${API_BASE}/geo/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;

const OM_AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const AQ_KEYS = 'pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide';
const OM_WX = 'https://api.open-meteo.com/v1/forecast';

// 상태바는 고정
document.documentElement.style.setProperty('--mobile-status', 'rgba(51,51,51,.2)');

/* ──────────────────────────────
 * 1. 공통 유틸 및 상수
 * ────────────────────────────── */
function debounce(fn, delay=300){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), delay); };
}
// WHO 8단계 기준값과 색상을 직접 정의
// NOTE: 이 코드는 STANDARDS를 포함하지만, 실제 import 파일에서 정의되어야 합니다.
// 중복을 피하기 위해 임시로 WHO8만 남깁니다.
const WHO8_STANDARDS = {
  WHO8: {
    code: 'WHO8',
    label: 'WHO 2021 (24h) · 8단계',
    breaks: {
      pm25: [5, 10, 15, 25, 37.5, 50, 75], // 경계값
      pm10: [15, 30, 45, 50, 75, 100, 150],
    },
    bands: [
      { key:'vgood', label:'매우 좋음', bg:'#23a0e5', fg:'#ffffff', headerClass: 'App-header--excellent' },
      { key:'good', label:'좋음', bg:'#30b8de', fg:'#ffffff', headerClass: 'App-header--good' },
      { key:'fair', label:'양호', bg:'#3dd392', fg:'#0b0d12', headerClass: 'App-header--fair' },
      { key:'it4', label:'주의', bg:'#85af36', fg:'#0b0d12', headerClass: 'App-header--moderate' },
      { key:'it3', label:'나쁨', bg:'#db9f3c', fg:'#222222', headerClass: 'App-header--poor' },
      { key:'it2', label:'매우 나쁨', bg:'#df7f59', fg:'#ffffff', headerClass: 'App-header--unhealthy' },
      { key:'it1', label:'위험', bg:'#71395e', fg:'#ffffff', headerClass: 'App-header--hazardous' },
      { key:'hazard', label:'최악', bg:'#a44960', fg:'#ffffff', headerClass: 'App-header--severe' },
    ],
  },
};
const ALL_STANDARDS = { ...STANDARDS, ...WHO8_STANDARDS }; // STANDARDS가 임포트된다고 가정

// 지수 단계 (Band Index) 계산
function bandIndex(value, breakpoints) {
  if (value == null || isNaN(value)) return breakpoints.length; 
  let i = 0;
  while (i < breakpoints.length && value > breakpoints[i]) i++;
  return Math.min(i, breakpoints.length); 
}

/**
 * 주어진 값에 해당하는 색상/단계 정보 반환 (pm25/pm10 중 더 나쁜 값 기준)
 * @param {string} metric 'pm25' 또는 'pm10' (현재 사용 안 함)
 * @param {object} value {pm25: number, pm10: number}
 * @param {string} standard 'WHO8' 또는 'KOR'
 * @returns {object|null} 해당 밴드 정보
 */
function getBandInfo(metric, value, standard='WHO8') {
  const std = ALL_STANDARDS[standard];
  if (!std || !std.breaks?.pm25 || !std.breaks?.pm10) return null;
  
  const pm25_idx = bandIndex(value.pm25, std.breaks.pm25);
  const pm10_idx = bandIndex(value.pm10, std.breaks.pm10);
  // 둘 중 더 나쁜 지표(높은 인덱스)를 기준으로 최종 등급 결정
  const final_idx = Math.max(pm25_idx, pm10_idx);
  
  return std.bands[final_idx] || std.bands[std.bands.length - 1];
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
  // ISO 문자열에서 시간과 분만 남기기 (예: "2023-10-27T15:00")
  return k.toISOString().slice(0, 16).replace(':00Z', ':00');
}

// 4단계 단독 계산용
const gradePM10 = (v) =>
  v == null ? null : v <= 30 ? 1 : v <= 80 ? 2 : v <= 150 ? 3 : 4;
const gradePM25 = (v) =>
  v == null ? null : v <= 15 ? 1 : v <= 35 ? 2 : v <= 75 ? 3 : 4;

// “둘 중 더 나쁜 거” CAI (4단계)
function caiGrade(pm10, pm25) {
  const g10 = gradePM10(pm10);
  const g25 = gradePM25(pm25);
  if (g10 == null && g25 == null) return null;
  return Math.max(g10 ?? g25, g25 ?? g10);
}

// STANDARDS.KOR 기준 4단계
function caiGradeKOR(pm10, pm25) {
  const b = ALL_STANDARDS.KOR.breaks;
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
 * 3. API (서버 및 데이터 관련)
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
    const nowHour = nowKSTHour().slice(0, 13); // "YYYY-MM-DDTHH"
    const idx = Math.max(0, t.findLastIndex((ts) => ts.startsWith(nowHour)));
    const pick = (k) => (h[k] || [])[idx] ?? null;
    return {
      provider: 'OPENMETEO',
      name: `OpenMeteo(${Number(lat).toFixed(2)},${Number(lon).toFixed(2)})`,
      display_ts: t[idx] ? `${t[idx].replace('T', ' ')}:00` : null,
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
    const nowHour = nowKSTHour().slice(0, 13);
    const start = Math.max(
      0,
      t.findLastIndex((ts) => ts.startsWith(nowHour))
    );
    const end = Math.min(t.length, start + horizon);

    const hourly = [];
    for (let i = start; i < end; i++) {
      const pm10 = aq.hourly?.pm10?.[i] ?? null;
      const pm25 = aq.hourly?.pm2_5?.[i] ?? null;

      hourly.push({
        ts: `${t[i].replace('T', ' ')}:00`,
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
 * 4. 렌더 (현재 대기질)
 * ────────────────────────────── */

/** 게이지 섹션을 렌더링 (PM10, PM2.5 링 및 값) */
function renderGauge(data) {
  const { pm10 = 0, pm25 = 0, display_ts, cai_grade } = data;
  const g = cai_grade ?? caiGrade(pm10, pm25) ?? 2;

  const pm10Ring = document.querySelector('.ring-pm10-fill');
  const pm25Ring = document.querySelector('.ring-pm25-fill');

  // Open-Meteo fallback 기준으로 색상 고정.
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

  // hero 4단계 색 클래스 있으면 채우기 (기존 렌더 로직 유지)
  const hero = document.querySelector('.hero-section');
  if (hero) {
    hero.classList.remove('grade-1', 'grade-2', 'grade-3', 'grade-4');
    hero.classList.add(`grade-${g}`);
  }
}

/** 선형 바를 렌더링 (보조 가스 정보) */
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
    // 최대값 설정 (OpenMeteo의 SO2, CO, O3, NO2의 임시 최대값)
    const MAX_VAL = 
      it.k === 'so2' ? 180 : 
      it.k === 'co' ? 20 : 
      it.k === 'o3' ? 200 : 
      it.k === 'no2' ? 200 : 100;

    const el = document.createElement('div');
    el.className = 'linear-bar-item';
    el.innerHTML = `
      <div class="bar-label">${it.label}</div>
      <div class="bar-wrapper"><div class="bar-fill" style="width:${
        v == null ? 0 : Math.min(100, (Number(v) / MAX_VAL) * 100)
      }%"></div></div>
      <div class="bar-value">${v != null ? Math.round(v) : '--'} ${it.unit}</div>
    `;
    wrap.appendChild(el);
  });
}

/** 가스 정보를 렌더링 (원래 로직 유지, renderLinearBars로 대체 가능) */
function renderGases(air) {
  // renderLinearBars가 더 간결하므로 이 함수는 더 이상 사용하지 않아도 되지만,
  // 원본 구조 유지를 위해 남겨둡니다. (DOM ID 충돌 시 삭제 고려)
  // ... (원래의 renderGases 로직)
}

/** 예보 소스 → 배지 svg 매핑 */
function pickBadgeSrcFrom(sourceKind = 'model') {
  const k = String(sourceKind || '').toLowerCase();

  if (k === 'observed' || k === 'station' || k === 'obs') {
    return './assets/forecast-badges-observed.svg';
  }
  if (k === 'model' || k === 'modeled') {
    return './assets/forecast-badges-model.svg';
  }
  if (k === 'interp' || k === 'interpolated') {
    return './assets/forecast-badges-interp.svg';
  }
  if (k === 'fail' || k === 'error') {
    return './assets/forecast-badges-fail.svg';
  }
  return './assets/forecast-badges-ai.svg';
}

/* ──────────────────────────────
 * 5. 렌더 (예보)
 * ────────────────────────────── */
function renderForecast(f) {
  const grid = document.getElementById('forecast-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const hours = Array.isArray(f?.hourly) ? f.hourly.slice(0, 10) : [];

  hours.forEach((h) => {
    // 시간 문자열 정리 (YYYY-MM-DD HH:MM:00 -> HH:00)
    const ts = (h.ts || '').replace(':00:00', ':00'); // 기존 로직에서 :00:00이 붙는 경우가 있어서 처리
    const dt = new Date(ts.replace(' ', 'T'));
    const hh = isNaN(dt.getTime())
      ? ts
      : String(dt.getHours()).padStart(2, '0') + ':00';

    // 등급 (기존 LABEL 쓰던 거 그대로)
    const g = h.grade ?? (typeof caiGrade === 'function'
      ? caiGrade(h.pm10, h.pm25)
      : 2);
    const label = typeof LABEL !== 'undefined' ? (LABEL[g] || '-') : '-';

    // 여기서 배지 고르기
    const badgeSrc = pickBadgeSrcFrom(h.source_kind || f.source_kind || 'model');
    const badgeAlt = (h.source_kind || f.source_kind || '모델').toUpperCase();
    
    // 임시 아이콘 (실제 날씨 정보는 없으므로 태양으로 고정)
    const weatherIcon = './assets/forecastcast-01-sun.svg'; 

    // 카드 만들기
    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      <div class="forecast-card-header">
        <span class="forecast-date">${hh}</span>
        <img class="forecast-badge" src="${badgeSrc}" alt="${badgeAlt} 예보 소스">
      </div>
      <div class="forecast-card-body">
        <img class="forecast-icon" src="${weatherIcon}" alt="날씨 아이콘">
        <p class="forecast-description">
          <strong>${label}</strong> · 바람 ${h.wind_spd != null ? h.wind_spd.toFixed(1) : '-'} m/s<br>
          초미세먼지 ${h.pm25 != null ? Math.round(h.pm25) : '-'} · 미세먼지 ${h.pm10 != null ? Math.round(h.pm10) : '-'}
        </p>
      </div>
    `;
    grid.appendChild(card);
  });

  // 예보가 하나도 없을 때
  if (!hours.length) {
    const empty = document.createElement('div');
    empty.className = 'forecast-card';
    empty.innerHTML = `
      <div class="forecast-card-header">
        <span class="forecast-date">예보 없음</span>
        <img class="forecast-badge" src="./assets/forecast-badges-fail.svg" alt="예보 소스">
      </div>
      <div class="forecast-card-body">
        <p class="forecast-description">예보 데이터를 불러오지 못했습니다. (Horzion: ${f.horizon ?? '-'})</p>
      </div>
    `;
    grid.appendChild(empty);
  }
}

/* ──────────────────────────────
 * 6. 지오/검색 및 전체 업데이트
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

async function resolvePlaceName(lat, lon) {
  try {
    const j = await getJSON(REVERSE_URL(lat, lon));
    return j?.address || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

/**
 * 메인 헤더 및 배경색을 결정하는 최종 렌더링 함수
 * @param {object} air 현재 대기질 데이터
 * @param {string} standard 'KOR' 또는 'WHO8'
 */
function renderMain(air, standard) {
  if (!air) return;

  // 1) 공통 위젯들 먼저
  renderGauge(air);
  renderLinearBars(air); 

  // 2) 어떤 표준으로 칠할지 결정
  const std = standard === 'KOR'
    ? ALL_STANDARDS.KOR
    : ALL_STANDARDS.WHO8;

  // 3) 헤더 위치명 (실제 위치 이름은 updateAll에서 채워짐)
  const placeEl = document.getElementById('station-name');
  if (placeEl) placeEl.textContent = air.station?.name || air.name || '—';

  // 4) 표준별로 등급/밴드 뽑기
  let band = null;
  let headerClassKey = '';

  if (standard === 'KOR' && ALL_STANDARDS.KOR) {
    // 4단계: 한국 환경부 기준 (기존 방식)
    const korGrade = caiGradeKOR(air.pm10, air.pm25); // 1~4
    band = std.bands[korGrade - 1];

    // 헤더 클래스 매핑 (4단계 → 8단계 클래스 이름으로)
    const map4to8 = { 1: 'good', 2: 'moderate', 3: 'unhealthy', 4: 'hazardous' };
    headerClassKey = map4to8[korGrade];

  } else if (ALL_STANDARDS.WHO8) {
    // 8단계: WHO8 (pm25/pm10 중 더 나쁜 값 기준)
    band = getBandInfo('pm25', air, 'WHO8');
    headerClassKey = band?.key;
  }
  
  // 5) 헤더 클래스 적용
  const header = document.getElementById('app-header');
  if (header) {
    // 모든 App-header--* 클래스 제거
    const classList = Array.from(header.classList).filter(c => c.startsWith('App-header--'));
    header.classList.remove(...classList);
    
    if (band && band.headerClass) {
        header.classList.add(band.headerClass); // WHO8 밴드 정보 사용
    } else if (headerClassKey) {
        header.classList.add(`App-header--${headerClassKey}`); // KOR 매핑 정보 사용
    }
  }

  // 6) 배경 그라데이션 (KOR/WHO8 밴드에서 gradient 정보가 있어야 함)
  const bg = document.querySelector('.summary_background_component .Rectangle-32');
  if (bg && band?.gradient) {
    const { top, bottom } = band.gradient;
    bg.style.backgroundImage = `linear-gradient(to bottom, ${top} 27%, ${bottom})`;
  }

  // 7) 헤더 텍스트
  const gradeEl = document.getElementById('hero-grade-label');
  if (gradeEl) gradeEl.textContent = band?.label ?? '—';

  // 8) 점수
  const scoreEl = document.getElementById('hero-score');
  if (scoreEl) scoreEl.textContent = `${scoreFrom(air)}점`;

  // 9) 설명
  const descEl = document.getElementById('hero-desc');
  if (descEl) {
    if (!band) {
      descEl.textContent = '오늘의 대기질 총평입니다.';
    } else {
      const key = band.key || headerClassKey;
      // 아주 대충: 좋은 쪽 / 중간 / 나쁜 쪽
      if (key === 'excellent' || key === 'good' || key === 'fair') {
        descEl.textContent = '창문 열고 환기해도 무방한 날이에요.';
      } else if (key === 'moderate' || key === 'poor' || key === 'it4' || key === 'it3') {
        descEl.textContent = '민감군은 마스크 착용을 권장해요.';
      } else {
        descEl.textContent = '불필요한 외출을 줄이고 실내 공기질을 관리하세요.';
      }
    }
  }
}


let LAST_COORD = null;
let CURRENT_STANDARD = 'KOR'; // 기본 4단계

/**
 * 위치 기반으로 모든 API 호출 및 UI를 업데이트합니다.
 */
async function updateAll(lat, lon) {
  LAST_COORD = { lat, lon };

  // 로딩 상태 표시
  const locBtn = document.querySelector('.location-button');
  const sta = document.getElementById('station-name');
  if (locBtn) locBtn.textContent = `위치 업데이트 중...`;
  if (sta) sta.textContent = '데이터 로딩 중...';
  
  try {
    const [air, place] = await Promise.all([
      fetchNearest(lat, lon),
      resolvePlaceName(lat, lon)
    ]);

    // 1. 현재 대기질 데이터 렌더링
    renderMain(air, CURRENT_STANDARD);
    
    // 2. 위치명 업데이트
    if (sta) sta.textContent = place || air.station?.name || air.name || '—';
    if (locBtn) locBtn.textContent = place || '현재 위치';

    // 3. 예보 데이터 렌더링
    const f = await fetchForecast(lat, lon, 24);
    renderForecast(f);
    
  } catch (error) {
    console.error('전체 업데이트 실패:', error);
    if (sta) sta.textContent = '업데이트 실패';
    if (locBtn) locBtn.textContent = '위치 재시도';
  }
}

/**
 * 사용자 위치를 가져와 updateAll을 호출하거나, 실패 시 서울 기본값으로 호출합니다.
 */
function initLocation(){
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => updateAll(pos.coords.latitude, pos.coords.longitude),
      () => {
        console.warn('위치 정보 가져오기 실패. 서울 기본값(37.5665, 126.9780)으로 설정.');
        updateAll(37.5665, 126.9780); 
      }
    );
  } else {
    console.warn('Geolocation API를 지원하지 않습니다. 서울 기본값(37.5665, 126.9780)으로 설정.');
    updateAll(37.5665, 126.9780); 
  }
}


/* ──────────────────────────────
 * 7. UI 바인딩 및 초기화 (DOMContentLoaded 내부로 통합)
 * ────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

    // **[선언 통합]: DOM 요소를 한 번만 선언**
    const tabItems = document.querySelectorAll('.tab-navigation .tab-item');
    const airContent = document.getElementById('tab-air-content');
    const forecastContent = document.getElementById('tab-forecast-content');
    const tabNavigation = document.querySelector('.tab-navigation');

    const slideMenuOverlay = document.querySelector('.slide-menu-overlay');
    const menuButton = document.querySelector('.notification-icon'); // 위치 재조회 버튼 역할 (종 모양)
    const logoButton = document.getElementById('app-logo');
    const searchOverlay = document.querySelector('.search-overlay');
    const searchButton = document.querySelector('.location-button');
    const menuItems = document.querySelectorAll('.slide-menu-nav .menu-item');

    const appHeader = document.querySelector('.App-header');
    const statusTitle = document.querySelector('.status-title');
    const statusScore = document.querySelector('.status-score');

    /**
     * 탭을 전환하고 콘텐츠를 표시/숨김 처리합니다.
     * @param {HTMLElement} clickedTab 활성화할 탭 요소
     */
    function switchTab(clickedTab) {
        // 탭 활성화 상태 업데이트
        tabItems.forEach(item => item.classList.remove('tab-item--active'));
        clickedTab.classList.add('tab-item--active');

        const tabKey = clickedTab.dataset.tab; // "air" 또는 "forecast"
        let position = (tabKey === 'air') ? '0%' : '50%';

        const showAir = (tabKey === 'air');
        const showEl = showAir ? airContent : forecastContent;
        const hideEl = showAir ? forecastContent : airContent;

        // 콘텐츠 표시/숨김 및 애니메이션
        hideEl.classList.remove('fade-in');
        hideEl.classList.add('hidden', 'fade-out');
        showEl.classList.remove('hidden');
        showEl.classList.add('fade-in');

        setTimeout(() => {
            hideEl.classList.add('hidden');
            hideEl.classList.remove('fade-out');
            showEl.classList.remove('fade-in');
        }, 300);

        // 탭 네비게이션 인디케이터 위치 업데이트
        tabNavigation.style.setProperty('--tab-left-position', position);
    }

    // 탭 클릭 이벤트 바인딩
    tabItems.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab));
    });

    // 슬라이드 메뉴 열기/닫기 (로고 버튼)
    logoButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        slideMenuOverlay.style.display = 'block';
    });

    slideMenuOverlay.addEventListener('click', (e) => {
        if (e.target === slideMenuOverlay) {
            slideMenuOverlay.style.display = 'none';
        }
    });

    // 검색 오버레이 열기/닫기 (위치명 버튼)
    searchButton.addEventListener('click', () => {
        searchOverlay.style.display = 'block';
    });
    searchOverlay.addEventListener('click', (e) => {
        if (e.target === searchOverlay) {
            searchOverlay.style.display = 'none';
        }
    });

    // 위치 재조회 버튼 (종 모양 아이콘)
    menuButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        initLocation(); // 위치 재조회
        slideMenuOverlay.style.display = 'none'; // 메뉴 닫기 (재조회 시)
    });

    // 메뉴 항목 클릭 시 서브 메뉴 토글
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const subMenu = item.nextElementSibling;

            // 다른 메뉴 닫기
            menuItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                    const otherSubMenu = otherItem.nextElementSibling;
                    if (otherSubMenu && otherSubMenu.classList.contains('sub-menu-box')) {
                        otherSubMenu.classList.remove('active');
                    }
                }
            });

            item.classList.toggle('active');
            if (subMenu && subMenu.classList.contains('sub-menu-box')) {
                subMenu.classList.toggle('active');
            }
        });
    });
    
    // **초기 로딩 시작**
    initLocation();
});
