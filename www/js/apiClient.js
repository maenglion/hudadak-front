// web/js/apiClient.js
// 임시로 Cloud Run 직접 호출
export const API_BASE = "https://air-api-350359872967.asia-northeast3.run.app";

// Netlify 프록시를 쓸 거면 위 줄 대신 ↓ 사용:
// export const API_BASE = "/api";

export async function fetchNearestAir(lat, lon) {
  const url = `${API_BASE}/nearest?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const raw = await r.json();

  // 서버 응답(provider/name/...) → 프런트 표준 스키마로 맵핑
  return {
    pm10: raw.pm10 ?? null,
    pm25: raw.pm25 ?? null,
    pm10_24h: raw.pm10_24h ?? null,
    pm25_24h: raw.pm25_24h ?? null,
    cai_grade: raw.cai_grade ?? null,
    cai_value: raw.cai_value ?? null,
    display_ts: raw.display_ts ?? null,

    // 🔽 linear 막대용 가스 4종 — 이 줄들이 꼭 필요!
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

