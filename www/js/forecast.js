// js/forecast.js
// 예보 렌더링 & 뱃지 매핑 모듈 (ESM)
export function badgeClassByName(name = "") {
  const n = String(name || "").toLowerCase();
  if (/(매우)?나쁨|poor|bad|unhealthy/.test(n)) return "badge badge-bad";
  if (/보통|moderate|normal/.test(n))           return "badge badge-mid";
  if (/좋음|good|clean/.test(n))                 return "badge badge-good";
  if (/황사|smog|dust/.test(n))                  return "badge badge-dust";
  if (/국외|유입|transbound/.test(n))            return "badge badge-flow";
  if (/대기정체|정체|stagnation/.test(n))        return "badge badge-stagn";
  return "badge";
}

// 서버 예보 응답을 화면에 반영
export function renderForecast(fc = {}, opts = {}) {
  const forecastSectionEl = document.getElementById("forecast-section");
  const forecastRegionEl  = document.getElementById("forecast-region");
  const forecastCauseEl   = document.getElementById("forecastCause");
  const whyTagsEl         = document.getElementById("whyTags");
  if (!forecastSectionEl || !whyTagsEl) return;

  const level   = fc.level ?? fc.grade ?? fc.cai_grade ?? "";
  const cause   = fc.cause ?? fc.informCause ?? fc.reason ?? "";
  const tagsArr = Array.isArray(fc.tags) ? fc.tags
                : (typeof fc.tags === "string"
                   ? fc.tags.split(/[,、]/).map(s => s.trim()).filter(Boolean)
                   : []);

  if (forecastRegionEl) {
    const horizon = fc.horizon ? ` · ${fc.horizon}` : "";
    if (opts?.address) {
      forecastRegionEl.textContent = `${opts.address}${horizon}`;
    } else if (opts?.lat && opts?.lon) {
      forecastRegionEl.textContent = `(${Number(opts.lat).toFixed(3)}, ${Number(opts.lon).toFixed(3)})${horizon}`;
    } else if (horizon && !forecastRegionEl.textContent.includes(horizon)) {
      forecastRegionEl.textContent = (forecastRegionEl.textContent || "--") + horizon;
    }
  }

  if (forecastCauseEl) forecastCauseEl.textContent = cause || "";

  whyTagsEl.innerHTML = "";
  const list = [];
  if (level) list.push(level);
  tagsArr.forEach(t => list.push(t));
  list.slice(0, 6).forEach(text => {
    const b = document.createElement("span");
    b.className = badgeClassByName(text);
    b.textContent = text;
    whyTagsEl.appendChild(b);
  });

  forecastSectionEl.style.display = list.length ? "block" : "none";
}

// 예보 문장 생성 (KO)
export function composeForecastLine(fc = {}, opts = {}) {
  // 날짜/범위
  const day = fc.date
    ? new Date(fc.date).toLocaleDateString('ko-KR', { weekday: 'long' })
    : (fc.horizon || '오늘');

  // 공기질 레벨 (문장에 쓰기 좋은 라벨)
  const level = fc.level || fc.grade || fc.cai_grade || '';
  const levelText = level ? `공기질은 '${level}' 수준` : '공기질 지표는 제한적';

  // PM 피크 정보 (있을 때만)
  const pm25 = (fc.pm25!=null) ? `PM2.5 ${Math.round(fc.pm25)}µg/m³` : '';
  const pm10 = (fc.pm10!=null) ? `PM10 ${Math.round(fc.pm10)}µg/m³` : '';
  const pmText = [pm25, pm10].filter(Boolean).join(', ');

  // 날씨(아이콘/desc에서 추출)
  const wx = fc.desc || fc.weather || '';
  const tmin = (fc.tmin!=null) ? `${Math.round(fc.tmin)}°` : null;
  const tmax = (fc.tmax!=null) ? `${Math.round(fc.tmax)}°` : null;
  const tempText = (tmin || tmax) ? `기온 ${tmin ?? '—'} / ${tmax ?? '—'}` : '';

  // 원인/태그
  const cause = fc.cause || fc.informCause || fc.reason || '';
  const tags = Array.isArray(fc.tags) ? fc.tags
            : (typeof fc.tags === 'string'
               ? fc.tags.split(/[,、]/).map(s=>s.trim()).filter(Boolean)
               : []);
  const tagText = tags.slice(0, 2).join(', '); // 너무 길면 2개만

  // 위치표시(옵션)
  const where = opts.address
    ? opts.address
    : (opts.lat && opts.lon ? `(${Number(opts.lat).toFixed(3)}, ${Number(opts.lon).toFixed(3)})` : '');

  // 권고 문구(간단 규칙)
  let advice = '';
  const lower = String(level).toLowerCase();
  if (/(매우)?나쁨|poor|bad|unhealthy/.test(lower)) {
    advice = '마스크 착용 및 실내 활동 권장';
  } else if (/보통|moderate|normal/.test(lower)) {
    advice = '야외 활동은 가능하나 민감군은 주의';
  } else if (/좋음|good|clean/.test(lower)) {
    advice = '야외 활동에 무리 없음';
  }

  // 조립
  const bits = [
    where && `${where} · ${day}`,
    levelText + (pmText ? `(${pmText})` : ''),
    wx && `날씨 ${wx}` || '',
    tempText,
    cause && `원인: ${cause}`,
    tagText && `태그: ${tagText}`,
    advice
  ].filter(Boolean);

  return bits.join(' · ');
}
