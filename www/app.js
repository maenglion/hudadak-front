// /app.js
// 표준/색상표
import { STANDARDS } from './js/standards.js';
import { colorFor } from './js/color-scale.js';

console.log('[app] boot');

// ===== 설정 =====
// ===== API BASE =====
const API_BASE = window.__API_BASE__ || new URLSearchParams(location.search).get('api') || ''; // '' 이면 상대경로

function api(path) {
  if (!API_BASE) return path;              // '/nearest'
  if (API_BASE.startsWith('http')) return `${API_BASE}${path}`;
  return `${API_BASE}${path}`;             // '/backend/nearest'
}

async function getJSON(url, opt={}) {
  const r = await fetch(url, { cache:'no-store', ...opt });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const STANDARD = 'KOR';           // 통합색은 국내 4단계 기준

// ===== 셀렉터/유틸 =====
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const pct = (v, max) => (v==null ? 0 : Math.round(clamp01(v / max) * 100));


// ===== 국내 4단계 통합등급(1~4) =====
function caiGradeKOR(pm10, pm25){
  const b = STANDARDS.KOR.breaks;
  const g10 = pm10==null ? 1 : (pm10<=b.pm10[0]?1: pm10<=b.pm10[1]?2: pm10<=b.pm10[2]?3:4);
  const g25 = pm25==null ? 1 : (pm25<=b.pm25[0]?1: pm25<=b.pm25[1]?2: pm25<=b.pm25[2]?3:4);
  return Math.max(g10, g25);
}

// ===== 점수(대략 100점 스케일) =====
function scoreFrom(air){
  const p25 = air.pm25 ?? 0, p10 = air.pm10 ?? 0;
  const s25 = Math.max(0, 100 - (p25*1.2));
  const s10 = Math.max(0, 100 - (p10*0.6));
  return Math.round(Math.max(0, Math.min(100, (s25*0.6 + s10*0.4))));
}

// ===== API =====
async function fetchNearest(lat, lon) {
  const u = `${api('/nearest')}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  return getJSON(u);
}

async function fetchForecast(lat, lon, horizon=24) {
  const u = `${api('/forecast')}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&horizon=${horizon}`;
  return getJSON(u);
}

// 서버 실패 시 최소 폴백(현재시각만 Open-Meteo에서 픽)
async function fetchNearestFallback(lat, lon) {
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide` +
    `&timezone=Asia%2FSeoul`;
  const j = await getJSON(url);
  const h = j?.hourly || {};
  const t = h.time || [];
  const i = t.length ? Math.max(0, t.length - 1) : 0;
  const pick = k => (h[k] && h[k][i]) ?? null;
  return {
    provider: 'OPENMETEO',
    name: `OpenMeteo(${(+lat).toFixed(2)},${(+lon).toFixed(2)})`,
    station_id: 0,
    display_ts: t[i] ? (t[i].length===16 ? `${t[i]}:00` : t[i]) : null,
    pm10: pick('pm10'), pm25: pick('pm2_5'),
    o3: pick('ozone'), no2: pick('nitrogen_dioxide'),
    so2: pick('sulphur_dioxide'), co: pick('carbon_monoxide'),
    unit_pm10:'µg/m³', unit_pm25:'µg/m³',
    source_kind:'model', lat, lon,
    station:{name:'Open-Meteo', provider:'OPENMETEO', kind:'model'},
    badges:['위성/모델 분석'],
  };
}



// ===== 게이지(통합색 한 색) =====
// ============ SVG 게이지 유틸 ============
// SVG 한 번만 주입 (div 도넛 숨김)
function ensureGaugeSvg() {
  const wrap = document.querySelector('#tab-air-quality .concentric-gauge');
  if (!wrap) return null;
  wrap.classList.add('use-svg');

  let svg = wrap.querySelector('svg.cg-svg');
  if (svg) return svg;

  const ns = 'http://www.w3.org/2000/svg';
  svg = document.createElementNS(ns,'svg');
  svg.classList.add('cg-svg');
  svg.setAttribute('viewBox','0 0 260 260');
  wrap.prepend(svg);

  // 바깥 트랙/아크 (r=90, 두께 CSS에서 22)
  const ot = document.createElementNS(ns,'circle');
  ot.setAttribute('cx','130'); ot.setAttribute('cy','130'); ot.setAttribute('r','90');
  ot.setAttribute('class','cg-track');
  svg.appendChild(ot);

  const oa = document.createElementNS(ns,'circle');
  oa.setAttribute('cx','130'); oa.setAttribute('cy','130'); oa.setAttribute('r','90');
  oa.setAttribute('class','cg-arc'); oa.id='cg-outer-arc';
  svg.appendChild(oa);

  // 안쪽 트랙/아크 (r=60, 같은 두께)
  const it = document.createElementNS(ns,'circle');
  it.setAttribute('cx','130'); it.setAttribute('cy','130'); it.setAttribute('r','60');
  it.setAttribute('class','cg-track cg-inner-track');
  svg.appendChild(it);

  const ia = document.createElementNS(ns,'circle');
  ia.setAttribute('cx','130'); ia.setAttribute('cy','130'); ia.setAttribute('r','60');
  ia.setAttribute('class','cg-arc cg-inner-arc'); ia.id='cg-inner-arc';
  svg.appendChild(ia);

  return svg;
}

// 라운드 캡 + 시작각/노치 제어
function setArc(circleEl, ratio, color) {
  const r = parseFloat(circleEl.getAttribute('r'));
  const C = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, ratio)) * C;
  circleEl.setAttribute('stroke-dasharray', `${p} ${C - p}`);
  circleEl.setAttribute('transform', `rotate(-90 130 130)`);
  if (color) circleEl.setAttribute('stroke', color);
}

