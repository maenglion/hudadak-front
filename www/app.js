// www/app.js
import { fetchNearestAir, API_BASE } from '/js/apiClient.js';
import { STANDARDS } from '/js/standards.js';


console.log('[app] boot');

const setText = (id, text) => { const n = document.getElementById(id); if (n) n.textContent = text; };


   // 검색 UI: 없을 수 있으니 존재하면만 쓸 거예요
 const el = {
  // 헤더 요약
  summaryGrade: document.getElementById('hero-grade-label'),
  summaryScore: document.getElementById('hero-score'),
  summaryText : document.getElementById('hero-desc'),
  currentLocation: document.getElementById('station-name'),
  currentBtn: document.getElementById('current-btn'),


  // 겹원 게이지(밖=PM10, 안=PM2.5)
  pm10Gauge: document.getElementById('pm10-gauge'),
  pm25Gauge: document.getElementById('pm25-gauge'),

  // 선형 막대 컨테이너
  linearBarsContainer: document.getElementById('linear-bars-container'),
};


function scoreFrom(air) {
  // 대략적인 100점 스케일(가벼운 가중치)
  const p25 = air.pm25 ?? 0, p10 = air.pm10 ?? 0;
  // 낮을수록 고득점
  const s25 = Math.max(0, 100 - (p25*1.2)); // P2.5 가중
  const s10 = Math.max(0, 100 - (p10*0.6));
  return Math.round(Math.max(0, Math.min(100, (s25*0.6 + s10*0.4))));
}

// 예보: 먼저 백엔드 /forecast 시도, 실패하면 Open-Meteo(날씨+공기질)로 5일 구성
async function fetchForecast(lat, lon){
  // 1) 백엔드 시도
  try{
    const r = await fetch(`${API_BASE}/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, { cache:'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    if (j && Array.isArray(j.daily)) return j;    // 백엔드가 이미 스키마 맞춰주면 그대로 사용
  } catch (err) {
  // 조용히 폴백 진행 (디버깅용 로그)
  console.debug('[forecast] backend failed → fallback', err);
}
  // 2) 폴백(Open-Meteo; CORS OK)
  const [w, aq] = await Promise.all([
    fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
      `&timezone=Asia%2FSeoul`,
      { cache:'no-store' }
    ).then(r=>r.json()),
    fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=pm10,pm2_5` +
      `&timezone=Asia%2FSeoul`,
      { cache:'no-store' }
    ).then(r=>r.json()),
  ]);

  const dates = w?.daily?.time ?? [];
  const tmax  = w?.daily?.temperature_2m_max ?? [];
  const tmin  = w?.daily?.temperature_2m_min ?? [];
  const wcode = w?.daily?.weathercode ?? [];

  // 시간별 AQ를 날짜별로 모아 간단 집계(최댓값; 평균 원하면 'mean'으로 바꿔)
  const idx   = aq?.hourly?.time ?? [];
  const byDay = {}; // { 'YYYY-MM-DD': { pm10:[], pm25:[] } }
  for (let i = 0; i < idx.length; i++) {
    const d = String(idx[i]).slice(0,10);
    (byDay[d] ||= { pm10:[], pm25:[] });
    if (aq?.hourly?.pm10?.[i]  != null) byDay[d].pm10.push(aq.hourly.pm10[i]);
    if (aq?.hourly?.pm2_5?.[i] != null) byDay[d].pm25.push(aq.hourly.pm2_5[i]);
  }
  const pick = (arr, mode='max')=>{
    if (!arr?.length) return null;
    if (mode==='mean') return Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
    return Math.round(Math.max(...arr));
  };

  const daily = dates.slice(0,5).map((d,i)=>{
    const agg = byDay[d] || { pm10:[], pm25:[] };
    const { icon, desc } = wmoToIconDesc(wcode[i]);
    return {
      date: d,
      icon, desc,
      tmin: tmin[i] != null ? Math.round(tmin[i]) : null,
      tmax: tmax[i] != null ? Math.round(tmax[i]) : null,
      pm10: pick(agg.pm10, 'max'),
      pm25: pick(agg.pm25, 'max'),
      horizon: 'Open-Meteo 폴백',
    };
  });

  return { daily };
}

