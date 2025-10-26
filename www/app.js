// /app.js
// 표준/색상표
import { STANDARDS } from './js/standards.js';
import { colorFor } from './js/color-scale.js';

// ===== 설정 =====
// ===== API BASE =====
const API_BASE = (window.__API_BASE__ ?? '').trim(); // 예: '/backend' or 'https://…'
if (!API_BASE) console.info('API_BASE is empty, will use relative paths like /nearest');


// endpoint builders (문자열 합치기로 간단/안전)
const NEAREST_URL  = (lat,lon)=> `${API_BASE}/nearest?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
const FORECAST_URL = (lat,lon,h=24)=> `${API_BASE}/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&horizon=${h}`;
const REVERSE_URL  = (lat,lon)=> `${API_BASE}/geo/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;

// Open-Meteo 폴백(정식 키 사용! o3/so2 아님)
const OM_AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const AQ_KEYS = 'pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide';
const OM_WX = 'https://api.open-meteo.com/v1/forecast';


// 1) 디바운스 유틸 (app.js 상단 아무 데나)
function debounce(fn, delay=300){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), delay); };
}

async function getJSON(url, opt={}) {
  const r = await fetch(url, { cache:'no-store', ...opt });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ───────── grade/colors (간단형) ─────────
const CAI_COLORS = {1:'#3CB371',2:'#F1C40F',3:'#E67E22',4:'#E74C3C'};
const LABEL = {1:'좋음',2:'보통',3:'나쁨',4:'매우나쁨'};
const gradePM10 = v => v==null?null : v<=30?1 : v<=80?2 : v<=150?3 : 4;
const gradePM25 = v => v==null?null : v<=15?1 : v<=35?2 : v<=75?3 : 4;
const caiGrade  = (pm10,pm25)=>{
  const g10 = gradePM10(pm10), g25 = gradePM25(pm25);
  if (g10==null && g25==null) return null;
  return Math.max(g10 ?? g25, g25 ?? g10);
};

// ===== 셀렉터/유틸 =====
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const nowKSTHour = () => {
  const d = new Date();
  const tz = d.getTime() + (9 * 60 - d.getTimezoneOffset())*60000;
  const k = new Date(tz); k.setMinutes(0,0,0);
  // "YYYY-MM-DDTHH:MM"
  return `${k.toISOString().slice(0,13)}:${k.toISOString().slice(14,16)}`;
};

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
  try {
    return await getJSON(NEAREST_URL(lat,lon));
  } catch (e) {
    console.warn('[nearest] backend failed → fallback', e);
    // Open-Meteo 폴백(모델 최신값 1개 픽)
    const u = `${OM_AQ}?latitude=${lat}&longitude=${lon}&hourly=${AQ_KEYS}&timezone=Asia%2FSeoul`;
    const j = await getJSON(u);
    const h = j.hourly ?? {};
    const t = h.time ?? [];
    const idx = Math.max(0, t.findLastIndex(ts => ts <= nowKSTHour()));
    const pick = k => (h[k]||[])[idx] ?? null;
    return {
      provider: 'OPENMETEO',
      name: `OpenMeteo(${Number(lat).toFixed(2)},${Number(lon).toFixed(2)})`,
      display_ts: t[idx] ? `${t[idx]}:00` : null,
      pm10: pick('pm10'),
      pm25: pick('pm2_5'),
      o3:  pick('ozone'),
      no2: pick('nitrogen_dioxide'),
      so2: pick('sulphur_dioxide'),
      co:  pick('carbon_monoxide'),
      source_kind: 'model',
      lat, lon,
      station: {name:'Open-Meteo', provider:'OPENMETEO', kind:'model'},
      badges: ['위성/모델 분석'],
      cai_grade: caiGrade(pick('pm10'), pick('pm2_5')),
    };
  }
}

async function fetchForecast(lat, lon, horizon=24) {
  try {
    return await getJSON(FORECAST_URL(lat,lon,horizon));
  } catch (e) {
    // 백엔드 실패 시: 공기질+날씨 한 번에 폴백(시간별)
    console.warn('[forecast] backend failed → fallback', e);
    const aqU = `${OM_AQ}?latitude=${lat}&longitude=${lon}&hourly=${AQ_KEYS}&timezone=Asia%2FSeoul`;
    const wxU = `${OM_WX}?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m,precipitation&timezone=Asia%2FSeoul`;
    const [aq, wx] = await Promise.all([getJSON(aqU), getJSON(wxU)]);
    const t = (aq.hourly?.time ?? []);
    const start = Math.max(0, t.findLastIndex(ts => ts <= nowKSTHour()));
    const end = Math.min(t.length, start + horizon);
    const hourly = [];
    for (let i=start;i<end;i++){
      const pm10 = aq.hourly.pm10?.[i] ?? null;
      const pm25 = aq.hourly.pm2_5?.[i] ?? null;
      hourly.push({
        ts: `${t[i]}:00`,
        pm10, pm25,
        grade: caiGrade(pm10, pm25) ?? 2,
        wind_spd: wx.hourly?.wind_speed_10m?.[i] ?? null,
        wind_dir: wx.hourly?.wind_direction_10m?.[i] ?? null,
        precip:   wx.hourly?.precipitation?.[i] ?? null,
      });
    }
    return {
      station: {id:`openmeteo-${lat.toFixed(2)},${lon.toFixed(2)}`, name:'모델 예보 (Open-Meteo)'},
      horizon: `${hourly.length}h`,
      issued_at: hourly[0]?.ts ?? null,
      hourly,
      model: {type:'openmeteo_fallback', version:'1.0'},
    };
  }
}

