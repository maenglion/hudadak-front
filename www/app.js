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
  const midAngle10 = (pm10Perc * 360) / 2; // 바깥휠(미세먼지) 중간각
  const midAngle25 = (pm25Perc * 360) / 2; // 안쪽휠(초미세먼지) 중간각

  // 도넛 시작각이 12시가 아니면 보정치 추가 (예: 3시 시작이면 +90)
  const OFFSET = 0; // 필요시 90, -90 등으로 조정
  if (window.updatePmConnectors) {
    window.updatePmConnectors({
      pm10Angle: midAngle10 + OFFSET,
      pm25Angle: midAngle25 + OFFSET
    });
  }
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

(function(){
  // 카드/도넛의 기하값(너의 SVG/Canvas 크기에 맞게 조정)
  const CX = 210, CY = 210;      // 도넛 중심
  const R_OUTER = 138;           // 바깥휠(미세먼지) 반지름
  const R_INNER = 103;           // 안쪽휠(초미세먼지) 반지름

  const card   = document.querySelector('.air-card');
  const svg    = card.querySelector('.connector-layer');

  const tick10 = card.querySelector('.components-pm10 .tick');
  const tick25 = card.querySelector('.components-pm25 .tick');

  const conn10 = svg.querySelector('#conn-pm10');
  const conn25 = svg.querySelector('#conn-pm25');
  const pin10  = svg.querySelector('#pin-pm10');
  const pin25  = svg.querySelector('#pin-pm25');

  function polarToXY(cx, cy, r, degFromTopClockwise){
    const a = (degFromTopClockwise - 90) * Math.PI/180; // 0°=12시 보정
    return { x: cx + r*Math.cos(a), y: cy + r*Math.sin(a) };
  }

  function pageToLocal(x, y, el){
    const b = el.getBoundingClientRect();
    return { x: x - b.left, y: y - b.top };
  }

  function anchorOfTick(tickEl){
    const r = tickEl.getBoundingClientRect();
    const c = { x: r.left + r.width/2, y: r.top + r.height/2 };
    return pageToLocal(c.x, c.y, card);
  }

  // === 너의 도넛 계산이 끝난 뒤(또는 값 갱신 때마다) 이 함수만 호출 ===
  // mid angles 예: pm10은 220°, pm25는 140° 처럼 넘겨줘
  window.updatePmConnectors = function({ pm10Angle, pm25Angle }){
    const s10 = anchorOfTick(tick10);
    const s25 = anchorOfTick(tick25);

    const e10 = polarToXY(CX, CY, R_OUTER, pm10Angle); // 바깥휠
    const e25 = polarToXY(CX, CY, R_INNER, pm25Angle); // 안쪽휠

    // 선 그리기
    conn10.setAttribute('x1', s10.x); conn10.setAttribute('y1', s10.y);
    conn10.setAttribute('x2', e10.x); conn10.setAttribute('y2', e10.y);

    conn25.setAttribute('x1', s25.x); conn25.setAttribute('y1', s25.y);
    conn25.setAttribute('x2', e25.x); conn25.setAttribute('y2', e25.y);

    // 끝점 핀(선택)
    pin10.setAttribute('cx', e10.x); pin10.setAttribute('cy', e10.y);
    pin25.setAttribute('cx', e25.x); pin25.setAttribute('cy', e25.y);
  };

  // 초기 테스트용(원하는 각도로 맞춰줘)
  // 바깥휠/안쪽휠 “중간 각도”를 넣으면 해당 지점으로 점선이 연결됨
  window.updatePmConnectors({ pm10Angle: 200, pm25Angle: 160 });

  // 라벨이 움직이는 레이아웃이라면 리사이즈 시 재계산
  window.addEventListener('resize', ()=> {
    // 마지막 각도를 기억해두었다가 다시 호출해줘
    // 예: updatePmConnectors(lastAngles);
  });
})();

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