// ============ 게이지 렌더(통합 색 1개) ============
// 기존 renderGauge 전체를 이걸로 교체
function renderGauge(air){
  const svg = ensureGaugeSvg();
  if (!svg) return;

  const g = (air.cai_grade!=null) ? air.cai_grade : caiGradeKOR(air.pm10, air.pm25);
  const band = STANDARDS.KOR.bands[(g||2)-1];
  const color = band?.bg || '#3CB371';

  const p10 = (air.pm10 ?? 0) / 150;  // 0~1
  const p25 = (air.pm25 ?? 0) / 75;

  setArc(svg.querySelector('#cg-outer-arc'), p10, color);
  setArc(svg.querySelector('#cg-inner-arc'), p25, color);

  const center = document.querySelector('.gauge-center-text');
  if (center){
    center.innerHTML = `
      <div class="grade-big">${band?.label || '—'}</div>
      <div class="pm-summary">PM2.5 ${air.pm25!=null?air.pm25.toFixed(1):'—'} · PM10 ${air.pm10!=null?air.pm10.toFixed(1):'—'} <em>µg/m³</em></div>
      <div class="badges">${(air.badges||[]).join(' · ')}</div>
    `;
  }
  const pm10Val = document.getElementById('pm10-value');
  const pm25Val = document.getElementById('pm25-value');
  if (pm10Val) pm10Val.innerHTML = `${air.pm10!=null?air.pm10.toFixed(1):'--'} <em>µg/m³</em>`;
  if (pm25Val) pm25Val.innerHTML = `${air.pm25!=null?air.pm25.toFixed(1):'--'} <em>µg/m³</em>`;
}


// ===== 보조수치 바(O3/NO2/SO2/CO) =====
function renderGasBars(air){
  const wrap = document.getElementById('linear-bars-container');
  if (!wrap) return;
  wrap.innerHTML = '';

  const metas = [
    { key:'o3',  label:'오존 O₃',       max:240 },
    { key:'no2', label:'이산화질소 NO₂', max:200 },
    { key:'so2', label:'아황산가스 SO₂', max:150 },
    { key:'co',  label:'일산화탄소 CO',  max:1200 },
  ];

  for (const m of metas){
    const v = air[m.key];
    const pct = (v==null) ? 0 : Math.max(0, Math.min(1, v/m.max));
    const item = document.createElement('div');
    item.className = 'linear-bar-item';
    item.innerHTML = `
      <div class="bar-label">${m.label}</div>
      <div class="bar-wrapper"><div class="bar-fill" style="width:${(pct*100).toFixed(0)}%"></div></div>
      <div class="bar-value">${v!=null?`${Math.round(v)} µg/m³`:'—'}</div>
    `;
    wrap.appendChild(item);
  }
}

