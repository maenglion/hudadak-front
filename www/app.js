// www/app.js
import { fetchNearestAir } from './js/apiClient.js';
import { STANDARDS } from './js/standards.js';
import { renderForecast } from './js/forecast.js';

console.log('[app] boot');

// --- UI 요소 참조 ---
const el = {
  placeInput: document.getElementById('place-search-input'),
  searchBtn: document.getElementById('search-btn'),
  currentLocationBtn: document.getElementById('reload-location-btn'),
  shareBtn: document.getElementById('share-btn'),
  
  summaryGrade: document.getElementById('summary-grade'),
  summaryText: document.getElementById('summary-text'),
  currentLocation: document.getElementById('current-location'),
  timestamp: document.getElementById('기준-시간'),

  pm10Gauge: {
    arc: document.querySelector('#pm10-gauge .gauge-arc'),
    value: document.querySelector('#pm10-gauge .gauge-value'),
  },
  pm25Gauge: {
    arc: document.querySelector('#pm25-gauge .gauge-arc'),
    value: document.querySelector('#pm25-gauge .gauge-value'),
  },

  linearBarsContainer: document.querySelector('.linear-bars-container'),
  weatherIcon: document.getElementById('weather-icon'),
  weatherTemp: document.getElementById('weather-temp'),
};


// --- 렌더링 함수 ---
function getGrade(metric, value) {
  const stdCode = localStorage.getItem('aqi-standard') || 'KOR'; // 설정값 또는 기본값
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
    el.linearBarsContainer.innerHTML = '';
    const pollutants = [
        { key: 'o3', label: '오존', max: 0.15 },
        { key: 'no2', label: '이산화질소', max: 0.1 },
        { key: 'so2', label: '아황산가스', max: 0.05 },
        { key: 'co', label: '일산화탄소', max: 15 },
    ];

    pollutants.forEach(p => {
        const value = data[p.key];
        if (value === null || value === undefined) return;
        
        const grade = getGrade(p.key, value); // (기준이 있다면)
        const percentage = Math.min(100, (value / p.max) * 100);
        const item = document.createElement('div');
        item.className = 'linear-bar-item';
        item.innerHTML = `
            <span class="bar-label">${p.label}</span>
            <div class="bar-wrapper">
                <div class="bar-fill" style="width: ${percentage}%; background-color: ${grade?.bg || '#adb5bd'};"></div>
            </div>
            <span class="bar-value">${value}</span>
        `;
        el.linearBarsContainer.appendChild(item);
    });
}


// --- 메인 로직 ---
async function updateAll(lat, lon) {
    try {
        const airData = await fetchNearestAir(lat, lon);
        renderMain(airData);
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

    el.currentLocationBtn?.addEventListener('click', () => initialize());
    // TODO: 검색, 공유 기능 이벤트 리스너 추가
}

    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const overlay = document.getElementById('overlay');
    
    function closeSettings() {
      settingsPanel.classList.remove('is-open');
      overlay.classList.remove('is-visible');
    }

    settingsBtn.addEventListener('click', () => {
      settingsPanel.classList.add('is-open');
      overlay.classList.add('is-visible');
    });

    overlay.addEventListener('click', closeSettings);

initialize();

