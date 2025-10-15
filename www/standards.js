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

  // WHO 2021 권고 2단계 (AQG 이내/초과)
  WHO24: {
    code: 'WHO24',
    label: 'WHO 2021 (24h) · 2단계',
    breaks: {
      pm10: [45],   // ≤45, >45
      pm25: [15],   // ≤15, >15
    },
    bands: [
      { key:'ok',     label:'권고 이내', bg:'#1EB980', fg:'#ffffff' },
      { key:'exceed', label:'권고 초과', bg:'#E74C3C', fg:'#ffffff' },
    ],
  },

  // WHO 2021 AQG + IT-4~IT-1 (5단계). 마지막 구간은 >IT-1도 같은 밴드로 처리
  WHO5: {
    code: 'WHO5',
    label: 'WHO 2021 (24h) · 5단계',
    breaks: {
      // PM2.5: AQG 15 / IT-4 25 / IT-3 37.5 / IT-2 50 / IT-1 75
      pm25: [15, 25, 37.5, 50, 75],
      // PM10: AQG 45 / IT-4 50 / IT-3 75 / IT-2 100 / IT-1 150
      pm10: [45, 50, 75, 100, 150],
    },
    bands: [
      { key:'aqg',   label:'권고 이내',     bg:'#1EB980', fg:'#ffffff' },
      { key:'it4',   label:'권고 초과 (IT-4)', bg:'#A3D977', fg:'#0b0d12' },
      { key:'it3',   label:'권고 초과 (IT-3)', bg:'#F4D03F', fg:'#222222' },
      { key:'it2',   label:'권고 초과 (IT-2)', bg:'#E67E22', fg:'#ffffff' },
      { key:'it1+',  label:'권고 초과 (IT-1+)',bg:'#E74C3C', fg:'#ffffff' },
    ],
  },

  // WHO 8단계 (미세미세 스타일): AQG 이하 3칸 + IT-4~IT-1 4칸 + 초과최상 1칸 = 8
  WHO8: {
    code: 'WHO8',
    label: 'WHO 2021 (24h) · 8단계',
    breaks: {
      // PM2.5: AQG 15을 3등분(5,10,15) + IT-4 25 / IT-3 37.5 / IT-2 50 / IT-1 75 / 최상>75
      pm25: [5, 10, 15, 25, 37.5, 50, 75],
      // PM10: AQG 45을 3등분(15,30,45) + IT-4 50 / IT-3 75 / IT-2 100 / IT-1 150 / 최상>150
      pm10: [15, 30, 45, 50, 75, 100, 150],
    },
    bands: [
      { key:'vgood',  label:'매우 좋음',   bg:'#14B8A6', fg:'#ffffff' }, // ≤1
      { key:'good',   label:'좋음',       bg:'#1EB980', fg:'#ffffff' }, // 2
      { key:'fair',   label:'양호',       bg:'#7DD3FC', fg:'#0b0d12' }, // 3
      { key:'it4',    label:'주의 (IT-4)', bg:'#A3D977', fg:'#0b0d12' }, // 4
      { key:'it3',    label:'나쁨 (IT-3)', bg:'#F4D03F', fg:'#222222' }, // 5
      { key:'it2',    label:'매우 나쁨 (IT-2)', bg:'#E67E22', fg:'#ffffff' }, // 6
      { key:'it1',    label:'위험 (IT-1)', bg:'#E74C3C', fg:'#ffffff' }, // 7
      { key:'hazard', label:'최악',       bg:'#8B0000', fg:'#ffffff' }, // >최상 경계
    ],
  },
};
