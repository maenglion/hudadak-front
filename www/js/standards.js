// standards.js

// 1) 공통 8색 팔레트 (CSS랑 1:1)
const HUDADAK_PALETTE = {
  excellent: { top: '#23a0e5', bottom: '#a0cdf8' },
  good:      { top: '#30b8de', bottom: '#a0e6d9' },
  fair:      { top: '#3dd392', bottom: '#bbe596' },
  moderate:  { top: '#85af36', bottom: '#ded06d' },
  poor:      { top: '#db9f3c', bottom: '#e6d55c' },
  unhealthy: { top: '#df7f59', bottom: '#e4bb8b' },
  severe:    { top: '#a44960', bottom: '#ffbba7' },
  hazardous: { top: '#71395e', bottom: '#d4a5a5' },
};

export const STANDARDS = {
  // ✅ 1. 국내 4단계 → 8색 중 4개만
  KOR: {
    code: 'KOR',
    label: '대한민국 CAI (24h)',
    breaks: {
      pm10: [30, 80, 150],
      pm25: [15, 35, 75],
    },
    bands: [
      {
        key: 'good',
        label: '좋음',
        gradient: HUDADAK_PALETTE.good,
      },
      {
        key: 'moderate',
        label: '보통',
        gradient: HUDADAK_PALETTE.moderate,
      },
      {
        key: 'unhealthy',
        label: '나쁨',
        gradient: HUDADAK_PALETTE.unhealthy,
      },
      {
        key: 'hazardous',
        label: '매우 나쁨',
        gradient: HUDADAK_PALETTE.hazardous,
      },
    ],
  },

  // ✅ 2. WHO 8단계만 남김 (필요하면 이름만 보여주는 용도)
  WHO8: {
    code: 'WHO8',
    label: 'WHO 2021 (24h) · 8단계',
    breaks: {
      pm25: [5, 10, 15, 25, 37.5, 50, 75],
      pm10: [15, 30, 45, 50, 75, 100, 150],
    },
    bands: [
      { key: 'excellent', label: '매우 좋음',   gradient: HUDADAK_PALETTE.excellent },
      { key: 'good',      label: '좋음',       gradient: HUDADAK_PALETTE.good },
      { key: 'fair',      label: '양호',       gradient: HUDADAK_PALETTE.fair },
      { key: 'moderate',  label: '주의',       gradient: HUDADAK_PALETTE.moderate },
      { key: 'poor',      label: '나쁨',       gradient: HUDADAK_PALETTE.poor },
      { key: 'unhealthy', label: '매우 나쁨',  gradient: HUDADAK_PALETTE.unhealthy },
      { key: 'severe',    label: '위험',       gradient: HUDADAK_PALETTE.severe },
      { key: 'hazardous', label: '최악',       gradient: HUDADAK_PALETTE.hazardous },
    ],
  },

  // ✅ 3. 우리꺼 이름으로 쓰는 8단계
  HUDADAK8: {
    code: 'HUDADAK8',
    label: '후다닥 8단계',
    // 임시로 WHO8 컷. 나중에 "총점 구간" 되면 여기만 바꿔.
    breaks: {
      pm25: [5, 10, 15, 25, 37.5, 50, 75],
      pm10: [15, 30, 45, 50, 75, 100, 150],
      // score: [100, 200, 300, 400, 500, 600, 700],
    },
    bands: [
      { key: 'excellent', label: '청정',       gradient: HUDADAK_PALETTE.excellent },
      { key: 'good',      label: '좋음',       gradient: HUDADAK_PALETTE.good },
      { key: 'fair',      label: '양호',       gradient: HUDADAK_PALETTE.fair },
      { key: 'moderate',  label: '보통',       gradient: HUDADAK_PALETTE.moderate },
      { key: 'poor',      label: '나쁨(주의)',  gradient: HUDADAK_PALETTE.poor },
      { key: 'unhealthy', label: '나쁨(경고)',  gradient: HUDADAK_PALETTE.unhealthy },
      { key: 'severe',    label: '심각(위험)',  gradient: HUDADAK_PALETTE.severe },
      { key: 'hazardous', label: '매우 나쁨',   gradient: HUDADAK_PALETTE.hazardous },
    ],
  },
};
