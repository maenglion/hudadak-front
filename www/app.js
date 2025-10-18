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
const setText = (id, text) => { const n = document.getElementById(id); if (n) n.textContent = text; };

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

// ===== 탭 =====
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

// ===== 게이지(통합색 한 색) =====
function renderGauge({pm10, pm25, name, display_ts, badges, cai_grade}){
  const outer = $('#pm10-gauge');  // 바깥( PM10 )
  const inner = $('#pm25-gauge');  // 안쪽( PM2.5 )
  const center = $('.gauge-center-text');

  const g = cai_grade ?? caiGradeKOR(pm10, pm25);
  const band = STANDARDS.KOR.bands[g-1];
  const color = band?.bg || '#888';

  const p10 = pct(pm10, 150);
  const p25 = pct(pm25, 75);

  // conic-gradient로 채움 (마스크 CSS 필수!)
  outer.style.background = `conic-gradient(${color} ${p10}%, #e9edf2 0)`;
  inner.style.background = `conic-gradient(${color} ${p25}%, #e9edf2 0)`;

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

  // 타임스탬프
  $('#forecast-note')?.textContent = '';
  $('.timestamp')?.replaceChildren(document.createTextNode(`${display_ts || ''} 업데이트`));
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

  $('#forecast-note')?.textContent = `발행: ${f.issued_at || ''} · 구간: ${f.horizon || ''}`;
}

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
  }catch(err){
    console.error('updateAll error:', err);
    setText('hero-desc', '데이터를 불러오지 못했습니다.');
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
