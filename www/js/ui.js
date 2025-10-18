// js/ui.js
import { STANDARDS } from './standards.js';
import { colorFor } from './color-scale.js';

// ===== 설정 =====
let STANDARD = 'KOR';                 // 'KOR' | 'WHO24' | 'WHO5' | 'WHO8'
const API_BASE = location.origin;     // 같은 포트에서 API 띄웠다면 그대로 사용


// ===== 유틸 =====
const $  = (q, el=document) => el.querySelector(q);

const circumference = (r) => 2 * Math.PI * r;
function setRingProgress(circle, value, max){
  const r = parseFloat(circle.getAttribute('r'));
  const C = circumference(r);
  const t = Math.max(0, Math.min(1, (value ?? 0) / max));
  circle.style.strokeDasharray = `${C*t} ${C*(1-t)}`;
}

// 국내 4단계 등급(숫자 1~4)
function caiGradeKOR(pm10, pm25){
  const b = STANDARDS.KOR.breaks;
  const g10 = pm10==null ? 1 : (pm10<=b.pm10[0]?1: pm10<=b.pm10[1]?2: pm10<=b.pm10[2]?3:4);
  const g25 = pm25==null ? 1 : (pm25<=b.pm25[0]?1: pm25<=b.pm25[1]?2: pm25<=b.pm25[2]?3:4);
  return Math.max(g10, g25);
}

// 보조수치 바의 % 스케일 (간단: 최상위 밴드 상한으로 100%)
const GAS_MAX = {
  o3:  (STANDARDS.KOR?.breaks?.o3  ?? [60,120,180,240])[3] || 240,
  no2: (STANDARDS.KOR?.breaks?.no2 ?? [50,100,200,400])[3] || 400,
  so2: (STANDARDS.KOR?.breaks?.so2 ?? [20,80,150,300])[3] || 300,
  co:  (STANDARDS.KOR?.breaks?.co  ?? [300,600,900,1200])[3] || 1200,
};
function pct(v, max){ if(v==null) return 0; return Math.max(0, Math.min(100, (v/max)*100)); }

// ===== API =====
async function fetchNearest(lat=37.57, lon=126.98){
  const u = new URL('/nearest', API_BASE);
  u.searchParams.set('lat', lat);
  u.searchParams.set('lon', lon);
  const res = await fetch(u);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ===== 렌더 =====
async function render(lat=37.57, lon=126.98){
  try{
    const d = await fetchNearest(lat, lon);
    const pm10 = d.pm10 ?? null;
    const pm25 = d.pm25 ?? null;

    // 1) 통합 색 1개(KOR 기준) 선택
    const g     = d.cai_grade ?? caiGradeKOR(pm10, pm25);
    const band  = STANDARDS.KOR.bands[g-1];       // { label, bg, ... }
    const color = band?.bg || '#888';

    // 2) 링 진행률 적용 (바깥 PM10 0~150, 안쪽 PM2.5 0~75)
    setRingProgress($('#ring-outer'), pm10, 150);
    setRingProgress($('#ring-inner'), pm25, 75);
    $('#ring-outer').style.stroke = color;
    $('#ring-inner').style.stroke = color;

    // 3) 텍스트/메타
    $('#gradeText').textContent = band?.label || '—';
    $('#pmText').textContent    = `PM2.5 ${pm25!=null?pm25.toFixed(1):'—'} · PM10 ${pm10!=null?pm10.toFixed(1):'—'} (µg/m³)`;
    $('#badgeText').textContent = (d.badges||[]).join(' · ');
    $('#metaTs').textContent    = `${d.name || '측정'} • ${d.display_ts || ''}`;

    // 4) 보조수치 바 (O3/NO2/SO2/CO)
    const gases = ['o3','no2','so2','co'];
    gases.forEach(k => {
      const row  = $(`.bar-row[data-key="${k}"]`);
      const fill = $('.bar-fill', row);
      const val  = d[k];         // µg/m³
      const max  = GAS_MAX[k];
      // width
      fill.style.width = `${pct(val, max)}%`;
      // 색상: 표준 밴드에 맞는 배경색 (metric 이름은 standards.js/color-scale.js의 키와 동일해야 함)
      const band = colorFor({ standard: STANDARD, metric: k, value: val });
      fill.style.background = band?.bg || color;  // 가스 항목별 색, 없으면 통합색
      // 라벨
      $('.bar-value', row).textContent = (val==null ? '—' : `${val.toFixed(0)} µg/m³`);
    });

  }catch(e){
    console.error(e);
    $('#gradeText').textContent = '불러오기 실패';
  }
}

window.addEventListener('load', () => render());