// ===== 예보 그리드(백엔드 /forecast 기준: hourly) =====
function renderForecastGrid(f){
  const grid = document.getElementById('forecast-grid');
  if (!grid) return;
  grid.innerHTML = ''; 

  (f.hourly || []).forEach(h=>{
    const item = document.createElement('div');
    item.className = 'forecast-cell';
    const time = (h.ts || '').slice(11,16);

    const g = h.grade ?? caiGradeKOR(h.pm10, h.pm25);
    const band = STANDARDS.KOR.bands[g-1];
    const color = band?.bg || '#999';

    item.innerHTML = `
      <div class="fc-time">${time}</div>
      <div class="fc-val">
        <span>PM2.5 ${h.pm25?.toFixed?.(0) ?? '–'}</span>
        <span>PM10 ${h.pm10?.toFixed?.(0) ?? '–'}</span>
      </div>
      <div class="fc-meta">
        <span class="dot" style="background:${color}"></span>
        <span>${band?.label || ''}</span>
        <span>바람 ${h.wind_spd??'–'}m/s</span>
      </div>
    `;
    grid.appendChild(item);
  });


  
  const note = document.getElementById('forecast-note');
  if (note) note.textContent = `발행: ${f.issued_at || ''} · 구간: ${f.horizon || ''}`;
} 

function setupTabs(){
  const btns = $$('.tab-button');
  const panes = $$('.tab-content');
  btns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const target = btn.dataset.tab; // "air-quality" | "weather-forecast"
      btns.forEach(b=>b.classList.toggle('active', b===btn));
      panes.forEach(p=>p.classList.toggle('active', p.id === `tab-${target}`));
    });
  });
}

