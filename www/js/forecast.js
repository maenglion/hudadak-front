// js/forecast.js
// 예보 렌더링 & 5종 소스 뱃지 전용 모듈

// 1) 소스 → 아이콘 매핑 (네 폴더명 기준)
const FORECAST_SOURCE_ICONS = {
  observed: "./assets/forecast-badges-observed.svg",
  model:    "./assets/forecast-badges-model.svg",
  interp:   "./assets/forecast-badges-interp.svg",
  fail:     "./assets/forecast-badges-fail.svg",
  ai:       "./assets/forecast-badges-ai.svg",
};

// fallback
const DEFAULT_SOURCE_ICON = "./assets/forecast-badges-ai.svg";

// 2) 소스 종류 감지
function detectSourceKind(fc = {}) {
  // 1순위: 백엔드가 명시해준 필드
  if (fc.source_kind) return String(fc.source_kind).toLowerCase();
  if (fc.badge)       return String(fc.badge).toLowerCase();

  // 2순위: name / source / provider 등에서 추론
  const raw =
    fc.source ||
    fc.provider ||
    fc.kind ||
    fc.src ||
    "";

  const lower = String(raw).toLowerCase();

  if (lower.includes("observed") || lower.includes("station")) return "observed";
  if (lower.includes("model"))                                 return "model";
  if (lower.includes("interp"))                                return "interp";
  if (lower.includes("fail") || lower.includes("error"))       return "fail";
  if (lower.includes("ai"))                                    return "ai";

  // 3순위: tags 안에 있을 때
  if (Array.isArray(fc.tags)) {
    const tags = fc.tags.map(t => String(t).toLowerCase());
    if (tags.includes("observed")) return "observed";
    if (tags.includes("model"))    return "model";
    if (tags.includes("interp"))   return "interp";
    if (tags.includes("fail"))     return "fail";
    if (tags.includes("ai"))       return "ai";
  }

  return null;
}

// 3) 특정 DOM에 <img> 뱃지 꽂기
function applyBadgeIconToSelectors(iconSrc, altText, selectors = []) {
  selectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;

    // selector가 바로 <img>일 수도 있음
    if (el.tagName && el.tagName.toLowerCase() === "img") {
      el.src = iconSrc;
      el.alt = altText;
      return;
    }

    // 네가 쓰는 클래스들
    const badge1 = el.querySelector(".forecast-badges");
    const badge2 = el.querySelector(".gas-item-badge");

    if (badge1) {
      badge1.src = iconSrc;
      badge1.alt = altText;
    }
    if (badge2) {
      badge2.src = iconSrc;
      badge2.alt = altText;
    }
  });
}

// 4) 실제 렌더링
//  - 이건 "상단 forecast 섹션"용으로만 생각해서 만들었어
//  - 공기질 수준 뱃지는 안 넣음
export function renderForecast(fc = {}, opts = {}) {
  const forecastSectionEl = document.getElementById("forecast-section");
  const forecastRegionEl  = document.getElementById("forecast-region");
  const forecastCauseEl   = document.getElementById("forecastCause");
  const whyTagsEl         = document.getElementById("whyTags");

  // 화면에 해당 섹션이 없으면 그냥 리턴
  if (!forecastSectionEl) return;

  // 위치 / 지평선
  if (forecastRegionEl) {
    const horizon = fc.horizon ? ` · ${fc.horizon}` : "";
    if (opts.address) {
      forecastRegionEl.textContent = `${opts.address}${horizon}`;
    } else if (opts.lat && opts.lon) {
      forecastRegionEl.textContent =
        `(${Number(opts.lat).toFixed(3)}, ${Number(opts.lon).toFixed(3)})${horizon}`;
    } else {
      forecastRegionEl.textContent = horizon ? horizon.slice(3) : "";
    }
  }

  // 원인문
  if (forecastCauseEl) {
    const cause = fc.cause ?? fc.informCause ?? fc.reason ?? "";
    forecastCauseEl.textContent = cause;
  }

  // 5종 소스 → 아이콘
  const sourceKind = detectSourceKind(fc) || "ai";
  const iconSrc    = FORECAST_SOURCE_ICONS[sourceKind] || DEFAULT_SOURCE_ICON;
  const altText    = sourceKind;

  // 이 아이콘을 공통 위치에 꽂아준다
  applyBadgeIconToSelectors(iconSrc, altText, [
    ".components-pm10",
    ".components-pm25",
    "#gas-so2",
    "#gas-co",
    "#gas-o3",
    "#gas-no2",
  ]);

  // 하단 태그는 소스만 간단히 보여주자
  if (whyTagsEl) {
    whyTagsEl.innerHTML = "";
    const tag = document.createElement("span");
    tag.className = "badge badge-src-" + sourceKind; // CSS에서 공통 스타일 주면 됨
    tag.textContent = sourceKind.toUpperCase();
    whyTagsEl.appendChild(tag);
  }

  // 섹션 보이게
  forecastSectionEl.style.display = "block";
}

// 5) 간단 예보 문장 (공기질 레벨 뱃지 X)
export function composeForecastLine(fc = {}, opts = {}) {
  const where = opts.address
    ? opts.address
    : (opts.lat && opts.lon
        ? `(${Number(opts.lat).toFixed(3)}, ${Number(opts.lon).toFixed(3)})`
        : "");

  const src = detectSourceKind(fc) || "ai";
  const pm25 = fc.pm25 != null ? `PM2.5 ${Math.round(fc.pm25)}µg/m³` : "";
  const pm10 = fc.pm10 != null ? `PM10 ${Math.round(fc.pm10)}µg/m³` : "";
  const pmText = [pm25, pm10].filter(Boolean).join(", ");

  const parts = [
    where,
    `소스: ${src.toUpperCase()}`,
    pmText,
  ].filter(Boolean);

  return parts.join(" · ");
}
