// js/forecast.js
// 예보 렌더링 & 뱃지 매핑 모듈 (ESM)

// A. 공기질/수준 뱃지 (기존 것 살려둠)
function aqBadgeClass(name = "") {
  const n = String(name || "").toLowerCase();
  if (/(매우)?나쁨|poor|bad|unhealthy/.test(n)) return "badge badge-bad";
  if (/보통|moderate|normal/.test(n))           return "badge badge-mid";
  if (/좋음|good|clean/.test(n))                 return "badge badge-good";
  if (/황사|smog|dust/.test(n))                  return "badge badge-dust";
  if (/국외|유입|transbound/.test(n))            return "badge badge-flow";
  if (/대기정체|정체|stagnation/.test(n))        return "badge badge-stagn";
  return "";
}

// B. 예보 소스 뱃지 (피그마: ai / observed / model / interp / fail)
function forecastSourceBadgeClass(name = "") {
  const n = String(name || "").toLowerCase();
  switch (n) {
    case "ai":
      return "badge badge-src-ai";
    case "observed":
      return "badge badge-src-observed";
    case "model":
      return "badge badge-src-model";
    case "interp":
    case "interpolated":
      return "badge badge-src-interp";
    case "fail":
    case "error":
      return "badge badge-src-fail";
    default:
      return "";
  }
}

// C. 날씨 상태 뱃지 (피그마: cloudy, sun, rain, snow, fog, shower, storm, sun-cloud, temperature-diff, humidity, uv-index, wind)
function weatherBadgeClass(name = "") {
  const n = String(name || "").toLowerCase();
  switch (n) {
    case "cloudy":
      return "badge badge-wx-cloudy";
    case "sun":
    case "clear":
      return "badge badge-wx-sun";
    case "sun-cloud":
    case "partly-cloudy":
      return "badge badge-wx-suncloud";
    case "rain":
      return "badge badge-wx-rain";
    case "shower":
      return "badge badge-wx-shower";
    case "storm":
    case "thunder":
      return "badge badge-wx-storm";
    case "snow":
      return "badge badge-wx-snow";
    case "fog":
      return "badge badge-wx-fog";
    case "temperature-diff":
      return "badge badge-wx-tempdiff";
    case "humidity":
      return "badge badge-wx-humidity";
    case "uv-index":
    case "uv":
      return "badge badge-wx-uv";
    case "wind":
      return "badge badge-wx-wind";
    default:
      return "";
  }
}

// 공통: 어떤 이름이 왔는지 보고 위 3개 중 하나라도 매칭되면 그걸 쓰는 헬퍼
export function badgeClassByName(name = "") {
  // 우선순위는: 예보소스 > 날씨상태 > 대기질
  const src = forecastSourceBadgeClass(name);
  if (src) return src;
  const wx = weatherBadgeClass(name);
  if (wx) return wx;
  const aq = aqBadgeClass(name);
  if (aq) return aq;
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
  const tagsArr = Array.isArray(fc.tags)
    ? fc.tags
    : (typeof fc.tags === "string"
        ? fc.tags.split(/[,、]/).map(s => s.trim()).filter(Boolean)
        : []);

  // 🔹 새 필드: 예보 소스가 따로 올 수도 있으니 잡아줌
  const source  = fc.source || fc.provider || fc.kind || fc.src || "";

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

  // 화면에 뿌릴 목록 만들기
  const list = [];

  // 1) 예보 소스 먼저 (ai / observed / model / interp / fail)
  if (source) list.push(source);

  // 2) 대기질 수준 (좋음/보통/나쁨…)
  if (level) list.push(level);

  // 3) 서버가 내려준 태그들
  tagsArr.forEach(t => list.push(t));

  // 4) 최대 6개만
  list.slice(0, 6).forEach(text => {
    const b = document.createElement("span");
    b.className = badgeClassByName(text);
    b.textContent = text;
    whyTagsEl.appendChild(b);
  });

  forecastSectionEl.style.display = list.length ? "block" : "none";
}

// 예보 문장 생성 (KO) — 아래는 그대로 두고 필요하면 source만 한 줄 넣어도 됨
export function composeForecastLine(fc = {}, opts = {}) {
  const day = fc.date
    ? new Date(fc.date).toLocaleDateString('ko-KR', { weekday: 'long' })
    : (fc.horizon || '오늘');

  const level = fc.level || fc.grade || fc.cai_grade || '';
  const levelText = level ? `공기질은 '${level}' 수준` : '공기질 지표는 제한적';

  const pm25 = (fc.pm25!=null) ? `PM2.5 ${Math.round(fc.pm25)}µg/m³` : '';
  const pm10 = (fc.pm10!=null) ? `PM10 ${Math.round(fc.pm10)}µg/m³` : '';
  const pmText = [pm25, pm10].filter(Boolean).join(', ');

  const wx = fc.desc || fc.weather || '';
  const tmin = (fc.tmin!=null) ? `${Math.round(fc.tmin)}°` : null;
  const tmax = (fc.tmax!=null) ? `${Math.round(fc.tmax)}°` : null;
  const tempText = (tmin || tmax) ? `기온 ${tmin ?? '—'} / ${tmax ?? '—'}` : '';

  const cause = fc.cause || fc.informCause || fc.reason || '';
  const tags = Array.isArray(fc.tags)
    ? fc.tags
    : (typeof fc.tags === 'string'
        ? fc.tags.split(/[,、]/).map(s=>s.trim()).filter(Boolean)
        : []);
  const tagText = tags.slice(0, 2).join(', ');

  const where = opts.address
    ? opts.address
    : (opts.lat && opts.lon ? `(${Number(opts.lat).toFixed(3)}, ${Number(opts.lon).toFixed(3)})` : '');

  let advice = '';
  const lower = String(level).toLowerCase();
  if (/(매우)?나쁨|poor|bad|unhealthy/.test(lower)) {
    advice = '마스크 착용 및 실내 활동 권장';
  } else if (/보통|moderate|normal/.test(lower)) {
    advice = '야외 활동은 가능하나 민감군은 주의';
  } else if (/좋음|good|clean/.test(lower)) {
    advice = '야외 활동에 무리 없음';
  }

  // 예보 소스도 있으면 문장에 살짝 끼워넣기
  const src = fc.source || fc.provider || fc.kind || '';

  const bits = [
    where && `${where} · ${day}`,
    src && `소스: ${src}`,
    levelText + (pmText ? `(${pmText})` : ''),
    wx && `날씨 ${wx}` || '',
    tempText,
    cause && `원인: ${cause}`,
    tagText && `태그: ${tagText}`,
    advice
  ].filter(Boolean);

  return bits.join(' · ');
}
