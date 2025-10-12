import { renderForecast } from './js/forecast.js';
console.log("app.js 로드 및 실행!");

// app.js (최종 수정 및 오류 해결 버전)
(() => {
  const SCALE = {
    PM10: [
      { name: '좋음',   max: 30,  color: { dark: ['#367BB8', '#7C9CC5'], light: ['#1e88e5', '#69AAFF'] } },
      { name: '보통',   max: 80,  color: { light: ['#43A047', '#3BD497'], dark: ['#629473', '#9ACEB9'] } },
      { name: '나쁨',   max: 150, color: { light: ['#F57C00', '#FFB20B'], dark: ['#F6AA5C', '#DDC472'] } },
      { name: '매우나쁨', max: 1000,color: { light: ['#D32F2F', '#FF886B'], dark: ['#C75959', '#BF8779'] } }
    ],
    PM25: [
      { name: '좋음',   max: 15,  color: { dark: ['#367BB8', '#7C9CC5'], light: ['#1e88e5', '#69AAFF'] } },
      { name: '보통',   max: 35,  color: { light: ['#43A047', '#3BD497'], dark: ['#629473', '#9ACEB9'] } },
      { name: '나쁨',   max: 75,  color: { light: ['#F57C00', '#FFB20B'], dark: ['#F6AA5C', '#DDC472'] } },
      { name: '매우나쁨', max: 1000,color: { light: ['#D32F2F', '#FF886B'], dark: ['#C75959', '#BF8779'] } }
    ]
  };

  const AIRKOREA_KEY = window.env?.AIRKOREA_KEY || 'I2wDgBTJutEeubWmNzwVS1jlGSGPvjidKMb5DwhKkjM2MMUst8KGPB2D03mQv8GHu%2BRc8%2BySKeHrYO6qaS19Sg%3D%3D';
  const KAKAO_KEY = window.env?.KAKAO_KEY || 'be29697319e13590895593f5f5508348';

  const AIRKOREA_API = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=1&pageNo=1&stationName={station}&dataTerm=DAILY&ver=1.3`;
  const KAKAO_ADDRESS_API = `https://dapi.kakao.com/v2/local/search/address.json`;
  const KAKAO_COORD_API = `https://dapi.kakao.com/v2/local/geo/coord2address.json`;

  const inputEl = document.getElementById('place');
  const suggestionsEl = document.getElementById('suggestions');
  const errorEl = document.getElementById('error-message');
  const shareResultBtn = document.getElementById('shareResultBtn');
  const dataSourceInfo = document.getElementById('data-source-info');

  let currentCoords = null;
  let debounceTimer;

  // --- 공용 유틸/캐시 함수 ---
  const inFlight = new Map();
  function cacheGet(key, maxAgeMs = 10 * 60 * 1000) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { t, v } = JSON.parse(raw);
      if (Date.now() - t > maxAgeMs) return null;
      return v;
    } catch { return null; }
  }
  function cacheSet(key, v) {
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {}
  }
  async function dedupFetch(url, opts = {}) {
    const k = url + '|' + (opts.method || 'GET');
    if (inFlight.has(k)) return inFlight.get(k);
    const p = fetch(url, opts).finally(() => inFlight.delete(k));
    inFlight.set(k, p);
    return p;
  }
  function isAirLimitPayload(json) {
    const code = json?.cmmMsgHeader?.returnReasonCode;
    return code === '22' || code === '30';
  }
  function toNum(x) { const n = Number(x); return (x != null && x !== '-' && Number.isFinite(n)) ? n : null; }
  
  // --- 데이터 조회 함수 ---
  function findNearbyStationsSorted(userLat, userLon) {
    const toRad = d => (d * Math.PI) / 180;
    const R = 6371000;
    return stations.map(station => {
      const dLat = toRad(station.lat - userLat);
      const dLon = toRad(station.lon - userLon);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(userLat)) * Math.cos(toRad(station.lat)) * Math.sin(dLon / 2) ** 2;
      const distance = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return { ...station, distance };
    }).sort((a, b) => a.distance - b.distance);
  }

  async function fetchByStation(stationName) {
    const url = AIRKOREA_API.replace('{station}', encodeURIComponent(stationName));
    const hit = cacheGet(url);
    if (hit) return hit;

    const res = await dedupFetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    
    const json = await res.json();
    if (isAirLimitPayload(json)) {
      throw new Error('API limit exceeded');
    }

    cacheSet(url, json);
    return json;
  }

  function pickPM(item) {
    return {
      pm10: toNum(item?.pm10Value) ?? toNum(item?.pm10Value24),
      pm25: toNum(item?.pm25Value) ?? toNum(item?.pm25Value24),
    };
  }
  
  async function findFirstHealthyData(sortedStations, N = 3) {
    for (const st of sortedStations.slice(0, N)) {
      console.log(`데이터 요청 시도 중인 측정소: ${st.name}`);
      try {
        const resp = await fetchByStation(st.name);
        const item = resp?.response?.body?.items?.[0];
        if (!item) continue;
        const { pm10, pm25 } = pickPM(item);
        if (pm10 !== null || pm25 !== null) {
          return { station: st.name, pm10, pm25, item };
        }
      
      } catch (err) {
        if (err.message === 'API limit exceeded') {
          throw err; // API 한도 초과 에러는 상위로 다시 던져서 특별 처리
        }
        // 그 외 네트워크 에러 등은 다음 측정소로 계속 시도
      }
    }
    return null;
  }


  
  // --- UI 업데이트 함수 ---
  function getStatus(type, v) {
    if (v === null) return null;
    return SCALE[type].find(c => v <= c.max) || SCALE[type][SCALE[type].length - 1];
  }

  function drawGauge(pmType, value, station) {
    const wheelEl = document.getElementById(`gauge${pmType}`);
    const statusTextEl = document.getElementById(`statusText${pmType}`);
    const valueTextEl = document.getElementById(`valueText${pmType}`);
    const stationEl = document.getElementById(`station${pmType}`);
    if (!wheelEl) return;

    const isDarkMode = document.body.classList.contains('dark-mode');

    if (value === null) {
      statusTextEl.textContent = '--';
      valueTextEl.textContent = '- µg/m³';
    } else {
      const status = getStatus(pmType, value);
      const colorSet = isDarkMode ? status.color.dark : status.color.light;
      const deg = 360 * Math.min(value / status.max, 1);
      
      wheelEl.style.setProperty('--gauge-color-start', colorSet[0]);
      wheelEl.style.setProperty('--gauge-color-end', colorSet[1]);
      wheelEl.style.setProperty('--angle', `${deg}deg`);
      statusTextEl.textContent = status.name;
      statusTextEl.style.color = colorSet[0];
      valueTextEl.textContent = `${value} µg/m³`;
    }
    stationEl.textContent = `측정소: ${station || '정보 없음'}`;
  }
  
  async function updateRegionText(lat, lon) {
    const regionEl = document.getElementById('region');
    if (!regionEl) return;
    try {
      const res = await fetch(`${KAKAO_COORD_API}?x=${lon}&y=${lat}`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
      const { documents } = await res.json();
      regionEl.textContent = documents[0]?.address?.address_name || '주소 조회 실패';
    } catch {
      regionEl.textContent = '주소 조회 실패';
    }
  }

  function updateDateTime() {
    document.getElementById('time').textContent = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }
  
  // --- 메인 로직 ---
  async function updateAll(lat, lon, isManualSearch = false) {
    currentCoords = { lat, lon };
    errorEl.style.display = 'none';
    shareResultBtn.style.display = isManualSearch ? 'inline-flex' : 'none';
    dataSourceInfo.style.display = isManualSearch ? 'none' : 'block';

    updateRegionText(lat, lon);
    updateDateTime();

    try {
      const sortedStations = findNearbyStationsSorted(lat, lon);
      const airData = await findFirstHealthyData(sortedStations);

      if (airData) {
        drawGauge('PM10', airData.pm10, airData.station);
        drawGauge('PM25', airData.pm25, airData.station);
      } else {
        drawGauge('PM10', null, sortedStations[0]?.name);
        drawGauge('PM25', null, sortedStations[0]?.name);
        showError('가까운 측정소에서 데이터를 가져올 수 없습니다.');
      }
    } catch (err) {
      if (err.message === 'API limit exceeded') {
        showError('API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.');
      } else {
        showError('데이터를 불러오는 중 오류가 발생했습니다.');
      }
      drawGauge('PM10', null, '오류');
      drawGauge('PM25', null, '오류');
    }
  }

  // --- 이벤트 핸들러 및 초기화 ---
  inputEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const query = inputEl.value.trim();
      if (!query) {
        suggestionsEl.style.display = 'none';
        return;
      }
      try {
        const url = `${KAKAO_ADDRESS_API}?query=${encodeURIComponent(query)}`;
        const res = await dedupFetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
        const { documents } = await res.json();
        
        suggestionsEl.innerHTML = '';
        if (documents.length > 0) {
          documents.slice(0, 5).forEach(d => {
            const li = document.createElement('li');
            li.textContent = d.address_name;
            li.onclick = () => {
              inputEl.value = d.address_name;
              suggestionsEl.style.display = 'none';
              updateAll(d.y, d.x, true);
            };
            suggestionsEl.appendChild(li);
          });
          suggestionsEl.style.display = 'block';
        } else {
          suggestionsEl.style.display = 'none';
        }
      } catch {
        suggestionsEl.style.display = 'none';
      }
    }, 300);
  });
  
  document.getElementById('searchBtn').onclick = () => {
    if (suggestionsEl.firstChild) {
      suggestionsEl.firstChild.click();
    }
  };

 async function initializeApp() {
  const urlParams = new URLSearchParams(window.location.search);
  const lat = urlParams.get('lat');
  const lon = urlParams.get('lon');

  if (lat && lon) {
    updateAll(parseFloat(lat), parseFloat(lon), true);
  } else {
    // Capacitor 앱 환경인지 확인
    if (window.Capacitor?.isNativePlatform()) {
      // --- 앱(안드로이드/iOS)을 위한 코드 ---
      try {
        const { Geolocation } = Capacitor.Plugins;
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        updateAll(position.coords.latitude, position.coords.longitude, false);
      } catch (error) {
        console.error("Capacitor 위치 정보 오류", error);
        alert('위치 권한이 없거나 정보를 가져올 수 없습니다. 기본 위치로 조회합니다.');
        updateAll(37.572016, 126.975319, false);
      }
    } else {
      // --- 일반 웹사이트를 위한 코드 ---
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateAll(position.coords.latitude, position.coords.longitude, false);
        },
        (error) => {
          console.error("웹 위치 정보 오류", error);
          alert('위치 정보를 가져올 수 없습니다. 기본 위치로 조회합니다.');
          updateAll(37.572016, 126.975319, false);
        }
      );
    }
  }
};
      