// WMO weathercode → 간단 아이콘/설명
function wmoToIconDesc(code){
  const c = Number(code);
  if (c===0) return { icon:'☀️', desc:'맑음' };
  if ([1,2].includes(c)) return { icon:'🌤️', desc:'대체로 맑음' };
  if (c===3) return { icon:'☁️', desc:'흐림' };
  if ([45,48].includes(c)) return { icon:'🌫️', desc:'안개' };
  if ([51,53,55,56,57].includes(c)) return { icon:'🌦️', desc:'이슬비' };
  if ([61,63,65,66,67].includes(c)) return { icon:'🌧️', desc:'비' };
  if ([71,73,75,77].includes(c)) return { icon:'❄️', desc:'눈' };
  if ([80,81,82].includes(c)) return { icon:'🌧️', desc:'소나기' };
  if ([95,96,99].includes(c)) return { icon:'⛈️', desc:'뇌우' };
  return { icon:'🌥️', desc:'구름' };
}


/* ========= 예보 렌더 =========
   - 컨테이너 id: forecast-grid, 보조문구 id: forecast-note (이미 페이지에 있음) */
function renderForecast(fc){
  const grid = document.getElementById('forecast-grid');
  const note = document.getElementById('forecast-note');
  if (!grid) return;

  const daily = fc?.daily || [];
  if (!daily.length){
    grid.innerHTML = `
      <div class="forecast-card">
        <p class="forecast-day">예보 준비 중</p>
        <div class="forecast-icon">📡</div>
        <p class="forecast-temp">— / <strong>—</strong></p>
        <p class="forecast-desc">곧 제공됩니다</p>
      </div>`;
    note && (note.textContent = '임시 폴백: 예보 데이터 수집 중');
    return;
  }

  grid.innerHTML = daily.map(d=>{
    const day = new Date(d.date).toLocaleDateString('ko-KR', { weekday:'long' });
    // AQ 등급 배지(WHO8 기준)
    const g = (d.pm25!=null) ? getGrade('pm25', d.pm25)
            : (d.pm10!=null) ? getGrade('pm10', d.pm10)
            : null;
    const aqBadge = g ? `<small class="muted" style="display:block;margin-top:4px">초미세먼지: ${g.label}</small>` : '';

    return `
      <div class="forecast-card">
        <p class="forecast-day">${day}</p>
        <div class="forecast-icon">${d.icon || '🌤️'}</div>
        <p class="forecast-temp">${d.tmin ?? '—'}° / <strong>${d.tmax ?? '—'}°</strong></p>
        <p class="forecast-desc">${d.desc || '—'}</p>
        ${aqBadge}
      </div>`;
  }).join('');
  note && (note.textContent = 'Open-Meteo 폴백 사용 중');
}


/* ========= 등급 계산 ========= */
function getGrade(pollutant, value){
  const std = STANDARDS[stdCode()] || STANDARDS.WHO8;
  const br = std.breaks[pollutant];
  const bands = std.bands;
  if (!br) return { key:'-', label:'-', bg:'#adb5bd', fg:'#111' };
  let idx = br.findIndex(x => value <= x);
  if (idx < 0) idx = br.length; // 최종 초과 구간
  const band = bands[idx] || bands[bands.length-1];
  return { key:band.key, label:band.label, bg:band.bg, fg:band.fg };
}

// 공통: 현재 선택된 '등급 기준 코드'를 알아낸다.
function stdCode() {
  // 1) 메모리에 캐시된 값이 있으면 우선
  if (typeof window.__appStdCode === 'string' && window.__appStdCode) return window.__appStdCode;

  // 2) 설정 셀렉트 박스(id="std-code")가 있으면 그 값
  const sel = document.getElementById('std-code');
  if (sel && sel.value) return sel.value;

  // 3) 저장된 로컬 스토리지 값
  const saved = localStorage.getItem('stdCode');
  if (saved) return saved;

  // 4) 기본값
  return 'WHO8';
}