// ===== 게이지(통합색 한 색) =====
// ============ SVG 게이지 유틸 ============
// SVG 한 번만 주입 (div 도넛 숨김)
function ensureGaugeSVG() {
  const wrap = document.querySelector('.concentric-gauge');
  if (!wrap || wrap.classList.contains('use-svg')) return;
  wrap.classList.add('use-svg');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class','cg-svg');
  svg.setAttribute('viewBox','0 0 260 260');

  // 바깥
  const track1 = document.createElementNS(svg.namespaceURI,'circle');
 + track1.setAttribute('cx','130'); track1.setAttribute('cy','130'); track1.setAttribute('r','100'); track1.setAttribute('class','cg-track');
  const arc1 = document.createElementNS(svg.namespaceURI,'circle');
  track2.setAttribute('cx','130'); track2.setAttribute('cy','130'); track2.setAttribute('r','68');  track2.setAttribute('class','cg-track cg-inner-track');

  // 안쪽
  const track2 = document.createElementNS(svg.namespaceURI,'circle');
 arc1.setAttribute('cx','130');   arc1.setAttribute('cy','130');   arc1.setAttribute('r','100');   arc1.setAttribute('class','cg-arc cg-outer-arc');
  const arc2 = document.createElementNS(svg.namespaceURI,'circle');
arc2.setAttribute('cx','130');   arc2.setAttribute('cy','130');   arc2.setAttribute('r','68');    arc2.setAttribute('class','cg-arc cg-inner-arc');

  svg.append(track1, arc1, track2, arc2);
  wrap.appendChild(svg);
}
function setArc(el, percent, color='#3CB371'){
  const r = Number(el.getAttribute('r'));
  const C = 2 * Math.PI * r;
  const on = Math.max(0, Math.min(1, percent)) * C;
  el.style.strokeDasharray = `${on} ${C - on}`;
  el.style.transform = 'rotate(-90deg)';
  el.style.transformOrigin = '50% 50%';
  el.style.stroke = color;
}
function renderGauge(data){
  ensureGaugeSVG();
  const {pm10, pm25, display_ts, badges, cai_grade} = data;
  const g = cai_grade ?? caiGrade(pm10, pm25) ?? 2;
  const color = CAI_COLORS[g] || '#3CB371';

  const outerArc = document.querySelector('.cg-outer-arc');
  const innerArc = document.querySelector('.cg-inner-arc');
  setArc(outerArc, (pm10 ?? 0)/150, color);
  setArc(innerArc, (pm25 ?? 0)/75,  color);

  const center = document.querySelector('.gauge-center-text');
  if (center){
    center.innerHTML = `
      <div class="grade-big">${LABEL[g] ?? '—'}</div>
      <div class="pm-summary">PM2.5 ${pm25!=null?pm25.toFixed(1):'—'} · PM10 ${pm10!=null?pm10.toFixed(1):'—'} <em>µg/m³</em></div>
      <div class="badges">${(badges||[]).join(' · ')}</div>
    `;
  }
  const hero = document.querySelector('.hero-section');
  if (hero){ hero.classList.remove('grade-1','grade-2','grade-3','grade-4'); hero.classList.add(`grade-${g}`); }
  const pm10El = document.getElementById('pm10-value');
  const pm25El = document.getElementById('pm25-value');
  if (pm10El) pm10El.innerHTML = `${pm10!=null?pm10.toFixed(1):'--'} <em>µg/m³</em>`;
  if (pm25El) pm25El.innerHTML = `${pm25!=null?pm25.toFixed(1):'--'} <em>µg/m³</em>`;

  const tsEl = document.querySelector('.timestamp');
  if (tsEl) tsEl.textContent = display_ts ? `${display_ts} 업데이트` : '';
}

// ───────── 기타 지표 (수평바 4개) ─────────
function renderLinearBars(d){
  const wrap = document.getElementById('linear-bars-container');
  if (!wrap) return;
  wrap.innerHTML = '';
  const items = [
    {k:'o3',  label:'오존 O₃', unit:'µg/m³'},
    {k:'no2', label:'이산화질소 NO₂', unit:'µg/m³'},
    {k:'so2', label:'아황산가스 SO₂', unit:'µg/m³'},
    {k:'co',  label:'일산화탄소 CO', unit:'µg/m³'},
  ];
  items.forEach(it=>{
    const v = d[it.k];
    const el = document.createElement('div');
    el.className = 'linear-bar-item';
    el.innerHTML = `
      <div class="bar-label">${it.label}</div>
      <div class="bar-wrapper"><div class="bar-fill" style="width:${v==null?0:Math.min(100, (Number(v)/ (it.k==='co'?1200:180))*100)}%"></div></div>
      <div class="bar-value">${v!=null?Math.round(v):'--'} ${it.unit}</div>
    `;
    wrap.appendChild(el);
  });
}

