console.log("app.js 로드 및 실행! (v4 DB 연동)");

// app.js – DB-first 리팩터링 버전
(() => {
  // ===================
  //  설정 & 상수
  // ===================
  const API_BASE = 'https://air-api-350359872967.asia-northeast3.run.app';
  const KAKAO_KEY = window.env?.KAKAO_KEY || 'be29697319e13590895593f5f5508348';
  const KAKAO_ADDRESS_API = 'https://dapi.kakao.com/v2/local/search/address.json';
  const KAKAO_COORD_API  = 'https://dapi.kakao.com/v2/local/geo/coord2address.json';

  const SCALE = {
    PM10: [
      { name: '좋음',    max: 30,   color: { dark: ['#367BB8','#7C9CC5'], light: ['#1e88e5','#69AAFF'] } },
      { name: '보통',    max: 80,   color: { light: ['#43A047','#3BD497'], dark: ['#629473','#9ACEB9'] } },
      { name: '나쁨',    max: 150,  color: { light: ['#F57C00','#FFB20B'], dark: ['#F6AA5C','#DDC472'] } },
      { name: '매우나쁨', max: 1000, color: { light: ['#D32F2F','#FF886B'], dark: ['#C75959','#BF8779'] } }
    ],
    PM25: [
      { name: '좋음',    max: 15,   color: { dark: ['#367BB8','#7C9CC5'], light: ['#1e88e5','#69AAFF'] } },
      { name: '보통',    max: 35,   color: { light: ['#43A047','#3BD497'], dark: ['#629473','#9ACEB9'] } },
      { name: '나쁨',    max: 75,   color: { light: ['#F57C00','#FFB20B'], dark: ['#F6AA5C','#DDC472'] } },
      { name: '매우나쁨', max: 1000, color: { light: ['#D32F2F','#FF886B'], dark: ['#C75959','#BF8779'] } }
    ]
  };

  // 가스별 스케일 (µg/m³) — 각 가스마다 다른 최대값
  const GAS_CONFIG = {
    so2: { max: 100,  unit: 'µg/m³', thresholds: [20, 80, 100],  labels: ['좋음 0–20', '보통 20–80', '나쁨 80+'] },
    co:  { max: 10000, unit: 'µg/m³', thresholds: [2000, 9000, 10000], labels: ['좋음 0–2000', '보통 2000–9000', '나쁨 9000+'] },
    o3:  { max: 200,  unit: 'µg/m³', thresholds: [60, 120, 200],  labels: ['좋음 0–60', '보통 60–120', '나쁨 120+'] },
    no2: { max: 200,  unit: 'µg/m³', thresholds: [40, 100, 200],  labels: ['좋음 0–40', '보통 40–100', '나쁨 100+'] },
  };

  // ===================
  //  DOM 요소
  // ===================
  const inputEl        = document.getElementById('place');
  const suggestionsEl  = document.getElementById('suggestions');
  const errorEl        = document.getElementById('error-message');
  const shareResultBtn = document.getElementById('shareResultBtn');
  const dataSourceInfo = document.getElementById('data-source-info');

  let currentCoords = null;
  let debounceTimer;

  // ===================
  //  유틸 함수
  // ===================
  function toNum(x) {
    const n = Number(x);
    return (x != null && x !== '-' && x !== '--' && Number.isFinite(n)) ? n : null;
  }

  const inFlight = new Map();
  async function dedupFetch(url, opts = {}) {
    const k = url + '|' + (opts.method || 'GET');
    if (inFlight.has(k)) return inFlight.get(k);
    const p = fetch(url, opts).finally(() => inFlight.delete(k));
    inFlight.set(k, p);
    return p;
  }

  // ===================
  //  데이터 조회
  // ===================
  async function fetchAirData(lat, lon) {
    try {
      const url = `${API_BASE}/nearest?lat=${lat}&lon=${lon}&source=auto`;
      const res = await dedupFetch(url);

      if (res.status === 204) {
        console.warn('[fetchAirData] DB 데이터 없음, 모델 폴백');
        return await fetchModelFallback(lat, lon);
      }
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();

      if (toNum(data.pm10) === null && toNum(data.pm25) === null) {
        console.warn('[fetchAirData] PM 데이터 없음, 모델 폴백');
        return await fetchModelFallback(lat, lon);
      }
      return normalizeResponse(data);
    } catch (err) {
      console.error('[fetchAirData] API 호출 실패:', err);
      try { return await fetchModelFallback(lat, lon); }
      catch { return null; }
    }
  }

  async function fetchModelFallback(lat, lon) {
    const url = `${API_BASE}/nearest?lat=${lat}&lon=${lon}&source=model`;
    const res = await dedupFetch(url);
    if (!res.ok) throw new Error(`Model fallback failed: ${res.status}`);
    return normalizeResponse(await res.json());
  }

  function normalizeResponse(data) {
    return {
      station:    data.name || data.station?.name || '정보 없음',
      provider:   data.provider || 'unknown',
      sourceKind: data.source_kind || data.source || 'unknown',
      displayTs:  data.display_ts || null,
      pm10: toNum(data.pm10),
      pm25: toNum(data.pm25),
      so2:  toNum(data.so2),
      co:   toNum(data.co),
      o3:   toNum(data.o3),
      no2:  toNum(data.no2),
      unitPm10:  data.unit_pm10 || 'µg/m³',
      unitPm25:  data.unit_pm25 || 'µg/m³',
      caiGrade:  data.cai_grade || null,
      badges:    data.badges || [],
      distanceM: data.distance_m || null,
    };
  }

  // ===================
  //  주소 조회
  // ===================
  async function getAddressFromCoords(lat, lon) {
    try {
      const res = await fetch(`${API_BASE}/geo/reverse?lat=${lat}&lon=${lon}`);
      if (res.ok) { const d = await res.json(); return d.address || '주소 조회 실패'; }
    } catch {}
    try {
      const res = await fetch(`${KAKAO_COORD_API}?x=${lon}&y=${lat}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      const { documents } = await res.json();
      return documents[0]?.address?.address_name || '주소 조회 실패';
    } catch { return '주소 조회 실패'; }
  }

  // ===================
  //  UI 업데이트
  // ===================
  function getStatus(type, v) {
    if (v === null) return null;
    return SCALE[type].find(c => v <= c.max) || SCALE[type][SCALE[type].length - 1];
  }

  function drawGauge(pmType, value, stationName, sourceKind) {
    const wheelEl      = document.getElementById(`gauge${pmType}`);
    const statusTextEl = document.getElementById(`statusText${pmType}`);
    const valueTextEl  = document.getElementById(`valueText${pmType}`);
    const stationEl    = document.getElementById(`station${pmType}`);
    if (!wheelEl) return;

    const isDarkMode = document.body.classList.contains('dark-mode');

    if (value === null) {
      statusTextEl.textContent = '--';
      valueTextEl.textContent  = '- µg/m³';
      wheelEl.style.setProperty('--angle', '0deg');
    } else {
      const status   = getStatus(pmType, value);
      const colorSet = isDarkMode ? status.color.dark : status.color.light;
      const deg      = 360 * Math.min(value / status.max, 1);

      wheelEl.style.setProperty('--gauge-color-start', colorSet[0]);
      wheelEl.style.setProperty('--gauge-color-end', colorSet[1]);
      wheelEl.style.setProperty('--angle', `${deg}deg`);
      statusTextEl.textContent = status.name;
      statusTextEl.style.color = colorSet[0];
      valueTextEl.textContent  = `${value} µg/m³`;
    }

    const sourceBadge = sourceKind === 'model' ? ' (예측)' : '';
    stationEl.textContent = `측정소: ${stationName || '정보 없음'}${sourceBadge}`;
  }

  // 가스 등급 (µg/m³ 기준)
  function getGasGrade(key, val) {
    const cfg = GAS_CONFIG[key];
    if (!cfg || val === null || val === undefined) return '';
    const t = cfg.thresholds;
    if (val <= t[0]) return 'good';
    if (val <= t[1]) return 'normal';
    if (val <= t[2]) return 'bad';
    return 'very-bad';
  }

  // 가스 지역명 저장용
  let gasStationName = '';

  function updateGasData(airData) {
    const keys = ['so2','co','o3','no2'];
    const gasStationEl = document.getElementById('gas-station-name');

    if (!airData) {
      keys.forEach(key => {
        const valEl = document.getElementById(`gas-${key}-value`);
        const barEl = document.getElementById(`gas-${key}-bar`);
        const refEl = document.getElementById(`gas-${key}-ref`);
        if (valEl) valEl.textContent = '--';
        if (barEl) { barEl.style.width = '0%'; barEl.className = 'gas-item-bar-value'; }
        if (refEl) refEl.textContent = '';
      });
      if (gasStationEl) gasStationEl.textContent = '';
      return;
    }

    // 지역명 표시
    if (gasStationEl && airData.station) {
      gasStationEl.textContent = airData.station;
    }

    keys.forEach(key => {
      const valEl = document.getElementById(`gas-${key}-value`);
      const barEl = document.getElementById(`gas-${key}-bar`);
      const refEl = document.getElementById(`gas-${key}-ref`);
      if (!valEl || !barEl) return;

      const val = airData[key];
      const cfg = GAS_CONFIG[key];

      if (val !== null && val !== undefined) {
        valEl.textContent = Number.isInteger(val) ? val : val.toFixed(1);
        barEl.style.width = `${Math.min(val / cfg.max * 100, 100)}%`;
        const grade = getGasGrade(key, val);
        barEl.className = 'gas-item-bar-value' + (grade ? ` ${grade}` : '');
        // 기준 표시
        if (refEl) refEl.textContent = cfg.labels[0] + ' / ' + cfg.labels[1] + ' / ' + cfg.labels[2];
      } else {
        valEl.textContent = '--';
        barEl.style.width = '0%';
        barEl.className = 'gas-item-bar-value';
        if (refEl) refEl.textContent = '';
      }
    });
  }

  function updateDateTime(displayTs) {
    const timeEl = document.getElementById('time');
    if (!timeEl) return;
    if (displayTs) {
      try { timeEl.textContent = new Date(displayTs).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }); return; } catch {}
    }
    timeEl.textContent = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }

  function showError(msg) { if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; } }
  function hideError()    { if (errorEl) errorEl.style.display = 'none'; }

  // ===================
  //  메인 로직
  // ===================
  async function updateAll(lat, lon, isManualSearch = false) {
    currentCoords = { lat, lon };
    hideError();

    if (shareResultBtn) shareResultBtn.style.display = isManualSearch ? 'inline-flex' : 'none';
    if (dataSourceInfo) dataSourceInfo.style.display  = isManualSearch ? 'none' : 'block';

    const regionEl = document.getElementById('region');
    if (regionEl) {
      regionEl.textContent = '조회 중...';
      getAddressFromCoords(lat, lon).then(addr => { regionEl.textContent = addr; });
    }

    try {
      const airData = await fetchAirData(lat, lon);
      if (airData) {
        drawGauge('PM10', airData.pm10, airData.station, airData.sourceKind);
        drawGauge('PM25', airData.pm25, airData.station, airData.sourceKind);
        updateGasData(airData);
        updateDateTime(airData.displayTs);
        console.log(`[updateAll] 소스: ${airData.sourceKind} / 측정소: ${airData.station}`);
      } else {
        drawGauge('PM10', null, '데이터 없음', 'unknown');
        drawGauge('PM25', null, '데이터 없음', 'unknown');
        updateGasData(null);
        updateDateTime(null);
        showError('가까운 측정소에서 데이터를 가져올 수 없습니다.');
      }
    } catch (err) {
      console.error('[updateAll] 오류:', err);
      drawGauge('PM10', null, '오류', 'unknown');
      drawGauge('PM25', null, '오류', 'unknown');
      updateGasData(null);
      updateDateTime(null);
      showError('데이터를 불러오는 중 오류가 발생했습니다.');
    }
  }

  // ===================
  //  검색
  // ===================
  if (inputEl) {
    inputEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const query = inputEl.value.trim();
        if (!query) { suggestionsEl.style.display = 'none'; return; }
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
                updateAll(parseFloat(d.y), parseFloat(d.x), true);
              };
              suggestionsEl.appendChild(li);
            });
            suggestionsEl.style.display = 'block';
          } else { suggestionsEl.style.display = 'none'; }
        } catch { suggestionsEl.style.display = 'none'; }
      }, 300);
    });
  }

  async function searchByAddress(q) {
    if (!q || q.trim().length < 2) { alert('검색어를 두 글자 이상 입력하세요'); return; }
    try {
      const geoRes = await fetch(`${API_BASE}/geo/address?q=${encodeURIComponent(q)}`);
      if (!geoRes.ok) throw new Error('geo failed');
      const geo = await geoRes.json();
      if (inputEl) inputEl.value = geo.address;
      updateAll(geo.lat, geo.lon, true);
    } catch (err) {
      console.warn('[searchByAddress]', err);
      if (suggestionsEl?.firstChild) suggestionsEl.firstChild.click();
      else alert('주소 검색에 실패했습니다.');
    }
  }

  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) searchBtn.addEventListener('click', () => searchByAddress(inputEl?.value));
  if (inputEl) inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchByAddress(inputEl.value); });

  // ===================
  //  초기화
  // ===================
  async function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');

    if (lat && lon) { updateAll(parseFloat(lat), parseFloat(lon), true); return; }

    if (window.Capacitor?.isNativePlatform()) {
      try {
        const { Geolocation } = Capacitor.Plugins;
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        updateAll(pos.coords.latitude, pos.coords.longitude, false);
      } catch (e) {
        console.error("Capacitor 위치 오류", e);
        alert('위치 권한이 없거나 정보를 가져올 수 없습니다. 기본 위치로 조회합니다.');
        updateAll(37.572016, 126.975319, false);
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => updateAll(pos.coords.latitude, pos.coords.longitude, false),
      (err) => {
        console.error("웹 위치 오류", err);
        alert('위치 정보를 가져올 수 없습니다. 기본 위치로 조회합니다.');
        updateAll(37.572016, 126.975319, false);
      }
    );
  }

  // ===================
  //  테마 토글
  // ===================
  const applyTheme = (theme) => {
    const isDark = theme === 'dark';
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    document.body.classList.toggle('dark-mode', isDark);
    const cb = document.getElementById('theme-checkbox');
    if (cb) cb.checked = isDark;
  };

  // 토글 스위치 (체크박스 기반)
  const themeCheckbox = document.getElementById('theme-checkbox');
  if (themeCheckbox) {
    themeCheckbox.addEventListener('change', () => {
      const newTheme = themeCheckbox.checked ? 'dark' : 'light';
      localStorage.setItem('theme', newTheme);
      applyTheme(newTheme);
    });
  }

  // 기존 버튼 호환 (있으면)
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle && !themeCheckbox) {
    themeToggle.addEventListener('click', () => {
      const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
      localStorage.setItem('theme', newTheme);
      applyTheme(newTheme);
    });
  }

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    applyTheme(savedTheme);
  } else {
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  initializeApp();
})();