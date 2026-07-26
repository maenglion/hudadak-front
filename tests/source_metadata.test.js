const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  normalizeResponse,
  gasSummaryLabel,
  gasItemSourceText,
  dataSourceText,
  pmStationText,
  stationDisplayName,
  shouldSyncWidget,
  formatSeoulDateTime,
  gasTimeText,
} = require('../www/app.js');

function gasMeta(provider, displayTs, station = null) {
  return {
    provider,
    source_kind: 'model',
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
});

test('WAQI PM and Open-Meteo gases never share a provider label', () => {
  const data = {
    provider: 'WAQI',
    sourceKind: 'waqi_station',
    o3: 45,
    gasProvider: 'OPENMETEO',
    gasMeta: { o3: gasMeta('OPENMETEO', '2026-07-23T11:00:00+09:00') },
  };

  assert.equal(dataSourceText(data), '미세먼지 실측: WAQI · 기타 공기지표: Open-Meteo 모델');
  assert.equal(gasSummaryLabel(data), '모델(Open-Meteo)');
  assert.equal(gasItemSourceText(data.gasMeta.o3), '출처: Open-Meteo 모델');
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

  assert.equal(dataSourceText(data), '미세먼지 실측: AirKorea · 기타 공기지표: OpenWeather 모델');
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
    '미세먼지 예측: Open-Meteo · 기타 공기지표: Open-Meteo 모델'
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
  assert.equal(gasItemSourceText(data.gasMeta.so2), '출처: Open-Meteo 모델');
  assert.equal(gasItemSourceText(data.gasMeta.co), '출처: OpenWeather 모델');
  assert.equal(
    dataSourceText(data),
    '미세먼지 실측: AirKorea · 기타 공기지표: Open-Meteo·OpenWeather 모델'
  );
  assert.equal(gasTimeText(data), '출처별 기준시각 상이');
});

test('static default source copy and PM-station gas assignment are removed', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'www', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'www', 'app.js'), 'utf8');

  assert.doesNotMatch(html, /hudadak-air 실측 기반/);
  assert.doesNotMatch(app, /gasStationEl\.textContent\s*=\s*airData\.station/);
  assert.match(html, /데이터 출처 확인 불가/);
  const widgetPayload = app.match(/widgetSync\.update\(\{([\s\S]*?)\}\)/)?.[1] || '';
  assert.match(widgetPayload, /provider:\s*airData\.provider/);
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
    '측정소: 서울 · WAQI'
  );
  assert.equal(
    pmStationText(
      'Jungang-way, Chuncheon-si, Gangwon, South Korea (중앙로 강원)',
      'WAQI',
      'waqi_station'
    ),
    '측정소: 중앙로(강원) · WAQI'
  );
  assert.equal(
    pmStationText('WAQI INCHEON', 'WAQI', 'waqi_station'),
    '측정소: WAQI INCHEON · WAQI'
  );
  assert.equal(
    pmStationText('', 'WAQI', 'waqi_station'),
    '측정소: 정보 없음'
  );
  assert.equal(
    pmStationText('Open-Meteo grid', 'OPENMETEO', 'model'),
    '예측 데이터: Open-Meteo'
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
  assert.match(provider, /topMetadataLabel/);
  assert.doesNotMatch(provider, /KEY_STATION/);
  assert.match(worker, /source=db/);
  assert.doesNotMatch(worker, /gas_provider|gas_meta/i);
  assert.doesNotMatch(provider, /tokens\.subList|dongIdx/);
  assert.match(gradle, /versionCode\s+2010/);
  assert.match(gradle, /versionName\s+"5\.1\.3"/);
});
