console.log("app.js 로드 및 실행! (v4 DB 연동)");

const HudadakSourceUtils = (() => {
  function toNum(x) {
    const n = Number(x);
    return (x != null && x !== '-' && x !== '--' && Number.isFinite(n)) ? n : null;
  }

  function normalizeResponse(data) {
    const legacyMeta = {
      provider: data.provider || null,
      station: data.name || data.station?.name || null,
      station_id: data.station_id ?? null,
      display_ts: data.display_ts || null,
      source_kind: data.source_kind || data.source || 'unknown',
      lat: data.lat ?? null,
      lon: data.lon ?? null,
      distance_m: data.distance_m ?? null,
    };
    return {
      station:    data.name || data.station?.name || '정보 없음',
      provider:   data.provider || null,
      sourceKind: data.source_kind || data.source || 'unknown',
      displayTs:  data.display_ts || null,
      pm10: toNum(data.pm10),
      pm25: toNum(data.pm25),
      pm10Meta: data.pm10_meta || (
        toNum(data.pm10) !== null ? { ...legacyMeta, unit: data.unit_pm10 } : null
      ),
      pm25Meta: data.pm25_meta || (
        toNum(data.pm25) !== null ? { ...legacyMeta, unit: data.unit_pm25 } : null
      ),
      so2:  toNum(data.so2),
      co:   toNum(data.co),
      o3:   toNum(data.o3),
      no2:  toNum(data.no2),
      gasProvider: data.gas_provider || null,
      gasSourceKind: data.gas_source_kind || null,
      gasDisplayTs: data.gas_display_ts || null,
      gasStation: data.gas_station || null,
      gasMeta: data.gas_meta || null,
      unitPm10:  data.unit_pm10 || 'µg/m³',
      unitPm25:  data.unit_pm25 || 'µg/m³',
      caiGrade:  data.cai_grade || null,
      badges:    data.badges || [],
      distanceM: data.distance_m || null,
    };
  }

  function hasPmData(airData) {
    return Boolean(
      airData &&
      (airData.pm10 !== null || airData.pm25 !== null)
    );
  }

  function providerName(provider) {
    const value = String(provider || '').trim();
    switch (value.toUpperCase()) {
      case 'WAQI': return 'WAQI';
      case 'AIRKOREA': return 'AirKorea';
      case 'OPENMETEO':
      case 'OPEN-METEO': return 'Open-Meteo';
      case 'OWM':
      case 'OPENWEATHER':
      case 'OPENWEATHERMAP': return 'OpenWeather';
      default: return value;
    }
  }

  function stationDisplayName(station) {
    const raw = String(station || '').trim();
    if (!raw) return '';
    const koreanAliases = [...raw.matchAll(/\(([^()]*)\)/g)]
      .map(match => match[1].trim())
      .filter(alias => /[가-힣]/.test(alias));
    const alias = koreanAliases.at(-1);
    if (!alias) return raw;
    const parts = alias.split(/\s+/).filter(Boolean);
    return parts.length > 1
      ? `${parts[0]}(${parts.slice(1).join(' ')})`
      : parts[0];
  }

  function gasProviders(airData) {
    if (!airData) return [];
    const keys = ['so2', 'co', 'o3', 'no2'];
    const fromMeta = keys
      .filter(key => airData[key] !== null && airData[key] !== undefined)
      .map(key => airData.gasMeta?.[key]?.provider)
      .filter(Boolean);
    const raw = fromMeta.length
      ? fromMeta
      : String(airData.gasProvider || '').split('+').filter(Boolean);
    return [...new Set(raw.map(providerName).filter(Boolean))];
  }

  function gasSummaryLabel(airData) {
    const providers = gasProviders(airData);
    const kinds = [...new Set(
      ['so2', 'co', 'o3', 'no2']
        .filter(key => airData?.[key] !== null && airData?.[key] !== undefined)
        .map(key => airData.gasMeta?.[key]?.source_kind)
        .filter(Boolean)
    )];
    if (providers.length === 1 && kinds.length === 1) {
      return kinds[0] === 'model'
        ? `모델(${providers[0]})`
        : `인근 참고값(${providers[0]})`;
    }
    if (providers.length > 1 || kinds.length > 1) return '출처 혼합';
    return '';
  }

  function parseGasTimestamp(displayTs) {
    if (!displayTs) return null;
    const value = String(displayTs).trim();
    const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
    const parsed = new Date(hasZone ? value : `${value}+09:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function gasAgeText(displayTs, now = Date.now()) {
    const timestamp = parseGasTimestamp(displayTs);
    const nowMs = now instanceof Date ? now.getTime() : Number(now);
    if (!timestamp || !Number.isFinite(nowMs)) return '';
    const elapsedMs = nowMs - timestamp.getTime();
    if (elapsedMs < 0) return '';
    const hours = Math.floor(elapsedMs / (60 * 60 * 1000));
    return hours < 1 ? '1시간 미만' : `${hours}시간 전`;
  }

  function gasItemSourceText(meta, now = Date.now()) {
    if (!meta?.provider) return '';
    const provider = providerName(meta.provider);
    if (meta.source_kind === 'model') {
      return `${provider} · 현재 위치 모델값`;
    }
    const age = gasAgeText(meta.display_ts, now);
    return [
      provider,
      '인근 참고값',
      age,
    ].filter(Boolean).join(' · ');
  }

  function dataSourceText(airData) {
    if (!airData) return '데이터 출처 확인 불가';
    const fallbackMeta = airData.provider ? {
      provider: airData.provider,
      source_kind: airData.sourceKind,
    } : null;
    const pmMetas = [
      airData.pm10Meta || fallbackMeta,
      airData.pm25Meta || fallbackMeta,
    ];
    const labels = pmMetas.map(meta => meta?.provider ? (
      `${meta.source_kind === 'model' ? '예측' : '실측'}: ${providerName(meta.provider)}`
    ) : null);
    const uniqueLabels = [...new Set(labels.filter(Boolean))];
    if (!uniqueLabels.length) return '데이터 출처 확인 불가';
    const gasSummary = gasSummaryLabel(airData);
    const pmText = uniqueLabels.length === 1
      ? `미세먼지 ${uniqueLabels[0]}`
      : `미세먼지 PM10 ${labels[0] || '확인 불가'} · PM2.5 ${labels[1] || '확인 불가'}`;
    return gasSummary
      ? `${pmText} · 기타 공기지표: ${gasSummary}`
      : pmText;
  }

  function pmStationText(station, provider, sourceKind) {
    const displayProvider = providerName(provider);
    if (sourceKind === 'model') {
      return `${displayProvider || 'Open-Meteo'} · 현재 위치 모델값`;
    }
    const stationName = stationDisplayName(station);
    const sourceLabel = `${
      displayProvider ? `${displayProvider} · ` : ''
    }인근 측정소 실측`;
    return stationName ? `${sourceLabel} (${stationName})` : sourceLabel;
  }

  function shouldSyncWidget(mode, succeeded = true) {
    return succeeded && mode === 'current';
  }

  function normalizeRegionScope(scope) {
    const regionLevel = scope?.regionLevel || scope?.region_level;
    const regionCode = String(
      scope?.regionCode || scope?.region_code || ''
    ).trim();
    const regionName = String(
      scope?.regionName ||
      scope?.region_name ||
      scope?.normalized_region_name ||
      ''
    ).trim();
    const expectedLength = regionLevel === 'sido' ? 2 : 5;
    if (
      !['sido', 'sigungu'].includes(regionLevel) ||
      !new RegExp(`^\\d{${expectedLength}}$`).test(regionCode)
    ) {
      return null;
    }
    return { regionLevel, regionCode, regionName };
  }

  function buildNearestUrl(
    apiBase,
    lat,
    lon,
    source,
    { mode = 'current', regionScope = null } = {}
  ) {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      source,
      lookup_mode: mode === 'search' ? 'search' : 'current',
    });
    if (mode === 'search') {
      const scope = normalizeRegionScope(regionScope);
      if (!scope) {
        throw new Error('Search lookup requires an administrative region');
      }
      params.set('region_level', scope.regionLevel);
      params.set('region_code', scope.regionCode);
      if (scope.regionName) params.set('region_name', scope.regionName);
    }
    return `${apiBase}/nearest?${params.toString()}`;
  }

  function formatSeoulDateTime(displayTs) {
    if (!displayTs) return null;
    const timestamp = parseGasTimestamp(displayTs);
    if (!timestamp) return null;
    return timestamp.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  function gasTimeText(airData) {
    if (!airData) return '가스 기준일시: 확인 불가';
    const keys = ['so2', 'co', 'o3', 'no2'];
    const timestamps = [...new Set(
      keys
        .filter(key => airData[key] !== null && airData[key] !== undefined)
        .map(key => airData.gasMeta?.[key]?.display_ts)
        .filter(Boolean)
    )];
    if (timestamps.length > 1) return '출처별 기준시각 상이';
    const formatted = formatSeoulDateTime(
      timestamps[0] || airData.gasDisplayTs
    );
    return formatted
      ? `가스 기준일시: ${formatted}`
      : '가스 기준일시: 확인 불가';
  }

  function createRefreshCoordinator(options) {
    const {
      performUpdate,
      getGpsCoords,
      defaultCoords = null,
      now = () => Date.now(),
      isVisible = () => true,
      setIntervalFn = setInterval,
      clearIntervalFn = clearInterval,
      autoThrottleMs = 60 * 1000,
      autoEventDedupeMs = 1500,
      intervalMs = 30 * 60 * 1000,
      onStateChange = () => {},
    } = options;

    let lookupMode = 'current';
    let currentCoords = null;
    let lastCurrentCoords = null;
    let searchAddress = '';
    let searchScope = null;
    let lastSuccessfulRefreshAt = 0;
    let lastAutomaticTriggerAt = 0;
    let refreshInProgress = false;
    let intervalId = null;

    function getState() {
      return {
        lookupMode,
        lastLookupWasManual: lookupMode === 'search',
        currentCoords: currentCoords ? { ...currentCoords } : null,
        lastCurrentCoords: lastCurrentCoords
          ? { ...lastCurrentCoords }
          : null,
        searchAddress,
        searchScope: searchScope ? { ...searchScope } : null,
        lastSuccessfulRefreshAt,
        refreshInProgress,
        intervalId,
      };
    }

    function notify() {
      onStateChange(getState());
    }

    function setLookupMode(mode, coords = null, regionScope = null) {
      lookupMode = mode === 'search' ? 'search' : 'current';
      if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon)) {
        currentCoords = { lat: coords.lat, lon: coords.lon };
        if (lookupMode === 'current') {
          lastCurrentCoords = { ...currentCoords };
        }
      }
      if (lookupMode === 'search') {
        searchScope = normalizeRegionScope(regionScope) || searchScope;
      } else {
        searchAddress = '';
        searchScope = null;
      }
      notify();
    }

    async function resolveCoords() {
      if (lookupMode === 'search') return currentCoords;
      try {
        const gpsCoords = await getGpsCoords();
        if (
          gpsCoords &&
          Number.isFinite(gpsCoords.lat) &&
          Number.isFinite(gpsCoords.lon)
        ) {
          currentCoords = { lat: gpsCoords.lat, lon: gpsCoords.lon };
        }
      } catch (error) {
        console.warn('[refresh] GPS 재조회 실패, 기존 좌표 사용:', error);
      }
      return currentCoords || defaultCoords;
    }

    async function refresh({
      manual = false,
      initial = false,
      reason = 'automatic',
    } = {}) {
      const startedAt = now();
      if (refreshInProgress) {
        return { started: false, success: false, skipped: 'in-flight' };
      }
      if (!manual && !initial) {
        if (
          lastAutomaticTriggerAt > 0 &&
          startedAt - lastAutomaticTriggerAt < autoEventDedupeMs
        ) {
          return { started: false, success: false, skipped: 'event-dedupe' };
        }
        lastAutomaticTriggerAt = startedAt;
        if (
          lastSuccessfulRefreshAt > 0 &&
          startedAt - lastSuccessfulRefreshAt < autoThrottleMs
        ) {
          return { started: false, success: false, skipped: 'throttled' };
        }
      }

      refreshInProgress = true;
      notify();
      try {
        const coords = await resolveCoords();
        if (!coords) {
          return { started: true, success: false, error: 'no-coordinates' };
        }
        currentCoords = { lat: coords.lat, lon: coords.lon };
        const success = await performUpdate(currentCoords, {
          initial,
          manual,
          mode: lookupMode,
          reason,
          regionScope: lookupMode === 'search' ? searchScope : null,
        });
        if (success) {
          lastSuccessfulRefreshAt = now();
          if (lookupMode === 'current') {
            lastCurrentCoords = { ...currentCoords };
          }
        }
        return { started: true, success: Boolean(success) };
      } catch (error) {
        console.error('[refresh] 조회 실패:', error);
        return { started: true, success: false, error };
      } finally {
        refreshInProgress = false;
        notify();
      }
    }

    async function lookupSearchLocation(coords, {
      initial = false,
      reason = 'address-search',
      address = '',
      regionScope = null,
    } = {}) {
      if (refreshInProgress) {
        return { started: false, success: false, skipped: 'in-flight' };
      }
      if (
        !coords ||
        !Number.isFinite(coords.lat) ||
        !Number.isFinite(coords.lon)
      ) {
        return { started: false, success: false, error: 'invalid-coordinates' };
      }

      refreshInProgress = true;
      notify();
      try {
        const nextCoords = { lat: coords.lat, lon: coords.lon };
        const nextSearchScope = normalizeRegionScope(regionScope);
        const success = await performUpdate(nextCoords, {
          initial,
          manual: true,
          mode: 'search',
          reason,
          searchAddress: address,
          regionScope: nextSearchScope,
        });
        if (success) {
          lookupMode = 'search';
          currentCoords = nextCoords;
          searchAddress = String(address || '').trim();
          searchScope = nextSearchScope;
          lastSuccessfulRefreshAt = now();
        }
        return { started: true, success: Boolean(success) };
      } catch (error) {
        console.error('[refresh] 검색 위치 조회 실패:', error);
        return { started: true, success: false, error };
      } finally {
        refreshInProgress = false;
        notify();
      }
    }

    async function returnToCurrentLocation({
      reason = 'return-to-current',
    } = {}) {
      if (refreshInProgress) {
        return { started: false, success: false, skipped: 'in-flight' };
      }

      refreshInProgress = true;
      notify();
      try {
        let gpsCoords = null;
        try {
          gpsCoords = await getGpsCoords();
        } catch (error) {
          console.warn(
            '[refresh] GPS 획득 실패, 마지막 현재 위치 사용:',
            error
          );
        }
        if (
          (!gpsCoords ||
            !Number.isFinite(gpsCoords.lat) ||
            !Number.isFinite(gpsCoords.lon)) &&
          lastCurrentCoords
        ) {
          gpsCoords = { ...lastCurrentCoords };
        }
        if (
          !gpsCoords ||
          !Number.isFinite(gpsCoords.lat) ||
          !Number.isFinite(gpsCoords.lon)
        ) {
          return { started: true, success: false, error: 'no-coordinates' };
        }

        const nextCoords = { lat: gpsCoords.lat, lon: gpsCoords.lon };
        const success = await performUpdate(nextCoords, {
          initial: false,
          manual: true,
          mode: 'current',
          reason,
        });
        if (success) {
          lookupMode = 'current';
          currentCoords = nextCoords;
          lastCurrentCoords = { ...nextCoords };
          searchAddress = '';
          searchScope = null;
          lastSuccessfulRefreshAt = now();
        }
        return { started: true, success: Boolean(success) };
      } catch (error) {
        console.error('[refresh] 현재 위치 복귀 실패:', error);
        return { started: true, success: false, error };
      } finally {
        refreshInProgress = false;
        notify();
      }
    }

    function stopInterval() {
      if (intervalId !== null) {
        clearIntervalFn(intervalId);
        intervalId = null;
        notify();
      }
    }

    function startInterval() {
      stopInterval();
      if (!isVisible()) return;
      intervalId = setIntervalFn(() => {
        if (isVisible()) {
          refresh({ reason: 'interval' });
        }
      }, intervalMs);
      notify();
    }

    async function handleVisibility(visible = isVisible(), reason = 'visible') {
      if (!visible) {
        stopInterval();
        return { started: false, success: false, skipped: 'hidden' };
      }
      const result = await refresh({ reason });
      startInterval();
      return result;
    }

    async function initialize() {
      const result = await refresh({ initial: true, reason: 'initial' });
      startInterval();
      return result;
    }

    notify();
    return {
      getState,
      setLookupMode,
      refresh,
      lookupSearchLocation,
      returnToCurrentLocation,
      startInterval,
      stopInterval,
      handleVisibility,
      initialize,
    };
  }

  function canStartPullRefresh({ atTop, inProgress, excluded }) {
    return Boolean(atTop && !inProgress && !excluded);
  }

  function shouldTriggerPullRefresh({
    atTop,
    pullDistance,
    inProgress,
    threshold = 70,
  }) {
    return Boolean(
      atTop &&
      !inProgress &&
      Number(pullDistance) >= threshold
    );
  }

  return {
    toNum,
    normalizeResponse,
    hasPmData,
    providerName,
    stationDisplayName,
    gasProviders,
    gasSummaryLabel,
    gasAgeText,
    gasItemSourceText,
    dataSourceText,
    pmStationText,
    shouldSyncWidget,
    normalizeRegionScope,
    buildNearestUrl,
    formatSeoulDateTime,
    gasTimeText,
    createRefreshCoordinator,
    canStartPullRefresh,
    shouldTriggerPullRefresh,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HudadakSourceUtils;
}
if (typeof window !== 'undefined') {
  window.HudadakSourceUtils = HudadakSourceUtils;
}

// app.js – DB-first 리팩터링 버전
if (typeof window !== 'undefined' && typeof document !== 'undefined') (() => {
  // ===================
  //  설정 & 상수
  // ===================
  const API_BASE = 'https://air-api-350359872967.asia-northeast3.run.app';
  const KAKAO_KEY = window.env?.KAKAO_KEY || 'be29697319e13590895593f5f5508348';
  const KAKAO_ADDRESS_API = 'https://dapi.kakao.com/v2/local/search/address.json';
  const KAKAO_COORD_API  = 'https://dapi.kakao.com/v2/local/geo/coord2address.json';

  const SCALE = {
    PM10: [
      { name: '좋음',    max: 30,   color: { dark: ['#367BB8','#7C9CC5'], light: ['#1e88e5','#69AAFF'] } },
      { name: '보통',    max: 80,   color: { light: ['#43A047','#3BD497'], dark: ['#629473','#9ACEB9'] } },
      { name: '나쁨',    max: 150,  color: { light: ['#F57C00','#FFB20B'], dark: ['#F6AA5C','#DDC472'] } },
      { name: '매우나쁨', max: 1000, color: { light: ['#D32F2F','#FF886B'], dark: ['#C75959','#BF8779'] } }
    ],
    PM25: [
      { name: '좋음',    max: 15,   color: { dark: ['#367BB8','#7C9CC5'], light: ['#1e88e5','#69AAFF'] } },
      { name: '보통',    max: 35,   color: { light: ['#43A047','#3BD497'], dark: ['#629473','#9ACEB9'] } },
      { name: '나쁨',    max: 75,   color: { light: ['#F57C00','#FFB20B'], dark: ['#F6AA5C','#DDC472'] } },
      { name: '매우나쁨', max: 1000, color: { light: ['#D32F2F','#FF886B'], dark: ['#C75959','#BF8779'] } }
    ]
  };

  // 가스별 스케일 (µg/m³) — 각 가스마다 다른 최대값
  const GAS_CONFIG = {
    so2: { max: 100,  unit: 'µg/m³', thresholds: [20, 80, 100],  labels: ['좋음 0–20', '보통 20–80', '나쁨 80+'] },
    co:  { max: 10000, unit: 'µg/m³', thresholds: [2000, 9000, 10000], labels: ['좋음 0–2000', '보통 2000–9000', '나쁨 9000+'] },
    o3:  { max: 200,  unit: 'µg/m³', thresholds: [60, 120, 200],  labels: ['좋음 0–60', '보통 60–120', '나쁨 120+'] },
    no2: { max: 200,  unit: 'µg/m³', thresholds: [40, 100, 200],  labels: ['좋음 0–40', '보통 40–100', '나쁨 100+'] },
  };

  // ===================
  //  DOM 요소
  // ===================
  const inputEl        = document.getElementById('place');
  const suggestionsEl  = document.getElementById('suggestions');
  const errorEl        = document.getElementById('error-message');
  const shareResultBtn = document.getElementById('shareResultBtn');
  const dataSourceInfo = document.getElementById('data-source-info');
  const returnLocationWrap = document.getElementById('returnLocationWrap');
  const returnToCurrentBtn = document.getElementById('returnToCurrentBtn');
  const searchLocationAddress =
    document.getElementById('searchLocationAddress');
  const pullOnboardingOverlay =
    document.getElementById('pullOnboardingOverlay');
  const pullOnboardingClose =
    document.getElementById('pullOnboardingClose');
  const pullOnboardingTry =
    document.getElementById('pullOnboardingTry');
  const pullOnboardingDone =
    document.getElementById('pullOnboardingDone');

  let currentCoords = null;
  let lastLookupWasManual = false;
  let lastSuccessfulRefreshAt = 0;
  let refreshInProgress = false;
  let refreshIntervalId = null;
  let debounceTimer;
  let suggestionsGeneration = 0;
  let currentSearchAddress = '';
  let onboardingTryActive = false;
  let onboardingIndicatorTimer = null;
  let onboardingPreviousFocus = null;

  // ===================
  //  유틸 함수
  // ===================
  const {
    toNum,
    normalizeResponse,
    providerName,
    stationDisplayName,
    gasSummaryLabel,
    gasItemSourceText,
    dataSourceText,
    pmStationText,
    shouldSyncWidget,
    formatSeoulDateTime,
    gasTimeText,
    createRefreshCoordinator,
    canStartPullRefresh,
    shouldTriggerPullRefresh,
  } = HudadakSourceUtils;

  const inFlight = new Map();
  async function dedupFetch(url, opts = {}) {
    const k = url + '|' + (opts.method || 'GET');
    if (inFlight.has(k)) return inFlight.get(k);
    const p = fetch(url, opts).finally(() => inFlight.delete(k));
    inFlight.set(k, p);
    return p;
  }

  // ===================
  //  데이터 조회
  // ===================
  async function fetchAirData(
    lat,
    lon,
    { mode = 'current', regionScope = null } = {}
  ) {
    try {
      const url = buildNearestUrl(
        API_BASE,
        lat,
        lon,
        'auto',
        { mode, regionScope }
      );
      const res = await dedupFetch(url, { cache: 'no-store' });

      if (res.status === 204) {
        console.warn('[fetchAirData] DB 데이터 없음, 모델 폴백');
        return await fetchModelFallback(lat, lon, { mode, regionScope });
      }
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();

      if (toNum(data.pm10) === null && toNum(data.pm25) === null) {
        console.warn('[fetchAirData] PM 데이터 없음, 모델 폴백');
        return await fetchModelFallback(lat, lon, { mode, regionScope });
      }
      return normalizeResponse(data);
    } catch (err) {
      console.error('[fetchAirData] API 호출 실패:', err);
      try {
        return await fetchModelFallback(lat, lon, { mode, regionScope });
      }
      catch { return null; }
    }
  }

  async function fetchModelFallback(
    lat,
    lon,
    { mode = 'current', regionScope = null } = {}
  ) {
    const url = buildNearestUrl(
      API_BASE,
      lat,
      lon,
      'model',
      { mode, regionScope }
    );
    const res = await dedupFetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Model fallback failed: ${res.status}`);
    const normalized = normalizeResponse(await res.json());
    return hasPmData(normalized) ? normalized : null;
  }

  function syncWidget(lat, lon, region, airData) {
    if (!window.Capacitor?.isNativePlatform?.()) return;
    const widgetSync = window.Capacitor?.Plugins?.WidgetSync;
    if (!widgetSync) return;
    widgetSync.update({
      mode: 'current',
      lat,
      lon,
      region,
      pm10: airData.pm10,
      pm10_provider: airData.pm10Meta?.provider,
      pm10_station: airData.pm10Meta?.station,
      pm10_station_id: airData.pm10Meta?.station_id,
      pm10_source_kind: airData.pm10Meta?.source_kind,
      pm10_display_ts: airData.pm10Meta?.display_ts,
      pm25: airData.pm25,
      pm25_provider: airData.pm25Meta?.provider,
      pm25_station: airData.pm25Meta?.station,
      pm25_station_id: airData.pm25Meta?.station_id,
      pm25_source_kind: airData.pm25Meta?.source_kind,
      pm25_display_ts: airData.pm25Meta?.display_ts,
    }).catch((err) => console.warn('[WidgetSync]', err));
  }

  // ===================
  //  주소 조회
  // ===================
  async function getAddressFromCoords(lat, lon) {
    try {
      const res = await fetch(`${API_BASE}/geo/reverse?lat=${lat}&lon=${lon}`);
      if (res.ok) { const d = await res.json(); return d.address || '주소 조회 실패'; }
    } catch {}
    try {
      const res = await fetch(`${KAKAO_COORD_API}?x=${lon}&y=${lat}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      const { documents } = await res.json();
      return documents[0]?.address?.address_name || '주소 조회 실패';
    } catch { return '주소 조회 실패'; }
  }

  // ===================
  //  UI 업데이트
  // ===================
  function getStatus(type, v) {
    if (v === null) return null;
    return SCALE[type].find(c => v <= c.max) || SCALE[type][SCALE[type].length - 1];
  }

  function drawGauge(pmType, value, stationName, provider, sourceKind, displayTs) {
    const wheelEl      = document.getElementById(`gauge${pmType}`);
    const statusTextEl = document.getElementById(`statusText${pmType}`);
    const valueTextEl  = document.getElementById(`valueText${pmType}`);
    const stationEl    = document.getElementById(`station${pmType}`);
    if (!wheelEl) return;

    const isDarkMode = document.body.classList.contains('dark-mode');

    if (value === null) {
      statusTextEl.textContent = '--';
      valueTextEl.textContent  = '- µg/m³';
      wheelEl.style.setProperty('--angle', '0deg');
    } else {
      const scale = SCALE[pmType];
      const status = getStatus(pmType, value);
      const colorSet = isDarkMode ? status.color.dark : status.color.light;

      // 등급별 구간 각도 계산 (각 등급 90도씩)
      const gradeIndex = scale.indexOf(status);
      const prevMax = gradeIndex > 0 ? scale[gradeIndex - 1].max : 0;
      const rangeMin = prevMax;
      const rangeMax = status.max;
      const ratio = Math.min((value - rangeMin) / (rangeMax - rangeMin), 1);
      const deg = (gradeIndex * 90) + (ratio * 90);

      wheelEl.style.setProperty('--gauge-color-start', colorSet[0]);
      wheelEl.style.setProperty('--gauge-color-end', colorSet[1]);
      wheelEl.style.setProperty('--angle', `${Math.min(deg, 360)}deg`);
      statusTextEl.textContent = status.name;
      statusTextEl.style.color = colorSet[0];
      valueTextEl.textContent  = `${value} µg/m³`;
    }

    const stationText = pmStationText(stationName, provider, sourceKind);
    const displayProvider = providerName(provider);
    stationEl.replaceChildren();
    if (sourceKind === 'model' || !displayProvider) {
      stationEl.textContent = stationText;
    } else {
      const providerBadge = document.createElement('span');
      providerBadge.className = 'station-provider-badge';
      providerBadge.textContent = displayProvider;
      stationEl.appendChild(providerBadge);
      const stationLabel = document.createElement('span');
      const compactStation = stationDisplayName(stationName);
      stationLabel.textContent = ` · 인근 측정소 실측${
        compactStation ? ` (${compactStation})` : ''
      }`;
      stationEl.appendChild(stationLabel);
    }
    const formattedTime = formatSeoulDateTime(displayTs);
    const timeLine = document.createElement('span');
    timeLine.className = 'station-time';
    timeLine.textContent = formattedTime
      ? `기준: ${formattedTime}`
      : '기준: 확인 불가';
    stationEl.appendChild(document.createElement('br'));
    stationEl.appendChild(timeLine);
  }

  // 가스 등급 (µg/m³ 기준)
  function getGasGrade(key, val) {
    const cfg = GAS_CONFIG[key];
    if (!cfg || val === null || val === undefined) return '';
    const t = cfg.thresholds;
    if (val <= t[0]) return 'good';
    if (val <= t[1]) return 'normal';
    if (val <= t[2]) return 'bad';
    return 'very-bad';
  }

  function updateGasData(airData) {
    const keys = ['so2','co','o3','no2'];
    const gasSourceEl = document.getElementById('gas-source-summary');
    const gasTimeEl = document.getElementById('gas-time-info');

    if (!airData) {
      keys.forEach(key => {
        const valEl = document.getElementById(`gas-${key}-value`);
        const barEl = document.getElementById(`gas-${key}-bar`);
        const refEl = document.getElementById(`gas-${key}-ref`);
        const sourceEl = document.getElementById(`gas-${key}-source`);
        if (valEl) valEl.textContent = '--';
        if (barEl) { barEl.style.width = '0%'; barEl.className = 'gas-item-bar-value'; }
        if (refEl) refEl.textContent = '';
        if (sourceEl) sourceEl.textContent = '';
      });
      if (gasSourceEl) gasSourceEl.textContent = '';
      if (gasTimeEl) gasTimeEl.textContent = '가스 기준일시: 확인 불가';
      return;
    }

    if (gasSourceEl) {
      const summary = gasSummaryLabel(airData);
      gasSourceEl.textContent = summary ? `· ${summary}` : '';
    }

    if (gasTimeEl) {
      gasTimeEl.textContent = gasTimeText(airData);
    }

    keys.forEach(key => {
      const valEl = document.getElementById(`gas-${key}-value`);
      const barEl = document.getElementById(`gas-${key}-bar`);
      const refEl = document.getElementById(`gas-${key}-ref`);
      const sourceEl = document.getElementById(`gas-${key}-source`);
      if (!valEl || !barEl) return;

      const val = airData[key];
      const cfg = GAS_CONFIG[key];

      if (val !== null && val !== undefined) {
        valEl.textContent = Number.isInteger(val) ? val : val.toFixed(1);
        barEl.style.width = `${Math.min(val / cfg.max * 100, 100)}%`;
        const grade = getGasGrade(key, val);
        barEl.className = 'gas-item-bar-value' + (grade ? ` ${grade}` : '');
        // 기준 표시
        if (refEl) refEl.textContent = cfg.labels[0] + ' / ' + cfg.labels[1] + ' / ' + cfg.labels[2];
        if (sourceEl) {
          const meta = airData.gasMeta?.[key];
          const sourceText = gasItemSourceText(meta);
          const itemTime = formatSeoulDateTime(meta?.display_ts);
          sourceEl.textContent = [
            sourceText,
            itemTime ? `기준: ${itemTime}` : '',
          ].filter(Boolean).join(' · ');
        }
      } else {
        valEl.textContent = '--';
        barEl.style.width = '0%';
        barEl.className = 'gas-item-bar-value';
        if (refEl) refEl.textContent = '';
        if (sourceEl) sourceEl.textContent = '';
      }
    });
  }

  function updateDateTime() {
    const timeEl = document.getElementById('time');
    if (!timeEl) return;
    timeEl.textContent = '항목별 최신값';
  }

  function updateDataSourceInfo(airData) {
    if (dataSourceInfo) {
      dataSourceInfo.textContent = dataSourceText(airData);
    }
  }

  function showError(msg) { if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; } }
  function hideError()    { if (errorEl) errorEl.style.display = 'none'; }

  // ===================
  //  메인 로직
  // ===================
  async function updateAll(
    lat,
    lon,
    {
      mode = 'current',
      preserveExisting = false,
      regionScope = null,
    } = {}
  ) {
    hideError();

    if (dataSourceInfo) dataSourceInfo.style.display = 'block';

    const regionEl = document.getElementById('region');
    const regionPromise = getAddressFromCoords(lat, lon);
    if (regionEl && !preserveExisting) {
      regionEl.textContent = '조회 중...';
    }

    try {
      const airData = await fetchAirData(lat, lon, {
        mode,
        regionScope,
      });
      if (airData) {
        lastAirData = airData;
        drawGauge(
          'PM10',
          airData.pm10,
          airData.pm10Meta?.station,
          airData.pm10Meta?.provider,
          airData.pm10Meta?.source_kind,
          airData.pm10Meta?.display_ts
        );
        drawGauge(
          'PM25',
          airData.pm25,
          airData.pm25Meta?.station,
          airData.pm25Meta?.provider,
          airData.pm25Meta?.source_kind,
          airData.pm25Meta?.display_ts
        );
        updateGasData(airData);
        updateDateTime();
        updateDataSourceInfo(airData);
        const regionName = await regionPromise;
        if (regionEl) regionEl.textContent = regionName;
        setLookupModeUi(mode, regionName);
        if (shouldSyncWidget(mode)) {
          syncWidget(lat, lon, regionName, airData);
        }
        console.log(`[updateAll] 소스: ${airData.sourceKind} / 측정소: ${airData.station}`);
        return true;
      } else {
        if (!preserveExisting) {
          drawGauge('PM10', null, '데이터 없음', null, 'unknown');
          drawGauge('PM25', null, '데이터 없음', null, 'unknown');
          updateGasData(null);
          updateDateTime(null);
          updateDataSourceInfo(null);
        }
        showError('가까운 측정소에서 데이터를 가져올 수 없습니다.');
        return false;
      }
    } catch (err) {
      console.error('[updateAll] 오류:', err);
      if (!preserveExisting) {
        drawGauge('PM10', null, '오류', null, 'unknown');
        drawGauge('PM25', null, '오류', null, 'unknown');
        updateGasData(null);
        updateDateTime(null);
        updateDataSourceInfo(null);
      }
      showError('데이터를 불러오는 중 오류가 발생했습니다.');
      return false;
    }
  }

  async function getFreshGpsCoords() {
    if (window.Capacitor?.isNativePlatform?.()) {
      const geolocation = window.Capacitor?.Plugins?.Geolocation;
      if (!geolocation) throw new Error('Capacitor Geolocation unavailable');
      const pos = await geolocation.getCurrentPosition({
        enableHighAccuracy: true,
      });
      return {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      };
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
        reject,
        { enableHighAccuracy: true }
      );
    });
  }

  const refreshCoordinator = createRefreshCoordinator({
    performUpdate: (coords, context) => updateAll(
      coords.lat,
      coords.lon,
      {
        mode: context.mode,
        preserveExisting: !context.initial,
        regionScope: context.regionScope,
      }
    ),
    getGpsCoords: getFreshGpsCoords,
    defaultCoords: { lat: 37.572016, lon: 126.975319 },
    isVisible: () => document.visibilityState === 'visible',
    onStateChange: state => {
      currentCoords = state.currentCoords;
      lastLookupWasManual = state.lastLookupWasManual;
      lastSuccessfulRefreshAt = state.lastSuccessfulRefreshAt;
      refreshInProgress = state.refreshInProgress;
      refreshIntervalId = state.intervalId;
    },
  });

  function showTransientError(message) {
    showError(message);
    setTimeout(() => {
      if (errorEl?.textContent === message) hideError();
    }, 2200);
  }

  function isPullOnboardingOpen() {
    return Boolean(pullOnboardingOverlay && !pullOnboardingOverlay.hidden);
  }

  function closePullOnboarding({ restoreFocus = true } = {}) {
    if (!pullOnboardingOverlay) return;
    pullOnboardingOverlay.hidden = true;
    document.body.classList.remove('pull-onboarding-open');
    if (
      restoreFocus &&
      onboardingPreviousFocus &&
      typeof onboardingPreviousFocus.focus === 'function'
    ) {
      onboardingPreviousFocus.focus();
    }
    onboardingPreviousFocus = null;
  }

  function completePullOnboarding() {
    localStorage.setItem('onboardingPullToCurrentVersion', '1');
    onboardingTryActive = false;
    closePullOnboarding();
  }

  function openPullOnboarding({ force = false } = {}) {
    if (
      !pullOnboardingOverlay ||
      (!force &&
        localStorage.getItem('onboardingPullToCurrentVersion') === '1')
    ) {
      return;
    }
    onboardingPreviousFocus = document.activeElement;
    pullOnboardingOverlay.hidden = false;
    document.body.classList.add('pull-onboarding-open');
    setTimeout(() => pullOnboardingClose?.focus(), 0);
  }

  function maybeShowPullOnboarding(delay = 0) {
    if (localStorage.getItem('onboardingPullToCurrentVersion') === '1') {
      return;
    }
    setTimeout(() => {
      const widgetPromptOpen =
        document.getElementById('widgetPromptModal')?.classList.contains('open');
      if (!widgetPromptOpen) openPullOnboarding();
    }, delay);
  }

  function startPullOnboardingPractice() {
    onboardingTryActive = true;
    closePullOnboarding({ restoreFocus: false });
    const indicator = document.getElementById('pullRefreshIndicator');
    const indicatorText = document.getElementById('pullRefreshText');
    if (!indicator || !indicatorText) return;
    indicator.classList.add('active');
    indicator.style.opacity = '1';
    indicatorText.textContent = '아래로 당겨 내 위치로 돌아가기';
    if (onboardingIndicatorTimer !== null) {
      clearTimeout(onboardingIndicatorTimer);
    }
    onboardingIndicatorTimer = setTimeout(() => {
      if (!refreshInProgress) {
        indicator.classList.remove('active');
        indicator.style.removeProperty('opacity');
        indicatorText.textContent = '당겨서 새로고침';
      }
      onboardingIndicatorTimer = null;
    }, 7000);
  }

  if (pullOnboardingClose) {
    pullOnboardingClose.addEventListener('click', () => {
      closePullOnboarding();
    });
  }
  if (pullOnboardingTry) {
    pullOnboardingTry.addEventListener('click', startPullOnboardingPractice);
  }
  if (pullOnboardingDone) {
    pullOnboardingDone.addEventListener('click', completePullOnboarding);
  }
  if (pullOnboardingOverlay) {
    pullOnboardingOverlay.addEventListener('touchmove', event => {
      if (event.cancelable) event.preventDefault();
    }, { passive: false });
    pullOnboardingOverlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePullOnboarding();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...pullOnboardingOverlay.querySelectorAll(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function setLookupModeUi(mode, address = '') {
    const isSearch = mode === 'search';
    if (isSearch && address) currentSearchAddress = address;
    if (returnLocationWrap) returnLocationWrap.hidden = !isSearch;
    if (searchLocationAddress && isSearch) {
      searchLocationAddress.textContent =
        currentSearchAddress || inputEl?.value?.trim() || '검색한 위치';
    }
    if (shareResultBtn) {
      shareResultBtn.style.display = isSearch ? 'inline-flex' : 'none';
    }
    const shareActionRow = document.getElementById('shareActionRow');
    if (shareActionRow) {
      shareActionRow.style.display = isSearch ? 'flex' : 'none';
    }
    if (!isSearch) currentSearchAddress = '';
  }

  async function refreshSearchCoords(
    lat,
    lon,
    address = '',
    regionScope = null
  ) {
    const result = await refreshCoordinator.lookupSearchLocation({ lat, lon }, {
      reason: 'address-search',
      address,
      regionScope,
    });
    if (result.success) {
      currentSearchAddress =
        String(address || inputEl?.value || '').trim();
      setLookupModeUi('search', currentSearchAddress);
    }
    return result;
  }

  async function returnToCurrentLocation(reason = 'return-to-current') {
    closeSuggestions({ blur: true });
    if (returnToCurrentBtn) returnToCurrentBtn.disabled = true;
    const result = await refreshCoordinator.returnToCurrentLocation({ reason });
    if (result.success) {
      if (inputEl) inputEl.value = '';
      currentSearchAddress = '';
      setLookupModeUi('current');
      const cleanUrl = `${location.origin}${location.pathname}`;
      history.replaceState(null, '', cleanUrl);
    } else if (result.skipped !== 'in-flight') {
      showTransientError(
        '현재 위치를 확인하지 못했습니다. 검색 결과를 그대로 유지합니다.'
      );
    }
    if (returnToCurrentBtn) returnToCurrentBtn.disabled = false;
    return result;
  }

  if (returnToCurrentBtn) {
    returnToCurrentBtn.addEventListener('click', () => {
      returnToCurrentLocation('return-button');
    });
  }

  function setupLifecycleRefresh() {
    const handleVisible = reason => {
      if (document.visibilityState === 'visible') {
        refreshCoordinator.handleVisibility(true, reason);
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleVisible('visibilitychange');
      } else {
        refreshCoordinator.handleVisibility(false, 'visibilitychange');
      }
    });
    window.addEventListener('pageshow', () => handleVisible('pageshow'));

    const appPlugin = window.Capacitor?.Plugins?.App;
    if (appPlugin?.addListener) {
      appPlugin.addListener('appStateChange', ({ isActive }) => {
        refreshCoordinator.handleVisibility(isActive, 'appStateChange');
      });
      appPlugin.addListener('resume', () => handleVisible('resume'));
      appPlugin.addListener('backButton', () => {
        if (isPullOnboardingOpen()) {
          closePullOnboarding();
        } else if (
          document.getElementById('settingsModal')?.classList.contains('open')
        ) {
          closeSettings();
        } else if (typeof appPlugin.minimizeApp === 'function') {
          appPlugin.minimizeApp();
        }
      });
    }
  }

  function setupPullToRefresh() {
    const indicator = document.getElementById('pullRefreshIndicator');
    const indicatorText = document.getElementById('pullRefreshText');
    if (!indicator || !indicatorText) return;

    const threshold = 70;
    let tracking = false;
    let startX = 0;
    let startY = 0;
    let pullDistance = 0;

    const isAtTop = () => (
      window.scrollY <= 0 &&
      (document.documentElement?.scrollTop || 0) <= 0 &&
      (document.body?.scrollTop || 0) <= 0
    );
    const isExcludedTarget = target => Boolean(
      target?.closest?.(
        'input, textarea, select, button, #suggestions, ' +
        '.modal-overlay, .widget-prompt-overlay, .pull-onboarding-overlay, ' +
        '[contenteditable="true"]'
      )
    );
    const resetIndicator = (delay = 0) => {
      setTimeout(() => {
        indicator.classList.remove('active', 'refreshing');
        indicator.style.removeProperty('transform');
        indicator.style.removeProperty('opacity');
        indicatorText.textContent = '당겨서 새로고침';
      }, delay);
    };

    document.addEventListener('touchstart', event => {
      if (
        event.touches.length !== 1 ||
        !canStartPullRefresh({
          atTop: isAtTop(),
          inProgress: refreshInProgress,
          excluded: isExcludedTarget(event.target),
        })
      ) {
        tracking = false;
        return;
      }
      tracking = true;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      pullDistance = 0;
    }, { passive: true });

    document.addEventListener('touchmove', event => {
      if (!tracking || event.touches.length !== 1) return;
      const deltaX = event.touches[0].clientX - startX;
      const deltaY = event.touches[0].clientY - startY;
      if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
        tracking = false;
        resetIndicator();
        return;
      }
      if (!isAtTop()) {
        tracking = false;
        resetIndicator();
        return;
      }
      if (event.cancelable) event.preventDefault();
      pullDistance = Math.min(deltaY * 0.55, 100);
      indicator.classList.add('active');
      indicator.style.transform =
        `translate(-50%, ${Math.min(pullDistance - 58, 8)}px)`;
      indicator.style.opacity = String(Math.min(pullDistance / 45, 1));
      indicatorText.textContent = pullDistance >= threshold
        ? '놓아서 새로고침'
        : '당겨서 새로고침';
    }, { passive: false });

    document.addEventListener('touchend', async () => {
      if (!tracking) return;
      tracking = false;
      if (!shouldTriggerPullRefresh({
        atTop: isAtTop(),
        pullDistance,
        inProgress: refreshInProgress,
        threshold,
      })) {
        resetIndicator();
        return;
      }

      indicator.style.removeProperty('transform');
      indicator.style.removeProperty('opacity');
      indicator.classList.add('active', 'refreshing');
      indicatorText.textContent = '새로고침 중…';
      const result = await returnToCurrentLocation('pull-to-refresh');
      if (result.success) {
        if (onboardingTryActive) {
          if (onboardingIndicatorTimer !== null) {
            clearTimeout(onboardingIndicatorTimer);
            onboardingIndicatorTimer = null;
          }
          completePullOnboarding();
        }
        resetIndicator(250);
      } else {
        indicator.classList.remove('refreshing');
        indicatorText.textContent = '새로고침 실패';
        showTransientError('새 데이터를 가져오지 못했습니다. 기존 화면을 유지합니다.');
        resetIndicator(1000);
      }
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
      tracking = false;
      resetIndicator();
    }, { passive: true });
  }

  // ===================
  //  검색
  // ===================
  function closeSuggestions({ blur = false } = {}) {
    suggestionsGeneration += 1;
    if (suggestionsEl) {
      suggestionsEl.style.display = 'none';
      suggestionsEl.innerHTML = '';
    }
    if (blur) inputEl?.blur();
  }

  // Android IME(한글 등) 입력 시 input 이벤트가 안 오는 경우 대비
  // keyup + compositionend + paste 이벤트도 같이 처리
  function triggerSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const query = inputEl.value.trim();
      if (!query) {
        closeSuggestions();
        return;
      }
      const requestGeneration = ++suggestionsGeneration;
      try {
        const url = `${KAKAO_ADDRESS_API}?query=${encodeURIComponent(query)}`;
        const res = await dedupFetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
        const { documents } = await res.json();
        if (requestGeneration !== suggestionsGeneration) return;
        suggestionsEl.innerHTML = '';
        if (documents.length > 0) {
          documents.slice(0, 5).forEach(d => {
            const li = document.createElement('li');
            li.textContent = d.address_name;
            li.onclick = () => {
              inputEl.value = d.address_name;
              closeSuggestions({ blur: true });
              searchByAddress(d.address_name);
            };
            suggestionsEl.appendChild(li);
          });
          suggestionsEl.style.display = 'block';
        } else {
          closeSuggestions();
        }
      } catch {
        if (requestGeneration === suggestionsGeneration) closeSuggestions();
      }
    }, 300);
  }

  if (inputEl) {
    inputEl.addEventListener('input', () => {
      if (!inputEl.value.trim()) closeSuggestions();
      triggerSearch();
    });
    inputEl.addEventListener('keyup', triggerSearch);
    inputEl.addEventListener('compositionend', triggerSearch);
    inputEl.addEventListener('paste', () => setTimeout(triggerSearch, 50));
  }

  async function searchByAddress(q) {
    closeSuggestions({ blur: true });
    if (!q || q.trim().length < 2) { alert('검색어를 두 글자 이상 입력하세요'); return; }
    try {
      const geoRes = await fetch(`${API_BASE}/geo/address?q=${encodeURIComponent(q)}`);
      if (!geoRes.ok) throw new Error('geo failed');
      const geo = await geoRes.json();
      if (inputEl) inputEl.value = geo.address;
      await refreshSearchCoords(geo.lat, geo.lon, geo.address, {
        regionLevel: geo.region_level,
        regionCode: geo.region_code,
        regionName: geo.normalized_region_name || geo.region_name,
      });
    } catch (err) {
      console.warn('[searchByAddress]', err);
      if (suggestionsEl?.firstChild) suggestionsEl.firstChild.click();
      else alert('주소 검색에 실패했습니다.');
    }
  }

  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      closeSuggestions({ blur: true });
      searchByAddress(inputEl?.value);
    });
  }
  if (inputEl) {
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        closeSuggestions({ blur: true });
        searchByAddress(inputEl.value);
      }
    });
  }
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest?.('#search')) closeSuggestions();
  });

  // ===================
  //  공유 기능
  // ===================
  let lastAirData = null;  // 마지막 조회 데이터 저장

  if (shareResultBtn) {
    shareResultBtn.addEventListener('click', async () => {
      closeSuggestions({ blur: true });
      if (!currentCoords) return;

      const regionEl = document.getElementById('region');
      const regionName = regionEl?.textContent || '알 수 없는 지역';
      const searchQuery = inputEl?.value?.trim() || '';
      const displayName = searchQuery || regionName;
      const pm10 = lastAirData?.pm10 ?? '--';
      const pm25 = lastAirData?.pm25 ?? '--';

      let shareUrl = `${location.origin}${location.pathname}?lat=${currentCoords.lat}&lon=${currentCoords.lon}`;
      if (searchQuery) shareUrl += `&q=${encodeURIComponent(searchQuery)}`;
      const shareTitle = '후다닥 미세먼지 피하기';
      const shareText = `${displayName} 미세먼지 PM10: ${pm10}µg/m³ / PM2.5: ${pm25}µg/m³`;

      // og 메타태그 동적 변경 (공유 시 미리보기용)
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', `${regionName}의 미세먼지 정보를 확인하세요!`);

      // Web Share API (모바일 우선)
      if (navigator.share) {
        try {
          await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
          return;
        } catch (e) {
          if (e.name === 'AbortError') return; // 사용자 취소
        }
      }

      // 폴백: 클립보드 복사
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        const origText = shareResultBtn.querySelector('span');
        if (origText) {
          const prev = origText.textContent;
          origText.textContent = '복사 완료!';
          setTimeout(() => { origText.textContent = prev; }, 2000);
        }
      } catch {
        // 최종 폴백
        prompt('아래 링크를 복사하세요:', shareUrl);
      }
    });
  }

  // ===================
  //  초기화
  // ===================
  async function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');

    if (lat && lon) {
      await refreshCoordinator.lookupSearchLocation({
        lat: parseFloat(lat),
        lon: parseFloat(lon),
      }, {
        initial: true,
        reason: 'shared-location',
        address: urlParams.get('q') || '',
      });
      refreshCoordinator.startInterval();
    } else {
      refreshCoordinator.setLookupMode('current');
      await refreshCoordinator.initialize();
    }
  }

  // ===================
  //  설정 모달
  // ===================
  const settingsBtn   = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const replayPullOnboardingBtn =
    document.getElementById('replayPullOnboardingBtn');

  let noticesLoaded = false;
  async function loadNotices() {
    if (noticesLoaded) return;
    const changelogEl = document.getElementById('changelogContent');
    const faqEl       = document.getElementById('faqContent');
    const titleEl     = document.getElementById('changelogTitle');
    try {
      const res = await fetch(API_BASE + '/notices');
      if (!res.ok) throw new Error('notices ' + res.status);
      const data = await res.json();
      noticesLoaded = true;
      // 제목 업데이트
      if (titleEl && data.version) {
        titleEl.textContent = `후다닥 미세먼지 v${data.version} 변경사항`;
      }
      // 공지사항 렌더링
      if (changelogEl && data.notices && data.notices.length) {
        const cats = {};
        data.notices.forEach(n => { if (!cats[n.category]) cats[n.category] = []; cats[n.category].push(n); });
        let html = data.updated ? `<p class="changelog-date">변경일: ${data.updated}</p>` : '';
        Object.entries(cats).forEach(([cat, items]) => {
          html += `<p class="changelog-category">${cat}</p><ul>`;
          items.forEach(item => { html += `<li><strong>${item.title}</strong><br>${item.body}</li>`; });
          html += '</ul>';
        });
        html += `<a href="https://maenglionworld.notion.site/_HUDADAK-3a5bcdc037cd8007a5afc19eeda0a106" target="_blank" rel="noopener" class="notion-link-btn">전체 공지 및 업데이트 내역 보기</a>`;
        changelogEl.innerHTML = html;
      }
      // FAQ 렌더링
      if (faqEl && data.faq && data.faq.length) {
        let html = '';
        data.faq.forEach(item => {
          html += `<div class="faq-item"><p class="faq-q">${item.q}</p><p class="faq-a">${item.a}</p></div>`;
        });
        faqEl.innerHTML = html;
      }
    } catch (e) {
      console.warn('[notices] fetch failed:', e);
      const errMsg = '<p class="changelog-loading">업데이트 정보를 불러오지 못했습니다.</p>';
      if (changelogEl) changelogEl.innerHTML = errMsg;
      if (faqEl) faqEl.innerHTML = errMsg;
    }
  }

  function openSettings() {
    if (settingsModal) settingsModal.classList.add('open');
    loadNotices();
  }
  function closeSettings() {
    if (settingsModal) settingsModal.classList.remove('open');
  }

  if (settingsBtn)    settingsBtn.addEventListener('click', openSettings);
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeSettings);
  if (replayPullOnboardingBtn) {
    replayPullOnboardingBtn.addEventListener('click', () => {
      closeSettings();
      openPullOnboarding({ force: true });
    });
  }
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettings();
    });
  }

  // ===================
  //  테마 토글
  // ===================
  const applyTheme = (theme) => {
    const isDark = theme === 'dark';
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('light-mode', !isDark);
    const cb = document.getElementById('theme-checkbox');
    if (cb) cb.checked = isDark;
    const modeLabel = document.getElementById('modeLabel');
    if (modeLabel) modeLabel.textContent = isDark ? '다크 모드' : '라이트 모드';

    // 게이지 색상은 인라인 CSS 변수이므로 테마 전환 후 다시 계산해야 한다.
    if (lastAirData) {
      drawGauge(
        'PM10',
        lastAirData.pm10,
        lastAirData.pm10Meta?.station,
        lastAirData.pm10Meta?.provider,
        lastAirData.pm10Meta?.source_kind,
        lastAirData.pm10Meta?.display_ts
      );
      drawGauge(
        'PM25',
        lastAirData.pm25,
        lastAirData.pm25Meta?.station,
        lastAirData.pm25Meta?.provider,
        lastAirData.pm25Meta?.source_kind,
        lastAirData.pm25Meta?.display_ts
      );
    }
  };

  const themeCheckbox = document.getElementById('theme-checkbox');
  if (themeCheckbox) {
    themeCheckbox.addEventListener('change', () => {
      const newTheme = themeCheckbox.checked ? 'dark' : 'light';
      localStorage.setItem('theme', newTheme);
      applyTheme(newTheme);
    });
  }

  // ===================
  //  위젯 토글 (설정 모달)
  // ===================
  const widgetCheckbox = document.getElementById('widget-checkbox');
  const widgetLabel    = document.getElementById('widgetLabel');
  const applyWidget = (enabled) => {
    if (widgetCheckbox) widgetCheckbox.checked = enabled;
    if (widgetLabel)    widgetLabel.textContent = enabled ? '활성' : '비활성';
    localStorage.setItem('widgetEnabled', enabled ? '1' : '0');
    if (window.Capacitor?.isNativePlatform?.()) {
      window.dispatchEvent(new CustomEvent('widgetToggle', { detail: { enabled } }));
    }
  };
  if (widgetCheckbox) {
    const savedWidget = localStorage.getItem('widgetEnabled');
    applyWidget(savedWidget === '1');
    widgetCheckbox.addEventListener('change', () => applyWidget(widgetCheckbox.checked));
  }

  // ===================
  //  위젯 설치 버튼 (설정 모달 내)
  // ===================
  function requestWidgetPin() {
    if (window.Capacitor?.isNativePlatform?.()) {
      // Capacitor 플러그인 호출
      import('@capacitor/core').then(({ Plugins }) => {
        const { WidgetPin } = Plugins;
        if (WidgetPin) {
          WidgetPin.requestPin().catch((err) => {
            console.warn('[WidgetPin]', err);
            alert('이 런처는 위젯 고정 기능을 지원하지 않습니다.\n홈 화면을 길게 누른 후 위젯 메뉴에서 후다닥을 선택해 추가하세요.');
          });
        }
      }).catch(() => {
        alert('홈 화면을 길게 누른 후 위젯 메뉴에서 후다닥을 선택해 추가하세요.');
      });
    } else {
      // 웹/에뮬레이터: 안내 텍스트
      alert('홈 화면을 길게 누른 후 위젯 메뉴에서 후다닥을 선택해 추가하세요.');
    }
  }
  const widgetInstallBtn = document.getElementById('widgetInstallBtn');
  if (widgetInstallBtn) {
    widgetInstallBtn.addEventListener('click', requestWidgetPin);
  }

  // ===================
  //  위젯 설치 안내 모달
  // ===================
  const widgetPromptModal   = document.getElementById('widgetPromptModal');
  const widgetPromptClose   = document.getElementById('widgetPromptClose');
  const widgetPromptDismiss = document.getElementById('widgetPromptDismiss');

  function closeWidgetPrompt() {
    if (widgetPromptModal) widgetPromptModal.classList.remove('open');
    maybeShowPullOnboarding(250);
  }
  function dismissWidgetPromptWeek() {
    closeWidgetPrompt();
    localStorage.setItem('widgetPromptHideUntil', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  }

  // 네이티브 앱 환경에서 매 실행마다 표시 (일주일 보지 않기 누른 경우 제외)
  const isNative = window.Capacitor?.isNativePlatform?.();
  const hideUntil = parseInt(localStorage.getItem('widgetPromptHideUntil') || '0', 10);
  const shouldShowWidgetPrompt =
    Boolean(isNative && Date.now() > hideUntil && widgetPromptModal);
  if (shouldShowWidgetPrompt) {
    setTimeout(() => widgetPromptModal.classList.add('open'), 1500);
  } else {
    maybeShowPullOnboarding(1500);
  }

  if (widgetPromptClose)   widgetPromptClose.addEventListener('click', closeWidgetPrompt);
  if (widgetPromptDismiss) widgetPromptDismiss.addEventListener('click', dismissWidgetPromptWeek);

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    applyTheme(savedTheme);
  } else {
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  setupLifecycleRefresh();
  setupPullToRefresh();
  initializeApp();
})();