// 로고/버튼으로 설정 패널 열기/닫기 (있을 때만)
function setupSettingsPanel(){
  const openEl  = document.getElementById('settings-btn')
              || document.getElementById('app-logo')
              || document.querySelector('.brand, .logo, .header-logo');
  const panel   = document.getElementById('settings-panel');
  const dim     = document.getElementById('settings-backdrop');
  const toggle = () => {
    const open = !panel?.classList.contains('is-open');
    panel?.classList.toggle('is-open', open);
    dim?.classList.toggle('is-visible', open);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  openEl?.addEventListener('click', toggle);
  dim?.addEventListener('click', toggle);
}

window.addEventListener('DOMContentLoaded', ()=>{
  setupTabs();
  setupSettingsPanel();
  // … 기존 initLocation() 호출 등 나머지 초기화는 그대로 두면 됨
});


// ===== 메인 바인딩 =====
function renderMain(air){
  if (!air) return;

  const mainGrade =
    (air.pm25!=null) ? { bg: colorFor({standard:'KOR',metric:'pm25',value:air.pm25})?.bg,
                         label: STANDARDS.KOR.bands[caiGradeKOR(air.pm10, air.pm25)-1]?.label }
  : (air.pm10!=null) ? { bg: colorFor({standard:'KOR',metric:'pm10',value:air.pm10})?.bg,
                         label: STANDARDS.KOR.bands[caiGradeKOR(air.pm10, air.pm25)-1]?.label }
  : { bg:'#adb5bd', label:'—' };

  const gradeEl = document.getElementById('hero-grade-label');
  const scoreEl = document.getElementById('hero-score');
  const descEl  = document.getElementById('hero-desc');
  if (gradeEl){ gradeEl.textContent = mainGrade.label; gradeEl.style.color = mainGrade.bg || '#222'; }
  if (scoreEl){ scoreEl.textContent = String(scoreFrom(air)).padStart(2,'0'); }
  if (descEl){ descEl.textContent = (air.cai_value!=null) ? `지수 ${air.cai_value}` : '오늘의 대기질 총평입니다.'; }

  // ❗️여기서는 place 안 씀 — updateAll()에서 역지오코딩 후 다시 세팅함
  const stationEl = document.getElementById('station-name');
  if (stationEl) stationEl.textContent = air.station?.name || air.name || '—';

  // 게이지 + 보조바 (함수 **안**에 있어야 함)
  renderGauge(air);
  renderGasBars(air);
}


// ===== 검색/지오 =====
async function geocode(q){
  const m = String(q||'').trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return { lat:+m[1], lon:+m[2], address:`${m[1]},${m[2]}` };

  // 백엔드 카카오 주소(우리 엔드포인트: /geo/address?q=)
  try{
    const r = await fetch(`${API_BASE}/geo/address?q=${encodeURIComponent(q)}`, { cache:'no-store' });
    if (r.ok) return await r.json(); // {lat, lon, address}
  }catch(e){ console.debug('[geocode] backend failed, fallback to OM'); }

  // Open-Meteo 지오코딩 폴백
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=ko`;
  const j = await fetch(u, { cache:'no-store' }).then(r=>r.json());
  const hit = j?.results?.[0];
  if (!hit) throw new Error('no result');
  return { lat:hit.latitude, lon:hit.longitude, address:[hit.country, hit.admin1, hit.name].filter(Boolean).join(' · ') };
}

async function doSearch(q){
  if (!q) return;
  try{
    const g = await geocode(q);
    const inp = document.getElementById('location-input');
    if (inp) inp.value = g.address;
    await updateAll(g.lat, g.lon);
  }catch(e){
    console.error(e);
    alert('주소를 찾지 못했습니다. "37.57,126.98"처럼 위도,경도로도 입력할 수 있어요.');
  }
}

async function resolvePlaceName(lat, lon) {
  try {
    if (API_BASE) {
      const u = `${api('/geo/reverse')}?lat=${lat}&lon=${lon}`;
      const j = await getJSON(u);
      return j?.address || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  } catch(_) {}
  // 외부 역지오(OM) CORS 막히면 좌표로 폴백
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}


// ===== 업데이트 =====
async function updateAll(lat, lon){
  let air, f;
  try { air = await fetchNearest(lat, lon); }
  catch(e){ console.warn('[nearest] backend failed → fallback', e); air = await fetchNearestFallback(lat, lon); }

  try { f = await fetchForecast(lat, lon, 24); }
  catch(e){ console.warn('[forecast] backend failed', e); }

  // 위치 라벨
  const place = await resolvePlaceName(lat, lon);
  const stationEl = document.getElementById('station-name');
  if (stationEl) stationEl.textContent = place || (air.name || air.station?.name || '—');

  // 히어로
  const tsEl = document.querySelector('.timestamp');
  if (tsEl) tsEl.textContent = air.display_ts ? `${air.display_ts} 업데이트` : '';

  // 카드 렌더
  renderGauge(air);
  renderGasBars(air);

  // 예보 요약 라벨(있으면)
  const note = document.getElementById('forecast-note');
  if (f && note) note.textContent = `발행: ${f.issued_at || ''} · 구간: ${f.horizon || ''}`;
}

// ===== 초기화/바인딩 =====
function bindUIEvents(){
  // 설정 패널(있으면만)
  const settingsBtn      = document.getElementById('settings-btn');
  const settingsPanel    = document.getElementById('settings-panel');
  const settingsBackdrop = document.getElementById('settings-backdrop');

  const openSettings = () => {
    settingsPanel?.classList.add('is-open');
    settingsBackdrop?.classList.add('is-visible');
    settingsBtn?.setAttribute('aria-expanded','true');
    document.body.style.overflow = 'hidden';
  };
  const closeSettings = () => {
    settingsPanel?.classList.remove('is-open');
    settingsBackdrop?.classList.remove('is-visible');
    settingsBtn?.setAttribute('aria-expanded','false');
    document.body.style.overflow = '';
  };

  settingsBtn?.addEventListener('click', openSettings);
  settingsBackdrop?.addEventListener('click', closeSettings);

  // 탭
  setupTabs();

  // 검색 인풋 엔터
  const inp = document.getElementById('location-input');
  inp?.addEventListener('keydown', (e)=>{ if (e.key==='Enter') doSearch(inp.value||''); });

  // 현재위치 버튼
  const currentBtn = document.getElementById('current-btn');
  currentBtn?.addEventListener('click', ()=>initLocation());
}

function initLocation(){
  const urlParams = new URLSearchParams(window.location.search);
  const lat = urlParams.get('lat');
  const lon = urlParams.get('lon');

  if (lat && lon) {
    updateAll(parseFloat(lat), parseFloat(lon));
  } else {
    navigator.geolocation.getCurrentPosition(
      (pos) => updateAll(pos.coords.latitude, pos.coords.longitude),
      () => updateAll(37.5665, 126.9780) // 서울 기본
    );
  }
}

window.addEventListener('DOMContentLoaded', ()=>{
  bindUIEvents();
  initLocation();
});
