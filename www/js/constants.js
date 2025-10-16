// js/constants.js
export const API_BASE = "/api"; // 같은 도메인이면 프록시/리라이트로 /api → FastAPI

export const MINI_COLORS = {
  good:  "#1EB980",
  mid:   "#F4D03F",
  bad:   "#E67E22",
  worst: "#E74C3C",
};

export const HERO_GRADIENT = {
  1: ["#14B8A6","#22D3EE"],
  2: ["#4ADE80","#FACC15"],
  3: ["#F59E0B","#F97316"],
  4: ["#FB923C","#F43F5E"],
  5: ["#EF4444","#991B1B"],
  6: ["#B91C1C","#7F1D1D"],
};

// 메시지(선택)
export const MESSAGES = {
  1: "바깥활동 아주 좋아요",
  2: "무난합니다",
  3: "민감군은 주의",
  4: "마스크 권장",
  5: "실내 권장",
  6: "실내 대기 권장",
};

// 평가 기준(여기 WHO8까지 포함)
export { STANDARDS } from "./standards.js";