function switchTab(clickedTab) {
    const tabItems = document.querySelectorAll('.tab-navigation .tab-item');
    const airContent = document.getElementById('tab-air-content');
    const forecastContent = document.getElementById('tab-forecast-content');
    const tabNavigation = document.querySelector('.tab-navigation');

    tabItems.forEach(item => item.classList.remove('tab-item--active'));
    clickedTab.classList.add('tab-item--active');

    const tabKey = clickedTab.dataset.tab; 
    let position = (tabKey === 'air') ? '0%' : '50%';
    
    const showAir = (tabKey === 'air');

    // 애니메이션 효과를 위한 CSS 클래스 적용
    const showEl = showAir ? airContent : forecastContent;
    const hideEl = showAir ? forecastContent : airContent;
    
    hideEl.classList.add('hidden', 'fade-out'); 
    showEl.classList.remove('hidden'); 
    showEl.classList.add('fade-in'); 
    
    setTimeout(() => {
        hideEl.classList.add('hidden');
        hideEl.classList.remove('fade-out');
        showEl.classList.remove('fade-in');
    }, 300); // CSS transition 시간과 맞춤

    // 밑줄 위치 변경
    tabNavigation.style.setProperty('--tab-left-position', position);
}

    // 2. 슬라이드 메뉴 열기 (로고 클릭)
    logoButton?.addEventListener('click', (e) => {
        e.stopPropagation(); 
        slideMenuOverlay.style.display = 'block';
    });
    
    // 3. 현재 위치 재조회 (알림 아이콘 클릭)
    menuButton?.addEventListener('click', (e) => {
        e.stopPropagation(); 
        initLocation(); // 위치 재조회 함수 호출
    });
    
    // 4. 슬라이드 메뉴 닫기 (오버레이 클릭)
    slideMenuOverlay?.addEventListener('click', (e) => {
        if (e.target === slideMenuOverlay) { 
            slideMenuOverlay.style.display = 'none';
        }
    });

    // 5. 슬라이드 메뉴 아코디언
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const subMenu = item.nextElementSibling;
            
            // 다른 메뉴 닫기 (하나만 열리도록)
            menuItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                    const otherSubMenu = otherItem.nextElementSibling;
                    if (otherSubMenu && otherSubMenu.classList.contains('sub-menu-box')) {
                         otherSubMenu.classList.remove('active');
                    }
                }
            });
            
            // 현재 메뉴 활성화/비활성화
            item.classList.toggle('active');

            // 하위 메뉴 토글
            if (subMenu && subMenu.classList.contains('sub-menu-box')) {
                subMenu.classList.toggle('active');
            }
        });
    });

    // 6. 검색 오버레이 열기/닫기
    searchButton?.addEventListener('click', () => {
        searchOverlay.style.display = 'block';
    });
    searchOverlay?.addEventListener('click', (e) => {
        if (e.target === searchOverlay) {
            searchOverlay.style.display = 'none';
        }
    });
    
    // 7. 기준 변경 라디오 버튼 이벤트
    document.querySelectorAll('input[name="standard"]').forEach(radio => {
        radio.addEventListener('change', e => {
            if (e.target.value === 'cai') {
                setStandard('KOR');
            } else if (e.target.value === 'who') {
                setStandard('WHO8'); 
            }
        });
    });

    // 검색 입력 관련 이벤트 (디바운스, 엔터)는 기존 로직을 따름
    const inp = document.getElementById('location-input');
    if (inp) {
        const autoSearch = debounce(() => doSearch(inp.value || ''), 350);
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                doSearch(inp.value || '');
            }
        });
        inp.addEventListener('input', autoSearch);
    }
}


// ===== 탭 전환 헬퍼 =====
const TAB_MAP = { air: 'tab-air-content', forecast: 'tab-forecast-content' };

