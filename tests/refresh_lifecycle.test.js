const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createRefreshCoordinator,
  canStartPullRefresh,
  shouldTriggerPullRefresh,
  shouldSyncWidget,
  buildNearestUrl,
  normalizeRegionScope,
} = require('../www/app.js');

function createFakeTimers() {
  let nextId = 1;
  const timers = new Map();
  return {
    timers,
    setIntervalFn(callback, ms) {
      const id = nextId++;
      timers.set(id, { callback, ms });
      return id;
    },
    clearIntervalFn(id) {
      timers.delete(id);
    },
  };
}

test('initial lookup runs exactly once and starts the 30-minute interval', async () => {
  let updates = 0;
  const timers = createFakeTimers();
  const coordinator = createRefreshCoordinator({
    performUpdate: async () => { updates += 1; return true; },
    getGpsCoords: async () => ({ lat: 37.1, lon: 126.1 }),
    isVisible: () => true,
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
  });

  await coordinator.initialize();

  assert.equal(updates, 1);
  assert.equal(timers.timers.size, 1);
  assert.equal([...timers.timers.values()][0].ms, 30 * 60 * 1000);
});

test('foreground refreshes after 60 seconds and coalesces native/web events', async () => {
  let now = 1000;
  let updates = 0;
  const timers = createFakeTimers();
  const coordinator = createRefreshCoordinator({
    performUpdate: async () => { updates += 1; return true; },
    getGpsCoords: async () => ({ lat: 37.2, lon: 126.2 }),
    now: () => now,
    isVisible: () => true,
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
  });
  await coordinator.initialize();

  now += 61 * 1000;
  await Promise.all([
    coordinator.handleVisibility(true, 'appStateChange'),
    coordinator.handleVisibility(true, 'pageshow'),
    coordinator.handleVisibility(true, 'visibilitychange'),
  ]);
  assert.equal(updates, 2);

  now += 1000;
  await coordinator.handleVisibility(true, 'resume');
  assert.equal(updates, 2);
});

test('background stops interval and foreground restarts one interval', async () => {
  let now = 1000;
  let visible = true;
  let updates = 0;
  const timers = createFakeTimers();
  const coordinator = createRefreshCoordinator({
    performUpdate: async () => { updates += 1; return true; },
    getGpsCoords: async () => ({ lat: 37.3, lon: 126.3 }),
    now: () => now,
    isVisible: () => visible,
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
  });
  await coordinator.initialize();
  assert.equal(timers.timers.size, 1);

  visible = false;
  await coordinator.handleVisibility(false, 'appStateChange');
  assert.equal(timers.timers.size, 0);

  visible = true;
  now += 61 * 1000;
  await coordinator.handleVisibility(true, 'appStateChange');
  assert.equal(updates, 2);
  assert.equal(timers.timers.size, 1);
});

test('visible interval refreshes while hidden interval does not exist', async () => {
  let now = 1000;
  let visible = true;
  let updates = 0;
  const timers = createFakeTimers();
  const coordinator = createRefreshCoordinator({
    performUpdate: async () => { updates += 1; return true; },
    getGpsCoords: async () => ({ lat: 37.4, lon: 126.4 }),
    now: () => now,
    isVisible: () => visible,
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
  });
  await coordinator.initialize();
  const intervalCallback = [...timers.timers.values()][0].callback;
  now += 30 * 60 * 1000;
  intervalCallback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(updates, 2);

  visible = false;
  await coordinator.handleVisibility(false, 'visibilitychange');
  assert.equal(timers.timers.size, 0);
});

test('address mode preserves searched coordinates without asking for GPS', async () => {
  let gpsCalls = 0;
  let received = null;
  let widgetSyncCalls = 0;
  const coordinator = createRefreshCoordinator({
    performUpdate: async (coords, context) => {
      received = coords;
      if (shouldSyncWidget(context.mode)) widgetSyncCalls += 1;
      return true;
    },
    getGpsCoords: async () => {
      gpsCalls += 1;
      return { lat: 1, lon: 2 };
    },
  });
  coordinator.setLookupMode('search', { lat: 37.3925, lon: 126.6399 });

  await coordinator.refresh({ manual: true });

  assert.deepEqual(received, { lat: 37.3925, lon: 126.6399 });
  assert.equal(gpsCalls, 0);
  assert.equal(widgetSyncCalls, 0);
  assert.equal(coordinator.getState().lastLookupWasManual, true);
});

