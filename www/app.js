// /app.js
// 표준/색상표
import { STANDARDS } from './js/standards.js';
import { colorFor } from './js/color-scale.js';

console.log('[app] boot');

// ===== 설정 =====
const API_BASE = location.origin; // 같은 도메인/포트에서 API 띄웠으면 OK
const STANDARD = 'KOR';           // 통합색은 국내 4단계 기준

// ===== 셀렉터/유틸 =====
const $  = (q, el=document) => el.querySelector(q);
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
async function fetchNearest(lat=37.57, lon=126.98){
  const u = new URL('/nearest', API_BASE);
  u.searchParams.set('lat', lat);
  u.searchParams.set('lon', lon);
  const res = await fetch(u, {cache:'no-store'});
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function fetchForecast(lat=37.57, lon=126.98, horizon=24){
  const u = new URL('/forecast', API_BASE);
  u.searchParams.set('lat', lat);
  u.searchParams.set('lon', lon);
  u.searchParams.set('horizon', horizon);
  const res = await fetch(u, {cache:'no-store'});
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 서버 실패 시 최소 폴백(현재시각만 Open-Meteo에서 픽)
async function fetchNearestFallback(lat, lon){
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm2_5,pm10,o3,no2,so2,co&timezone=Asia%2FSeoul`;
  const j = await fetch(url, {cache:'no-store'}).then(r=>r.json());
  const i = (j.hourly?.time?.length || 1) - 1;
  const pick = (k)=> j.hourly?.[k]?.[i] ?? null;
  return {
    provider: 'OPENMETEO',
    name: `Open-Meteo(${lat.toFixed(2)},${lon.toFixed(2)})`,
    display_ts: j.hourly?.time?.[i] || '',
    pm10: pick('pm10'), pm25: pick('pm2_5'),
    o3: pick('o3'), no2: pick('no2'), so2: pick('so2'), co: pick('co'),
    badges: ['위성/모델 분석'],
    station: { name:'Open-Meteo', provider:'OPENMETEO', kind:'model', lat, lon }
  };
}



// ===== 게이지(통합색 한 색) =====
// ============ SVG 게이지 유틸 ============
// SVG 한 번만 주입 (div 도넛 숨김)
function ensureGaugeSVG() {
  const host = document.querySelector('.concentric-gauge');
  if (!host) return null;
  let svg = host.querySelector('svg.cg-svg');
  if (svg) return host;

  const NS = 'http://www.w3.org/2000/svg';
  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'cg-svg');
  svg.setAttribute('viewBox', '0 0 260 260');

  // 공통 파라미터: 두께/간격
  const THICK = 20;   // 링 두께(두 링 동일)
  const GAP   = 12;   // 두 링 사이 간격

  const cx = 130, cy = 130;
  const rOuter = 110;                       // 바깥 반지름
  const rInner = rOuter - THICK - GAP;      // 안쪽 반지름 = 두께+간격만큼 안쪽

  // 트랙/아크 생성 헬퍼
  const mkCircle = (cls, r) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', cx);
    c.setAttribute('cy', cy);
    c.setAttribute('r',  r);
    c.setAttribute('stroke-width', THICK); // 두께 통일
    return c;
  };

  // 바깥 링
  const outerTrack = mkCircle('cg-track cg-outer-track', rOuter);
  const outerArc   = mkCircle('cg-arc   cg-outer-arc',   rOuter);
  // 안쪽 링
  const innerTrack = mkCircle('cg-track cg-inner-track', rInner);
  const innerArc   = mkCircle('cg-arc   cg-inner-arc',   rInner);

  svg.append(outerTrack, outerArc, innerTrack, innerArc);
  host.appendChild(svg);
  host.classList.add('use-svg'); // div 도넛 감추기(네가 styles.css에 넣어둔 룰 사용)
  return host;
}

// 라운드 캡 + 시작각/노치 제어
function setArc(circleEl, progress /*0~1*/, color, { offsetDeg=-90, notchDeg=14 } = {}) {
  const r = parseFloat(circleEl.getAttribute('r'));
  const C = 2 * Math.PI * r;

  const notchFrac = notchDeg / 360;             // 항상 남길 빈틈
  const eff = Math.max(0, Math.min(1, progress)) * (1 - notchFrac);
  const filled = C * eff;

  const offset = C * (offsetDeg / 360);
  circleEl.style.stroke = color;
  circleEl.setAttribute('stroke-dasharray', `${filled} ${C}`);
  circleEl.setAttribute('stroke-dashoffset', String(offset));
}

// ============ 게이지 렌더(통합 색 1개) ============
// 기존 renderGauge 전체를 이걸로 교체
function renderGauge({ pm10, pm25, display_ts, badges, cai_grade }) {
  const host = ensureGaugeSVG();
  if (!host) return;
  const center = document.querySelector('.gauge-center-text');

  // 등급/색
  const g    = cai_grade ?? caiGradeKOR(pm10, pm25);
  const band = STANDARDS.KOR.bands[g-1];
  const color = band?.bg || '#3CB371';

  // 퍼센트(0~1)
  const p10 = Math.max(0, Math.min(1, (pm10 ?? 0) / 150));
  const p25 = Math.max(0, Math.min(1, (pm25 ?? 0) / 75));

  // 요소
  const svg = host.querySelector('svg.cg-svg');
  const outerArc = svg.querySelector('.cg-outer-arc');
  const innerArc = svg.querySelector('.cg-inner-arc');

  // 시작 각/노치(원하는 꺾쇠 위치로 조정 가능)
  setArc(outerArc, p10, color, { offsetDeg: -60, notchDeg: 14 }); // 바깥
  setArc(innerArc, p25, color, { offsetDeg: -30, notchDeg: 14 }); // 안쪽

  // 중앙/라벨
  center.innerHTML = `
    <div class="grade-big">${band?.label || '—'}</div>
    <div class="pm-summary">PM2.5 ${pm25!=null?pm25.toFixed(1):'—'} · PM10 ${pm10!=null?pm10.toFixed(1):'—'} <em>µg/m³</em></div>
    <div class="badges">${(badges||[]).join(' · ')}</div>
  `;
  $('#pm10-value').innerHTML = `${pm10!=null?pm10.toFixed(1):'--'} <em>µg/m³</em>`;
  $('#pm25-value').innerHTML = `${pm25!=null?pm25.toFixed(1):'--'} <em>µg/m³</em>`;

  // 히어로 그라데이션 연동(선택)
  const hero = $('.hero-section');
  if (hero) {
    hero.classList.remove('grade-1','grade-2','grade-3','grade-4');
    hero.classList.add(`grade-${g}`);
  }
  const noteEl = $('#forecast-note');
 if (noteEl) noteEl.textContent = '';

 const tsEl = $('.timestamp');
 if (tsEl) tsEl.replaceChildren(document.createTextNode(`${display_ts || ''} 업데이트`));
}


// ===== 보조수치 바(O3/NO2/SO2/CO) =====
function renderGasBars({o3, no2, so2, co}){
  const wrap = $('#linear-bars-container');
  if (!wrap) return;
  wrap.innerHTML = '';

  const rows = [
    { key:'o3',  label:'오존 O₃',        value:o3  },
    { key:'no2', label:'이산화질소 NO₂', value:no2 },
    { key:'so2', label:'아황산가스 SO₂', value:so2 },
    { key:'co',  label:'일산화탄소 CO',  value:co  },
  ];

  const maxByKey = {
    o3:  (STANDARDS.KOR?.breaks?.o3  ?? [60,120,180,240])[3] || 240,
    no2: (STANDARDS.KOR?.breaks?.no2 ?? [50,100,200,400])[3] || 400,
    so2: (STANDARDS.KOR?.breaks?.so2 ?? [20,80,150,300])[3] || 300,
    co:  (STANDARDS.KOR?.breaks?.co  ?? [300,600,900,1200])[3] || 1200,
  };

  rows.forEach(({key,label,value})=>{
    const row  = document.createElement('div'); row.className = 'bar-row';
    const lab  = document.createElement('span'); lab.className='bar-label';   lab.textContent = label;
    const prog = document.createElement('div');  prog.className='bar-progress';
    const fill = document.createElement('div');  fill.className='bar-fill';
    prog.appendChild(fill);
    const val  = document.createElement('span'); val.className='bar-value';
    val.textContent = (value==null ? '—' : `${Math.round(value)} µg/m³`);

    const max = maxByKey[key];
    fill.style.width = `${pct(value, max)}%`;
    const band = colorFor({ standard: STANDARD, metric: key, value });
    fill.style.background = band?.bg || '#7e7e7e';

    row.append(lab, prog, val);
    wrap.appendChild(row);
  });
}

// ===== 예보 그리드(백엔드 /forecast 기준: hourly) =====
function renderForecastGrid(f){
  const grid = $('#forecast-grid');
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

  const noteEl = $('#forecast-note');
if (noteEl) noteEl.textContent = `발행: ${f.issued_at || ''} · 구간: ${f.horizon || ''}`;
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

  // 헤더 요약
  const mainGrade =
    (air.pm25!=null) ? { bg: colorFor({standard:STANDARD,metric:'pm25',value:air.pm25})?.bg, label: STANDARDS.KOR.bands[caiGradeKOR(air.pm10, air.pm25)-1]?.label }
  : (air.pm10!=null) ? { bg: colorFor({standard:STANDARD,metric:'pm10',value:air.pm10})?.bg, label: STANDARDS.KOR.bands[caiGradeKOR(air.pm10, air.pm25)-1]?.label }
  : { bg:'#adb5bd', label:'—' };

  const gradeEl = $('#hero-grade-label');
  const scoreEl = $('#hero-score');
  const descEl  = $('#hero-desc');
  if (gradeEl){ gradeEl.textContent = mainGrade.label; gradeEl.style.color = mainGrade.bg || '#222'; }
  if (scoreEl){ scoreEl.textContent = String(scoreFrom(air)).padStart(2,'0'); }
  if (descEl){ descEl.textContent = air.cai_value!=null ? `지수 ${air.cai_value}` : '오늘의 대기질 총평입니다.'; }

  const stationEl = $('#station-name');
  if (stationEl) stationEl.textContent = `${air.station?.name || air.name || '—'}`;

  // 게이지 + 보조바
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

async function resolvePlaceName(lat, lon){
  // 1) 백엔드 카카오 리버스 지오코딩
  try{
    const r = await fetch(`${API_BASE}/geo/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, {cache:'no-store'});
    if (r.ok){
      const j = await r.json(); // {lat, lon, address, source}
      if (j?.address) return j.address;
    }
  }catch(_e){ /* silently fallback */ }

  // 2) Open-Meteo geocoding 폴백(가장 가까운 행정명)
  try{
    const u = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=ko&count=1`;
    const j = await fetch(u, {cache:'no-store'}).then(r=>r.json());
    const hit = j?.results?.[0];
    if (hit){
      // 예: "인천 송도동" 스타일
      return [hit.admin1, hit.name].filter(Boolean).join(' ');
    }
  }catch(_e){}

  // 3) 그래도 없으면 좌표로 표시
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}


// ===== 업데이트 =====
async function updateAll(lat, lon){
  try{
    let air;
    try {
      air = await fetchNearest(lat, lon);     // 정상 경로
    } catch(err) {
      console.warn('[nearest] backend failed → fallback', err);
      air = await fetchNearestFallback(lat, lon);
    }
    const fc = await fetchForecast(lat, lon, 24); // 백엔드 예보 사용

    renderMain(air);
    renderForecastGrid(fc);
      const place = await resolvePlaceName(lat, lon);
    const inp = document.getElementById('location-input');
    if (inp) inp.value = place;

    const stationEl = document.getElementById('station-name');
    if (stationEl) stationEl.textContent = place || (air.name || air.station?.name || '—');

  }catch(err){
    console.error('updateAll error:', err);
    const desc = document.getElementById('hero-desc');
    if (desc) desc.textContent = '데이터를 불러오지 못했습니다.';
  }
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
