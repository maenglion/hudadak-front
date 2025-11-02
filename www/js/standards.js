// standards.js
export const STANDARDS = {
  // 대한민국 환경부 CAI 4단계 (24h)
  KOR: {
    code: 'KOR',
    label: '대한민국 CAI (24h)',
    breaks: {
      pm10: [30, 80, 150],   // ≤30, ≤80, ≤150, >150
      pm25: [15, 35, 75],    // ≤15, ≤35, ≤75, >75
    },
    bands: [
      { key:'good',     label:'좋음',     bg:'#1EB980', fg:'#ffffff' },
      { key:'moderate', label:'보통',     bg:'#F4D03F', fg:'#222222' },
      { key:'unhealthy',label:'나쁨',     bg:'#E67E22', fg:'#ffffff' },
      { key:'verybad',  label:'매우나쁨', bg:'#E74C3C', fg:'#ffffff' },
    ],
  },

  // WHO 2021 (24h) · 2단계
  WHO24: {
    code: 'WHO24',
    label: 'WHO 2021 (24h) · 2단계',
    breaks: {
      pm10: [45],
      pm25: [15],
    },
    bands: [
      { key:'ok',     label:'권고 이내', bg:'#1EB980', fg:'#ffffff' },
      { key:'exceed', label:'권고 초과', bg:'#E74C3C', fg:'#ffffff' },
    ],
  },

  // WHO 2021 (24h) · 5단계
  WHO5: {
    code: 'WHO5',
    label: 'WHO 2021 (24h) · 5단계',
    breaks: {
      pm25: [15, 25, 37.5, 50, 75],
      pm10: [45, 50, 75, 100, 150],
    },
    bands: [
      { key:'aqg',   label:'권고 이내',        bg:'#1EB980', fg:'#ffffff' },
      { key:'it4',   label:'권고 초과 (IT-4)',  bg:'#A3D977', fg:'#0b0d12' },
      { key:'it3',   label:'권고 초과 (IT-3)',  bg:'#F4D03F', fg:'#222222' },
      { key:'it2',   label:'권고 초과 (IT-2)',  bg:'#E67E22', fg:'#ffffff' },
      { key:'it1+',  label:'권고 초과 (IT-1+)', bg:'#E74C3C', fg:'#ffffff' },
    ],
  },

  // WHO 2021 (24h) · 8단계
  WHO8: {
    code: 'WHO8',
    label: 'WHO 2021 (24h) · 8단계',
    breaks: {
      pm25: [5, 10, 15, 25, 37.5, 50, 75],
      pm10: [15, 30, 45, 50, 75, 100, 150],
    },
    bands: [
      { key:'vgood',  label:'매우 좋음',         bg:'#14B8A6', fg:'#ffffff' },
      { key:'good',   label:'좋음',             bg:'#1EB980', fg:'#ffffff' },
      { key:'fair',   label:'양호',             bg:'#7DD3FC', fg:'#0b0d12' },
      { key:'it4',    label:'주의 (IT-4)',      bg:'#A3D977', fg:'#0b0d12' },
      { key:'it3',    label:'나쁨 (IT-3)',      bg:'#F4D03F', fg:'#222222' },
      { key:'it2',    label:'매우 나쁨 (IT-2)',  bg:'#E67E22', fg:'#ffffff' },
      { key:'it1',    label:'위험 (IT-1)',      bg:'#E74C3C', fg:'#ffffff' },
      { key:'hazard', label:'최악',             bg:'#8B0000', fg:'#ffffff' },
    ],
  },

   // 🟣 HUDADAK 전용 8단계 (CSS랑 1:1 매칭)
  HUDADAK8: {
    code: 'HUDADAK8',
    label: '후다닥 8단계',
    // 일단 WHO8이랑 같은 컷. (나중에 "총점 구간" 나오면 여기만 교체)
    breaks: {
      pm25: [5, 10, 15, 25, 37.5, 50, 75],
      pm10: [15, 30, 45, 50, 75, 100, 150],
      // score: [100, 200, 300, 400, 500, 600, 700], // 점수 쓰게 되면 이 라인으로
    },
    bands: [
      {
        key: 'excellent',
        label: '청정',
        bg: '#23a0e5',          // .summary_background_component.excellent 의 위쪽 색
        fg: '#ffffff',
        statusColor: '#23a0e5', // 이걸 var(--mobile-status)에 넣어
        kor4: false,
        className: 'excellent',
      },
      {
        key: 'good',
        label: '좋음',
        bg: '#30b8de',
        fg: '#ffffff',
        statusColor: '#30b8de',
        kor4: true,
        kor4Label: '좋음',
        className: 'good',
      },
      {
        key: 'fair',
        label: '양호',
        bg: '#3dd392',
        fg: '#ffffff',
        statusColor: '#3dd392',
        kor4: false,
        className: 'fair',
      },
      {
        key: 'moderate',
        label: '보통',
        bg: '#85af36',
        fg: '#ffffff',
        statusColor: '#85af36',
        kor4: true,
        kor4Label: '보통',
        className: 'moderate',
      },
      {
        key: 'poor',
        label: '나쁨(주의)',
        bg: '#db9f3c',
        fg: '#ffffff',
        statusColor: '#db9f3c',
        kor4: false,
        className: 'poor',
      },
      {
        key: 'unhealthy',
        label: '나쁨(경고)',
        bg: '#df7f59',
        fg: '#ffffff',
        statusColor: '#df7f59',
        kor4: true,
        kor4Label: '나쁨',
        className: 'unhealthy',
      },
      {
        key: 'severe',
        label: '심각(위험)',
        bg: '#a44960',
        fg: '#ffffff',
        statusColor: '#a44960',
        kor4: false,
        className: 'severe',
      },
      {
        key: 'hazardous',
        label: '매우 나쁨',
        bg: '#71395e',
        fg: '#ffffff',
        statusColor: '#71395e',
        kor4: true,
        kor4Label: '매우 나쁨',
        className: 'hazardous',
      },
    ],
  },
};
