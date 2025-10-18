// color-scale.js
import { STANDARDS } from './standards.js';

export function bandIndex(value, breakpoints) {
  if (value == null || isNaN(value)) return 0;
  let i = 0;
  while (i < breakpoints.length && value > breakpoints[i]) i++;
  return Math.min(i, Math.max(0, breakpoints.length)); // 0..N
}

export function colorFor({ standard = 'KOR', metric, value }) {
  const std = STANDARDS[standard] || STANDARDS.KOR;
  const breaks = std.breaks[metric] || std.breaks.pm25;
  const idx = bandIndex(Number(value), breaks);
  const band = std.bands[idx] || std.bands[std.bands.length - 1];
  return { ...band, standard: std.code };
}

export function paintByMetric(el, opts) {
  const { bg, fg, label } = colorFor(opts);
  el.style.backgroundColor = bg;
  el.style.color = fg;
  el.setAttribute('data-band-label', label); // 접근성/툴팁
}