test('search-mode foreground refresh never synchronizes the widget', async () => {
  let now = 1000;
  let widgetSyncCalls = 0;
  const contexts = [];
  const coordinator = createRefreshCoordinator({
    performUpdate: async (_coords, context) => {
      contexts.push(context);
      if (shouldSyncWidget(context.mode)) widgetSyncCalls += 1;
      return true;
    },
    getGpsCoords: async () => {
      throw new Error('search mode must not request GPS');
    },
    now: () => now,
  });
  coordinator.setLookupMode(
    'search',
    { lat: 37.8315, lon: 127.5090 },
    {
      regionLevel: 'sigungu',
      regionCode: '41820',
      regionName: '경기도 가평군',
    }
  );

  await coordinator.refresh({ manual: true, reason: 'address-refresh' });
  now += 61 * 1000;
  await coordinator.handleVisibility(true, 'appStateChange');

  assert.equal(widgetSyncCalls, 0);
  assert.deepEqual(contexts.map(context => context.mode), ['search', 'search']);
  assert.deepEqual(contexts.at(-1).regionScope, {
    regionLevel: 'sigungu',
    regionCode: '41820',
    regionName: '경기도 가평군',
  });
  coordinator.stopInterval();
});

test('search nearest URL sends the official administrative scope', () => {
  const url = new URL(buildNearestUrl(
    'https://example.test',
    37.2635,
    127.0287,
    'auto',
    {
      mode: 'search',
      regionScope: {
        regionLevel: 'sigungu',
        regionCode: '41110',
        regionName: '경기도 수원시',
      },
    }
  ));

  assert.equal(url.searchParams.get('lookup_mode'), 'search');
  assert.equal(url.searchParams.get('region_level'), 'sigungu');
  assert.equal(url.searchParams.get('region_code'), '41110');
  assert.equal(url.searchParams.get('region_name'), '경기도 수원시');
  assert.equal(url.searchParams.get('source'), 'auto');
});

test('current nearest URL never carries a stale search region', () => {
  const url = new URL(buildNearestUrl(
    'https://example.test',
    37.4134,
    126.6177,
    'auto',
    {
      mode: 'current',
      regionScope: {
        regionLevel: 'sigungu',
        regionCode: '41820',
      },
    }
  ));

  assert.equal(url.searchParams.get('lookup_mode'), 'current');
  assert.equal(url.searchParams.has('region_level'), false);
  assert.equal(url.searchParams.has('region_code'), false);
});

test('invalid search scope is rejected before a nearest request', () => {
  assert.equal(normalizeRegionScope({
    region_level: 'sido',
    region_code: '50',
  }).regionCode, '50');
  assert.throws(
    () => buildNearestUrl(
      'https://example.test',
      37,
      127,
      'auto',
      { mode: 'search' }
    ),
    /administrative region/
  );
});

test('search lookup changes mode only after a successful response', async () => {
  let shouldSucceed = false;
  const coordinator = createRefreshCoordinator({
    performUpdate: async () => shouldSucceed,
    getGpsCoords: async () => ({ lat: 37.4, lon: 126.7 }),
  });

  const failed = await coordinator.lookupSearchLocation({
    lat: 37.8315,
    lon: 127.5090,
  });
  assert.equal(failed.success, false);
  assert.equal(coordinator.getState().lookupMode, 'current');
  assert.equal(coordinator.getState().currentCoords, null);

  shouldSucceed = true;
  const succeeded = await coordinator.lookupSearchLocation({
    lat: 37.8315,
    lon: 127.5090,
  });
  assert.equal(succeeded.success, true);
  assert.equal(coordinator.getState().lookupMode, 'search');
  assert.deepEqual(
    coordinator.getState().currentCoords,
    { lat: 37.8315, lon: 127.5090 }
  );
});

