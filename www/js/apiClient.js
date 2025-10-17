// /js/apiClient.js
export const API_BASE = "/api";

export async function fetchNearestAir(lat, lon) {
  const url = `${API_BASE}/nearest?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  const raw = await r.json();

  // 1) 서버 응답을 프런트 표준 스키마로 정규화
  const data = {
    pm10: raw.pm10 ?? null,
    pm25: raw.pm25 ?? null,
    pm10_24h: raw.pm10_24h ?? null,
    pm25_24h: raw.pm25_24h ?? null,
    cai_grade: raw.cai_grade ?? null,
    cai_value: raw.cai_value ?? null,
    display_ts: raw.display_ts ?? null,
    o3:  raw.o3  ?? null,
    no2: raw.no2 ?? null,
    so2: raw.so2 ?? null,
    co:  raw.co  ?? null,
    station: {
      name:     raw.station?.name     || raw.name     || null,
      provider: raw.station?.provider || raw.provider || null,
      kind:     raw.station?.kind     || raw.source_kind || 'unknown',
      lat:      raw.station?.lat ?? raw.lat ?? null,
      lon:      raw.station?.lon ?? raw.lon ?? null,
    },
  };

  // 2) 가스 4종(o3/no2/so2/co)이 전부 비어 있으면 Open-Meteo로 보강
  if ([data.o3, data.no2, data.so2, data.co].every(v => v == null)) {
    try {
      const om = `https://air-quality-api.open-meteo.com/v1/air-quality` +
                 `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
                 `&hourly=ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide` +
                 `&timezone=Asia%2FSeoul`;
      const r2 = await fetch(om, { cache: 'no-store' });
      if (r2.ok) {
        const j = await r2.json();
        const i = (j.hourly?.time?.length || 1) - 1;
        data.o3  ??= j.hourly?.ozone?.[i]               ?? null;
        data.no2 ??= j.hourly?.nitrogen_dioxide?.[i]    ?? null;
        data.so2 ??= j.hourly?.sulphur_dioxide?.[i]     ?? null;
        data.co  ??= j.hourly?.carbon_monoxide?.[i]     ?? null;
      }
    } catch { /* 조용히 폴백 실패 무시 */ }
  }

  // 3) 최종 반환
  return data;
}