/* 겹원 게이지 렌더러 */
function renderConcentricGauges(pm10, pm25) {
  // 각도 계산 (시각용 상한, 과감하게 고정)
  const pct10 = Math.max(0, Math.min(1, (pm10 ?? 0) / 200));
  const pct25 = Math.max(0, Math.min(1, (pm25 ?? 0) / 150));
  const deg10 = Math.round(pct10 * 360);
  const deg25 = Math.round(pct25 * 360);

  // 색상은 현재 기준(STANDARDS)로부터 추출
  const g10 = pm10 != null ? getGrade('pm10', pm10) : null;
  const g25 = pm25 != null ? getGrade('pm25', pm25) : null;

  if (el.pm10Gauge) {
    el.pm10Gauge.style.background =
      g10
        ? `conic-gradient(${g10.bg} 0 ${deg10}deg, #e9ecef ${deg10}deg 360deg)`
        : '#e9ecef';
  }
  if (el.pm25Gauge) {
    el.pm25Gauge.style.background =
      g25
        ? `conic-gradient(${g25.bg} 0 ${deg25}deg, #e9ecef ${deg25}deg 360deg)`
        : '#e9ecef';
  }

  // 라벨/값
  const centerLabel = document.getElementById('center-text-label');
  const centerValue = document.getElementById('center-text-value');
  if (centerLabel) centerLabel.textContent = '통합지수';
  if (centerValue) centerValue.textContent =
    (pm25 ?? pm10 ?? null) != null ? String(pm25 ?? pm10) : '--';

  // 아래 작은 값 라벨
  const v10 = document.getElementById('pm10-value');
  const v25 = document.getElementById('pm25-value');
  if (v10) v10.innerHTML = `${pm10 ?? '--'} <em>μg/m³</em>`;
  if (v25) v25.innerHTML = `${pm25 ?? '--'} <em>μg/m³</em>`;
}

function renderMain(air){
  if (!air) return;

  // 상단 라벨/점수/설명
  const mainGrade =
    (air.pm25!=null) ? getGrade('pm25', air.pm25) :
    (air.pm10!=null) ? getGrade('pm10', air.pm10) :
    { label:'—', bg:'#adb5bd' };

  if (el.summaryGrade){ el.summaryGrade.textContent = mainGrade.label; el.summaryGrade.style.color = mainGrade.bg; }
  if (el.summaryScore){ el.summaryScore.textContent = String(scoreFrom(air)).padStart(2, '0'); }
  setText('hero-desc', air.cai_value!=null ? `지수 ${air.cai_value}` : '오늘의 대기질 총평입니다.');
 const $station = document.getElementById('station-name');
if ($station) {
  $station.textContent = `${air.station?.name || air.name || '—'}`;
}


  // 겹원 게이지
  renderConcentricGauges(air.pm10, air.pm25);

  // 선형 막대
  renderLinearBars(air);
}



// app.js 안의 renderLinearBars 교체
function renderLinearBars(data){
  const wrap = el.linearBarsContainer;
  if (!wrap) return;
  wrap.innerHTML = '';

  const defs = [
    { key:'o3',  label:'오존(O₃)',        max:240,  unit: data.units?.o3  || 'µg/m³' },
    { key:'no2', label:'이산화질소(NO₂)', max:200,  unit: data.units?.no2 || 'µg/m³' },
    { key:'so2', label:'아황산가스(SO₂)', max:350,  unit: data.units?.so2 || 'µg/m³' },
    { key:'co',  label:'일산화탄소(CO)',  max:10000,unit: data.units?.co  || 'µg/m³' },
  ];

  let shown = 0;
  defs.forEach(p=>{
    const v = data?.[p.key];
    if (v == null) return;
    shown++;
    const pct = Math.max(0, Math.min(100, (v / p.max) * 100));
    const item = document.createElement('div');
    item.className = 'linear-bar-item';
    item.innerHTML = `
      <div class="bar-label">${p.label}</div>
      <div class="bar-wrapper"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="bar-value">${Math.round(v)} ${p.unit}</div>
    `;
    wrap.appendChild(item);
  });

const sec = wrap.closest('section');
if (sec) sec.style.display = shown ? '' : 'none';

}



