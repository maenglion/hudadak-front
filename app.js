(() => {
  // (수정) ─ 변수명을 SCALE로 통일
  const SCALE = {
    PM10: [
      { name:'좋음',   max: 30,  color:'#1E88E5' },
      { name:'보통',   max: 80,  color:'#43A047' },
      { name:'나쁨',   max: 150, color:'#F57C00' },
      { name:'매우나쁨', max: 1000, color:'#D32F2F' }
    ],
    PM25: [
      { name:'좋음',   max: 15,  color:'#1E88E5' },
      { name:'보통',   max: 35,  color:'#43A047' },
      { name:'나쁨',   max: 75,  color:'#F57C00' },
      { name:'매우나쁨', max: 1000, color:'#D32F2F' }
    ]
  };

  const AIRKOREA_KEY = window.env?.AIRKOREA_KEY || 'I2wDgBTJutEeubWmNzwVS1jlGSGPvjidKMb5DwhKkjM2MMUst8KGPB2D03mQv8GHu%2BRc8%2BySKeHrYO6qaS19Sg%3D%3D';
  const KAKAO_KEY = window.env?.KAKAO_KEY || 'be29697319e13590895593f5f5508348';
  
  // (수정) Gemini API 키는 그대로 비워둡니다.
  const GEMINI_API_KEY = ""; 

  const AIRKOREA_API = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=1&pageNo=1&stationName={station}&dataTerm=DAILY&ver=1.3`;
  const KAKAO_ADDRESS_API = `https://dapi.kakao.com/v2/local/search/address.json`;
  const KAKAO_COORD_API = `https://dapi.kakao.com/v2/local/geo/coord2address.json`;
  const FORECAST_API = (code) => `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=100&pageNo=1&searchDate={date}&informCode=${code}`;
  const METEO_API = `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=wind_speed_10m,wind_direction_10m,shortwave_radiation,cloud_cover,temperature_2m&timezone=Asia%2FSeoul`;
  
  // (수정) API URL에서 키 부분을 제거하고 기본 주소만 남깁니다.
  const GEMINI_API_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent`;


  const inputEl = document.getElementById('place');
  const suggestionsEl = document.getElementById('suggestions');
  const errorEl = document.getElementById('error-message');
  const gaugesEl = document.getElementById('gauges');
  const shareResultContainer = document.getElementById('share-result-container');
  const shareResultBtn = document.getElementById('shareResultBtn');
  const dataSourceInfo = document.getElementById('data-source-info');

  let currentCoords = null;

  // --- 유틸 함수 ---
  function cleanCause(txt){
    if(!txt) return '';
    return txt.replace(/^\s*○\s*/, '').replace(/^\s*\[[^\]]+\]\s*/, '').trim();
  }
  function toNum(x){ const n = Number(x); return Number.isFinite(n) ? n : null; }
  function degToCompass(d){
    if(d==null) return null;
    const dirs = ['북','북북동','북동','동북동','동','동남동','남동','남남동','남','남남서','남서','서남서','서','서북서','북서','북북서'];
    const idx = Math.round(((d%360)+360)%360 / 22.5) % 16;
    return dirs[idx];
  }

  function loadCache(key, maxAgeMs) {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    try {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp > maxAgeMs) {
        localStorage.removeItem(key);
        return null;
      }
      return data;
    } catch (e) {
      localStorage.removeItem(key);
      return null;
    }
  }
  function saveCache(key, data) {
    const item = { timestamp: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(item));
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const toRad = d => (d * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  
  function findNearbyStationsSorted(userLat, userLon) {
    return stations
      .map(station => ({
        ...station,
        distance: calculateDistance(userLat, userLon, station.lat, station.lon)
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  function getStatus(type, v) {
    if (v === null || v === undefined) return null;
    const arr = SCALE[type] || SCALE.PM25;
    return arr.find(c => v <= c.max) || arr[arr.length - 1];
  }
    
  function drawGauge(pmType, value, station) {
    const wheelEl = document.getElementById(`gauge${pmType}`);
    const statusTextEl = document.getElementById(`statusText${pmType}`);
    const valueTextEl = document.getElementById(`valueText${pmType}`);
    const stationEl = document.getElementById(`station${pmType}`);
    if (!wheelEl || !statusTextEl || !valueTextEl || !stationEl) return;

    if (value === null || value === undefined) {
      wheelEl.style.setProperty('--gauge-color', '#cccccc');
      wheelEl.style.setProperty('--angle', '0deg');
      statusTextEl.textContent = '--';
      statusTextEl.style.color = 'var(--light-text-color)';
      valueTextEl.textContent = '- µg/m³';
      stationEl.textContent = `측정소: ${station || '정보 없음'}`;
      return;
    }
    
    const status = getStatus(pmType, Number(value));
    const ratio  = Math.min(Number(value) / (status?.max || 1), 1);
    const deg    = 360 * ratio;

    wheelEl.style.setProperty('--gauge-color', status.color);
    wheelEl.style.setProperty('--angle', `${deg}deg`);
    statusTextEl.textContent = status.name;
    statusTextEl.style.color = status.color;
    valueTextEl.textContent = `${value} µg/m³`;
    stationEl.textContent = `측정소: ${station}`;
  }

  async function fetchByStation(stationName) {
    const url = AIRKOREA_API.replace('{station}', encodeURIComponent(stationName));
    const res = await fetch(url);
    return await res.json();
  }

  function pickPM(item, type = 'pm25') {
    const toNum = v => (v && v !== '-' ? Number(v) : null);
    if (type === 'pm10') {
        return toNum(item.pm10Value) ?? toNum(item.pm10Value24) ?? null;
    }
    return toNum(item.pm25Value) ?? toNum(item.pm25Value24) ?? null;
  }

  async function findFirstHealthyData(sortedStations, N = 5) {
    for (const st of sortedStations.slice(0, N)) {
      const resp = await fetchByStation(st.name);
      const item = resp?.response?.body?.items?.[0];
      if (item) {
        const pm10 = pickPM(item, 'pm10');
        const pm25 = pickPM(item, 'pm25');
        if (pm10 !== null || pm25 !== null) {
          return { station: st.name, pm10, pm25, item };
        }
      }
    }
    return null;
  }
  
  async function fetchMeteo(lat, lon) {
    try {
      const url = METEO_API.replace('{lat}', lat).replace('{lon}', lon);
      const res = await fetch(url);
      const data = await res.json();
      const idx = nearestHourIndex(data.hourly?.time || []);
      return {
        temp: data.hourly?.temperature_2m?.[idx] ?? null,
        windSpeed: data.hourly?.wind_speed_10m?.[idx] ?? null,
        windDir: data.hourly?.wind_direction_10m?.[idx] ?? null,
        rad: data.hourly?.shortwave_radiation?.[idx] ?? null,
        cloud: data.hourly?.cloud_cover?.[idx] ?? null,
      };
    } catch (e) {
      console.error("Meteo fetch error:", e);
      return null;
    }
  }

  function nearestHourIndex(times){
    if (!Array.isArray(times) || !times.length) return 0;
    const now = new Date();
    let best = 0, diff = Infinity;
    for (let i=0; i<times.length; i++){
      const d = Math.abs(now - new Date(times[i]));
      if (d < diff){ best=i; diff=d; }
    }
    return best;
  }

  async function fetchForecast(code, dateStrKST = null) {
    const date = dateStrKST || new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).toISOString().slice(0,10);
    const cacheKey = `forecast_${code}_${date}`;
    const cached = loadCache(cacheKey, 3*60*60*1000);
    if (cached) return cached;

    const url = FORECAST_API(code).replace('{date}', date);
    const res = await fetch(url);
    if (!res.ok) throw new Error('forecast fetch failed');
    const data = await res.json();
    const items = data?.response?.body?.items || [];
    if (!items.length) {
      if (!dateStrKST) {
        const y = new Date(new Date(date).getTime() - 86400000).toISOString().slice(0,10);
        return fetchForecast(code, y);
      }
      return null;
    }
    const it = items[0];
    const out = { cause: it.informCause || '', overall: it.informOverall || '' };
    saveCache(cacheKey, out);
    return out;
  }

  // (신규) ─ AI를 이용한 예보 해설 생성 함수
  async function generateAiExplanation(meas, meteo, hints, areaName) {
    const pm10 = toNum(meas?.pm10);
    const pm25 = toNum(meas?.pm25);
    const ws = toNum(meteo?.windSpeed);
    const wd = toNum(meteo?.windDir);
    const compass = degToCompass(wd);
    const ratio = (pm25 && pm25 > 0) ? (pm10 / pm25) : null;

    const prompt = `
      당신은 대한민국 최고의 대기질 분석 전문가입니다. 아래 데이터를 바탕으로 현재 대기질 상태와 원인을 일반인이 이해하기 쉽게 자연스러운 한국어 문장으로 설명해주세요. 딱딱한 데이터 나열이 아닌, 종합적인 분석을 담아 2~3문장으로 요약해주세요.

      [분석 데이터]
      - 현재 지역: ${areaName || '알 수 없음'}
      - 미세먼지(PM10): ${pm10 ?? '측정값 없음'} µg/m³
      - 초미세먼지(PM2.5): ${pm25 ?? '측정값 없음'} µg/m³
      - PM10/PM2.5 비율: ${ratio ? ratio.toFixed(1) : '계산 불가'}
      - 바람: ${compass ? `${compass} ${ws.toFixed(1)}m/s` : '정보 없음'}
      - 공식 예보 (미세먼지): ${cleanCause(hints?.cause10 || hints?.overall10) || '정보 없음'}
      - 공식 예보 (초미세먼지): ${cleanCause(hints?.cause25 || hints?.overall25) || '정보 없음'}
      - 오존(O₃): ${toNum(meas?.o3) ? toNum(meas.o3).toFixed(3) : '측정값 없음'} ppm
      - 이산화질소(NO₂): ${toNum(meas?.no2) ? toNum(meas.no2).toFixed(3) : '측정값 없음'} ppm
      - 일사량: ${toNum(meteo?.rad) ?? '정보 없음'} W/㎡
      - 구름 양: ${toNum(meteo?.cloud) ?? '정보 없음'} %

      [분석 결과 예시]
      예시 1: 현재 대기 정체가 이어지면서 국내에서 발생한 오염물질이 계속 쌓이고 있는 상황입니다. 특히 바람이 약해 미세먼지가 흩어지지 못하고 있어 주의가 필요합니다.
      예시 2: 중국 등 국외에서 유입된 미세먼지의 영향으로 전국 대부분 지역의 공기가 탁합니다. 서풍 계열의 바람을 타고 오염물질이 계속 들어오고 있으니, 외출 시 마스크를 꼭 착용하세요.
    `;
    
    try {
      // (수정) API URL을 함수 내에서 동적으로 생성합니다.
      const apiUrl = `${GEMINI_API_BASE_URL}?key=${GEMINI_API_KEY}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API 호출 실패: ${response.statusText}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      return text || 'AI 분석 중 오류가 발생했습니다.';
    } catch (error) {
      console.error('AI Explanation Error:', error);
      return 'AI 분석에 실패했습니다. 잠시 후 다시 시도해주세요.';
    }
  }


  async function updateAll(lat, lon, isManualSearch = false) {
    currentCoords = { lat, lon };
    errorEl.style.display = 'none';
    
    if (isManualSearch) {
      shareResultBtn.style.display = 'inline-flex';
      dataSourceInfo.style.display = 'none';
    } else {
      shareResultBtn.style.display = 'none';
      dataSourceInfo.style.display = 'block';
    }

    const sortedStations = findNearbyStationsSorted(lat, lon);
    const airData = await findFirstHealthyData(sortedStations);
    
    if (airData) {
      drawGauge('PM10', airData.pm10, airData.station);
      drawGauge('PM25', airData.pm25, airData.station);
    } else {
      const stationName = sortedStations.length > 0 ? sortedStations[0].name : '정보 없음';
      drawGauge('PM10', null, stationName);
      drawGauge('PM25', null, stationName);
    }
    
    const regionName = await updateRegionText(lat, lon);
    updateDateTime();
    if (gaugesEl) {
      gaugesEl.classList.add('blink');
      setTimeout(() => gaugesEl.classList.remove('blink'), 500);
    }
    
    const causeEl = document.getElementById('forecastCause');
    const tagsEl  = document.getElementById('whyTags');
    
    // AI 분석 시작 전 로딩 메시지 표시
    if (causeEl) causeEl.textContent = 'AI가 오늘의 공기질을 분석하고 있어요... 🧐';
    if (tagsEl) tagsEl.innerHTML = '';
    document.getElementById('forecast-section').style.display = 'block';

    const [f10, f25, meteo] = await Promise.all([
      fetchForecast('PM10'),
      fetchForecast('PM25'),
      fetchMeteo(lat, lon)
    ]);
    
    const hints = {
      cause10:   cleanCause(f10?.cause)   || '',
      overall10: cleanCause(f10?.overall) || '',
      cause25:   cleanCause(f25?.cause)   || '',
      overall25: cleanCause(f25?.overall) || ''
    };

    const meas = {
      pm10: toNum(airData?.pm10),
      pm25: toNum(airData?.pm25),
      o3:   toNum(airData?.item?.o3Value),
      no2:  toNum(airData?.item?.no2Value)
    };
    
    // AI에게 해설 생성 요청
    const aiExplanation = await generateAiExplanation(meas, meteo, hints, regionName);
    
    if (causeEl) causeEl.textContent = aiExplanation;
    // 태그는 일단 비워두거나, AI가 생성하도록 프롬프트를 수정할 수 있습니다.
    if (tagsEl) tagsEl.innerHTML = '<span class="chip">AI 분석</span>';
  }
  
  let debounceTimer;
  inputEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const query = inputEl.value;
      if (!query) {
        suggestionsEl.innerHTML = '';
        return;
      }
      try {
        const res = await fetch(`${KAKAO_ADDRESS_API}?query=${encodeURIComponent(query)}`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
        if (!res.ok) return;
        const { documents } = await res.json();
        suggestionsEl.innerHTML = '';
        documents.slice(0, 5).forEach(d => {
          const li = document.createElement('li');
          li.textContent = d.address_name;
          li.onclick = () => {
            inputEl.value = d.address_name;
            suggestionsEl.innerHTML = '';
            updateAll(d.y, d.x, true);
          };
          suggestionsEl.appendChild(li);
        });
      } catch (e) {
        console.error('카카오 검색 오류:', e);
      }
    }, 300); 
  });

  document.getElementById('searchBtn').onclick = async () => {
    const query = inputEl.value.trim();
    if (!query) {
      alert('검색할 지역을 입력해 주세요.');
      return;
    }
    suggestionsEl.innerHTML = '';
    try {
      const res = await fetch(`${KAKAO_ADDRESS_API}?query=${encodeURIComponent(query)}`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
      if (!res.ok) throw new Error();
      const { documents } = await res.json();
      if (documents.length > 0) {
        const { y, x, address_name } = documents[0];
        updateAll(y, x, true);
        inputEl.value = address_name;
      } else {
        errorEl.textContent = `'${query}'에 대한 검색 결과가 없습니다.`;
        errorEl.style.display = 'block';
      }
    } catch (e) {
      errorEl.textContent = '검색 중 오류가 발생했습니다.';
      errorEl.style.display = 'block';
    }
  };

  if (shareResultBtn) {
    shareResultBtn.onclick = async () => {
      if (!currentCoords) {
        alert('먼저 지역을 검색하거나 현재 위치를 확인해주세요.');
        return;
      }
      const baseUrl = window.location.origin + window.location.pathname;
      const shareUrl = `${baseUrl}?lat=${currentCoords.lat}&lon=${currentCoords.lon}`;
      const regionName = document.getElementById('region').textContent || '검색 지역';

      const shareData = {
        title: `${regionName} 미세먼지 정보`,
        text: `'${regionName}'의 미세먼지 정보를 확인해보세요!`,
        url: shareUrl
      };
      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          throw new Error('Web Share API not supported');
        }
      } catch (err) {
        alert('이 브라우저에서는 공유 기능을 지원하지 않습니다.');
      }
    };
  }

  function updateDateTime() {
    const timeEl = document.getElementById('time');
    if(timeEl) timeEl.textContent = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }
  
  async function updateRegionText(lat, lon) {
    const regionEl = document.getElementById('region');
    if (!regionEl) return null;
    try {
      const res = await fetch(`${KAKAO_COORD_API}?x=${lon}&y=${lat}`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
      if (!res.ok) throw new Error();
      const { documents } = await res.json();
      const address = documents[0]?.address;
      if (address) {
        regionEl.textContent = address.address_name;
        return address.address_name;
      }
      return null;
    } catch (e) {
      regionEl.textContent = '주소 조회 실패';
      return null;
    }
  }
  
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
    updateDateTime();
    setInterval(updateDateTime, 60000);
  }

  initializeApp();
})();