// ───────── 예보(10개만, 카드형) ─────────
function renderForecast(f){
  const grid = document.getElementById('forecast-grid');
  const note = document.getElementById('forecast-note');
  if (!grid) return;
  grid.innerHTML = '';

  const take = (f.hourly||[]).slice(0,10); // 최신 10개
  take.forEach(h=>{
    const dt = new Date(h.ts.replace(' ','T'));
    const hh = String(dt.getHours()).padStart(2,'0')+':00';
    const g  = h.grade ?? caiGrade(h.pm10,h.pm25) ?? 2;
    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      <div class="forecast-day">${hh}</div>
      <div class="forecast-icon">🔮</div>
      <div class="forecast-temp">
        <div><strong>${LABEL[g]}</strong> · 바람 ${h.wind_spd!=null?h.wind_spd:'-'} m/s</div>
        <div class="forecast-desc">초미세먼지 ${h.pm25!=null?h.pm25:'-'} · 미세먼지 ${h.pm10!=null?h.pm10:'-'}</div>
      </div>
    `;
    grid.appendChild(card);
  });
  if (note) note.textContent = `발행: ${f.issued_at||''} · 구간: ${f.horizon||''} · 예측`;
}

function bindTabs() {
  const btns  = Array.from(document.querySelectorAll('.tab-button'));
  const panes = Array.from(document.querySelectorAll('.tab-content'));
  if (!btns.length || !panes.length) return;

  const activate = (key) => {
    btns.forEach(b => b.classList.toggle('active', b.dataset.tab === key));
    panes.forEach(p => p.classList.toggle('active', p.id === `tab-${key}`));
  };

  // 클릭 바인딩 (1회만)
  btns.forEach(btn => {
    btn.addEventListener('click', () => activate(btn.dataset.tab));
  });

  // 초기 활성 탭 결정: HTML에 active가 없으면 첫 탭으로
  const initial = document.querySelector('.tab-button.active')?.dataset.tab
                  || btns[0]?.dataset.tab;
  if (initial) activate(initial);
}

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
  // ✅ 수정: 존재하지 않는 renderGasBars 대신 renderLinearBars 호출
  renderLinearBars(air);
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
  try {
    const j = await getJSON(REVERSE_URL(lat,lon));
    return j?.address || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`; // 카카오 키 없으면 백엔드 500 → 좌표표시
  }
}

// ===== 업데이트 =====
async function updateAll(lat, lon){
  const air = await fetchNearest(lat,lon);
  renderGauge(air);
  renderLinearBars(air);
  const place = await resolvePlaceName(lat,lon);
  const sta = document.getElementById('station-name');
  if (sta) sta.textContent = place || (air.name || air.station?.name || '—');

  const f = await fetchForecast(lat,lon,24);
  renderForecast(f);
}

// ===== 초기화/바인딩 =====
function bindUIEvents(){
  // 설정 패널(있으면만)
  const settingsBtn      = document.getElementById('settings-btn') || document.getElementById('app-logo') || document.querySelector('.brand, .logo, .header-logo');
  const settingsPanel    = document.getElementById('settings-panel');
  const settingsBackdrop = document.getElementById('settings-backdrop');

  const toggleSettings = () => {
    const isOpen = !settingsPanel?.classList.contains('is-open');
    settingsPanel?.classList.toggle('is-open', isOpen);
    settingsBackdrop?.classList.toggle('is-visible', isOpen);
    settingsBtn?.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
  };

  settingsBtn?.addEventListener('click', toggleSettings);
  settingsBackdrop?.addEventListener('click', toggleSettings);

  // 검색 인풋 엔터
  const inp = document.getElementById('location-input');
  inp?.addEventListener('keydown', (e)=>{ if (e.key==='Enter') doSearch(inp.value||''); });
  
  // 2) 자동검색 핸들러 (기존 코드에 추가)
  if (inp) {
    const autoSearch = debounce(async () => {
      const q = inp.value.trim();
      if (q.length < 2) return;        // 너무 짧으면 무시
      try {
        const g = await geocode(q);      // 이미 너가 만든 geocode(q): /geo/address → {lat,lon,address}
        if (g?.address) inp.value = g.address;  // 주소 정제
        await updateAll(g.lat, g.lon);   // ✅ 가장 가까운 관측소까지 포함해서 갱신
      } catch(e) {
        // 조용히 무시(사용자 타이핑 중 에러 토스트 불필요)
        console.debug('[autoSearch]', e);
      }
    }, 350); // 300~500ms 추천

    inp.addEventListener('input', autoSearch);
  }

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

// ✅ 수정: 모든 DOMContentLoaded를 하나로 통합하여 실행 순서 보장
window.addEventListener('DOMContentLoaded', ()=>{
  console.log('[app] boot');
  bindTabs();
  bindUIEvents();
  initLocation();
});