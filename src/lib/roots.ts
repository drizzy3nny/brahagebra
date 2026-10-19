export interface IterRow {
  i: number;
  a: number;
  b: number;
  x: number;
  fx: number;
}

export type RootMethod = 'brent' | 'touch' | 'exact';

export interface Root {
  x: number;
  fx: number;
  method: RootMethod;
  /** initial sign-change bracket (or search window for touch roots) */
  bracket: [number, number];
  /** refinement history, used by the explainer */
  iters: IterRow[];
  /** true when the curve touches the axis without crossing it */
  touches: boolean;
}

export interface RootScan {
  roots: Root[];
  /** x values where a sign change was an asymptote (e.g. tan), not a root */
  poles: number[];
  /** intervals where f is undefined (e.g. ln of a negative number) */
  gaps: [number, number][];
  samples: number;
  sampleStep: number;
  range: [number, number];
  medianAbs: number;
}

const EPS = Number.EPSILON;

function sign(a: number, b: number): number {
  return b >= 0 ? Math.abs(a) : -Math.abs(a);
}

/**
 * Brent's method: bisection (guaranteed) accelerated with secant and
 * inverse-quadratic interpolation. Returns the root plus iteration history.
 */
export function brent(
  f: (x: number) => number,
  x1: number,
  x2: number,
  tol: number,
  maxIter = 100,
): { x: number; fx: number; iters: IterRow[]; converged: boolean } | null {
  let a = x1;
  let b = x2;
  let c = x2;
  let fa = f(a);
  let fb = f(b);
  if (fa === 0) return { x: a, fx: 0, iters: [], converged: true };
  if (fb === 0) return { x: b, fx: 0, iters: [], converged: true };
  if (fa * fb > 0) return null;
  let fc = fb;
  let d = b - a;
  let e = d;
  const iters: IterRow[] = [];

  for (let iter = 1; iter <= maxIter; iter++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      e = d = b - a;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * EPS * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    iters.push({ i: iter, a: Math.min(b, c), b: Math.max(b, c), x: b, fx: fb });
    if (Math.abs(xm) <= tol1 || fb === 0) {
      return { x: b, fx: fb, iters, converged: true };
    }
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      const min1 = 3 * xm * q - Math.abs(tol1 * q);
      const min2 = Math.abs(e * q);
      if (2 * p < Math.min(min1, min2)) {
        e = d;
        d = p / q;
      } else {
        e = d = xm;
      }
    } else {
      e = d = xm;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : sign(tol1, xm);
    fb = f(b);
  }
  return { x: b, fx: fb, iters, converged: Math.abs(fb) < Math.abs(fa) || fb === 0 };
}

/** Golden-section search minimising |f| — used for roots the curve only touches. */
function goldenMinAbs(
  f: (x: number) => number,
  lo: number,
  hi: number,
  tol: number,
): { x: number; fx: number; iters: IterRow[] } {
  const invphi = (Math.sqrt(5) - 1) / 2;
  let a = lo;
  let b = hi;
  let c = b - invphi * (b - a);
  let d = a + invphi * (b - a);
  let fc = Math.abs(f(c));
  let fd = Math.abs(f(d));
  const iters: IterRow[] = [];
  let i = 0;
  while (b - a > tol && i < 400) {
    i++;
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - invphi * (b - a);
      fc = Math.abs(f(c));
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + invphi * (b - a);
      fd = Math.abs(f(d));
    }
    if (i % 4 === 1) iters.push({ i, a, b, x: 0.5 * (a + b), fx: f(0.5 * (a + b)) });
  }
  const x = 0.5 * (a + b);
  iters.push({ i, a, b, x, fx: f(x) });
  return { x, fx: f(x), iters };
}

/**
 * Scan `range` for x-intercepts of f:
 *  1. sample densely for sign changes -> Brent refinement (precise to ~1e-13)
 *  2. reject poles (tan, 1/x) that also show a sign change
 *  3. catch roots the curve only touches via |f| minimisation
 */
