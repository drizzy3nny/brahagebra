const MINUS = '\u2212';

/** Format a number for display: integers stay exact, otherwise up to `sig` significant digits. */
export function formatNumber(v: number, sig = 10): string {
  if (Number.isNaN(v)) return 'undefined';
  if (!Number.isFinite(v)) return v > 0 ? '\u221e' : MINUS + '\u221e';
  if (v === 0) return '0';
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) <= 1e-12 * Math.max(1, Math.abs(v)) && Math.abs(v) < 1e15) {
    return String(rounded).replace('-', MINUS);
  }
  const abs = Math.abs(v);
  if (abs >= 1e12 || abs < 1e-6) {
    return v.toExponential(Math.min(6, sig - 1)).replace('-', MINUS);
  }
  let s = v.toPrecision(sig);
  if (s.includes('e')) s = String(Number(s));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('-', MINUS);
}

/** Compact label for grid ticks. */
export function formatTick(v: number): string {
  if (Math.abs(v) < 1e-12) return '0';
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) <= 1e-9 * Math.max(1, Math.abs(v)) && Math.abs(v) < 1e9) return String(rounded);
  let s = v.toPrecision(4);
  if (s.includes('e')) s = String(Number(s));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('-', MINUS);
}

/** Nice axis/grid step: 1, 2 or 5 times a power of ten, targeting ~`target` divisions over `span`. */
export function niceStep(span: number, target = 10): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const raw = span / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) {
    if (raw <= m * mag * (1 + 1e-9)) return m * mag;
  }
  return 10 * mag;
}
