// www/app.js
import { fetchNearestAir, API_BASE } from '/js/apiClient.js';
import { STANDARDS } from '/js/standards.js';


console.log('[app] boot');

const byId = (...ids) => ids.map(id => document.getElementById(id)).find(Boolean); // (쓰면 유지, 안 쓰면 삭제해도 됨)

const setText  = (id, text) => { const n = document.getElementById(id); if (n) n.textContent = text; };
const setValue = (el, value)   => { if (el) el.value = value; };

const clamp   = (v, min, max) => Math.max(min, Math.min(max, v));
const stdCode = () => localStorage.getItem('aq_standard') || 'WHO8';

   // 검색 UI: 없을 수 있으니 존재하면만 쓸 거예요
 const el = {
  placeInput: byId('place', 'place-search-input'),
  searchBtn : byId('searchBtn', 'search-btn'),
  currentBtn: byId('btn-current', 'reload-location-btn'),
  shareBtn  : byId('share-btn'),

  summaryGrade: byId('hero-grade'),
  summaryText : byId('hero-desc'),
  currentLocation: byId('station-name'),
  timestamp  : byId('display-ts'),

  pm10Gauge: { arc: byId('pm10-arc'), value: byId('pm10-value') },
  pm25Gauge: { arc: byId('pm25-arc'), value: byId('pm25-value') },

  linearBarsContainer: byId('linear-bars-container'),
};


// --- forecast fetch + render ---
/* ========= 예보 =========
   - 먼저 `${API_BASE}/forecast?lat=&lon=` 시도
   - 실패/빈값이면 Open-Meteo 날씨 + Air-Quality로 5일 구성 */
