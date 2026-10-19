import { degree, polyEval, type Poly } from './polynomial';

/** The turning point of an actual quadratic, in the plotted coordinates. */
export function quadraticVertex(poly: Poly | null): { x: number; y: number } | null {
  if (!poly || degree(poly) !== 2) return null;
  const a = poly.c[2];
  const b = poly.c[1] ?? 0;
  const x = -(b / a) / 2;
  const y = polyEval(poly, x);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Object.is(x, -0) ? 0 : x, y: Object.is(y, -0) ? 0 : y };
}
