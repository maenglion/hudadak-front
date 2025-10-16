// web/js/apiClient.js
export const API_BASE = "/api";;
// Netlify 프록시를 쓸 거면 위 줄 대신 ↓ 사용:
// export const API_BASE = "/api";

export async function fetchNearestAir(lat, lon) {
  const url = `${API_BASE}/nearest?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const raw = await r.json();

  // 서버 응답(provider/name/...) → 프런트 표준 스키마로 맵핑
  return {
    pm10: raw.pm10,
    pm25: raw.pm25,
    pm10_24h: raw.pm10_24h ?? null,
    pm25_24h: raw.pm25_24h ?? null,
    cai_grade: raw.cai_grade ?? null,
    cai_value: raw.cai_value ?? null,
    display_ts: raw.display_ts,
    station: {
      name: raw.name,
      provider: raw.provider,
      kind: raw.source_kind || 'unknown',
      lat: raw.lat ?? null,
      lon: raw.lon ?? null,
    },
  };
}