export function scanRoots(
  f: (x: number) => number,
  range: [number, number],
  perUnit = 160,
): RootScan {
  const [lo, hi] = range;
  const width = Math.max(hi - lo, Number.MIN_VALUE);
  const samples = Math.min(12000, Math.max(600, Math.ceil(width * perUnit)));
  const step = width / samples;
  const xs = new Float64Array(samples + 1);
  const vs = new Float64Array(samples + 1);
  for (let i = 0; i <= samples; i++) {
    const x = lo + i * step;
    xs[i] = x;
    vs[i] = f(x);
  }

  const finiteAbs: number[] = [];
  for (let i = 0; i <= samples; i++) if (Number.isFinite(vs[i])) finiteAbs.push(Math.abs(vs[i]));
  finiteAbs.sort((p, q) => p - q);
  const medianAbs = finiteAbs.length ? finiteAbs[Math.floor(finiteAbs.length / 2)] : 0;
  const touchTol = 1e-8 * (1 + medianAbs);

  const roots: Root[] = [];
  if (vs.every(v => v === 0)) return { roots, poles: [], gaps: [], samples, sampleStep: step, range: [lo, hi], medianAbs };
  const poles: number[] = [];
  const gaps: [number, number][] = [];

  // 1) exact zeros hit by the sample grid (incl. endpoints);
  //    neighbours with the same sign mean the curve only touches the axis
  for (let i = 0; i <= samples; i++) {
    if (vs[i] === 0) {
      const prev = i > 0 ? vs[i - 1] : undefined;
      const next = i < samples ? vs[i + 1] : undefined;
      const crosses =
        (prev !== undefined && prev !== 0 && prev * (next ?? prev) < 0) ||
        (next !== undefined && next !== 0 && next * (prev ?? next) < 0);
      roots.push({
        x: xs[i],
        fx: 0,
        method: 'exact',
        bracket: [xs[i], xs[i]],
        iters: [],
        touches: !crosses && (prev === undefined || next === undefined ? true : prev * next > 0 || prev === 0 || next === 0),
      });
    }
  }

  // 1b) runs of undefined values become domain gaps
  for (let i = 0; i <= samples; ) {
    if (Number.isFinite(vs[i])) {
      i++;
      continue;
    }
    const start = i;
    while (i <= samples && !Number.isFinite(vs[i])) i++;
    gaps.push([xs[start], xs[i - 1]]);
  }

  // 2) sign changes -> Brent
  for (let i = 1; i <= samples; i++) {
    // Probe just inside an exact endpoint root so a second root in the
    // same sample interval is not hidden by a zero product.
    const left = vs[i - 1] === 0 ? xs[i - 1] + step * 1e-5 : xs[i - 1];
    const right = vs[i] === 0 ? xs[i] - step * 1e-5 : xs[i];
    const v0 = vs[i - 1] === 0 ? f(left) : vs[i - 1];
    const v1 = vs[i] === 0 ? f(right) : vs[i];
    if (!Number.isFinite(v0) || !Number.isFinite(v1)) continue;
    if (v0 * v1 >= 0) continue;
    const res = brent(f, left, right, 1e-13);
    if (!res) continue;
    const minEnd = Math.min(Math.abs(v0), Math.abs(v1));
    const isPole =
      !Number.isFinite(res.fx) ||
      (minEnd > 0 && Math.abs(res.fx) >= 0.5 * minEnd);
    if (isPole) {
      poles.push(res.x);
      continue;
    }
    roots.push({
      x: res.x,
      fx: res.fx,
      method: 'brent',
      bracket: [xs[i - 1], xs[i]],
      iters: res.iters,
      touches: false,
    });
  }

  // 3) touching (tangential) roots: local minima of |f| that reach zero
  for (let i = 1; i < samples; i++) {
    const vPrev = vs[i - 1];
    const vCur = vs[i];
    const vNext = vs[i + 1];
    if (!Number.isFinite(vPrev) || !Number.isFinite(vCur) || !Number.isFinite(vNext)) continue;
    const cur = Math.abs(vCur);
    if (cur === 0) continue;
    if (cur > Math.abs(vPrev) || cur > Math.abs(vNext)) continue;
    if (vPrev * vNext <= 0) continue; // a crossing is handled by Brent
    const endMin = Math.min(Math.abs(vPrev), Math.abs(vNext));
    const res = goldenMinAbs((x) => Math.abs(f(x)), xs[i - 1], xs[i + 1], 1e-14 * (1 + Math.abs(xs[i])));
    const tv = Math.abs(res.fx);
    if (!Number.isFinite(tv) || tv > touchTol) continue;
    if (endMin > 0 && tv > 1e-6 * endMin) continue;
    roots.push({
      x: res.x,
      fx: f(res.x),
      method: 'touch',
      bracket: [xs[i - 1], xs[i + 1]],
      iters: res.iters,
      touches: true,
    });
  }

  // dedupe: keep the most accurate finding per location (also collapses flat zero runs)
  const mergeTol = 1e-9;
  roots.sort((p, q) => p.x - q.x);
  const deduped: Root[] = [];
  for (const r of roots) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(r.x - prev.x) <= Math.max(mergeTol, 1e-10 * (1 + Math.abs(r.x)))) {
      const better = Math.abs(r.fx) < Math.abs(prev.fx) || (r.method !== 'touch' && prev.method === 'touch') ? r : prev;
      deduped[deduped.length - 1] = { ...better, touches: prev.touches || r.touches };
    } else {
      deduped.push(r);
    }
  }

  poles.sort((p, q) => p - q);
  const dedupedPoles: number[] = [];
  for (const p of poles) {
    const prev = dedupedPoles[dedupedPoles.length - 1];
    if (prev === undefined || Math.abs(p - prev) > 1e-7 * (1 + Math.abs(p))) dedupedPoles.push(p);
  }

  return { roots: deduped, poles: dedupedPoles, gaps, samples, sampleStep: step, range: [lo, hi], medianAbs };
}
