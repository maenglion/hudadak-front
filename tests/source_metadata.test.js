const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  normalizeResponse,
  hasPmData,
  gasSummaryLabel,
  gasAgeText,
  gasItemSourceText,
  dataSourceText,
  pmStationText,
  stationDisplayName,
  shouldSyncWidget,
  formatSeoulDateTime,
  gasTimeText,
} = require('../www/app.js');

test('PM response is usable when either pollutant has a value', () => {
  assert.equal(hasPmData({ pm10: 10, pm25: null }), true);
  assert.equal(hasPmData({ pm10: null, pm25: 5 }), true);
  assert.equal(hasPmData({ pm10: null, pm25: null }), false);
  assert.equal(hasPmData(null), false);
});

function gasMeta(
  provider,
  displayTs,
  station = null,
  sourceKind = 'model'
) {
  return {
    provider,
    source_kind: sourceKind,
    display_ts: displayTs,
    station,
  };
}

test('normalizeResponse preserves PM and gas metadata separately', () => {
  const response = normalizeResponse({
    provider: 'WAQI',
    name: 'PM station',
    source_kind: 'waqi_station',
    display_ts: '2026-07-23T12:00:00+09:00',
    pm10: 31,
    pm25: 14,
    o3: 45,
    gas_provider: 'OPENMETEO',
    gas_source_kind: 'model',
    gas_display_ts: '2026-07-23T11:00:00+09:00',
    gas_station: null,
    gas_meta: {
      o3: gasMeta('OPENMETEO', '2026-07-23T11:00:00+09:00'),
    },
  });

  assert.equal(response.provider, 'WAQI');
  assert.equal(response.displayTs, '2026-07-23T12:00:00+09:00');
  assert.equal(response.gasProvider, 'OPENMETEO');
  assert.equal(response.gasSourceKind, 'model');
  assert.equal(response.gasDisplayTs, '2026-07-23T11:00:00+09:00');
  assert.equal(response.gasStation, null);
  assert.equal(response.gasMeta.o3.provider, 'OPENMETEO');
  assert.equal(response.pm10Meta.provider, 'WAQI');
  assert.equal(response.pm25Meta.provider, 'WAQI');
});

test('normalizeResponse preserves independent PM station and timestamp metadata', () => {
  const response = normalizeResponse({
    pm10: 36,
    pm25: 22,
    pm10_meta: {
      provider: 'AIRKOREA',
      station: '인천 신흥',
      station_id: 10,
      display_ts: '2026-07-28T14:00:00+09:00',
      source_kind: 'airkorea_station',
    },
    pm25_meta: {
      provider: 'WAQI',
      station: 'Aam, Incheon',
      station_id: 20,
      display_ts: '2026-07-28T13:00:00+09:00',
      source_kind: 'waqi_station',
    },
  });
  assert.equal(response.pm10Meta.station, '인천 신흥');
  assert.equal(response.pm25Meta.provider, 'WAQI');
  assert.notEqual(
    response.pm10Meta.display_ts,
    response.pm25Meta.display_ts
  );
});

test('WAQI PM and Open-Meteo gases never share a provider label', () => {
  const data = {
    provider: 'WAQI',
    sourceKind: 'waqi_station',
    o3: 45,
    gasProvider: 'OPENMETEO',
    gasMeta: { o3: gasMeta('OPENMETEO', '2026-07-23T11:00:00+09:00') },
  };

  assert.equal(dataSourceText(data), '미세먼지 실측: WAQI · 기타 공기지표: 모델(Open-Meteo)');
  assert.equal(gasSummaryLabel(data), '모델(Open-Meteo)');
  assert.equal(gasItemSourceText(data.gasMeta.o3), 'Open-Meteo · 현재 위치 모델값');
  assert.doesNotMatch(gasItemSourceText(data.gasMeta.o3), /WAQI/);
});

test('AirKorea PM and OWM gases use their actual provider names', () => {
  const data = {
    provider: 'AIRKOREA',
    sourceKind: 'airkorea_station',
    no2: 12,
    gasProvider: 'OWM',
    gasMeta: {
      no2: gasMeta('OWM', '2026-07-23T11:30:00+09:00', 'OpenWeather grid'),
    },
  };

  assert.equal(dataSourceText(data), '미세먼지 실측: AirKorea · 기타 공기지표: 모델(OpenWeather)');
  assert.equal(gasSummaryLabel(data), '모델(OpenWeather)');
});