test('GPS failure keeps the previous search result and does not update', async () => {
  let updates = 0;
  const coordinator = createRefreshCoordinator({
    performUpdate: async () => {
      updates += 1;
      return true;
    },
    getGpsCoords: async () => {
      throw new Error('GPS unavailable');
    },
  });
  coordinator.setLookupMode('search', { lat: 37.8315, lon: 127.5090 });

  const result = await coordinator.returnToCurrentLocation({
    reason: 'return-button',
  });

  assert.equal(result.success, false);
  assert.equal(updates, 0);
  assert.equal(coordinator.getState().lookupMode, 'search');
  assert.deepEqual(
    coordinator.getState().currentCoords,
    { lat: 37.8315, lon: 127.5090 }
  );
});

test('GPS failure falls back to the last successful current coordinates', async () => {
  let failGps = false;
  const received = [];
  const coordinator = createRefreshCoordinator({
    performUpdate: async (coords, context) => {
      received.push({ coords: { ...coords }, mode: context.mode });
      return true;
    },
    getGpsCoords: async () => {
      if (failGps) throw new Error('GPS unavailable');
      return { lat: 37.4134, lon: 126.6177 };
    },
  });
  await coordinator.initialize();
  await coordinator.lookupSearchLocation(
    { lat: 37.8315, lon: 127.5090 },
    { address: '경기도 가평군' }
  );
  failGps = true;

  const result = await coordinator.returnToCurrentLocation({
    reason: 'pull-to-refresh',
  });

  assert.equal(result.success, true);
  assert.deepEqual(received.at(-1), {
    coords: { lat: 37.4134, lon: 126.6177 },
    mode: 'current',
  });
  assert.equal(coordinator.getState().lookupMode, 'current');
  coordinator.stopInterval();
});

test('successful return uses fresh GPS and permits current-mode widget sync', async () => {
  let widgetSyncCalls = 0;
  let received = null;
  const coordinator = createRefreshCoordinator({
    performUpdate: async (coords, context) => {
      received = { coords, context };
      if (shouldSyncWidget(context.mode)) widgetSyncCalls += 1;
      return true;
    },
    getGpsCoords: async () => ({ lat: 37.3925, lon: 126.6399 }),
  });
  coordinator.setLookupMode('search', { lat: 37.8315, lon: 127.5090 });

  const result = await coordinator.returnToCurrentLocation({
    reason: 'return-button',
  });

  assert.equal(result.success, true);
  assert.deepEqual(received.coords, { lat: 37.3925, lon: 126.6399 });
  assert.equal(received.context.mode, 'current');
  assert.equal(widgetSyncCalls, 1);
  assert.equal(coordinator.getState().lookupMode, 'current');
});

test('successful current lookup synchronizes the widget once', async () => {
  let widgetSyncCalls = 0;
  const coordinator = createRefreshCoordinator({
    performUpdate: async (_coords, context) => {
      if (shouldSyncWidget(context.mode)) widgetSyncCalls += 1;
      return true;
    },
    getGpsCoords: async () => ({ lat: 37.3925, lon: 126.6399 }),
  });

  await coordinator.initialize();

  assert.equal(widgetSyncCalls, 1);
  coordinator.stopInterval();
});

test('current-location mode reacquires GPS and falls back to saved coordinates', async () => {
  let failGps = false;
  const received = [];
  const coordinator = createRefreshCoordinator({
    performUpdate: async coords => { received.push({ ...coords }); return true; },
    getGpsCoords: async () => {
      if (failGps) throw new Error('GPS unavailable');
      return { lat: 37.5, lon: 126.5 };
    },
  });
  coordinator.setLookupMode('current', { lat: 37.4, lon: 126.4 });
  await coordinator.refresh({ manual: true });
  failGps = true;
  await coordinator.refresh({ manual: true });

  assert.deepEqual(received, [
    { lat: 37.5, lon: 126.5 },
    { lat: 37.5, lon: 126.5 },
  ]);
});

