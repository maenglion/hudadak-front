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