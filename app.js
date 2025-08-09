(() => {
  const CAT = [
    { name: '좋음', max: 28, color: '#1E88E5' },
    { name: '보통', max: 80, color: '#43A047' },
    { name: '나쁨', max: 146, color: '#F57C00' },
    { name: '매우나쁨', max: 1000, color: '#D32F2F' }
  ];

  const AIRKOREA_KEY = window.env?.AIRKOREA_KEY || 'I2wDgBTJutEeubWmNzwVS1jlGSGPvjidKMb5DwhKkjM2MMUst8KGPB2D03mQv8GHu%2BRc8%2BySKeHrYO6qaS19Sg%3D%3D';
  const KAKAO_KEY = window.env?.KAKAO_KEY || 'be29697319e13590895593f5f5508348';
  
  const AIRKOREA_API = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=1&pageNo=1&stationName={station}&dataTerm=DAILY&ver=1.3`;
  const KAKAO_ADDRESS_API = `https://dapi.kakao.com/v2/local/search/address.json`;
  const KAKAO_COORD_API = `https://dapi.kakao.com/v2/local/geo/coord2address.json`;
  
  const inputEl = document.getElementById('place');
  const suggestionsEl = document.getElementById('suggestions');
  const errorEl = document.getElementById('error-message');
  const gaugesEl = document.getElementById('gauges');

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const dx = lon1 - lon2;
    const dy = lat1 - lat2;
    return dx * dx + dy * dy;
  }

  function findNearestStation(userLat, userLon) {
    let closestStation = null;
    let minDistance = Infinity;
    stations.forEach(station => {
      const distance = calculateDistance(userLat, userLon, station.lat, station.lon);
      if (distance < minDistance) {
        minDistance = distance;
        closestStation = station;
      }
    });
    return closestStation.name;
  }

  function getStatus(v) {
    return CAT.find(c => v <= c.max) || CAT[CAT.length - 1];
  }

  function drawGauge(pmType, value, station) {
    const wheelEl = document.getElementById(`gauge${pmType}`);
    const statusTextEl = document.getElementById(`statusText${pmType}`);
    const valueTextEl = document.getElementById(`valueText${pmType}`);
    const stationEl = document.getElementById(`station${pmType}`);
    if (!wheelEl || !statusTextEl || !valueTextEl || !stationEl) return;
    const status = getStatus(value);
    const ratio = Math.min(value / 150, 1);
    const deg = 360 * ratio;
    wheelEl.style.setProperty('--gauge-color', status.color);
    wheelEl.style.setProperty('--angle', `${deg}deg`);
    statusTextEl.textContent = status.name;
    statusTextEl.style.color = status.color;
    valueTextEl.textContent = `${value} µg/m³`;
    stationEl.textContent = `측정소: ${station}`;
  }

  async function fetchAirData(station) {
    try {
      const url = AIRKOREA_API.replace('{station}', encodeURIComponent(station));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`AirKorea 데이터 API 오류`);
      const data = await res.json();
      const item = data.response.body.items[0];
      if (!item || !item.pm10Value) {
        return { pm10: 0, pm25: 0, station: `${station} (데이터 없음)` };
      }
      return { 
        pm10: parseFloat(item.pm10Value) || 0, 
        pm25: parseFloat(item.pm25Value) || 0, 
        station: station
      };
    } catch (e) {
      console.error(`AirKorea 데이터 API 오류:`, e);
      return { pm10: 0, pm25: 0, station: `${station} (조회 실패)` };
    }
  }

  async function updateAll(lat, lon) {
    errorEl.style.display = 'none';
    const stationName = findNearestStation(lat, lon);
    const airData = await fetchAirData(stationName);
    drawGauge('PM10', airData.pm10, airData.station);
    drawGauge('PM25', airData.pm25, airData.station);
    updateRegionText(lat, lon);
    updateDateTime();
    if (gaugesEl) {
      gaugesEl.classList.add('blink');
      setTimeout(() => gaugesEl.classList.remove('blink'), 500);
    }
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
            updateAll(d.y, d.x);
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
        updateAll(y, x);
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

  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) {
    adminBtn.onclick = () => {
      const pw = prompt('비밀번호를 입력하세요.');
      if (pw === 'leesoul0407!') {
        window.location.href = 'admin.html';
      } else if (pw) {
        alert('비밀번호가 일치하지 않습니다.');
      }
    };
  }
  
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.onclick = () => {
      const url = window.location.href;
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);

      const toast = document.getElementById('toast-message');
      toast.textContent = 'URL이 복사되었어요!';
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2000);
    };
  }

  navigator.geolocation.getCurrentPosition(
    p => updateAll(p.coords.latitude, p.coords.longitude),
    () => {
      alert('위치 정보를 가져올 수 없습니다. 기본 위치(서울 종로구)로 조회합니다.');
      updateAll(37.572016, 126.975319);
    }
  );

  function updateDateTime() {
    const timeEl = document.getElementById('time');
    if(timeEl) timeEl.textContent = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }
  
  async function updateRegionText(lat, lon) {
    const regionEl = document.getElementById('region');
    if (!regionEl) return;
    try {
      const res = await fetch(`${KAKAO_COORD_API}?x=${lon}&y=${lat}`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
      if (!res.ok) throw new Error();
      const { documents } = await res.json();
      regionEl.textContent = documents[0]?.address?.address_name || '--';
    } catch (e) {
      regionEl.textContent = '주소 조회 실패';
    }
  }

  // --- PWA 설치 팝업 로직 ---
  let deferredPrompt;
  const installPopup = document.getElementById('install-popup');
  const installBtn = document.getElementById('install-btn');
  const installCloseBtn = document.getElementById('install-close-btn');
  const iosInstallPopup = document.getElementById('ios-install-popup');
  const iosCloseBtn = document.getElementById('ios-close-btn');
  const PWA_PROMPT_SHOWN_KEY = 'pwaPromptShown';

  const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    if (!localStorage.getItem(PWA_PROMPT_SHOWN_KEY)) {
      installPopup.style.display = 'flex';
    }
  });

  if (installBtn) {
    installBtn.onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          console.log('User accepted the A2HS prompt');
        }
        deferredPrompt = null;
        installPopup.style.display = 'none';
        localStorage.setItem(PWA_PROMPT_SHOWN_KEY, 'true');
      }
    };
  }
  
  if (installCloseBtn) {
    installCloseBtn.onclick = () => {
      installPopup.style.display = 'none';
      localStorage.setItem(PWA_PROMPT_SHOWN_KEY, 'true');
    };
  }

  function showIosInstallPopup() {
    if (isIos() && !localStorage.getItem(PWA_PROMPT_SHOWN_KEY)) {
      iosInstallPopup.style.display = 'flex';
    }
  }

  if (iosCloseBtn) {
    iosCloseBtn.onclick = () => {
      iosInstallPopup.style.display = 'none';
      localStorage.setItem(PWA_PROMPT_SHOWN_KEY, 'true');
    };
  }

  window.addEventListener('load', showIosInstallPopup);

    // --- 서비스 워커 등록 로직 (추가) ---
  function registerServiceWorker() {
    // 'serviceWorker' in navigator는 현재 브라우저가 서비스 워커를 지원하는지 확인하는 코드입니다.
    if ('serviceWorker' in navigator) {
      // window.addEventListener('load', ...)는 페이지의 모든 리소스(이미지, 스타일시트 등)가
      // 완전히 로드된 후에 서비스 워커를 등록하여, 페이지 초기 로딩을 방해하지 않도록 합니다.
      window.addEventListener('load', () => {
        // navigator.serviceWorker.register('/sw.js')가 서비스 워커를 등록하는 핵심 명령입니다.
        // 브라우저는 사이트의 최상위 경로에서 'sw.js' 파일을 찾아 등록합니다.
        navigator.serviceWorker.register('/sw.js')
          .then(registration => {
            // 등록에 성공하면 콘솔에 성공 메시지를 출력합니다.
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
          })
          .catch(err => {
            // 등록에 실패하면 콘솔에 오류 메시지를 출력합니다.
            console.log('ServiceWorker registration failed: ', err);
          });
      });
    }
  }

  // --- 함수 실행 ---
  registerServiceWorker(); // 위에서 정의한 서비스 워커 등록 함수를 실행합니다.
  
  updateDateTime();
  setInterval(updateDateTime, 60000);
})();
