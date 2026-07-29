const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'www', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'www', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'www', 'styles.css'), 'utf8');

test('all search exit paths close and clear suggestions', () => {
  const closeBody = app.match(
    /function closeSuggestions\([^)]*\) \{([\s\S]*?)\n  \}/
  )?.[1] || '';
  assert.match(closeBody, /style\.display = 'none'/);
  assert.match(closeBody, /innerHTML = ''/);
  assert.match(closeBody, /inputEl\?\.blur\(\)/);

  assert.match(
    app,
    /li\.onclick = \(\) => \{[\s\S]*?closeSuggestions\(\{ blur: true \}\);[\s\S]*?refreshSearchCoords/
  );
  assert.match(
    app,
    /searchBtn\.addEventListener\('click',[\s\S]*?closeSuggestions\(\{ blur: true \}\)/
  );
  assert.match(
    app,
    /e\.key === 'Enter'[\s\S]*?closeSuggestions\(\{ blur: true \}\)/
  );
  assert.match(
    app,
    /document\.addEventListener\('pointerdown'[\s\S]*?!event\.target\.closest\?\.\('#search'\)[\s\S]*?closeSuggestions\(\)/
  );
  assert.match(
    app,
    /shareResultBtn\.addEventListener\('click'[\s\S]*?closeSuggestions\(\{ blur: true \}\)/
  );
  assert.match(app, /if \(!inputEl\.value\.trim\(\)\) closeSuggestions\(\)/);
  assert.match(
    app,
    /async function searchByAddress\(q\) \{\s*closeSuggestions\(\{ blur: true \}\)/
  );
});

test('stale autocomplete responses cannot reopen a closed suggestion list', () => {
  assert.match(app, /let suggestionsGeneration = 0/);
  assert.match(app, /suggestionsGeneration \+= 1/);
  assert.match(
    app,
    /if \(requestGeneration !== suggestionsGeneration\) return/
  );
});

test('share action row is separate from the normal-flow suggestion list', () => {
  const suggestionIndex = html.indexOf('id="suggestions"');
  const searchCloseIndex = html.indexOf('</section>', suggestionIndex);
  const shareIndex = html.indexOf('id="shareActionRow"');
  assert.ok(suggestionIndex >= 0);
  assert.ok(searchCloseIndex > suggestionIndex);
  assert.ok(shareIndex > searchCloseIndex);
  assert.match(html, /id="shareResultBtn"[\s\S]*?<span>결과 공유<\/span>/);

  const suggestionCss = css.match(/#suggestions \{([\s\S]*?)\}/)?.[1] || '';
  assert.match(suggestionCss, /position:\s*relative/);
  assert.match(suggestionCss, /width:\s*100%/);
  assert.match(css, /\.share-result-btn \{[\s\S]*?min-height:\s*46px/);
});

test('station text is compact and limited to two lines', () => {
  const stationCss = css.match(/\.station-info \{([\s\S]*?)\}/)?.[1] || '';
  assert.match(stationCss, /font-size:\s*0\.78rem/);
  assert.match(stationCss, /-webkit-line-clamp:\s*2/);
  assert.match(stationCss, /overflow:\s*hidden/);
  assert.match(css, /\.station-provider-badge \{/);
});

test('updateAll receives an explicit lookup mode and gates widget sync', () => {
  assert.match(
    app,
    /async function updateAll\([\s\S]*?mode = 'current',[\s\S]*?preserveExisting = false,[\s\S]*?regionScope = null/
  );
  assert.match(
    app,
    /performUpdate:[\s\S]*?mode: context\.mode,[\s\S]*?regionScope: context\.regionScope/
  );
  assert.match(
    app,
    /if \(shouldSyncWidget\(mode\)\) \{\s*syncWidget/
  );
});

test('return-to-current pill is placed between settings and location metadata', () => {
  const settingsIndex = html.indexOf('id="settingsBtn"');
  const returnIndex = html.indexOf('id="returnLocationWrap"');
  const regionIndex = html.indexOf('id="region"');
  assert.ok(settingsIndex >= 0);
  assert.ok(returnIndex > settingsIndex);
  assert.ok(regionIndex > returnIndex);
  assert.match(
    html,
    /id="returnLocationWrap"[\s\S]*?hidden[\s\S]*?검색 위치:[\s\S]*?id="searchLocationAddress"[\s\S]*?id="returnToCurrentBtn"[\s\S]*?내 위치로/
  );
});

test('return pill uses the supplied theme-specific SVG assets unchanged', () => {
  const lightIcon = fs.readFileSync(
    path.join(root, 'www', 'img', 'location-back-light-blue.svg'),
    'utf8'
  );
  const darkIcon = fs.readFileSync(
    path.join(root, 'www', 'img', 'location-back-white.svg'),
    'utf8'
  );
  assert.match(html, /src="img\/location-back-light-blue\.svg"/);
  assert.match(html, /src="img\/location-back-white\.svg"/);
  assert.match(lightIcon, /fill="#9DD9FF"/);
  assert.match(lightIcon, /stroke="#9DD9FF"/);
  assert.match(darkIcon, /fill="white"/);
  assert.match(darkIcon, /stroke="white"/);
});

test('return pill is compact, themed, and swaps its icon immediately', () => {
  const buttonCss = css.match(
    /\.return-location-btn \{([\s\S]*?)\}/
  )?.[1] || '';
  assert.match(buttonCss, /min-height:\s*32px/);
  assert.match(buttonCss, /padding:\s*0 14px/);
  assert.match(buttonCss, /border-radius:\s*999px/);
  assert.match(buttonCss, /font-size:\s*0\.84rem/);
  assert.match(buttonCss, /gap:\s*6px/);
  assert.match(buttonCss, /background:\s*var\(--card-color\)/);
  assert.match(
    css,
    /\.return-location-wrap \{[\s\S]*?background:\s*var\(--subtle-bg-color\)/
  );
  assert.match(buttonCss, /color:\s*var\(--light-text-color\)/);
  assert.match(css, /\.return-location-icon \{[\s\S]*?width:\s*17px/);
  assert.match(
    css,
    /body\.dark-mode \.return-location-icon-light \{\s*display:\s*none/
  );
  assert.match(
    css,
    /body\.dark-mode \.return-location-icon-dark \{\s*display:\s*block/
  );
  assert.match(css, /\.return-location-btn:hover/);
  assert.match(css, /\.return-location-btn:active/);
  assert.match(css, /\.return-location-btn:focus-visible/);
});

test('button and search-mode pull share returnToCurrentLocation', () => {
  assert.match(
    app,
    /returnToCurrentBtn\.addEventListener\('click',[\s\S]*?returnToCurrentLocation\('return-button'\)/
  );
  assert.match(
    app,
    /const result = await returnToCurrentLocation\('pull-to-refresh'\)/
  );
  assert.doesNotMatch(
    app,
    /returnToCurrentBtn\.addEventListener\('click'[\s\S]{0,300}?getFreshGpsCoords/
  );
});

test('return success clears search state while failure preserves it', () => {
  assert.match(
    app,
    /const result = await refreshCoordinator\.returnToCurrentLocation[\s\S]*?if \(result\.success\) \{[\s\S]*?inputEl\.value = ''[\s\S]*?setLookupModeUi\('current'\)/
  );
  assert.match(
    app,
    /현재 위치를 확인하지 못했습니다\. 검색 결과를 그대로 유지합니다\./
  );
  assert.match(
    app,
    /if \(returnLocationWrap\) returnLocationWrap\.hidden = !isSearch/
  );
});

test('pull onboarding follows the widget prompt and persists completion', () => {
  assert.match(html, /id="pullOnboardingOverlay"[\s\S]*?hidden/);
  assert.match(html, /내 위치로 돌아가기/);
  assert.match(
    html,
    /검색한 지역을 보고 있어도[\s\S]*?화면을 아래로 당기면 현재 위치로 돌아와[\s\S]*?최신 대기질 정보를 불러옵니다/
  );
  assert.match(html, /id="pullOnboardingTry"[\s\S]*?직접 해보기/);
  assert.match(html, /id="pullOnboardingDone"[\s\S]*?알겠어요/);
  assert.match(html, /id="replayPullOnboardingBtn"[\s\S]*?사용 방법 다시 보기/);
  assert.match(
    app,
    /localStorage\.setItem\('onboardingPullToCurrentVersion', '1'\)/
  );
  assert.match(
    app,
    /function closeWidgetPrompt\(\) \{[\s\S]*?maybeShowPullOnboarding\(250\)/
  );
  assert.match(
    app,
    /replayPullOnboardingBtn\.addEventListener\('click'[\s\S]*?openPullOnboarding\(\{ force: true \}\)/
  );
});

test('onboarding blocks gestures, handles back, and respects reduced motion', () => {
  const overlayHtml = html.match(
    /<div\s+id="pullOnboardingOverlay"([\s\S]*?)<\/div>\s*<\/div>/
  )?.[0] || '';
  assert.doesNotMatch(overlayHtml, /<img|\.png|lottie/i);
  assert.match(overlayHtml, /<svg/);
  assert.match(css, /\.pull-onboarding-overlay \{[\s\S]*?rgba\(0, 0, 0, 0\.68\)/);
  assert.match(css, /body\.pull-onboarding-open \{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(app, /pullOnboardingOverlay\.addEventListener\('touchmove'/);
  assert.match(app, /appPlugin\.addListener\('backButton'/);
  assert.match(app, /\.pull-onboarding-overlay/);
});

test('manual pull always returns to current mode and can finish practice', () => {
  assert.match(
    app,
    /const result = await returnToCurrentLocation\('pull-to-refresh'\)/
  );
  assert.match(
    app,
    /if \(onboardingTryActive\)[\s\S]*?completePullOnboarding\(\)/
  );
  assert.doesNotMatch(
    app,
    /isSearchMode[\s\S]{0,200}refreshCoordinator\.refresh/
  );
});