function switchTab(tabOrName){
  const name = typeof tabOrName === 'string' ? tabOrName : tabOrName?.dataset?.tab;
  if(!name || !TAB_MAP[name]) return;

  // 버튼 상태 토글
  document.querySelectorAll('.tab-navigation .tab-item').forEach(b=>{
    const active = b.dataset.tab === name;
    b.classList.toggle('tab-item--active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  // 패널 표시/숨김 (hidden 속성만 사용 → CSS 불필요)
  document.querySelectorAll('.tab-content').forEach(p=>{
    p.hidden = (p.id !== TAB_MAP[name]);
  });
}

// ===== 디바운스 유틸 =====
function debounce(fn, wait=350){
  let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
}

// ===== 원래 방식의 addEventListener 바인딩 =====
let __uiBound = false;
function bindUIEvents() {
  if (__uiBound) return;           // 중복 방지
  __uiBound = true;

  // UI 요소 참조 (너가 준 선택자 그대로)
  const tabItems         = document.querySelectorAll('.tab-navigation .tab-item');
  const slideMenuOverlay = document.querySelector('.slide-menu-overlay');
  const menuButton       = document.querySelector('.notification-icon'); 
  const logoButton       = document.querySelector('.logo-text'); // HUDADAK 로고
  const searchOverlay    = document.querySelector('.search-overlay');
  const searchButton     = document.querySelector('.location-button');
  const menuItems        = document.querySelectorAll('.slide-menu-nav .menu-item');

  // 1. 탭 이벤트 연결
  tabItems.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab));
  });

  // 2. 슬라이드 메뉴 열기 (로고 클릭)
  logoButton && logoButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (slideMenuOverlay) slideMenuOverlay.style.display = 'block';
  });

  // 3. 현재 위치 재조회 (알림 아이콘 클릭)
  menuButton && menuButton.addEventListener('click', (e) => {
    e.stopPropagation();
    try { initLocation && initLocation(); } catch(_) {}
  });

  // 4. 슬라이드 메뉴 닫기 (오버레이 클릭)
  slideMenuOverlay && slideMenuOverlay.addEventListener('click', (e) => {
    if (e.target === slideMenuOverlay) slideMenuOverlay.style.display = 'none';
  });

  // 5. 슬라이드 메뉴 아코디언
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

      // 현재 메뉴 토글
      item.classList.toggle('active');
      if (subMenu && subMenu.classList.contains('sub-menu-box')) {
        subMenu.classList.toggle('active');
      }
    });
  });

  // 6. 검색 오버레이 열기/닫기
  searchButton && searchButton.addEventListener('click', () => {
    if (searchOverlay) searchOverlay.style.display = 'block';
  });
  searchOverlay && searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) searchOverlay.style.display = 'none';
  });

  // 7. 기준 변경 라디오 버튼 이벤트
  document.querySelectorAll('input[name="standard"]').forEach(radio => {
    radio.addEventListener('change', e => {
      const v = e.target.value;
      try {
        if (v === 'cai') setStandard && setStandard('KOR');
        else if (v === 'who') setStandard && setStandard('WHO8');
      } catch(_) {}
    });
  });

  // 8. 검색 입력 (디바운스, 엔터)
  const inp = document.getElementById('location-input');
  if (inp) {
    const autoSearch = debounce(() => { try { doSearch && doSearch(inp.value || ''); } catch(_) {} }, 350);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        try { doSearch && doSearch(inp.value || ''); } catch(_) {}
      }
    });
    inp.addEventListener('input', autoSearch);
  }

  // 9. 초기 탭 세팅 (HTML에서 active로 표시된 버튼 기준)
  const initial = document.querySelector('.tab-navigation .tab-item.tab-item--active')?.dataset.tab || 'air';
  switchTab(initial);
}

// DOM 로드 후 한 번만 바인딩
document.addEventListener('DOMContentLoaded', bindUIEvents);

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

/* =========================================================
   9. 시작
   ========================================================= */
window.addEventListener('DOMContentLoaded', () => {
  console.log('[app] boot');
  bindUIEvents();
  initLocation();
});