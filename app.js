(() => {
  // ====== 기준/키/엔드포인트 ======
  const CAT = [
    { name: '좋음',   max: 28,   color: '#1E88E5' },
    { name: '보통',   max: 80,   color: '#43A047' },
    { name: '나쁨',   max: 146,  color: '#F57C00' },
    { name: '매우나쁨', max: 1000, color: '#D32F2F' }
  ];

  const AIRKOREA_KEY = window.env?.AIRKOREA_KEY || 'I2wDgBTJutEeubWmNzwVS1jlGSGPvjidKMb5DwhKkjM2MMUst8KGPB2D03mQv8GHu%2BRc8%2BySKeHrYO6qaS19Sg%3D%3D';
  const KAKAO_KEY    = window.env?.KAKAO_KEY    || 'be29697319e13590895593f5f5508348';

  const AIRKOREA_API     = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=1&pageNo=1&stationName={station}&dataTerm=DAILY&ver=1.3`;
  const FORECAST_API     = (code) => `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=100&pageNo=1&searchDate={date}&informCode=${code}`;
  const KAKAO_ADDRESS_API= `https://dapi.kakao.com/v2/local/search/address.json`;
  const KAKAO_COORD_API  = `https://dapi.kakao.com/v2/local/geo/coord2address.json`;

  // ====== 엘리먼트 ======
  const inputEl        = document.getElementById('place');
  const suggestionsEl  = document.getElementById('suggestions');
  const errorEl        = document.getElementById('error-message');
  const gaugesEl       = document.getElementById('gauges');
  const shareResultBtn = document.getElementById('shareResultBtn');
  const dataSourceInfo = document.getElementById('data-source-info');

  let currentCoords = null;

  // ====== 유틸 ======
  function cleanCause(txt){
    if (!txt) return '';
    return txt.replace(/^\s*○\s*/, '').replace(/^\s*\[[^\]]+\]\s*/, '').trim();
  }
  function toNum(x){ const n = Number(x); return Number.isFinite(n) ? n : null; }
  function degToCompass(d){
    if (d == null) return null;
    const dirs = ['북','북북동','북동','동북동','동','동남동','남동','남남동','남','남남서','남서','서남서','서','서북서','북서','북북서'];
    const idx = Math.round(((d%360)+360)%360 / 22.5) % 16;
    return dirs[idx];
  }
  function isFromChinaSide(dir){
    if (dir == null) return false;
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
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  }
  function saveCache(key, data) {
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
  }

  // 하버사인
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
    return (window.stations || [])
      .map(st => ({ ...st, distance: calculateDistance(userLat, userLon, st.lat, st.lon) }))
      .sort((a, b) => a.distance - b.distance);
  }

  // 상태
  function getStatus(v) {
    if (v == null) return null;
    return CAT.find(c => v <= c.max) || CAT[CAT.length - 1];
  }

  // 게이지 애니메이션
  const GaugeState = { PM10: 0, PM25: 0 };
  function animateGauge(el, fromDeg, toDeg, color, duration=600) {
    const start = performance.now();
    function ease(t){ return t<0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2; }
    function step(now){
      const t = Math.min(1, (now - start) / duration);
      const v = fromDeg + (toDeg - fromDeg) * ease(t);
      el.style.setProperty('--angle', `${v}deg`);
      el.style.setProperty('--gauge-color', color);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function drawGauge(pmType, value, stationName) {
    const wheelEl      = document.getElementById(`gauge${pmType}`);
    const statusTextEl = document.getElementById(`statusText${pmType}`);
    const valueTextEl  = document.getElementById(`valueText${pmType}`);
    const stationEl    = document.getElementById(`station${pmType}`);
    if (!wheelEl || !statusTextEl || !valueTextEl || !stationEl) return;

    if (value == null) {
      wheelEl.style.setProperty('--gauge-color', '#cccccc');
      wheelEl.style.setProperty('--angle', '0deg');
      statusTextEl.textContent = '--';
      statusTextEl.style.color = 'var(--light-text-color)';
      valueTextEl.textContent = '- µg/m³';
      stationEl.textContent = `측정소: ${stationName || '정보 없음'}`;
      GaugeState[pmType] = 0;
      return;
    }

    const status = getStatus(value);
    const ratio  = Math.min(value / (status?.max || 150), 1);
    const targetDeg = Math.round(360 * ratio);
    const fromDeg   = GaugeState[pmType] || 0;

    animateGauge(wheelEl, fromDeg, targetDeg, status.color);
    GaugeState[pmType] = targetDeg;

    statusTextEl.textContent = status.name;
    statusTextEl.style.color = status.color;
    valueTextEl.textContent  = `${value} µg/m³`;
    stationEl.textContent    = `측정소: ${stationName || '정보 없음'}`;
  }

  // AirKorea 호출
  async function fetchByStation(stationName) {
    const url = AIRKOREA_API.replace('{station}', encodeURIComponent(stationName));
    const res = await fetch(url);
    return res.json();
  }
  function pickPM(item, type='pm25') {
    const _n = v => (v && v !== '-' ? Number(v) : null);
    if (type === 'pm10') return _n(item.pm10Value) ?? _n(item.pm10Value24) ?? null;
    return _n(item.pm25Value) ?? _n(item.pm25Value24) ?? null;
  }
  async function findFirstHealthyData(sortedStations, N=5) {
    for (const st of sortedStations.slice(0, N)) {
      const resp = await fetchByStation(st.name);
      const item = resp?.response?.body?.items?.[0];
      if (item) {
        const pm10 = pickPM(item, 'pm10');
        const pm25 = pickPM(item, 'pm25');
        if (pm10 != null || pm25 != null) {
          return { station: st.name, pm10, pm25, item };
        }
      }
    }
    return null;
  }

  // O3/NO2 포함 실시간
  async function fetchStationRealtime(stationName) {
    const url =
      'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty' +
      `?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=1&pageNo=1&dataTerm=DAILY&ver=1.3` +
      `&stationName=${encodeURIComponent(stationName)}`;
    const r = await fetch(url);
    const j = await r.json();
    const item = j?.response?.body?.items?.[0] || {};
    const pm25 = toNum(item.pm25Value) ?? toNum(item.pm25Value24);
    const pm10 = toNum(item.pm10Value);
    const o3   = toNum(item.o3Value);
    const no2  = toNum(item.no2Value);
    return { pm10, pm25, o3, no2, dataTime: item.dataTime || null };
  }

  // Open-Meteo (무키)
  async function fetchMeteo(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=wind_speed_10m,wind_direction_10m,shortwave_radiation,cloud_cover,temperature_2m` +
      `&timezone=Asia%2FSeoul`;
    const res = await fetch(url);
    const j = await res.json();
    const idx = nearestHourIndex(j.hourly?.time || []);
    return {
      windSpeed: j.hourly?.wind_speed_10m?.[idx] ?? null,
      windDir:   j.hourly?.wind_direction_10m?.[idx] ?? null,
      rad:       j.hourly?.shortwave_radiation?.[idx] ?? null,
      cloud:     j.hourly?.cloud_cover?.[idx] ?? null,
      temp:      j.hourly?.temperature_2m?.[idx] ?? null
    };
  }
  function nearestHourIndex(times){
    if (!Array.isArray(times) || !times.length) return 0;
    const now = new Date();
    let best = 0, diff = Infinity;
    for (let i=0;i<times.length;i++){
      const d = Math.abs(now - new Date(times[i]));
      if (d < diff){ best=i; diff=d; }
    }
    return best;
  }

  // 예보 (원인/종합만)
  async function fetchForecast(code, dateStrKST=null) {
    const date = dateStrKST || new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Seoul'})).toISOString().slice(0,10);
    const cacheKey = `forecast_${code}_${date}`;
    const cached = loadCache(cacheKey, 3*60*60*1000);
    if (cached) return cached;

    const url = FORECAST_API(code).replace('{date}', date);
    const res = await fetch(url);
    if (!res.ok) throw new Error('forecast fetch failed');
    const data  = await res.json();
    const items = data?.response?.body?.items || [];
    if (!items.length) {
      if (!dateStrKST) {
        const y = new Date(new Date(date).getTime()-86400000).toISOString().slice(0,10);
        return fetchForecast(code, y);
      }
      return { cause:'', overall:'' };
    }
    const it = items[0];
    const out = {
      cause:   cleanCause(it.informCause || ''),
      overall: cleanCause(it.informOverall || '')
    };
    saveCache(cacheKey, out);
    return out;
  }

  // 태그/해설
  function computeCauseTags(meas, meteo, hints){
    const tags = new Set();
    const pm10 = toNum(meas.pm10), pm25 = toNum(meas.pm25);
    const o3   = toNum(meas.o3),   no2  = toNum(meas.no2);
    const ws   = toNum(meteo?.windSpeed), wd = toNum(meteo?.windDir);
    const rad  = toNum(meteo?.rad),       cloud = toNum(meteo?.cloud), t = toNum(meteo?.temp);

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
  function buildForecastExplanation(meas, meteo, hints){
    const tags = computeCauseTags(meas, meteo, hints);
    const main =
      tags.includes('황사')          ? '황사 영향 가능성이 큽니다' :
      tags.includes('국외 유입')      ? '국외 유입 영향 가능성이 있습니다' :
      tags.includes('대기 정체')      ? '대기 정체로 축적되는 양상입니다' :
      tags.includes('광화학')         ? '강한 일사와 광화학 반응 영향이 보입니다' :
      tags.includes('국내 배출/교통') ? '국내 배출(교통 등) 영향이 큽니다' :
                                       '원인이 뚜렷하지 않습니다';

    const ev = [];
    if (isFinite(meas.pm10) && isFinite(meas.pm25) && meas.pm25>0)
      ev.push(`PM10/PM2.5 비율 ${(meas.pm10/meas.pm25).toFixed(1)}`);
    if (isFinite(meteo?.windSpeed) && isFinite(meteo?.windDir))
      ev.push(`바람 ${degToCompass(meteo.windDir)} ${meteo.windSpeed.toFixed(1)} m/s`);
    if (isFinite(meas.o3))  ev.push(`O₃ ${Number(meas.o3).toFixed(2)} ppm`);
    if (isFinite(meas.no2)) ev.push(`NO₂ ${Number(meas.no2).toFixed(2)} ppm`);
    if (isFinite(meteo?.rad))   ev.push(`일사 ${Math.round(meteo.rad)} W/㎡`);
    if (isFinite(meteo?.cloud)) ev.push(`구름 ${Math.round(meteo.cloud)}%`);

    return {
      text: `${main}${ev.length ? ' (근거: ' + ev.join(', ') + ')' : ''}`,
      tags
    };
  }

  // ====== 메인 업데이트 ======
  async function updateAll(lat, lon, isManualSearch=false) {
    currentCoords = { lat, lon };
    if (errorEl) errorEl.style.display = 'none';

    if (shareResultBtn && dataSourceInfo) {
      if (isManualSearch) {
        shareResultBtn.style.display = 'inline-flex';
        dataSourceInfo.style.display = 'none';
      } else {
        shareResultBtn.style.display = 'none';
        dataSourceInfo.style.display = 'block';
      }
    }

    // 1) 측정소 정렬 및 최근접 폴백 조회
    const sortedStations = findNearbyStationsSorted(lat, lon);
    const airData = await findFirstHealthyData(sortedStations); // {station, pm10, pm25, item} | null

    if (airData) {
      drawGauge('PM10', airData.pm10, airData.station);
      drawGauge('PM25', airData.pm25, airData.station);
    } else {
      const stationName = sortedStations[0]?.name || '정보 없음';
      drawGauge('PM10', null, stationName);
      drawGauge('PM25', null, stationName);
    }

    // 2) 지역/시간/살짝 애니
    const regionInfo = await updateRegionText(lat, lon);
    updateDateTime();
    if (gaugesEl) {
      gaugesEl.classList.add('blink');
      setTimeout(() => gaugesEl.classList.remove('blink'), 500);
    }

    // 3) 기상
    const meteo = await fetchMeteo(lat, lon);

    // 4) O3/NO2 포함 실시간
    const stationName = airData?.station || sortedStations[0]?.name || null;
    let gas = { pm10:null, pm25:null, o3:null, no2:null };
    if (stationName) {
      try { gas = await fetchStationRealtime(stationName); } catch {}
    }

    // 5) 예보 해설 (PM10/PM25)
    const [f10, f25] = await Promise.all([ fetchForecast('PM10'), fetchForecast('PM25') ]);
    const hints = {
      cause10:   f10?.cause || '',
      overall10: f10?.overall || '',
      cause25:   f25?.cause || '',
      overall25: f25?.overall || ''
    };

    // 6) 해설 생성(주소/측정소명 없음)
    const exp = buildForecastExplanation(
      {
        pm10: toNum(airData?.pm10) ?? toNum(gas.pm10),
        pm25: toNum(airData?.pm25) ?? toNum(gas.pm25),
        o3:   toNum(gas.o3),
        no2:  toNum(gas.no2)
      },
      meteo,
      hints
    );

    // 7) UI 반영
    const causeEl = document.getElementById('forecastCause');
    const tagsEl  = document.getElementById('whyTags');
    const section = document.getElementById('forecast-section');

    if (causeEl) causeEl.textContent = exp.text;
    if (tagsEl)  tagsEl.innerHTML = exp.tags.length
      ? exp.tags.map(t => `<span class="chip">${t}</span>`).join('')
      : '원인 정보를 추정할 수 없습니다.';
    if (section) section.style.display = 'block';
  }

  // ====== 검색/공유/UI ======
  let debounceTimer;
  if (inputEl) {
    inputEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const query = inputEl.value.trim();
        if (!query) { suggestionsEl.innerHTML=''; return; }
        try {
          const res = await fetch(`${KAKAO_ADDRESS_API}?query=${encodeURIComponent(query)}`, {
            headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
          });
          if (!res.ok) return;
          const { documents } = await res.json();
          suggestionsEl.innerHTML = '';
          documents.slice(0,5).forEach(d => {
            const li = document.createElement('li');
            li.textContent = d.address_name;
            li.onclick = () => {
              inputEl.value = d.address_name;
              suggestionsEl.innerHTML = '';
              updateAll(parseFloat(d.y), parseFloat(d.x), true);
            };
            suggestionsEl.appendChild(li);
          });
        } catch (e) {
          // silent
        }
      }, 300);
    });
  }

  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) {
    searchBtn.onclick = async () => {
      const query = inputEl?.value.trim();
      if (!query) { alert('검색할 지역을 입력해 주세요.'); return; }
      suggestionsEl.innerHTML = '';
      try {
        const res = await fetch(`${KAKAO_ADDRESS_API}?query=${encodeURIComponent(query)}`, {
          headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
        });
        if (!res.ok) throw new Error();
        const { documents } = await res.json();
        if (documents.length > 0) {
          const { y, x, address_name } = documents[0];
          updateAll(parseFloat(y), parseFloat(x), true);
          if (inputEl) inputEl.value = address_name;
        } else {
          if (errorEl) {
            errorEl.textContent = `'${query}'에 대한 검색 결과가 없습니다.`;
            errorEl.style.display = 'block';
          }
        }
      } catch {
        if (errorEl) {
          errorEl.textContent = '검색 중 오류가 발생했습니다.';
          errorEl.style.display = 'block';
        }
      }
    };
  }

  if (shareResultBtn) {
    shareResultBtn.onclick = async () => {
      if (!currentCoords) {
        alert('먼저 지역을 검색하거나 현재 위치를 확인해주세요.');
        return;
      }
      const baseUrl = window.location.origin + window.location.pathname;
      const shareUrl = `${baseUrl}?lat=${currentCoords.lat}&lon=${currentCoords.lon}`;
      const regionName = document.getElementById('region')?.textContent || '검색 지역';
      const shareData = {
        title: `${regionName} 미세먼지 정보`,
        text:  `'${regionName}'의 미세먼지 정보를 확인해보세요!`,
        url:   shareUrl
      };
      try {
        if (navigator.share) await navigator.share(shareData);
        else throw new Error('Web Share API not supported');
      } catch {
        alert('이 브라우저에서는 공유 기능을 지원하지 않습니다.');
      }
    };
  }

  function updateDateTime() {
    const timeEl = document.getElementById('time');
    if (timeEl) timeEl.textContent = new Date().toLocaleString('ko-KR',{ timeZone:'Asia/Seoul' });
  }

  async function updateRegionText(lat, lon) {
    const regionEl = document.getElementById('region');
    if (!regionEl) return null;
    try {
      const res = await fetch(`${KAKAO_COORD_API}?x=${lon}&y=${lat}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      if (!res.ok) throw new Error();
      const { documents } = await res.json();
      const address = documents?.[0]?.address;
      if (address) {
        regionEl.textContent = address.address_name;
        return address;
      }
      return null;
    } catch {
      regionEl.textContent = '주소 조회 실패';
      return null;
    }
  }

  // ====== 시작 ======
  function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');

    if (lat && lon) {
      updateAll(parseFloat(lat), parseFloat(lon), true);
    } else {
      navigator.geolocation.getCurrentPosition(
        p => updateAll(p.coords.latitude, p.coords.longitude, false),
        () => { alert('위치 정보를 가져올 수 없습니다. 기본 위치(서울 종로구)로 조회합니다.'); updateAll(37.572016, 126.975319, false); }
      );
    }
    updateDateTime();
    setInterval(updateDateTime, 60000);
  }
  initializeApp();
})();
