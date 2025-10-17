// /js/apiClient.js
export const API_BASE = "/backend"; // 지금 프록시를 /backend로 쓰고 있다면 이렇게. (/api로 통일시엔 /api)

export async function fetchNearestAir(lat, lon) {
  const url = `${API_BASE}/nearest?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const raw = await r.json();

  // 1) 서버 응답 → 프론트 표준 스키마
  const data = {
    pm10: raw.pm10 ?? null,
    pm25: raw.pm25 ?? null,
    pm10_24h: raw.pm10_24h ?? null,
    pm25_24h: raw.pm25_24h ?? null,
    cai_grade: raw.cai_grade ?? null,
    cai_value: raw.cai_value ?? null,
    display_ts: raw.display_ts ?? null,

    o3 : raw.o3  ?? null,
    no2: raw.no2 ?? null,
    so2: raw.so2 ?? null,
    co : raw.co  ?? null,

    station: {
      name: raw.station?.name || raw.name || null,
      provider: raw.station?.provider || raw.provider || null,
      kind: raw.station?.kind || raw.source_kind || 'unknown',
      lat: raw.station?.lat ?? raw.lat ?? null,
      lon: raw.station?.lon ?? raw.lon ?? null,
    },

    // 단위 저장(있으면 프런트에서 표시용으로 사용)
    units: {
      pm10: raw.unit_pm10 || 'µg/m³',
      pm25: raw.unit_pm25 || 'µg/m³',
      o3:   raw.unit_o3   || null,
      no2:  raw.unit_no2  || null,
      so2:  raw.unit_so2  || null,
      co:   raw.unit_co   || null,
    },
  };

  // 2) 가스 4종이 비어 있으면 Open-Meteo Air-Quality로 폴백 보강
  const allMissing = (data.o3==null && data.no2==null && data.so2==null && data.co==null);
  if (allMissing) {
    try {
      const g = await fetchOpenMeteoGases(lat, lon);
      Object.assign(data, g.values);
      data.units = { ...data.units, ...g.units };
    } catch {}
  }

  return data;
}

// --- Open-Meteo 가스 폴백 ---
async function fetchOpenMeteoGases(lat, lon) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality` +
              `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
              `&hourly=ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide&timezone=Asia%2FSeoul`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`openmeteo ${r.status}`);
  const j = await r.json();
  const t = j?.hourly?.time || [];
  const pick = (arr) => (Array.isArray(arr) && arr.length) ? arr[arr.length-1] : null;

  const idx = t.length - 1;
  const values = {
    o3:  j?.hourly?.ozone?.[idx] ?? null,               // μg/m³
    no2: j?.hourly?.nitrogen_dioxide?.[idx] ?? null,    // μg/m³
    so2: j?.hourly?.sulphur_dioxide?.[idx] ?? null,     // μg/m³
    co:  j?.hourly?.carbon_monoxide?.[idx] ?? null,     // μg/m³
  };
  const units = {
    o3:  'µg/m³',
    no2: 'µg/m³',
    so2: 'µg/m³',
    co:  'µg/m³',
  };
  return { values, units };
}
