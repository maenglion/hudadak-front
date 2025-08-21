(() => {
  // (수정) ─ 변수명을 SCALE로 통일
  const SCALE = {
    PM10: [
      { name:'좋음',   max: 15,  color:'#1E88E5' },
      { name:'보통',   max: 35,  color:'#43A047' },
      { name:'나쁨',   max: 75, color:'#F57C00' },
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
  
  const AIRKOREA_API = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=1&pageNo=1&stationName={station}&dataTerm=DAILY&ver=1.3`;
  const KAKAO_ADDRESS_API = `https://dapi.kakao.com/v2/local/search/address.json`;
  const KAKAO_COORD_API = `https://dapi.kakao.com/v2/local/geo/coord2address.json`;
  const FORECAST_API = (code) => `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=100&pageNo=1&searchDate={date}&informCode=${code}`;
  const METEO_API = `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=wind_speed_10m,wind_direction_10m,shortwave_radiation,cloud_cover,temperature_2m&timezone=Asia%2FSeoul`;
  
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
  function isFromChinaSide(dir){
    if(dir==null) return false;
    return (dir >= 240 && dir <= 300) || (dir >= 315 || dir <= 30); // 서~북서~북
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
  // 1. 가까운 N개 측정소에 대한 API 요청을 '동시에' 모두 보냅니다.
  const promises = sortedStations.slice(0, N).map(st => 
    fetchByStation(st.name).then(resp => ({
      station: st.name,
      item: resp?.response?.body?.items?.[0]
    }))
  );

  // 2. 모든 요청이 끝날 때까지 기다립니다.
  const results = await Promise.all(promises);

  // 3. 도착한 결과 중에서 가장 먼저 유효한 데이터를 찾아서 반환합니다.
  const validResult = results.find(res => {
    if (!res.item) return false;
    const pm10 = pickPM(res.item, 'pm10');
    const pm25 = pickPM(res.item, 'pm25');
    return pm10 !== null || pm25 !== null;
  });

  if (!validResult) return null;

  // 4. 찾은 유효한 데이터로 최종 결과 객체를 만들어 반환합니다.
  return {
    station: validResult.station,
    pm10: pickPM(validResult.item, 'pm10'),
    pm25: pickPM(validResult.item, 'pm25'),
    item: validResult.item
  };
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

  function computeCauseTags(meas, meteo, hints){
    const tags = new Set();
    const pm10 = toNum(meas?.pm10), pm25 = toNum(meas?.pm25);
    const o3 = toNum(meas?.o3), no2 = toNum(meas?.no2);
    const ws = toNum(meteo?.windSpeed), wd = toNum(meteo?.windDir);
    const rad = toNum(meteo?.rad), cloud = toNum(meteo?.cloud), t = toNum(meteo?.temp);
    const pmBad = (pm25>=36) || (pm10>=81);
    const ratio = pm25 ? (pm10/pm25) : Infinity;
    const f10 = cleanCause(hints?.cause10 || hints?.overall10 || '');
    const f25 = cleanCause(hints?.cause25 || hints?.overall25 || '');

    if ((pm10>=81 && ratio>=2.2) || /황사/.test(f10+f25)) tags.add('황사');
    if (pmBad && ws!=null && ws<=1.5 && ((cloud!=null && cloud<=40) || (rad!=null && rad>=350))) tags.add('대기 정체');
    if ((pmBad && ws!=null && ws>=4 && isFromChinaSide(wd)) || /(국외|장거리|서풍|북서풍)/.test(f10+f25)) tags.add('국외 유입');
    if ((o3!=null && o3>=0.06) || (rad!=null && rad>=500 && cloud!=null && cloud<=30 && t!=null && t>=24 && pm25>=36)) tags.add('광화학');
    if (no2!=null && no2>=0.05 && pm25>=36) tags.add('국내 배출/교통');

    return Array.from(tags);
  }

  function describeEvidence(meas, meteo, mainTag){
    const notes = [];
    const ws = toNum(meteo?.windSpeed), wd = toNum(meteo?.windDir);
    const rad = toNum(meteo?.rad), cloud = toNum(meteo?.cloud);
  
    if (ws != null && wd != null) {
      const d = degToCompass(wd);
      notes.push(ws >= 4 ? `${d}풍 ${ws.toFixed(1)}m/s` : '약한 바람');
    }
    if (mainTag === '황사' && isFinite(meas.pm10) && isFinite(meas.pm25) && meas.pm25 > 0) {
      notes.push(`PM10/PM2.5 ${ (meas.pm10/meas.pm25).toFixed(1) }`);
    }
    if (mainTag === '광화학' && rad != null && rad >= 500) notes.push('강한 일사');
    if (mainTag === '대기 정체' && cloud != null && cloud <= 40) notes.push('구름 적음');
    if (mainTag === '광화학' && isFinite(meas.o3))  notes.push(`O₃ ${Number(meas.o3).toFixed(2)}ppm`);
    if (mainTag === '국내 배출/교통' && isFinite(meas.no2)) notes.push(`NO₂ ${Number(meas.no2).toFixed(2)}ppm`);
  
    return notes.slice(0,2).join(', ');
  }
  
  // (수정) ─ 오존 정보를 포함하도록 해설 생성 로직 변경
  function buildForecastExplanation(meas, meteo, hints){
    const tags = computeCauseTags(meas, meteo, hints);
    const order = ['황사','국외 유입','대기 정체','광화학','국내 배출/교통'];
    const mainTag = order.find(t => tags.includes(t)) || null;
  
    let line;
    switch (mainTag) {
      case '황사':          line = '황사로 일시적 고농도입니다.'; break;
      case '국외 유입':      line = '서·북서풍을 타고 국외 오염이 유입 중입니다.'; break;
      case '대기 정체':      line = '바람이 약해 오염물질이 축적되고 있어요.'; break;
      case '광화학':        line = '강한 일사로 2차 생성이 활발합니다.'; break;
      case '국내 배출/교통': line = '국내 배출(교통 등) 영향이 큽니다.'; break;
      default: {
        const off = (hints?.cause25 || hints?.cause10 || hints?.overall25 || hints?.overall10 || '').trim();
        line = off || '복합 원인으로 보입니다.';
      }
    }
  
    const ev = describeEvidence(meas, meteo, mainTag);
    let fullText = ev ? `${line} (${ev})` : line;

    // 오존 농도가 '나쁨' (0.091 ppm) 이상일 경우 문구 추가
    const o3 = toNum(meas?.o3);
    if (o3 !== null && o3 >= 0.091) {
      fullText += " 또한, 오존 농도도 높으니 주의가 필요합니다.";
    }

    return { text: fullText, tags };
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
      drawGauge('PM10', airData.pm25, airData.station);
      drawGauge('PM25', airData.pm25, airData.station);
    } else {
      const stationName = sortedStations.length > 0 ? sortedStations[0].name : '정보 없음';
      drawGauge('PM10', null, stationName);
      drawGauge('PM25', null, stationName);
    }
    
    const regionName = await updateRegionText(lat, lon);
    updateDateTime();
    // 게이지 전체 대신, 업데이트된 텍스트 요소들에만 효과 적용
    const elementsToBlink = [
      document.getElementById('statusTextPM10'),
      document.getElementById('valueTextPM10'),
      document.getElementById('statusTextPM25'),
      document.getElementById('valueTextPM25')
    ];

    elementsToBlink.forEach(el => {
      if (el) {
        el.classList.add('blink-effect');
        setTimeout(() => el.classList.remove('blink-effect'), 500);
    }
  });
    
    const causeEl = document.getElementById('forecastCause');
    const tagsEl  = document.getElementById('whyTags');
    
    if (causeEl) causeEl.textContent = '오늘의 공기질을 분석하고 있어요... 🧐';
    if (tagsEl) tagsEl.innerHTML = '';
    document.getElementById('forecast-section').style.display = 'block';

    const [f10, f25, meteo] = await Promise.all([
      fetchForecast('PM25'),
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
    
    const exp = buildForecastExplanation(meas, meteo, hints);
    
    if (causeEl) causeEl.textContent = exp.text;
    if (tagsEl)  tagsEl.innerHTML = (exp.tags && exp.tags.length)
      ? exp.tags.map(t => `<span class="chip">${t}</span>`).join('')
      : '<span class="chip">분석 완료</span>';
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
        title: `${regionName} 초미세먼지 정보`,
        text: `'${regionName}'의 초미세먼지 정보를 확인해보세요!`,
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
