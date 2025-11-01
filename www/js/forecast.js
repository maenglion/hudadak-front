// js/forecast.js
// 예보 렌더링 & 뱃지 매핑 모듈 (ESM)

// 1. 아이콘 매핑 -------------------------------------------
const FORECAST_BADGE_ICONS = {
  observed: "images/forecast-badges-observed.svg",
  model:    "images/forecast-badges-model.svg",
  interp:   "images/forecast-badges-interp.svg",
  fail:     "images/forecast-badges-fail.svg",
  ai:       "images/forecast-badges-ai.svg",
};

// 기본 아이콘 (네가 HTML에 깔아둔 gas-badge로도 써도 됨)
const DEFAULT_BADGE_ICON = "images/gas-badge.svg";

// 2. 소스 종류 감지 -----------------------------------------
function detectSourceKind(fc = {}) {
  // 서버가 바로 주는 케이스
  if (fc.badge) return String(fc.badge).toLowerCase();
  if (fc.source_kind) return String(fc.source_kind).toLowerCase();

  // source / provider / kind 등으로 추정
  const cand = fc.source || fc.provider || fc.kind || fc.src || "";
  const lower = String(cand).toLowerCase();

  if (lower.includes("observed") || lower.includes("station")) return "observed";
  if (lower.includes("model")) return "model";
  if (lower.includes("interp")) return "interp";
  if (lower.includes("fail") || lower.includes("error")) return "fail";
  if (lower.includes("ai")) return "ai";

  // tags 안에 심어둔 경우
  if (Array.isArray(fc.tags)) {
    const ts = fc.tags.map(t => String(t).toLowerCase());
    if (ts.includes("observed")) return "observed";
    if (ts.includes("model"))    return "model";
    if (ts.includes("interp"))   return "interp";
    if (ts.includes("fail"))     return "fail";
    if (ts.includes("ai"))       return "ai";
  }

  return null;
}

// 3. 여러 섹션에 <img ...> 뱃지 꽂는 헬퍼 --------------------
function applyBadgeIconToSelectors(iconSrc, altText, selectors = []) {
  selectors.forEach(sel => {
    // sel이 컨테이너일 수도 있고 바로 img일 수도 있음
    const el = document.querySelector(sel);
    if (!el) return;

    // 컨테이너 안에 img.gas-item-badge 나 .forecast-badges 가 있는 구조
    if (el.tagName && el.tagName.toLowerCase() === "img") {
      el.src = iconSrc;
      el.alt = altText;
    } else {
      const img1 = el.querySelector(".forecast-badges");
      const img2 = el.querySelector(".gas-item-badge");
      if (img1) { img1.src = iconSrc; img1.alt = altText; }
      if (img2) { img2.src = iconSrc; img2.alt = altText; }
    }
  });
}

// 4. 뱃지용 클래스 매핑 -------------------------------------
// A. 공기질/수준 뱃지
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

// B. 예보 소스 뱃지
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

// C. 날씨 상태 뱃지
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
  // 우선순위: 예보소스 > 날씨상태 > 대기질
  const src = forecastSourceBadgeClass(name);
  if (src) return src;
  const wx  = weatherBadgeClass(name);
  if (wx) return wx;
  const aq  = aqBadgeClass(name);
  if (aq) return aq;
  return "badge";
}

// 5. 실제 렌더링 --------------------------------------------
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

  // 위치/지평선
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

  if (forecastCauseEl) {
    forecastCauseEl.textContent = cause || "";
  }

  // 🔹 뱃지 아이콘용 데이터 정리
  const sourceKind = detectSourceKind(fc);
  const iconSrc = sourceKind
    ? (FORECAST_BADGE_ICONS[sourceKind] || DEFAULT_BADGE_ICON)
    : DEFAULT_BADGE_ICON;
  const altText = sourceKind || "대기질 소스";

  // 🔹 이 아이콘을 넣어줄 섹션들 한 번에
  applyBadgeIconToSelectors(iconSrc, altText, [
    // 위/아래 게이지
    ".components-pm10",
    ".components-pm25",
    // 아래쪽 가스 블록이 네가 준 구조
    ".gas-info-list .gas-info-item:nth-child(1)", // SO2
    ".gas-info-list .gas-info-item:nth-child(2)", // CO
    ".gas-info-list .gas-info-item:nth-child(3)", // O3 자리에 쓰면 됨
    ".gas-info-list .gas-info-item:nth-child(4)", // NO2 자리에 쓰면 됨
  ]);

  // 🔹 화면 하단 태그(span) 렌더
  whyTagsEl.innerHTML = "";
  const list = [];

  // 소스(텍스트)도 목록에 넣을 수 있게
  const sourceText = fc.source || fc.provider || fc.kind || fc.src || sourceKind || "";
  if (sourceText) list.push(sourceText);

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

// 6. 예보 문장 생성 -----------------------------------------
export function composeForecastLine(fc = {}, opts = {}) {
  // 날짜/범위
  const day = fc.date
    ? new Date(fc.date).toLocaleDateString("ko-KR", { weekday: "long" })
    : (fc.horizon || "오늘");

  // 공기질 레벨
  const level = fc.level || fc.grade || fc.cai_grade || "";
  const levelText = level ? `공기질은 '${level}' 수준` : "공기질 지표는 제한적";

  // PM
  const pm25 = (fc.pm25 != null) ? `PM2.5 ${Math.round(fc.pm25)}µg/m³` : "";
  const pm10 = (fc.pm10 != null) ? `PM10 ${Math.round(fc.pm10)}µg/m³` : "";
  const pmText = [pm25, pm10].filter(Boolean).join(", ");

  // 날씨
  const wx = fc.desc || fc.weather || "";
  const tmin = (fc.tmin != null) ? `${Math.round(fc.tmin)}°` : null;
  const tmax = (fc.tmax != null) ? `${Math.round(fc.tmax)}°` : null;
  const tempText = (tmin || tmax) ? `기온 ${tmin ?? "—"} / ${tmax ?? "—"}` : "";

  // 원인/태그
  const cause = fc.cause || fc.informCause || fc.reason || "";
  const tags = Array.isArray(fc.tags)
    ? fc.tags
    : (typeof fc.tags === "string"
        ? fc.tags.split(/[,、]/).map(s => s.trim()).filter(Boolean)
        : []);
  const tagText = tags.slice(0, 2).join(", ");

  // 위치
  const where = opts.address
    ? opts.address
    : (opts.lat && opts.lon
        ? `(${Number(opts.lat).toFixed(3)}, ${Number(opts.lon).toFixed(3)})`
        : "");

  // 소스 (문장용)
  const src = fc.source || fc.provider || fc.kind || fc.src || "";

  // 권고
  let advice = "";
  const lower = String(level).toLowerCase();
  if (/(매우)?나쁨|poor|bad|unhealthy/.test(lower)) {
    advice = "마스크 착용 및 실내 활동 권장";
  } else if (/보통|moderate|normal/.test(lower)) {
    advice = "야외 활동은 가능하나 민감군은 주의";
  } else if (/좋음|good|clean/.test(lower)) {
    advice = "야외 활동에 무리 없음";
  }

  const bits = [
    where && `${where} · ${day}`,
    src && `소스: ${src}`,
    levelText + (pmText ? `(${pmText})` : ""),
    wx && `날씨 ${wx}` || "",
    tempText,
    cause && `원인: ${cause}`,
    tagText && `태그: ${tagText}`,
    advice,
  ].filter(Boolean);

  return bits.join(" · ");
}