const API_BASE = 'https://air-api-350359872967.asia-northeast3.run.app';

async function searchByAddress(q) {
  if (!q || q.trim().length < 2) {
    alert('검색어를 두 글자 이상 입력하세요'); return;
  }
  try {
    // 주소 → 좌표
    const geoRes = await fetch(`${API_BASE}/geo/address?q=${encodeURIComponent(q)}`);
    if (!geoRes.ok) throw new Error('geo failed');
    const geo = await geoRes.json();

    // 좌표 → 예보(목업)
    const fcRes = await fetch(`${API_BASE}/forecast?lat=${geo.lat}&lon=${geo.lon}`);
    if (!fcRes.ok) throw new Error('forecast failed');
    const fc = await fcRes.json();

    // 화면 반영 (이미 만들어둔 함수/요소 재사용)
    const regionEl = document.getElementById('forecast-region');
    if (regionEl) regionEl.textContent = `${geo.address} 기준 · ${fc.horizon}`;
    if (typeof renderForecast === 'function') renderForecast(fc);

    // 선택: 검색창에 정규화된 주소 반영
    const placeInput = document.getElementById('place');
    if (placeInput) placeInput.value = geo.address;

  } catch (err) {
    console.warn(err);
    alert('주소 검색/예보 조회에 실패했습니다.');
  }
}

// 이벤트 연결 (버튼 + Enter)
(function wireSearch() {
  const input = document.getElementById('place');
  const btn   = document.getElementById('searchBtn');
  if (btn) btn.addEventListener('click', () => searchByAddress(input.value));
  if (input) input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchByAddress(input.value);
  });
})();


// (선택) 현재 좌표를 주소로 표시하고 싶을 때
async function reverseToAddress(lat, lon) {
  const res = await fetch(`${API_BASE}/geo/reverse?lat=${lat}&lon=${lon}`);
  if (!res.ok) return null;
  return res.json(); // {lat, lon, address, source}
}



  // --- 테마 토글 로직 ---
  const themeToggle = document.getElementById('theme-toggle');
  const applyTheme = (theme) => {
    const isDark = theme === 'dark';
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    document.body.classList.toggle('dark-mode', isDark);
  };

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
      localStorage.setItem('theme', newTheme);
      applyTheme(newTheme);
    });
  }
  
  // 앱 시작 시 테마 적용
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    applyTheme(savedTheme);
  } else {
    // 시스템 설정 감지 (최초 방문 시)
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  initializeApp();
})();