// web/js/apiClient.js
export const API_BASE = "/api";

export async function fetchNearestAir(lat, lon) {
  const url = `${API_BASE}/nearest?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const raw = await r.json();

  return {
    pm10: raw.pm10 ?? null,
    pm25: raw.pm25 ?? null,
    pm10_24h: raw.pm10_24h ?? null,
    pm25_24h: raw.pm25_24h ?? null,
    cai_grade: raw.cai_grade ?? null,
    cai_value: raw.cai_value ?? null,
    display_ts: raw.display_ts ?? null,

    // 🔽🔽🔽 추가 (없으면 null로 채워서 렌더러가 스킵하게)
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
}
