// app.js (최종 수정 버전)
(() => {
  const SCALE = {
    PM10: [
      { name: '좋음',   max: 30,  color: { light: ['#367BB8', '#7C9CC5'], dark: ['#1e88e5', '#69AAFF'] } },
      { name: '보통',   max: 80,  color: { light: ['#43A047', '#3BD497'], dark: ['#629473', '#9ACEB9'] } },
      { name: '나쁨',   max: 150, color: { light: ['#F57C00', '#FFB20B'], dark: ['#F6AA5C', '#DDC472'] } },
      { name: '매우나쁨', max: 1000,color: { light: ['#D32F2F', '#FF886B'], dark: ['#C75959', '#BF8779'] } }
    ],
    PM25: [
      { name: '좋음',   max: 15,  color: { light: ['#367BB8', '#7C9CC5'], dark: ['#1e88e5', '#69AAFF'] } },
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
  const FORECAST_API = (code) => `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=100&pageNo=1&searchDate={date}&informCode=${code}`;
  const METEO_API = `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=wind_speed_10m,wind_direction_10m,shortwave_radiation,cloud_cover,temperature_2m&timezone=Asia%2FSeoul`;

  const inputEl = document.getElementById('place');
  const suggestionsEl = document.getElementById('suggestions');
  const errorEl = document.getElementById('error-message');
  const shareResultBtn = document.getElementById('shareResultBtn');
  const dataSourceInfo = document.getElementById('data-source-info');

  let currentCoords = null;

  // --- 유틸 함수 ---

// ===== 공용 유틸/캐시 =====
const TTL_MS = 10 * 60 * 1000; // 10분
const inFlight = new Map();
function cacheGet(key){
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const {t, v} = JSON.parse(raw);
    if (Date.now() - t > TTL_MS) return null;
    return v;
  } catch { return null; }
}
function cacheSet(key, v){
  try { localStorage.setItem(key, JSON.stringify({t: Date.now(), v})); } catch {}
}
async function dedupFetch(url, opts={}) {
  const k = url + '|' + (opts.method||'GET');
  if (inFlight.has(k)) return inFlight.get(k);
  const p = fetch(url, opts).finally(()=> inFlight.delete(k));
  inFlight.set(k, p);
  return p;
}
function isAirLimitPayload(json){
  try {
    const h = json?.cmmMsgHeader;
    return h?.returnReasonCode === '22' || /LIMITED_NUMBER_OF_SERVICE/i.test(h?.returnAuthMsg||'');
  } catch { return false; }
}


  function toNum(x) { const n = Number(x); return (x != null && x !== '-' && Number.isFinite(n)) ? n : null; }
  function cleanCause(txt) { return txt ? txt.replace(/^\s*○\s*/, '').replace(/^\s*\[[^\]]+\]\s*/, '').trim() : ''; }
  function degToCompass(d) {
    if (d == null) return null;
    const dirs = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
    return dirs[Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
  }

  // --- 캐시 관련 함수 ---
  function loadCache(key, maxAgeMs) {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp > maxAgeMs) {
        localStorage.removeItem(key);
        return null;
      }
      return data;
    } catch { return null; }
  }
  function saveCache(key, data) {
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
  }

  // --- 데이터 조회 및 처리 함수 ---
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

  function getStatus(type, v) {
    if (v === null) return null;
    const arr = SCALE[type];
    return arr.find(c => v <= c.max) || arr[arr.length - 1];
  }
  
  async function fetchByStation(stationName, fetchOpts = {}) {
  const url = AIRKOREA_API.replace('{station}', encodeURIComponent(stationName));
  const hit = cacheGet(url);
  if (hit) return hit;

  let delay = 500; // 0.5s → 1s → 2s → 4s → 8s
  for (let i=0; i<5; i++){
    const res = await dedupFetch(url, fetchOpts);
    if (res.ok) {
      const json = await res.json();
      if (!isAirLimitPayload(json)) {
        cacheSet(url, json);
        return json;
      }
    }
    await new Promise(r=>setTimeout(r, delay));
    delay = Math.min(delay*2, 8000);
  }
  throw new Error(`airkorea limited or failed: ${stationName}`);
}


  // ✅ 데이터 조회 함수를 하나로 통합하고 안정성을 높였습니다.
  async function findFirstHealthyData(sortedStations, N = 5) {
    const promises = sortedStations.slice(0, N).map(st =>
      fetchByStation(st.name)
        .then(resp => ({ station: st.name, item: resp?.response?.body?.items?.[0] }))
        .catch(() => null)
    );

    const results = await Promise.all(promises);
    const validResults = results.filter(r => r && r.item);

    if (validResults.length === 0) return null;
    
    // 1순위: PM10과 PM2.5가 모두 있는 측정소
    let bestResult = validResults.find(r => {
        const { pm10, pm25 } = pickPM(r.item);
        return pm10 !== null && pm25 !== null;
    });

    // 2순위: 하나라도 있는 측정소 (1순위가 없을 경우)
    if (!bestResult) {
        bestResult = validResults.find(r => {
            const { pm10, pm25 } = pickPM(r.item);
            return pm10 !== null || pm25 !== null;
        });
    }

    if (!bestResult) return null;

    const { pm10, pm25 } = pickPM(bestResult.item);
    return { station: bestResult.station, pm10, pm25, item: bestResult.item };
  }

  // --- UI 업데이트 함수 ---
  function drawGauge(pmType, value, station) {
    const wheelEl = document.getElementById(`gauge${pmType}`);
    const statusTextEl = document.getElementById(`statusText${pmType}`);
    const valueTextEl = document.getElementById(`valueText${pmType}`);
    const stationEl = document.getElementById(`station${pmType}`);
    if (!wheelEl) return;

    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

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
      const address = documents[0]?.address?.address_name || '주소 조회 실패';
      regionEl.textContent = address;
    } catch {
      regionEl.textContent = '주소 조회 실패';
    }
  }

  function updateDateTime() {
    const timeEl = document.getElementById('time');
    if (timeEl) timeEl.textContent = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }

  // ✅ 메인 로직을 단순하고 명확하게 변경했습니다.
  async function updateAll(lat, lon, isManualSearch = false) {
    currentCoords = { lat, lon };
    errorEl.style.display = 'none';
    shareResultBtn.style.display = isManualSearch ? 'inline-flex' : 'none';
    dataSourceInfo.style.display = isManualSearch ? 'none' : 'block';

    updateRegionText(lat, lon);
    updateDateTime();

    const sortedStations = findNearbyStationsSorted(lat, lon);
    const airData = await findFirstHealthyData(sortedStations);

    if (airData) {
      drawGauge('PM10', airData.pm10, airData.station);
      drawGauge('PM25', airData.pm25, airData.station);
    } else {
      drawGauge('PM10', null, sortedStations[0]?.name);
      drawGauge('PM25', null, sortedStations[0]?.name);
      errorEl.textContent = '가까운 측정소에서 데이터를 가져올 수 없습니다.';
      errorEl.style.display = 'block';
    }
  }

  // --- 이벤트 핸들러 및 초기화 ---
  let lastQuery = '';
inputEl.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const query = inputEl.value.trim();
    if (!query || query === lastQuery) { suggestionsEl.style.display = 'none'; return; }
    lastQuery = query;
    try {
      const url = `${KAKAO_ADDRESS_API}?query=${encodeURIComponent(query)}`;
      const res = await dedupFetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
      const { documents } = await res.json();
      // ... 이하 동일

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
    const query = inputEl.value.trim();
    if (query) {
        // 첫 번째 추천 항목을 바로 클릭한 것처럼 동작
        if (suggestionsEl.firstChild) {
            suggestionsEl.firstChild.click();
        }
    }
  };

  function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');
    if (lat && lon) {
      updateAll(parseFloat(lat), parseFloat(lon), true);
    } else {
      navigator.geolocation.getCurrentPosition(
        p => updateAll(p.coords.latitude, p.coords.longitude, false),
        () => {
          alert('위치 정보를 가져올 수 없습니다. 기본 위치(서울 종로구)로 조회합니다.');
          updateAll(37.572016, 126.975319, false);
        }
      );
    }
  }

  function showError(msg){
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
}

showError('에어코리아 요청이 많아 잠시 데이터를 불러올 수 없음. 잠시 후 다시 시도 바람.');


  initializeApp();
})();