// /js/apiClient.js
export const API_BASE = '/backend';

export async function fetchNearestAir(lat, lon) {
  const url = `${API_BASE}/air/nearest?lat=${lat}&lon=${lon}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`API fetch error: ${response.status}`);
  }
const raw = await response.json();

const data = {
    pm10: raw.pm10 ?? null,
    pm25: raw.pm25 ?? null,
    pm10_24h: raw.pm10_24h ?? null,
    pm25_24h: raw.pm25_24h ?? null,
    cai_grade: raw.cai_grade ?? null,
    cai_value: raw.cai_value ?? null,
    display_ts: raw.display_ts ?? null,
    o3: raw.o3 ?? null,
    no2: raw.no2 ?? null,
    so2: raw.so2 ?? null,
    co: raw.co ?? null,
    station: {
      name: raw.station?.name || raw.name || null,
      provider: raw.station?.provider || raw.provider || null,
      kind: raw.station?.kind || raw.source_kind || 'unknown',
      lat: raw.station?.lat ?? raw.lat ?? null,
      lon: raw.station?.lon ?? raw.lon ?? null,
    },
  };

  // 가스 4종 전부 비어 있으면 Open-Meteo API로 보강
  if (data.o3 == null && data.no2 == null && data.so2 == null && data.co == null) {
    try {
      const u =
        `https://air-quality-api.open-meteo.com/v1/air-quality` +
        `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
        `&hourly=ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide&timezone=Asia%2FSeoul`;
      const r2 = await fetch(u, { cache: 'no-store' });
      if (r2.ok) {
        const j = await r2.json();
        const i = (j.hourly?.time?.length || 1) - 1;
        data.o3 = j.hourly?.ozone?.[i] ?? null;
        data.no2 = j.hourly?.nitrogen_dioxide?.[i] ?? null;
        data.so2 = j.hourly?.sulphur_dioxide?.[i] ?? null;
        data.co = j.hourly?.carbon_monoxide?.[i] ?? null;
      }
    } catch {
      // 보강 실패 시 조용히 넘어감
    }
  }

  // 최종적으로 가공된 데이터를 반환
  return data;

} // ✅ 수정 3: 함수의 닫는 괄호 '}'가 올바른 위치로 이동했습니다.
