
// admin.js
(() => {
  const KEY = 'pm25_stats';
  let stats = JSON.parse(localStorage.getItem(KEY) || '{"total":0,"today":0,"last":""}');
  const today = new Date().toISOString().slice(0, 10);

  // 날짜 바뀌면 오늘 접속자 초기화
  if (stats.last !== today) {
    stats.today = 0;  // 날짜 바뀌면 0으로 초기화
    stats.last = today;
  }
  stats.today++;  // 매 호출시 1 증가
  stats.total++;  // 누적 증가

  // localStorage에 저장
  localStorage.setItem(KEY, JSON.stringify(stats));

  // 화면에 표시
  document.getElementById('todayCount').textContent = stats.today;
  document.getElementById('totalCount').textContent = stats.total;

  
})()