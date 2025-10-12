// --- 모듈 임포트 ---
// API 클라이언트 및 새로운 UI에 필요한 상수와 렌더러를 가져옵니다.
import { API_BASE, HERO_GRADIENT, STANDARDS, MESSAGES, MINI_COLORS } from './js/constants.js';
import { fetchForecast, fetchNearestAir, searchByAddress, reverseToAddress } from './js/apiClient.js';
import { renderForecast } from './js/forecast.js';

console.log("app.js 로드 및 실행!");

(() => {
  // --- 기존 게이지를 위한 상수 (유지) ---
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

  // --- 설정 및 상태 관리 ---
  const STD_KEY = 'aqi-standard';
  let currentStd = localStorage.getItem(STD_KEY) || 'MOE'; // MOE: 환경부, WHO: 세계보건기구
  let currentCoords = null;

  // --- UI 요소 참조 ---
  const hero = document.getElementById('hero');
  const elLoc = document.getElementById('hero-location');
  const elTime = document.getElementById('hero-time');
  const elVal = document.getElementById('hero-value');
  const elGrade = document.getElementById('hero-grade');
  const elDesc = document.getElementById('hero-desc');
  const miniWrap = document.getElementById('mini-gauges');
  const btnSettings = document.getElementById('btn-settings');
  const dlg = document.getElementById('settings-modal');
  const stdSelect = document.getElementById('std-select');
  const inputEl = document.getElementById('place');
  const errorEl = document.getElementById('error-message');
  const themeToggle = document.getElementById('theme-toggle');

  // --- 헬퍼 함수 ---
  function setHeroGradient(grade) {
    const g = HERO_GRADIENT[grade] || HERO_GRADIENT[2]; // 기본값: 보통
    hero.style.background = `linear-gradient(160deg, ${g[0]}, ${g[1]})`;
  }
  function pctByStandard(kind, value) {
    const t = (STANDARDS[currentStd]?.[kind] || {});
    const max = t.bad || 100;
    return Math.max(0, Math.min(1, (value / max)));
  }
  function colorByStandard(kind, value) {
    const t = (STANDARDS[currentStd]?.[kind] || {});
    if (value <= (t.good ?? Infinity)) return MINI_COLORS.good;
    if (value <= (t.mid  ?? Infinity)) return MINI_COLORS.mid;
    if (value <= (t.bad  ?? Infinity)) return MINI_COLORS.bad;
    return MINI_COLORS.worst;
  }
  function gradeLabel(g) {
    return ["", "좋음", "보통", "나쁨(민감군)", "나쁨", "매우나쁨", "최악"][g] || "—";
  }

  // --- 렌더링 함수 ---
  function updateHero(air) {
    const grade = Number(air.cai_grade ?? air.grade ?? 0) || 0;
    const value = Number(air.cai_value ?? air.pm25 ?? air.pm10 ?? 0) || 0;
    elLoc.textContent = air.station?.name ? `${air.station.name}` : '—';
    elTime.textContent = air.display_ts ? new Date(air.display_ts).toLocaleString('ko-KR') : new Date().toLocaleString('ko-KR');
    elVal.textContent = value;
    elGrade.textContent = gradeLabel(grade);
    elDesc.textContent = MESSAGES[grade] || '';
    setHeroGradient(grade);
  }

  function renderMiniGauges(air) {
    const rows = [
      { k: "pm10",  label: "미세먼지",     unit: "㎍/㎥", v: air.pm10 },
      { k: "pm25",  label: "초미세먼지",   unit: "㎍/㎥", v: air.pm25 },
      { k: "cai",   label: "통합대기지수", unit: "",      v: air.cai_value ?? air.cai ?? null },
      { k: "o3",    label: "오존",         unit: "ppm",   v: air.o3 },
      { k: "no2",   label: "이산화질소",   unit: "ppm",   v: air.no2 },
      { k: "so2",   label: "아황산가스",   unit: "ppm",   v: air.so2 },
      { k: "co",    label: "일산화탄소",   unit: "ppm",   v: air.co },
    ];
    miniWrap.innerHTML = '';
    rows.forEach(r => {
      if (r.v == null) return;
      const p = r.k === "cai" ? Math.min(1, (Number(r.v) / 200)) : pctByStandard(r.k, Number(r.v));
      const col = r.k === "cai" ? MINI_COLORS.mid : colorByStandard(r.k, Number(r.v));
      const div = document.createElement('div');
      div.className = 'mini';
      div.innerHTML = `
        <div class="ring" style="--pct:${(p * 100).toFixed(0)};--ring:${col}">
          <span>${Number(r.v)}</span>
        </div>
        <div class="label">${r.label}</div>
        <div class="sub">${r.unit}</div>
      `;
      miniWrap.appendChild(div);
    });
  }
  
  // 기존 게이지 렌더링 함수 (유지)
  function getStatus(type, v) {
    if (v === null) return null;
    return SCALE[type].find(c => v <= c.max) || SCALE[type][SCALE[type].length - 1];
  }

  function drawGauge(pmType, value, grade, details = {}) {
    const wheelEl = document.getElementById(`gauge${pmType}`);
    const statusTextEl = document.getElementById(`statusText${pmType}`);
    const valueTextEl = document.getElementById(`valueText${pmType}`);
    const stationEl = document.getElementById(`station${pmType}`);
    if (!wheelEl) return;

    const isDarkMode = document.body.classList.contains('dark-mode');

    if (value === null) {
      statusTextEl.textContent = grade || '--';
      valueTextEl.textContent = '- µg/m³';
    } else {
      const status = getStatus(pmType, value);
      const colorSet = isDarkMode ? status.color.dark : status.color.light;
      const deg = 360 * Math.min(value / (status.max * 1.2), 1);

      wheelEl.style.setProperty('--gauge-color-start', colorSet[0]);
      wheelEl.style.setProperty('--gauge-color-end', colorSet[1]);
      wheelEl.style.setProperty('--angle', `${deg}deg`);
      statusTextEl.textContent = grade || status.name;
      statusTextEl.style.color = colorSet[0];
      valueTextEl.textContent = `${value} µg/m³`;
    }
    if (details.station) {
        stationEl.textContent = `측정소: ${details.station}`;
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  // --- 메인 데이터 로직 ---
  async function updateAll(lat, lon, isManualSearch = false) {
    currentCoords = { lat, lon };
    errorEl.style.display = 'none';
    // ... 기타 UI 초기화 코드 ...

    try {
      // 1) 예보 데이터 호출 (실패해도 괜찮음)
      fetchForecast(lat, lon)
        .then(fc => renderForecast(fc, { lat, lon }))
        .catch(e => console.warn('Forecast fetch failed:', e));

      // 2) 현재 공기질 데이터 호출 (핵심 로직)
      const air = await fetchNearestAir(lat, lon);
      window.__lastAir = air; // 설정 변경 시 재렌더링을 위해 전역에 저장
      
      // 새로운 UI 렌더링
      updateHero(air);
      renderMiniGauges(air);

      // (선택) 기존 큰 게이지도 계속 표시
      const sname = air.station?.name ?? air.name ?? '—';
      drawGauge('PM10', air.pm10 ?? null, air.cai_grade ?? '', { station: sname, ts: air.display_ts });
      drawGauge('PM25', air.pm25 ?? null, air.cai_grade ?? '', { station: sname, ts: air.display_ts });
      
    } catch (e) {
      showError('데이터를 불러오는 중 오류가 발생했습니다.');
      console.error(e);
      // 에러 시 기존 게이지 초기화
      drawGauge('PM10', null, '오류');
      drawGauge('PM25', null, '오류');
    }
  }

  // --- 이벤트 핸들러 및 초기화 ---
  async function handleAddressSearch(query) {
    if (!query || query.trim().length < 2) {
      alert('검색어를 두 글자 이상 입력하세요');
      return;
    }
    try {
      const geo = await searchByAddress(query);
      inputEl.value = geo.address;
      updateAll(geo.lat, geo.lon, true);
    } catch (err) {
      console.warn(err);
      alert('주소 검색에 실패했습니다.');
    }
  }
  
  document.getElementById('searchBtn').onclick = () => handleAddressSearch(inputEl.value);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddressSearch(inputEl.value);
  });

  btnSettings?.addEventListener('click', () => {
    stdSelect.value = currentStd;
    dlg.showModal();
  });
  stdSelect?.addEventListener('change', (e) => {
    currentStd = e.target.value;
    localStorage.setItem(STD_KEY, currentStd);
    // 기준 변경 시 미니 게이지 즉시 재렌더링
    if (window.__lastAir) renderMiniGauges(window.__lastAir);
  });
  
  async function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');

    if (lat && lon) {
      updateAll(parseFloat(lat), parseFloat(lon), true);
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => updateAll(pos.coords.latitude, pos.coords.longitude, false),
        (err) => {
          console.error("위치 정보 오류", err);
          alert('위치 정보를 가져올 수 없습니다. 기본 위치(서울)로 조회합니다.');
          updateAll(37.5665, 126.9780, false);
        }
      );
    }
  }

  // 테마 관리
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
      if (currentCoords) updateAll(currentCoords.lat, currentCoords.lon);
    });
  }
  
  const savedTheme = localStorage.getItem('theme') 
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);

  // 앱 시작!
  initializeApp();
})();

