// /app.js — with search & safe boot
import { fetchNearestAir } from '/js/apiClient.js';
import { STANDARDS } from '/js/standards.js';

console.log('[app] boot');

const qs = new URLSearchParams(location.search);
const el = {
  place: document.getElementById('place'),
  btnSearch: document.getElementById('searchBtn'),
  btnCurrent: document.getElementById('btn-current'),
};

function ensureContainer() {
  let pm10 = document.getElementById('pm10-value');
  let pm25 = document.getElementById('pm25-value');
  let g10  = document.getElementById('pm10-grade');
  let g25  = document.getElementById('pm25-grade');
  let sta  = document.getElementById('station-name');
  let ts   = document.getElementById('display-ts');

  if (!pm10 || !pm25 || !g10 || !g25 || !sta || !ts) {
    const card = document.createElement('section');
    card.className = 'card';
    card.id = 'autocard';
    card.innerHTML = `
      <h4>현재 대기질</h4>
      <div>PM10: <b id="pm10-value">--</b> μg/m³ <span id="pm10-grade" class="muted">--</span></div>
      <div>PM2.5: <b id="pm25-value">--</b> μg/m³ <span id="pm25-grade" class="muted">--</span></div>
      <div class="muted" style="margin-top:6px">
        기준지역: <span id="station-name">--</span> · 시각: <span id="display-ts">--</span>
      </div>`;
    (document.querySelector('main') || document.body).prepend(card);
    pm10 = card.querySelector('#pm10-value');
    pm25 = card.querySelector('#pm25-value');
    g10  = card.querySelector('#pm10-grade');
    g25  = card.querySelector('#pm25-grade');
    sta  = card.querySelector('#station-name');
    ts   = card.querySelector('#display-ts');
  }
  return { pm10, pm25, g10, g25, sta, ts };
}

function gradeLabel(metric, v){
  const stdCode = localStorage.getItem('aq_standard') || 'WHO8';
  const std = STANDARDS[stdCode];
  const br = std?.breaks?.[metric];
  if (!br) return '--';
  const L2 = ['권고 이내','권고 초과'];
  const L4 = ['좋음','보통','나쁨','매우나쁨'];
  const L8 = ['매우 좋음','좋음','양호','주의(IT-4)','나쁨(IT-3)','매우 나쁨(IT-2)','위험(IT-1)','최악'];
  const labels = br.length===1 ? L2 : br.length===3 ? L4 : br.length===7 ? L8
               : Array.from({length: br.length+1}, (_,i)=>`${i+1}단계`);
  const x = Number(v);
  for (let i=0;i<br.length;i++) if (x<=br[i]) return labels[i];
  return labels[labels.length-1];
}

function render(air){
  const { pm10, pm25, g10, g25, sta, ts } = ensureContainer();
  pm10.textContent = air.pm10 ?? '--';
  pm25.textContent = air.pm25 ?? '--';
  g10.textContent  = air.pm10==null ? '--' : gradeLabel('pm10', air.pm10);
  g25.textContent  = air.pm25==null ? '--' : gradeLabel('pm25', air.pm25);
  sta.textContent  = air.station?.name || air.name || '--';
  ts.textContent   = air.display_ts ? new Date(air.display_ts).toLocaleString('ko-KR') : '--';
}

/* ---------- 검색: 주소 → 좌표 ---------- */
/* 우선순위: 1) 백엔드 /api/geo/search (있으면)  2) "lat,lon" 직접 파싱 */
async function geocode(q){
  // 2) "37.57,126.98" 형식 허용
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]), address: q.trim() };

  // 1) 백엔드 프록시 시도
  const resp = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`);
  if (!resp.ok) {
    const text = await resp.text().catch(()=>String(resp.status));
    throw new Error(`검색 실패 (${resp.status}) ${text}`);
  }
  return await resp.json(); // {lat, lon, address}
}

async function doSearch(q){
  if (!q || q.trim().length < 2) return alert('두 글자 이상 입력하세요 (또는 "37.57,126.98")');
  try{
    const g = await geocode(q);
    el.place && (el.place.value = g.address || `${g.lat},${g.lon}`);
    render(await fetchNearestAir(g.lat, g.lon));
  }catch(e){
    console.error(e);
    alert('주소 검색이 아직 준비되지 않았습니다. "위도,경도" 형태로 입력해 보세요.');
  }
}

/* ---------- 시작: 쿼리 → 지오로케이션 → 기본 ---------- */
async function boot(){
  try{
    const lat = qs.get('lat'), lon = qs.get('lon');
    if (lat && lon) return render(await fetchNearestAir(parseFloat(lat), parseFloat(lon)));

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async pos => render(await fetchNearestAir(pos.coords.latitude, pos.coords.longitude)),
        async _   => render(await fetchNearestAir(37.5665,126.9780))
      );
    } else {
      render(await fetchNearestAir(37.5665,126.9780));
    }
  }catch(e){
    console.error('[app] failed:', e);
  }
}

/* ---------- 이벤트 바인딩 ---------- */
el.btnSearch?.addEventListener('click', ()=>doSearch(el.place?.value || ''));
el.place?.addEventListener('keydown', e => { if (e.key==='Enter') doSearch(el.place.value); });
el.btnCurrent?.addEventListener('click', ()=>{
  navigator.geolocation?.getCurrentPosition(
    async pos => render(await fetchNearestAir(pos.coords.latitude, pos.coords.longitude)),
    async _   => render(await fetchNearestAir(37.5665,126.9780))
  );
});

boot();