test('Open-Meteo PM fallback is labeled as a prediction', () => {
  const data = {
    provider: 'OPENMETEO',
    sourceKind: 'model',
    pm10: 28,
    pm25: 12,
    o3: 45,
    gasProvider: 'OPENMETEO',
    gasMeta: {
      o3: gasMeta('OPENMETEO', '2026-07-23T12:00:00+09:00'),
    },
  };

  assert.equal(
    dataSourceText(data),
    '미세먼지 예측: Open-Meteo · 기타 공기지표: 모델(Open-Meteo)'
  );
});

test('mixed gas metadata keeps each pollutant provider', () => {
  const data = {
    provider: 'AIRKOREA',
    sourceKind: 'airkorea_station',
    o3: 45,
    so2: 3,
    no2: 12,
    co: 210,
    gasProvider: 'OPENMETEO+OWM',
    gasMeta: {
      o3: gasMeta('OPENMETEO', '2026-07-23T12:00:00+09:00'),
      so2: gasMeta('OPENMETEO', '2026-07-23T12:00:00+09:00'),
      no2: gasMeta('OWM', '2026-07-23T11:30:00+09:00', 'OpenWeather grid'),
      co: gasMeta('OWM', '2026-07-23T11:30:00+09:00', 'OpenWeather grid'),
    },
  };

  assert.equal(gasSummaryLabel(data), '출처 혼합');
  assert.equal(gasItemSourceText(data.gasMeta.so2), 'Open-Meteo · 현재 위치 모델값');
  assert.equal(gasItemSourceText(data.gasMeta.co), 'OpenWeather · 현재 위치 모델값');
  assert.equal(
    dataSourceText(data),
    '미세먼지 실측: AirKorea · 기타 공기지표: 출처 혼합'
  );
  assert.equal(gasTimeText(data), '출처별 기준시각 상이');
});

test('observed gas reference shows provider and elapsed hours', () => {
  const observed = gasMeta(
    'WAQI',
    '2026-07-23T04:00:00+09:00',
    'Nearby station',
    'observed'
  );
  const now = new Date('2026-07-23T12:00:00+09:00');

  assert.equal(
    gasItemSourceText(observed, now),
    'WAQI · 인근 참고값 · 8시간 전'
  );
  assert.equal(
    gasAgeText(observed.display_ts, now),
    '8시간 전'
  );
  assert.equal(
    gasSummaryLabel({
      o3: 45,
      gasMeta: { o3: observed },
    }),
    '인근 참고값(WAQI)'
  );
});

test('gas items may mix observed and model metadata independently', () => {
  const data = {
    o3: 45,
    no2: 12,
    gasMeta: {
      o3: gasMeta(
        'AIRKOREA',
        '2026-07-23T05:00:00+09:00',
        'Ozone station',
        'observed'
      ),
      no2: gasMeta(
        'OPENMETEO',
        '2026-07-23T12:00:00+09:00'
      ),
    },
  };
  assert.equal(gasSummaryLabel(data), '출처 혼합');
  assert.equal(
    gasItemSourceText(
      data.gasMeta.o3,
      new Date('2026-07-23T12:00:00+09:00')
    ),
    'AirKorea · 인근 참고값 · 7시간 전'
  );
  assert.equal(
    gasItemSourceText(data.gasMeta.no2),
    'Open-Meteo · 현재 위치 모델값'
  );
});

test('static default source copy and PM-station gas assignment are removed', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'www', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'www', 'app.js'), 'utf8');

  assert.doesNotMatch(html, /hudadak-air 실측 기반/);
  assert.doesNotMatch(app, /gasStationEl\.textContent\s*=\s*airData\.station/);
  assert.match(html, /데이터 출처 확인 불가/);
  const widgetPayload = app.match(/widgetSync\.update\(\{([\s\S]*?)\}\)/)?.[1] || '';
  assert.match(widgetPayload, /pm10_provider:\s*airData\.pm10Meta\?\.provider/);
  assert.match(widgetPayload, /pm25_provider:\s*airData\.pm25Meta\?\.provider/);
  assert.match(widgetPayload, /pm10_display_ts/);
  assert.match(widgetPayload, /pm25_display_ts/);
  assert.doesNotMatch(widgetPayload, /\n\s*provider:/);
  assert.doesNotMatch(widgetPayload, /gasProvider|gasMeta/);
});

test('PM display timestamp uses Seoul time without seconds', () => {
  const formatted = formatSeoulDateTime(
    '2026-07-23T17:00:45+09:00'
  );
  assert.match(formatted, /2026/);
  assert.match(formatted, /오후/);
  assert.match(formatted, /5:00/);
  assert.doesNotMatch(formatted, /:45/);
  assert.equal(formatSeoulDateTime('invalid'), null);
});

