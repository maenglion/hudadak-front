const BOT_UA = /facebookexternalhit|twitterbot|slackbot|discordbot|telegrambot|linkedinbot|whatsapp|line-poker|naverbot|yeti|kakaotalk-scrap/i;

const API_BASE = 'https://air-api-350359872967.asia-northeast3.run.app';

export default async (request, context) => {
  const ua = request.headers.get('user-agent') || '';
  const url = new URL(request.url);

  // bypass 파라미터가 있으면 통과 (리다이렉트 루프 방지)
  if (url.searchParams.has('_og')) {
    return context.next();
  }

  // 봇이 아니면 그냥 통과 (일반 사용자)
  if (!BOT_UA.test(ua)) {
    return context.next();
  }

  // lat/lon 파라미터 확인
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const queryName = url.searchParams.get('q');

  if (!lat || !lon) {
    return context.next();
  }

  // API에서 대기질 + 주소 가져오기
  let regionName = '내 주변';
  let pm10 = '--';
  let pm25 = '--';
  let grade = '';

  try {
    // 대기질 조회
    const airRes = await fetch(`${API_BASE}/nearest?lat=${lat}&lon=${lon}&source=auto`);
    if (airRes.ok) {
      const air = await airRes.json();
      pm10 = air.pm10 ?? '--';
      pm25 = air.pm25 ?? '--';

      // 등급 판별
      const g25 = pm25 <= 15 ? '좋음' : pm25 <= 35 ? '보통' : pm25 <= 75 ? '나쁨' : '매우나쁨';
      grade = g25;
    }

    // 주소 조회
    const geoRes = await fetch(`${API_BASE}/geo/reverse?lat=${lat}&lon=${lon}`);
    if (geoRes.ok) {
      const geo = await geoRes.json();
      regionName = geo.address || '내 주변';
    }
  } catch (e) {
    console.error('Edge function fetch error:', e);
  }

  const ogTitle = `${queryName || regionName} 미세먼지 - 후다닥`;
  const ogDesc = `PM10: ${pm10}µg/m³ · PM2.5: ${pm25}µg/m³ (${grade}) — 지금 바로 확인하세요!`;
  const ogImage = `${url.origin}/og2.png`;
  const ogUrl = url.toString();

  // 리다이렉트용 URL (_og 붙여서 루프 방지)
  const redirectUrl = new URL(url.toString());
  redirectUrl.searchParams.set('_og', '1');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${ogTitle}">
  <meta property="og:description" content="${ogDesc}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:url" content="${ogUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${ogTitle}">
  <meta name="twitter:description" content="${ogDesc}">
  <meta name="twitter:image" content="${ogImage}">
  <title>${ogTitle}</title>
  <meta http-equiv="refresh" content="0;url=${redirectUrl.toString()}">
</head>
<body></body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
};

export const config = {
  path: "/*",
};