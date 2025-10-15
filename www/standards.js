// standards.js
export const STANDARDS = {
  KOR: {
    code: 'KOR',
    label: '대한민국 CAI (24h)',
    // 경계값은 상한들만 나열(좋음/보통/나쁨/매우나쁨)
    breaks: {
      pm10:  [30, 80, 150],   // 151~600은 마지막 구간
      pm25:  [15, 35, 75],
    },
    bands: [
      { key: 'good',    label: '좋음',      bg: '#1EB980', fg: '#ffffff' },
      { key: 'moderate',label: '보통',      bg: '#F4D03F', fg: '#222222' },
      { key: 'unhealthy',label:'나쁨',      bg: '#E67E22', fg: '#ffffff' },
      { key: 'verybad', label: '매우나쁨',  bg: '#E74C3C', fg: '#ffffff' },
    ],
  },

  WHO24: {
    code: 'WHO24',
    label: 'WHO AQG 2021 (24h)',
    // 기본: 2단계(권고 이내/권고 초과). 필요시 IT 단계 확장 가능.
    breaks: {
      pm10:  [45],      // ≤45 OK, >45 Exceed
      pm25:  [15],      // ≤15 OK, >15 Exceed
    },
    bands: [
      { key: 'ok',      label: '권고 이내', bg: '#1EB980', fg: '#ffffff' },
      { key: 'exceed',  label: '권고 초과', bg: '#E74C3C', fg: '#ffffff' },
    ],
    // (선택) Interim Targets를 쓰고 싶으면 아래처럼 켜면 됨:
    // breaks: { pm10: [45, 75, 100], pm25: [15, 25, 35] }  // 예시 자리표시자 — 실제 IT는 프로젝트 정책에 맞춰 확정 입력
    // bands: 4단계로 맞추기
  },
};