test('manual refresh ignores automatic throttle', async () => {
  let now = 1000;
  let updates = 0;
  const coordinator = createRefreshCoordinator({
    performUpdate: async () => { updates += 1; return true; },
    getGpsCoords: async () => ({ lat: 37.6, lon: 126.6 }),
    now: () => now,
  });
  await coordinator.initialize();
  await coordinator.refresh({ reason: 'resume' });
  await coordinator.refresh({ manual: true, reason: 'pull-to-refresh' });

  assert.equal(updates, 2);
  coordinator.stopInterval();
});

test('in-flight refresh blocks consecutive pull requests', async () => {
  let releaseUpdate;
  let updates = 0;
  const pending = new Promise(resolve => { releaseUpdate = resolve; });
  const coordinator = createRefreshCoordinator({
    performUpdate: async () => {
      updates += 1;
      await pending;
      return true;
    },
    getGpsCoords: async () => ({ lat: 37.7, lon: 126.7 }),
  });
  const first = coordinator.refresh({ manual: true });
  await new Promise(resolve => setImmediate(resolve));
  const second = await coordinator.refresh({ manual: true });
  releaseUpdate();
  await first;

  assert.equal(updates, 1);
  assert.equal(second.skipped, 'in-flight');
});

test('failed automatic/manual refresh retains last successful timestamp', async () => {
  let now = 1000;
  let shouldSucceed = true;
  const contexts = [];
  const coordinator = createRefreshCoordinator({
    performUpdate: async (_coords, context) => {
      contexts.push(context);
      return shouldSucceed;
    },
    getGpsCoords: async () => ({ lat: 37.8, lon: 126.8 }),
    now: () => now,
  });
  await coordinator.initialize();
  const successAt = coordinator.getState().lastSuccessfulRefreshAt;
  shouldSucceed = false;
  now += 61 * 1000;
  await coordinator.handleVisibility(true, 'resume');
  await coordinator.refresh({ manual: true, reason: 'pull-to-refresh' });

  assert.equal(coordinator.getState().lastSuccessfulRefreshAt, successAt);
  assert.equal(contexts[1].initial, false);
  assert.equal(contexts[2].manual, true);
  coordinator.stopInterval();
});

test('pull-to-refresh only triggers at top, beyond threshold, and when idle', () => {
  assert.equal(canStartPullRefresh({
    atTop: true,
    inProgress: false,
    excluded: false,
  }), true);
  assert.equal(canStartPullRefresh({
    atTop: false,
    inProgress: false,
    excluded: false,
  }), false);
  assert.equal(shouldTriggerPullRefresh({
    atTop: true,
    pullDistance: 69,
    inProgress: false,
  }), false);
  assert.equal(shouldTriggerPullRefresh({
    atTop: true,
    pullDistance: 70,
    inProgress: false,
  }), true);
  assert.equal(shouldTriggerPullRefresh({
    atTop: false,
    pullDistance: 100,
    inProgress: false,
  }), false);
  assert.equal(shouldTriggerPullRefresh({
    atTop: true,
    pullDistance: 100,
    inProgress: true,
  }), false);
});

test('runtime wiring preserves existing UI and disables nearest HTTP cache', () => {
  const app = fs.readFileSync(
    path.join(__dirname, '..', 'www', 'app.js'),
    'utf8'
  );
  assert.match(app, /buildNearestUrl\([\s\S]*?'auto'[\s\S]*?\{ mode, regionScope \}/);
  assert.match(app, /buildNearestUrl\([\s\S]*?'model'[\s\S]*?\{ mode, regionScope \}/);
  assert.equal(
    (app.match(/dedupFetch\(url, \{ cache: 'no-store' \}\)/g) || []).length >= 2,
    true
  );
  assert.match(app, /region_level/);
  assert.match(app, /region_code/);
  assert.match(app, /if \(!preserveExisting\) \{\s*drawGauge\('PM10', null/);
  assert.match(
    app,
    /if \(shouldSyncWidget\(mode\)\) \{\s*syncWidget\(lat, lon, regionName, airData\)/
  );
  assert.match(app, /appStateChange/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /pageshow/);
  assert.match(app, /touchmove[\s\S]*?\{ passive: false \}/);
});
