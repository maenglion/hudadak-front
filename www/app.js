// www/app.js
import { fetchNearestAir, API_BASE } from '/js/apiClient.js';
import { STANDARDS } from '/js/standards.js';


console.log('[app] boot');

const byId = (...ids) => ids.map(id => document.getElementById(id)).find(Boolean);
const setText = (id, text) => {
  const n = document.getElementById(id);
  if (n) n.textContent = text;
};
const setValue = (el, value) => { if (el) el.value = value; };


function setTextById(id, text){
  const n = document.getElementById(id);
  if (n) n.textContent = text;
}

function setInputValue(el, value){
  if (el) el.value = value;
}

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
async function fetchForecast(lat, lon){
  // 백엔드가 비어있으면 {}나 {daily: []}가 올 수 있어요.
  const r = await fetch(`${API_BASE}/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, {cache:'no-store'});
  if (!r.ok) return { daily: [] };
  return await r.json(); // { daily: [...] }
}

function renderForecast(daily){
  const grid = document.getElementById('forecast-grid');
  const note = document.getElementById('forecast-note');
  if (!grid) return;

  if (!daily || !daily.length){
    grid.innerHTML = `
      <div class="forecast-card">
        <p class="forecast-day">예보 준비 중</p>
        <div class="forecast-icon">📡</div>
        <p class="forecast-temp">— / <strong>—</strong></p>
        <p class="forecast-desc">곧 제공됩니다</p>
      </div>`;
    note && (note.textContent = '예보 API가 준비되는 대로 자동으로 표시됩니다.');
    return;
  }

  grid.innerHTML = daily.slice(0,5).map(d => {
    // 백엔드 스키마 가정: { date: '2025-10-13', icon:'☀️', tmin:22, tmax:28, desc:'맑음' }
    const day = new Date(d.date || d.time || Date.now()).toLocaleDateString('ko-KR', {weekday:'long'});
    const icon = d.icon || '🌤️';
    const tmin = (d.tmin ?? d.min ?? '—');
    const tmax = (d.tmax ?? d.max ?? '—');
    const desc = d.desc || d.summary || '—';
    return `
      <div class="forecast-card">
        <p class="forecast-day">${day}</p>
        <div class="forecast-icon">${icon}</div>
        <p class="forecast-temp">${tmin}° / <strong>${tmax}°</strong></p>
        <p class="forecast-desc">${desc}</p>
      </div>`;
  }).join('');
  note && (note.textContent = '');
}


// --- 렌더링 함수 ---
function getGrade(metric, value) {
  const stdCode = localStorage.getItem('aq_standard') || 'WHO8';
  const std = STANDARDS[stdCode];
  if (!std || !std.breaks[metric] || value === null) {
    return { label: '정보없음', bg: '#868e96', fg: 'white' };
  }

  const breaks = std.breaks[metric];
  let level = breaks.findIndex(b => value <= b);
  if (level === -1) level = breaks.length;

  return std.bands[level];
}


function renderMain(air) {
    const pm10Grade = getGrade('pm10', air.pm10);
    
    el.summaryGrade.textContent = pm10Grade.label;
    el.summaryGrade.style.color = pm10Grade.bg;
    el.summaryText.textContent = "오늘의 대기질 총평입니다."; // TODO: 메시지 시스템 연동
    el.currentLocation.textContent = air.station?.name || air.name || '알 수 없음';
    el.timestamp.textContent = `기준: ${new Date(air.display_ts).toLocaleString('ko-KR')}`;

    // 반원 게이지 렌더링
    renderSemiGauge(el.pm10Gauge, air.pm10, 150); // '나쁨' 기준을 max로
    renderSemiGauge(el.pm25Gauge, air.pm25, 75); // '나쁨' 기준을 max로

    // 선형 막대 렌더링
    renderLinearBars(air);
}



function renderSemiGauge(gauge, value, max) {
    if (value === null || value === undefined) {
      gauge.value.textContent = '-';
      gauge.arc.style.background = '#e9ecef';
      return;
    }
    gauge.value.textContent = value;
    const grade = getGrade(gauge === el.pm10Gauge ? 'pm10' : 'pm25', value);
    const percentage = Math.min(100, (value / max) * 100);
    const angle = (percentage / 100) * 180;
    gauge.arc.style.background = `conic-gradient(${grade.bg} 0deg, ${grade.bg} ${angle}deg, #e9ecef ${angle}deg, #e9ecef 180deg)`;
}




function renderLinearBars(data) {
  if (!el.linearBarsContainer) return;

  el.linearBarsContainer.innerHTML = '';

  const pollutants = [
    { key: 'o3',  label: '오존',      max: 0.15 },
    { key: 'no2', label: '이산화질소', max: 0.10 },
    { key: 'so2', label: '아황산가스', max: 0.05 },
    { key: 'co',  label: '일산화탄소', max: 15   },
  ];

  pollutants.forEach(p => {
    const v = data?.[p.key];
    if (v == null) return;

    const pct = Math.max(0, Math.min(100, (v / p.max) * 100));
    const item = document.createElement('div');
    item.className = 'linear-bar-item';
    item.innerHTML = `
      <div class="bar-label">${p.label}</div>
      <div class="bar-wrapper"><div class="bar-fill" style="width:${pct}%;"></div></div>
      <div class="bar-value">${v}</div>
    `;
    el.linearBarsContainer.appendChild(item);
  });
}


// 검색 "위도,경도" 직접 입력 허용 + 백엔드 프록시(/api/geo/search) 사용
async function geocode(query){
  if (!query) throw new Error('query required');

  // 1) "37.57,126.98" 같이 콤마로 구분된 좌표 문자열 지원
  const m = String(query).trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]), address: `${m[1]},${m[2]}` };

  // 2) 백엔드 지오코딩 프록시 (미구현이어도 에러만 캐치하면 됨)
  const url = `${API_BASE}/geo/search?q=${encodeURIComponent(query)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) {
    const t = await r.text().catch(()=>`${r.status} ${r.statusText}`);
    throw new Error(`검색 실패: ${t}`);
  }
  // 기대 스키마: {lat, lon, address}
  return await r.json();
}

// 실제 검색 실행
async function doSearch(q){
  const v = (q ?? el.placeInput?.value ?? '').trim();
  if (v.length < 2 && !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v)) {
    alert('두 글자 이상 입력하거나 "37.57,126.98" 형태로 입력하세요.');
    return;
  }
  try{
    // 좌표 얻기
    const g = await geocode(v);
    // 좌표로 측정값 갱신
if (typeof updateAll === 'function') {
  await updateAll(g.lat, g.lon);
} else if (typeof renderMain === 'function') {
  const data = await fetchNearestAir(g.lat, g.lon);
  renderMain(data);
} else {
  const data = await fetchNearestAir(g.lat, g.lon);
  setText('pm10-value',  data.pm10 ?? '--');
  setText('pm25-value',  data.pm25 ?? '--');
  setText('station-name', data.station?.name || data.name || '--');
  setText('display-ts',   data.display_ts ? new Date(data.display_ts).toLocaleString('ko-KR') : '--');
}

    // 입력창에 정규화된 주소 표시
    if (el.placeInput) el.placeInput.value = g.address || `${g.lat},${g.lon}`;
  }catch(e){
    console.error(e);
    alert('주소 검색이 아직 준비되지 않았습니다. "위도,경도" 형태로 입력해 보세요.');
  }
}

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
async function updateAll(lat, lon) {
    try {
        const airData = await fetchNearestAir(lat, lon);
        renderMain(airData);
        const fc = await fetchForecast(lat, lon);
    renderForecast(fc.daily || []);
    } catch (error) {
        console.error("데이터 업데이트 중 오류:", error);
        el.summaryText.textContent = '데이터를 불러오는 데 실패했습니다.';
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

 const settingsBtn      = document.getElementById('settings-btn');
const settingsPanel    = document.getElementById('settings-panel');
const settingsBackdrop = document.getElementById('settings-backdrop');

    function closeSettings() {
      settingsPanel.classList.remove('is-open');
      settings-backdrop.classList.remove('is-visible');
    }

 settingsBtn?.addEventListener('click', () => {
    settingsPanel.classList.add('is-open');
    settings-backdrop.classList.add('is-visible');
  });

 settings-backdrop?.addEventListener('click', closeSettings);


function openSettings(){
  settingsPanel?.classList.add('is-open');
  settingsBackdrop?.classList.add('is-visible');
  settingsBtn?.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden'; // 배경 스크롤 잠금
}
function closeSettings(){
  settingsPanel?.classList.remove('is-open');
  settingsBackdrop?.classList.remove('is-visible');
  settingsBtn?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

settingsBtn?.addEventListener('click', openSettings);
settingsBackdrop?.addEventListener('click', closeSettings);

// 설정(iframe) → 메인 통신
window.addEventListener('message', (ev)=>{
  const { type, value } = ev.data || {};
  if (type === 'standardChanged') {
    localStorage.setItem('aq_standard', value);
    // 배지/게이지 재도색 훅이 있으면 호출
    window.repaintByStandard?.(value);
  }
  if (type === 'closeSettings') closeSettings();
});

// 메인 → 설정(iframe)으로 현재 값 보내고 싶으면(선택)
function sendToSettings(msg){
  const frame = settingsPanel?.querySelector('iframe');
  frame?.contentWindow?.postMessage(msg, '*');
}


initialize();