test('PM station labels prefer Korean aliases and keep actual providers separate', () => {
  assert.equal(
    pmStationText('Seoul (서울)', 'WAQI', 'waqi_station'),
    'WAQI · 인근 측정소 실측 (서울)'
  );
  assert.equal(
    pmStationText(
      'Jungang-way, Chuncheon-si, Gangwon, South Korea (중앙로 강원)',
      'WAQI',
      'waqi_station'
    ),
    'WAQI · 인근 측정소 실측 (중앙로(강원))'
  );
  assert.equal(
    pmStationText('WAQI INCHEON', 'WAQI', 'waqi_station'),
    'WAQI · 인근 측정소 실측 (WAQI INCHEON)'
  );
  assert.equal(
    pmStationText('', 'WAQI', 'waqi_station'),
    'WAQI · 인근 측정소 실측'
  );
  assert.equal(
    pmStationText('Open-Meteo grid', 'OPENMETEO', 'model'),
    'Open-Meteo · 현재 위치 모델값'
  );
});

test('station formatting keeps original English only when no Korean alias exists', () => {
  assert.equal(stationDisplayName('Seoul (서울)'), '서울');
  assert.equal(
    stationDisplayName('Long English Station (중앙로 강원)'),
    '중앙로(강원)'
  );
  assert.equal(stationDisplayName('WAQI INCHEON'), 'WAQI INCHEON');
});

test('widget synchronization is allowed only for successful current lookups', () => {
  assert.equal(shouldSyncWidget('current', true), true);
  assert.equal(shouldSyncWidget('search', true), false);
  assert.equal(shouldSyncWidget('current', false), false);
});

test('widget header uses full-width rows and DB-only PM refresh', () => {
  const root = path.resolve(__dirname, '..');
  const layout = fs.readFileSync(
    path.join(root, 'android', 'app', 'src', 'main', 'res', 'layout', 'widget_air.xml'),
    'utf8'
  );
  const worker = fs.readFileSync(
    path.join(
      root,
      'android',
      'app',
      'src',
      'main',
      'java',
      'app',
      'netlify',
      'app_hudadak',
      'twa',
      'widget',
      'WidgetUpdateWorker.kt'
    ),
    'utf8'
  );
  const provider = fs.readFileSync(
    path.join(
      root,
      'android',
      'app',
      'src',
      'main',
      'java',
      'app',
      'netlify',
      'app_hudadak',
      'twa',
      'widget',
      'AirWidgetProvider.kt'
    ),
    'utf8'
  );
  const gradle = fs.readFileSync(
    path.join(root, 'android', 'app', 'build.gradle'),
    'utf8'
  );

  const regionView = layout.match(
    /<TextView\s+android:id="@\+id\/widget_region"([\s\S]*?)\/>/
  )?.[1] || '';
  const metadataView = layout.match(
    /<TextView\s+android:id="@\+id\/widget_updated_at"([\s\S]*?)\/>/
  )?.[1] || '';

  assert.match(regionView, /android:layout_width="match_parent"/);
  assert.match(regionView, /android:singleLine="true"/);
  assert.match(regionView, /android:ellipsize="end"/);
  assert.match(metadataView, /android:layout_width="match_parent"/);
  assert.match(metadataView, /android:singleLine="true"/);
  assert.doesNotMatch(layout, /@\+id\/widget_station/);
  assert.doesNotMatch(layout, /@\+id\/widget_source_label/);
  assert.match(provider, /KEY_PM10_DISPLAY_TS/);
  assert.match(provider, /KEY_PM25_DISPLAY_TS/);
  assert.match(provider, /widget_pm10_meta/);
  assert.match(provider, /widget_pm25_meta/);
  assert.match(layout, /@\+id\/widget_pm10_meta/);
  assert.match(layout, /@\+id\/widget_pm25_meta/);
  assert.match(worker, /source=db/);
  assert.match(worker, /pm_fallback=true/);
  assert.match(provider, /KEY_PM10_SOURCE_KIND/);
  assert.match(provider, /KEY_PM25_SOURCE_KIND/);
  assert.match(provider, /항목별 최신값/);
  assert.doesNotMatch(provider, /항목별 최신 실측값/);
  assert.doesNotMatch(worker, /gas_provider|gas_meta/i);
  assert.doesNotMatch(provider, /tokens\.subList|dongIdx/);
  assert.match(gradle, /versionCode\s+2012/);
  assert.match(gradle, /versionName\s+"5\.1\.4"/);
});
