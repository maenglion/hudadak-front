const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const kotlin = (...parts) => read(
  'android', 'app', 'src', 'main', 'java',
  'app', 'netlify', 'app_hudadak', 'twa', ...parts
);

test('WidgetSync payload and native plugin enforce current mode twice', () => {
  const app = read('www', 'app.js');
  const plugin = kotlin('widget', 'WidgetSyncPlugin.kt');

  const payload = app.match(/widgetSync\.update\(\{([\s\S]*?)\}\)/)?.[1] || '';
  assert.match(payload, /mode:\s*['"]current['"]/);
  assert.match(payload, /pm10_provider/);
  assert.match(payload, /pm25_provider/);
  assert.match(payload, /pm10_display_ts/);
  assert.match(payload, /pm25_display_ts/);
  assert.match(plugin, /isCurrentSyncMode\(mode\)/);
  assert.match(plugin, /MODE_NOT_CURRENT/);
  assert.match(plugin, /EMPTY_PM/);
  assert.match(plugin, /WidgetDataStore\.saveObservation/);
  assert.match(plugin, /WidgetWorkScheduler\.ensurePeriodic\(context\)/);
  assert.doesNotMatch(plugin, /nearest\?|enqueueAutomatic/);
});

test('central scheduler uses one-hour UPDATE periodic and split one-time policies', () => {
  const scheduler = kotlin('widget', 'WidgetWorkScheduler.kt');

  assert.match(scheduler, /PERIODIC_WORK_NAME\s*=\s*"hudadak_widget_update"/);
  assert.match(scheduler, /IMMEDIATE_WORK_NAME\s*=\s*"hudadak_widget_update_immediate"/);
  assert.match(scheduler, /PERIODIC_INTERVAL_HOURS\s*=\s*1L/);
  assert.match(scheduler, /PERIODIC_FLEX_MINUTES\s*=\s*15L/);
  assert.match(scheduler, /NetworkType\.CONNECTED/);
  assert.match(scheduler, /BackoffPolicy\.LINEAR,\s*5,\s*TimeUnit\.MINUTES/);
  assert.match(scheduler, /ExistingPeriodicWorkPolicy\.UPDATE/);
  assert.match(scheduler, /enqueueAutomatic[\s\S]*?ExistingWorkPolicy\.KEEP/);
  assert.match(scheduler, /enqueueManual[\s\S]*?ExistingWorkPolicy\.REPLACE/);
  assert.match(scheduler, /MANUAL_DEBOUNCE_MILLIS\s*=\s*10_000L/);
});

test('all self-healing entry points schedule without app-start network duplication', () => {
  const activity = kotlin('MainActivity.kt');
  const provider = kotlin('widget', 'AirWidgetProvider.kt');
  const sync = kotlin('widget', 'WidgetSyncPlugin.kt');
  const replacement = kotlin('widget', 'WidgetPackageReplacedReceiver.kt');
  const manifest = read('android', 'app', 'src', 'main', 'AndroidManifest.xml');

  assert.match(activity, /onCreate[\s\S]*?ensurePeriodic\(this\)/);
  assert.match(activity, /onResume[\s\S]*?ensurePeriodic\(this\)/);
  assert.doesNotMatch(activity, /enqueueAutomatic|nearest\?/);
  assert.match(provider, /onEnabled[\s\S]*?ensurePeriodic[\s\S]*?enqueueAutomatic/);
  assert.match(provider, /onUpdate[\s\S]*?updateWidget[\s\S]*?ensurePeriodic[\s\S]*?enqueueAutomatic/);
  assert.match(provider, /onDisabled[\s\S]*?cancelAll/);
  assert.match(sync, /saveObservation[\s\S]*?ensurePeriodic/);
  assert.match(replacement, /MY_PACKAGE_REPLACED|TRIGGER_PACKAGE_REPLACED/);
  assert.match(manifest, /WidgetPackageReplacedReceiver/);
  assert.match(manifest, /android:exported="false"/);
  assert.doesNotMatch(manifest, /BOOT_COMPLETED/);
});

test('worker is DB-only, current-coordinate-only, cache-free and bounded', () => {
  const worker = kotlin('widget', 'WidgetUpdateWorker.kt');

  assert.match(worker, /WidgetDataStore\.getCoordinates/);
  assert.doesNotMatch(worker, /lastKnownLocation|getLastKnownLocation|requestLocationUpdates/);
  assert.match(worker, /source=db/);
  assert.match(worker, /pm_fallback=true/);
  assert.match(worker, /lookup_mode=current/);
  assert.doesNotMatch(worker, /region_code|region_level/);
  assert.doesNotMatch(worker, /source=auto|gas_meta|gas_provider/i);
  assert.match(worker, /connectTimeout\s*=\s*8000/);
  assert.match(worker, /readTimeout\s*=\s*8000/);
  assert.match(worker, /useCaches\s*=\s*false/);
  assert.match(worker, /"Cache-Control",\s*"no-cache"/);
  assert.match(worker, /HTTP_NO_CONTENT[\s\S]*?NO_CONTENT/);
  assert.match(worker, /isRetryableHttp/);
  assert.match(worker, /shouldRetry\(runAttemptCount\)/);
  assert.match(worker, /tryAcquireAutomaticLease/);
  assert.match(worker, /releaseAutomaticLease/);
  assert.match(worker, /FUTURE_TIMESTAMPS/);
  assert.match(worker, /EMPTY_PM/);
  assert.match(worker, /source_kind[\s\S]*?source/);
});

test('widget fallback, manual refresh and diagnostics are wired', () => {
  const info = read('android', 'app', 'src', 'main', 'res', 'xml', 'widget_air_info.xml');
  const layout = read('android', 'app', 'src', 'main', 'res', 'layout', 'widget_air.xml');
  const provider = kotlin('widget', 'AirWidgetProvider.kt');
  const store = kotlin('widget', 'WidgetDataStore.kt');

  assert.match(info, /android:updatePeriodMillis="3600000"/);
  assert.match(layout, /@\+id\/widget_refresh/);
  assert.match(provider, /ACTION_MANUAL_REFRESH[\s\S]*?enqueueManual/);
  assert.match(provider, /getActivity[\s\S]*?widget_header/);
  assert.match(provider, /getBroadcast[\s\S]*?widget_refresh/);
  assert.match(provider, /setContentDescription/);

  [
    'last_worker_started_at',
    'last_api_requested_at',
    'last_api_response_at',
    'last_http_status',
    'last_successful_check_at',
    'last_saved_display_ts',
    'last_update_origin',
    'last_result',
    'last_failure_reason',
    'consecutive_failure_count',
    'last_run_attempt_count',
  ].forEach(key => assert.match(store, new RegExp(`"${key}"`)));
});

test('null observations remove stale preference keys and unchanged data skips render', () => {
  const store = kotlin('widget', 'WidgetDataStore.kt');

  assert.match(store, /putNullableFloat\(KEY_PM10/);
  assert.match(store, /putNullableFloat\(KEY_PM25/);
  assert.match(store, /putNullableString\(KEY_PM10_PROVIDER/);
  assert.match(store, /putNullableString\(KEY_PM25_PROVIDER/);
  assert.match(store, /putNullableString\(KEY_PM10_DISPLAY_TS/);
  assert.match(store, /putNullableString\(KEY_PM25_DISPLAY_TS/);
  assert.match(store, /pollutantString\(values,\s*KEY_PM10_PROVIDER,\s*KEY_PROVIDER\)/);
  assert.match(store, /isSameObservation[\s\S]*?SaveResult\.UNCHANGED/);
  assert.match(store, /SaveResult\.UPDATED[\s\S]*?refreshAllWidgets/);
});
