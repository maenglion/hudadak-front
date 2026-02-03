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

  // 가스 기준값 (환경부 기준, 바 퍼센트 계산용)
  const GAS_MAX = {
    so2: 0.15,   // ppm
    co:  15,     // ppm
    o3:  0.15,   // ppm
    no2: 0.2     // ppm
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

  // 중복 fetch 방지
  const inFlight = new Map();
  async function dedupFetch(url, opts = {}) {
    const k = url + '|' + (opts.method || 'GET');
    if (inFlight.has(k)) return inFlight.get(k);
    const p = fetch(url, opts).finally(() => inFlight.delete(k));
    inFlight.set(k, p);
    return p;
  }

  // ===================
  //  데이터 조회 (DB 우선 → 모델 폴백)
  // ===================
  async function fetchAirData(lat, lon) {
    // 1차: DB에서 가져오기 (source=auto → DB 우선, 없으면 모델 폴백)
    try {
      const url = `${API_BASE}/nearest?lat=${lat}&lon=${lon}&source=auto`;
      const res = await dedupFetch(url);

      // 204 = DB에 데이터 없음
      if (res.status === 204) {
        console.warn('[fetchAirData] DB 데이터 없음, 모델 폴백 시도');
        return await fetchModelFallback(lat, lon);
      }

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();

      // 유효성 검사: pm10, pm25 둘 다 null이면 폴백
      if (toNum(data.pm10) === null && toNum(data.pm25) === null) {
        console.warn('[fetchAirData] PM 데이터 없음, 모델 폴백');
        return await fetchModelFallback(lat, lon);
      }

      return normalizeResponse(data);
    } catch (err) {
      console.error('[fetchAirData] API 호출 실패:', err);
      // 최종 폴백: 모델
      try {
        return await fetchModelFallback(lat, lon);
      } catch {
        return null;
      }
    }
  }

  // 모델 폴백 (Open-Meteo)
  async function fetchModelFallback(lat, lon) {
    const url = `${API_BASE}/nearest?lat=${lat}&lon=${lon}&source=model`;
    const res = await dedupFetch(url);
    if (!res.ok) throw new Error(`Model fallback failed: ${res.status}`);
    const data = await res.json();
    return normalizeResponse(data);
  }

  // 응답 정규화 (DB든 모델이든 같은 형태로)
  function normalizeResponse(data) {
    return {
      station:     data.name || data.station?.name || '정보 없음',
      provider:    data.provider || 'unknown',
      sourceKind:  data.source_kind || data.source || 'unknown',
      displayTs:   data.display_ts || null,
      pm10:        toNum(data.pm10),
      pm25:        toNum(data.pm25),
      so2:         toNum(data.so2),
      co:          toNum(data.co),
      o3:          toNum(data.o3),
      no2:         toNum(data.no2),
      unitPm10:    data.unit_pm10 || 'µg/m³',
      unitPm25:    data.unit_pm25 || 'µg/m³',
      caiGrade:    data.cai_grade || null,
      badges:      data.badges || [],
      distanceM:   data.distance_m || null,
    };
  }

  // ===================
  //  주소 조회 (air-api 경유 → Kakao 직접 폴백)
  // ===================
  async function getAddressFromCoords(lat, lon) {
    // 1차: air-api의 /geo/reverse
    try {
      const res = await fetch(`${API_BASE}/geo/reverse?lat=${lat}&lon=${lon}`);
      if (res.ok) {
        const data = await res.json();
        return data.address || '주소 조회 실패';
      }
    } catch {}

    // 2차: Kakao 직접 (기존 호환)
    try {
      const res = await fetch(`${KAKAO_COORD_API}?x=${lon}&y=${lat}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      const { documents } = await res.json();
      return documents[0]?.address?.address_name || '주소 조회 실패';
    } catch {
      return '주소 조회 실패';
    }
  }

  // ===================
  //  UI 업데이트 함수
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

    // 측정소 + 데이터 출처 표시
    const sourceBadge = sourceKind === 'model' ? ' (예측)' : '';
    stationEl.textContent = `측정소: ${stationName || '정보 없음'}${sourceBadge}`;
  }

  // 가스 데이터 바 업데이트
  function updateGasData(airData) {
    if (!airData) return;

    const gases = [
      { key: 'so2', max: GAS_MAX.so2 },
      { key: 'co',  max: GAS_MAX.co  },
      { key: 'o3',  max: GAS_MAX.o3  },
      { key: 'no2', max: GAS_MAX.no2 },
    ];

    gases.forEach(({ key, max }) => {
      const valEl = document.getElementById(`gas-${key}-value`);
      const barEl = document.getElementById(`gas-${key}-bar`);
      if (!valEl || !barEl) return;

      const val = airData[key];
      if (val !== null && val !== undefined) {
        valEl.textContent    = val;
        barEl.style.width    = `${Math.min(val / max * 100, 100)}%`;
      } else {
        valEl.textContent    = '--';
        barEl.style.width    = '0%';
      }
    });
  }

  function updateDateTime(displayTs) {
    const timeEl = document.getElementById('time');
    if (!timeEl) return;

    if (displayTs) {
      // DB 또는 API에서 받은 시각 사용
      try {
        const d = new Date(displayTs);
        timeEl.textContent = d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        return;
      } catch {}
    }
    // 폴백: 현재 시각
    timeEl.textContent = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent   = msg;
    errorEl.style.display = 'block';
  }

  function hideError() {
    if (!errorEl) return;
    errorEl.style.display = 'none';
  }

  // ===================
  //  메인 로직
  // ===================
  async function updateAll(lat, lon, isManualSearch = false) {
    currentCoords = { lat, lon };
    hideError();

    // 선택적 UI 요소 (없을 수도 있음)
    if (shareResultBtn) shareResultBtn.style.display = isManualSearch ? 'inline-flex' : 'none';
    if (dataSourceInfo) dataSourceInfo.style.display  = isManualSearch ? 'none' : 'block';

    // 주소 표시
    const regionEl = document.getElementById('region');
    if (regionEl) {
      regionEl.textContent = '조회 중...';
      getAddressFromCoords(lat, lon).then(addr => { regionEl.textContent = addr; });
    }

    // 대기질 데이터 조회 (DB 우선 → 모델 폴백)
    try {
      const airData = await fetchAirData(lat, lon);

      if (airData) {
        drawGauge('PM10', airData.pm10, airData.station, airData.sourceKind);
        drawGauge('PM25', airData.pm25, airData.station, airData.sourceKind);
        updateGasData(airData);
        updateDateTime(airData.displayTs);
        console.log(`[updateAll] 데이터 소스: ${airData.sourceKind} / 측정소: ${airData.station}`);
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
  //  검색 (자동완성 + 주소 검색)
  // ===================

  // 자동완성: Kakao 주소 API 직접 사용 (빠른 응답)
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
          } else {
            suggestionsEl.style.display = 'none';
          }
        } catch {
          suggestionsEl.style.display = 'none';
        }
      }, 300);
    });
  }

  // 검색 버튼: air-api /geo/address 사용 (정규화된 주소 + 좌표)
  async function searchByAddress(q) {
    if (!q || q.trim().length < 2) {
      alert('검색어를 두 글자 이상 입력하세요');
      return;
    }
    try {
      const geoRes = await fetch(`${API_BASE}/geo/address?q=${encodeURIComponent(q)}`);
      if (!geoRes.ok) throw new Error('geo failed');
      const geo = await geoRes.json();

      if (inputEl) inputEl.value = geo.address;
      updateAll(geo.lat, geo.lon, true);
    } catch (err) {
      console.warn('[searchByAddress]', err);
      // 폴백: 자동완성 첫 번째 결과 클릭
      if (suggestionsEl && suggestionsEl.firstChild) {
        suggestionsEl.firstChild.click();
      } else {
        alert('주소 검색에 실패했습니다.');
      }
    }
  }

  // 검색 버튼 + Enter 이벤트
  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => searchByAddress(inputEl?.value));
  }
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchByAddress(inputEl.value);
    });
  }

  // ===================
  //  초기화
  // ===================
  async function initializeApp() {
    // URL 파라미터로 진입한 경우 (공유 링크)
    const urlParams = new URLSearchParams(window.location.search);
    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');

    if (lat && lon) {
      updateAll(parseFloat(lat), parseFloat(lon), true);
      return;
    }

    // Capacitor 앱 환경
    if (window.Capacitor?.isNativePlatform()) {
      try {
        const { Geolocation } = Capacitor.Plugins;
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        updateAll(position.coords.latitude, position.coords.longitude, false);
      } catch (error) {
        console.error("Capacitor 위치 정보 오류", error);
        alert('위치 권한이 없거나 정보를 가져올 수 없습니다. 기본 위치로 조회합니다.');
        updateAll(37.572016, 126.975319, false);
      }
      return;
    }

    // 일반 웹
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

  // ===================
  //  테마 토글
  // ===================
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

  
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    applyTheme(savedTheme);
  } else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  initializeApp();
})();