async function geocode(q){
  const m = String(q||'').trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return { lat:+m[1], lon:+m[2], address:`${m[1]},${m[2]}` };

  try{
    const r = await fetch(`${API_BASE}/geo/search?q=${encodeURIComponent(q)}`, { cache:'no-store' });
    if (r.ok) return await r.json(); // {lat, lon, address}
  } catch (err) {
  console.debug('[geocode] backend search failed → fallback', err);
}


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

(function bindSearchOnce(){
  const inp = document.getElementById('location-input');
  const bar = document.querySelector('.location-search');
  // 입력 토글(라벨 클릭 시 모달 대신 인라인 토글)
  bar?.addEventListener('click', ()=>{
    if (!inp) return;
    const show = inp.style.display !== 'block';
    inp.style.display = show ? 'block' : 'none';
    if (show) inp.focus();
  });
  inp?.addEventListener('keydown', (e)=>{ if (e.key==='Enter') doSearch(inp.value||''); });
})();

async function fetchNearestAirSoft(lat, lon){
  // Open-Meteo 공기질 현재값에서 PM만 간단 집계
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm2_5,pm10,o3,no2,so2,co&timezone=Asia%2FSeoul`;
  const j = await fetch(url, {cache:'no-store'}).then(r=>r.json());
  const i = (j.hourly?.time?.length || 1) - 1; // 마지막 시각
  const pick = (k)=> j.hourly?.[k]?.[i] ?? null;
  return {
    provider: 'OPENMETEO',
    name: `(${lat.toFixed(3)},${lon.toFixed(3)})`,
    display_ts: new Date().toISOString(),
    pm10: Math.round(pick('pm10') ?? 0),
    pm25: Math.round(pick('pm2_5') ?? 0),
    o3:   pick('o3'), no2: pick('no2'), so2: pick('so2'), co: pick('co'),
    units: { o3:'µg/m³', no2:'µg/m³', so2:'µg/m³', co:'µg/m³' },
    station: { name: 'Open-Meteo', provider:'OPENMETEO', kind:'model', lat, lon }
  };
}


// --- 메인 로직 ---
async function updateAll(lat, lon){
  try{
    let air;
    try {
  air = await fetchNearestAir(lat, lon); // 정상 경로
} catch(err) { // _ 를 err 로 변경
  console.error("My backend fetch failed, using fallback:", err); // 🚨 에러 출력 코드 추가
  air = await fetchNearestAirSoft(lat, lon); // 폴백
}
    const fc = await fetchForecast(lat, lon);  // 이미 폴백 내장

    renderMain(air);
    renderForecast(fc);
  } catch(err){
    console.error('updateAll error:', err);
    setText('hero-desc', '데이터를 불러오지 못했습니다.');
  }
}

// --- 초기화 및 이벤트 리스너 ---
function initialize() {
    const urlParams = new URLSearchParams(window.location.search);
    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');

    if (lat && lon) {
        updateAll(parseFloat(lat), parseFloat(lon));
    } else {
        navigator.geolocation.getCurrentPosition(
            (pos) => updateAll(pos.coords.latitude, pos.coords.longitude),
            (err) => {
                console.warn('Geolocation 에러:', err.message);
                updateAll(37.5665, 126.9780); // 기본 위치: 서울
            }
        );
    }

    el.currentBtn?.addEventListener('click', ()=>initialize());
    // TODO: 검색, 공유 기능 이벤트 리스너 추가
}

function bindUIEvents() {
  const settingsBtn      = document.getElementById('settings-btn');
  const settingsPanel    = document.getElementById('settings-panel');
  const settingsBackdrop = document.getElementById('settings-backdrop');

  const openSettings = () => 
  {
    settingsPanel?.classList.add('is-open');
    settingsBackdrop?.classList.add('is-visible');
    settingsBtn?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };
  const closeSettings = () =>
  {
    settingsPanel?.classList.remove('is-open');
    settingsBackdrop?.classList.remove('is-visible');
    settingsBtn?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  settingsBtn?.addEventListener('click', openSettings);
  settingsBackdrop?.addEventListener('click', closeSettings);

 const tabButtons = document.querySelectorAll('.tab-button');
tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    document.querySelector('.tab-button.active')?.classList.remove('active');
    document.querySelector('.tab-content.active')?.classList.remove('active');

    const tabId = button.dataset.tab;
    button.classList.add('active');
    const pane = document.getElementById(`tab-${tabId}`);
    pane?.classList.add('active');
  });
});

  const accordionItems = document.querySelectorAll('#settings-panel .accordion-menu details');
  accordionItems.forEach(item => {
item.addEventListener('toggle', () => {
  if (item.open) {
    accordionItems.forEach(otherItem => {
      if (otherItem !== item) {
        otherItem.removeAttribute('open');
      }
    });
  }
});
  })
}


initialize();
bindUIEvents();