async function fetchForecast(lat, lon){
  // 1) 백엔드 먼저
  try{
     const r = await fetch(`${API_BASE}/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, { cache:'no-store' });
    if (r.ok){
      const j = await r.json();
      if (j?.daily?.length) return j; // { daily:[ {date, icon, tmin, tmax, desc, pm25, pm10}... ] }
    }
  }catch(_){}

  // 2) 폴백(키 없음, CORS OK)
  const [w, aq] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul`, {cache:'no-store'}).then(r=>r.json()),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm10,pm2_5&timezone=Asia%2FSeoul`, {cache:'no-store'}).then(r=>r.json()),
  ]);

  // 시간별 AQ → 날짜별(현지) 최대치로 요약
  const byDay = {};
  if (aq?.hourly?.time) {
    aq.hourly.time.forEach((iso, i)=>{
      const d = iso.slice(0,10);
      const pm25 = aq.hourly.pm2_5?.[i];
      const pm10 = aq.hourly.pm10?.[i];
      if (!byDay[d]) byDay[d] = { pm25:[], pm10:[] };
      if (pm25!=null) byDay[d].pm25.push(pm25);
      if (pm10!=null) byDay[d].pm10.push(pm10);
    });
  }

  const daily = (w?.daily?.time || []).map((d, i)=>{
    const wcode = w.daily.weathercode?.[i];
    const tmax  = w.daily.temperature_2m_max?.[i];
    const tmin  = w.daily.temperature_2m_min?.[i];
    const aqDay = byDay[d] || {};
    const pm25max = aqDay.pm25?.length ? Math.max(...aqDay.pm25) : null;
    const pm10max = aqDay.pm10?.length ? Math.max(...aqDay.pm10) : null;

    const icon = weatherIcon(wcode);
    const desc = weatherDesc(wcode);
    return { date:d, icon, tmin, tmax, desc, pm25: pm25max, pm10: pm10max };
  }).slice(0,5);

  return { daily };
}

// 간단한 날씨코드 → 아이콘/문구
function weatherIcon(code){
  if (code==0) return '☀️';
  if ([1,2].includes(code)) return '🌤️';
  if (code===3) return '⛅️';
  if ([45,48].includes(code)) return '🌫️';
  if ([51,53,55,61,63,65].includes(code)) return '🌧️';
  if ([71,73,75].includes(code)) return '❄️';
  if ([95,96,99].includes(code)) return '⛈️';
  return '🌥️';
}
function weatherDesc(code){
  if (code==0) return '맑음';
  if ([1,2,3].includes(code)) return '구름';
  if ([45,48].includes(code)) return '안개';
  if ([51,53,55,61,63,65].includes(code)) return '비';
  if ([71,73,75].includes(code)) return '눈';
  if ([95,96,99].includes(code)) return '뇌우';
  return '날씨';
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

/* ========= 반원 게이지 =========
   - id: pm10-arc / pm10-value, pm25-arc / pm25-value (이미 페이지에 있음)
   - max 값은 UI 스케일용 (각 나라별 “표시 한계” 느낌) */
function renderGauge(kind, value){
  const arc = document.getElementById(`${kind}-arc`);
  const val = document.getElementById(`${kind}-value`);
  if (!arc || !val) return;

  if (value == null || isNaN(value)){
    arc.style.background = '#e9ecef';
    val.textContent = '--';
    return;
  }
  val.textContent = String(value);

  // 게이지 각도(0~180deg)
  const scaleMax = (kind==='pm25') ? 150 : 200;
  const pct  = clamp((value/scaleMax)*100, 0, 100);
  const angle = (pct/100)*180;

  const g = getGrade(kind, value);  // 색상은 기준으로
  arc.style.background =
    `conic-gradient(${g.bg} 0deg, ${g.bg} ${angle}deg, #e9ecef ${angle}deg, #e9ecef 180deg)`;
}

function renderMain(air){
  if (!air) return;

  // 등급(초미세먼지 우선 → 없으면 미세먼지)
  const mainGrade = (air.pm25!=null) ? getGrade('pm25', air.pm25)
                   : (air.pm10!=null) ? getGrade('pm10', air.pm10)
                   : { label:'—', bg:'#adb5bd' };

  // 요약 텍스트/라벨
  if (el.summaryGrade){
    el.summaryGrade.textContent = mainGrade.label;
    el.summaryGrade.style.color = mainGrade.bg;
  }
  setText('hero-desc', air.cai_value!=null ? `지수 ${air.cai_value}` : '오늘의 대기질 총평입니다.');
  setText('station-name', air.station?.name || air.name || '알 수 없음');

  const ts = air.display_ts ? new Date(air.display_ts).toLocaleString('ko-KR') : '—';
  setText('display-ts', `기준: ${ts}`);

  // 반원 게이지
  renderSemiGauge(el.pm10Gauge, air.pm10, 200); // PM10 스케일(표시 한계 200)
  renderSemiGauge(el.pm25Gauge, air.pm25, 150); // PM2.5 스케일(표시 한계 150)

  // 하단 선형 막대 (O3/NO2/SO2/CO)
  renderLinearBars(air);
}

function renderSemiGauge(gauge, value, max){
  if (!gauge?.arc || !gauge?.value){
    // id로도 동작 가능하도록 폴백
    const kind = (gauge && gauge.kind) || ''; // 선택 사항
    const arc = document.getElementById(`${kind}-arc`);
    const val = document.getElementById(`${kind}-value`);
    if (!arc || !val) return;
    gauge = { arc, value: val };
  }

  if (value == null || isNaN(value)){
    gauge.arc.style.background = '#e9ecef';
    gauge.value.textContent = '--';
    return;
  }

  gauge.value.textContent = String(value);

  // 각도(0~180deg)
  const pct   = clamp((value / (max||100)) * 100, 0, 100);
  const angle = (pct / 100) * 180;

  // 어떤 오염물인지 추정(엘리먼트 id로 구분)
  const id = gauge.value.id || '';
  const pollutant = id.includes('pm25') ? 'pm25' : 'pm10';
  const g = getGrade(pollutant, value); // STANDARDS 기반 색상

  gauge.arc.style.background =
    `conic-gradient(${g.bg} 0deg, ${g.bg} ${angle}deg, #e9ecef ${angle}deg, #e9ecef 180deg)`;
}

// app.js 안의 renderLinearBars 교체
function renderLinearBars(data){
  const wrap = document.getElementById('linear-bars-container');
  if (!wrap) return;

  wrap.innerHTML = '';

  // μg/m³ 기준의 표시 상한(대략값)
  const defs = [
    { key:'o3',  label:'오존(O₃)',        max: 240, unit: (data.units?.o3  || 'µg/m³') },
    { key:'no2', label:'이산화질소(NO₂)', max: 200, unit: (data.units?.no2 || 'µg/m³') },
    { key:'so2', label:'아황산가스(SO₂)', max: 350, unit: (data.units?.so2 || 'µg/m³') },
    { key:'co',  label:'일산화탄소(CO)',  max:10000,unit: (data.units?.co  || 'µg/m³') },
  ];

  defs.forEach(p=>{
    const v = data?.[p.key];
    if (v == null) return;
    const pct = clamp((v / p.max) * 100, 0, 100);

    const item = document.createElement('div');
    item.className = 'linear-bar-item';
    item.innerHTML = `
      <div class="bar-label">${p.label}</div>
      <div class="bar-wrapper"><div class="bar-fill" style="width:${pct}%;"></div></div>
      <div class="bar-value">${Math.round(v)} ${p.unit}</div>
    `;
    wrap.appendChild(item);
  });

  // 전부 없으면 섹션 숨김(선택)
  if (!wrap.children.length) {
    wrap.closest('section')?.style && (wrap.closest('section').style.display = 'none');
  } else {
    wrap.closest('section')?.style && (wrap.closest('section').style.display = '');
  }
}


// 검색 "위도,경도" 직접 입력 허용 + 백엔드 프록시(/api/geo/search) 사용
// === 주소 검색 → 좌표 → 전체 갱신 ===
async function geocode(query){
  // "37.57,126.98" 직접 입력 처리
  const m = String(query||'').trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]), address: `${m[1]},${m[2]}` };

  // 백엔드가 있으면 먼저 시도
  try{
    const r = await fetch(`${API_BASE}/geo/search?q=${encodeURIComponent(query)}`, { cache:'no-store' });
    if (r.ok) return await r.json(); // {lat, lon, address}
  }catch(_){}

  // 폴백: Open-Meteo Geocoding
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=ko`;
  const r2 = await fetch(u, { cache:'no-store' });
  const j = await r2.json();
  const hit = j?.results?.[0];
  if (!hit) throw new Error('no result');
  return {
    lat: hit.latitude, lon: hit.longitude,
    address: [hit.country, hit.admin1, hit.name].filter(Boolean).join(' · ')
  };
}

async function doSearch(query){
  if (!query) return;
  try{
    const g = await geocode(query);
    // 입력창 값 갱신(있으면)
    const placeInput = document.getElementById('place') || document.getElementById('place-search-input');
    if (placeInput) placeInput.value = g.address;
    await updateAll(g.lat, g.lon);
  }catch(e){
    console.error(e);
    alert('주소를 찾지 못했습니다. "37.57,126.98"처럼 위도,경도로도 입력할 수 있어요.');
  }
}

// 이벤트 바인딩(안전 가드)
document.getElementById('searchBtn')?.addEventListener('click', ()=>{
  const v = (document.getElementById('place') || document.getElementById('place-search-input'))?.value || '';
  doSearch(v);
});
(document.getElementById('place') || document.getElementById('place-search-input'))?.addEventListener('keydown', (e)=>{
  if (e.key === 'Enter'){
    doSearch(e.currentTarget.value || '');
  }
});



// 안전 바인딩 (요소가 있을 때만 연결)
el.searchBtn && el.searchBtn.addEventListener('click', () => doSearch(el.placeInput?.value || ''));
el.placeInput && el.placeInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(el.placeInput.value || ''); });
el.currentBtn && el.currentBtn.addEventListener('click', () => {
  navigator.geolocation?.getCurrentPosition(
    async pos => {
      if (typeof updateAll === 'function') {
        await updateAll(pos.coords.latitude, pos.coords.longitude);
      } else {
        const data = await fetchNearestAir(pos.coords.latitude, pos.coords.longitude);
        if (typeof renderMain === 'function') {
          renderMain(data);
        } else {
          // ❗여기서 LHS에 ?. 쓰지 말고 헬퍼 사용
          setText('pm10-value', data.pm10 ?? '--');
          setText('pm25-value', data.pm25 ?? '--');
          setText('station-name', data.station?.name || data.name || '--');
          setText('display-ts', data.display_ts ? new Date(data.display_ts).toLocaleString('ko-KR') : '--');
        }
      }
    },
    async _ => {
      // 실패 시 서울 기본
      if (typeof updateAll === 'function') {
        await updateAll(37.5665, 126.9780);
      } else {
        const data = await fetchNearestAir(37.5665, 126.9780);
        if (typeof renderMain === 'function') {
          renderMain(data);
        } else {
          setText('pm10-value', data.pm10 ?? '--');
          setText('pm25-value', data.pm25 ?? '--');
          setText('station-name', data.station?.name || data.name || '--');
          setText('display-ts', data.display_ts ? new Date(data.display_ts).toLocaleString('ko-KR') : '--');
        }
      }
    }
  );
});
// == [검색/지오코딩] 블록 끝 =======================================


// --- 메인 로직 ---
async function updateAll(lat, lon){
  try{
    const air = await fetchNearestAir(lat, lon);
    renderMain(air);

    const fc = await fetchForecast(lat, lon);
    renderForecast(fc);
  }catch(e){
    console.error(e);
    setText('hero-desc', '데이터를 불러오는 데 실패했습니다.');
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

// === Settings slide-in (single source) ===
const settingsBtn      = document.getElementById('settings-btn');
const settingsPanel    = document.getElementById('settings-panel');
const settingsBackdrop = document.getElementById('settings-backdrop');

function openSettings(){
  settingsPanel?.classList.add('is-open');
  settingsBackdrop?.classList.add('is-visible');
  settingsBtn?.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}
function closeSettings(){
  settingsPanel?.classList.remove('is-open');
  settingsBackdrop?.classList.remove('is-visible');
  settingsBtn?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

settingsBtn?.addEventListener('click', openSettings);
settingsBackdrop?.addEventListener('click', closeSettings);



initialize();

