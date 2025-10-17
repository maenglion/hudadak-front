// /js/apiClient.js  (배포되는 그 위치의 파일을 교체할 것!)
export const API_BASE = "/backend";
console.log("[apiClient] loaded:", import.meta.url, "API_BASE=", API_BASE);

export async function fetchNearestAir(lat, lon){
  const url = `${API_BASE}/nearest?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const raw = await r.json();

  // 서버 → 프론트 표준 매핑
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
  };

  // 가스 4종이 전부 없으면 Open-Meteo 폴백
  if (data.o3==null && data.no2==null && data.so2==null && data.co==null) {
    try {
      const u = `https://air-quality-api.open-meteo.com/v1/air-quality`+
                `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}`+
                `&hourly=ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide&timezone=Asia%2FSeoul`;
      const r2 = await fetch(u, { cache:'no-store' });
      if (r2.ok){
        const j = await r2.json();
        const i = (j.hourly?.time?.length || 1) - 1;
        data.o3  = j.hourly?.ozone?.[i] ?? null;
        data.no2 = j.hourly?.nitrogen_dioxide?.[i] ?? null;
        data.so2 = j.hourly?.sulphur_dioxide?.[i] ?? null;
        data.co  = j.hourly?.carbon_monoxide?.[i] ?? null;
      }
    } catch {}
  }

  return data;
}
