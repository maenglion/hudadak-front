// /app.js  — LITE
import { fetchNearestAir, searchByAddress } from '/js/apiClient.js';
import { STANDARDS } from '/js/standards.js';

console.log('app.js LITE boot');

const elPM10 = document.getElementById('pm10-value');
const elPM25 = document.getElementById('pm25-value');
const elG10  = document.getElementById('pm10-grade');
const elG25  = document.getElementById('pm25-grade');
const elSta  = document.getElementById('station-name');
const elTS   = document.getElementById('display-ts');

const inputEl = document.getElementById('place');
const btnSearch = document.getElementById('searchBtn');

// ---- 기준 선택 (없으면 WHO8 기본) ----
const STD_KEY = 'aq_standard';
function getStd() { return localStorage.getItem(STD_KEY) || 'WHO8'; }

// ---- WHO/KOR 구간에서 등급 라벨 만들기 ----
function labelFromBreaks(breaks, value, labels) {
  // breaks: 오름차순 상한 배열, labels: breaks.length+1 개
  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return labels[i];
  }
  return labels[labels.length - 1];
}

function gradeLabel(metric, v) {
  const std = STANDARDS[getStd()];
  if (!std) return '--';
  const br = std.breaks?.[metric];
  if (!br) return '--';

  // 라벨 세트(필요 시 바꿔도 됨)
  const LABELS_4 = ['좋음','보통','나쁨','매우나쁨'];
  const LABELS_2 = ['권고 이내','권고 초과'];
  const LABELS_8 = ['매우 좋음','좋음','양호','주의(IT-4)','나쁨(IT-3)','매우 나쁨(IT-2)','위험(IT-1)','최악'];

  const labels =
    br.length === 1 ? LABELS_2 :
    br.length === 3 ? LABELS_4 :
    br.length === 7 ? LABELS_8 : // WHO8
    // 그 외 길이는 간단 라벨로 생성
    Array.from({length: br.length + 1}, (_,i)=>`${i+1}단계`);

  return labelFromBreaks(br, Number(v), labels);
}

// ---- 렌더 ----
function renderAir(air){
  const pm10 = air.pm10 ?? null;
  const pm25 = air.pm25 ?? null;

  elPM10.textContent = (pm10 ?? '--');
  elPM25.textContent = (pm25 ?? '--');

  elG10.textContent  = (pm10 == null) ? '--' : gradeLabel('pm10', pm10);
  elG25.textContent  = (pm25 == null) ? '--' : gradeLabel('pm25', pm25);

  elSta.textContent  = air.station?.name || air.name || '--';
  elTS.textContent   = air.display_ts ? new Date(air.display_ts).toLocaleString('ko-KR') : '--';
}

// ---- 데이터 갱신 ----
async function updateAll(lat, lon){
  const air = await fetchNearestAir(lat, lon);
  renderAir(air);
}

// ---- 검색 ----
async function doSearch(q){
  if (!q || q.trim().length < 2) return alert('두 글자 이상 입력하세요');
  try {
    const g = await searchByAddress(q);
    inputEl.value = g.address;
    updateAll(g.lat, g.lon);
  } catch(e){
    console.error(e);
    alert('주소 검색 실패');
  }
}
btnSearch?.addEventListener('click', ()=>doSearch(inputEl.value));
inputEl?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(inputEl.value); });

// ---- 시작: 쿼리/지오로케이션/기본 서울 ----
(function boot(){
  const u = new URLSearchParams(location.search);
  const lat = u.get('lat'), lon = u.get('lon');
  if (lat && lon) return updateAll(parseFloat(lat), parseFloat(lon));

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => updateAll(pos.coords.latitude, pos.coords.longitude),
      _   => updateAll(37.5665, 126.9780) // 서울
    );
  } else {
    updateAll(37.5665, 126.9780);
  }
})();
