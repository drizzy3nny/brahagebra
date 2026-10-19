import { asPolynomial, degree } from './polynomial';
import { formatNumber } from './format';
import { evaluate } from './eval';
import type { Node } from './ast';
import type { RootScan } from './roots';

export type RelOp = '<' | '>' | '≤' | '≥';

/** Does f(x) = y satisfy the relation y OP 0? */
export function holds(y: number, op: RelOp): boolean {
  if (!Number.isFinite(y)) return false;
  switch (op) {
    case '<':
      return y < 0;
    case '≤':
      return y <= 0;
    case '>':
      return y > 0;
    case '≥':
      return y >= 0;
  }
}

/** An interval of the solution set. null = infinite end; *Inc = endpoint included. */
export interface Interval {
  a: number | null;
  b: number | null;
  aInc: boolean;
  bInc: boolean;
}

export interface SignRow {
  /** interval label like "(−2, 2)" */
  label: string;
  testX: number;
  fx: number;
  holds: boolean;
}

export interface SolutionSet {
  intervals: Interval[];
  range?: [number, number];
  /** true when the set is (−∞, ∞) */
  allReal: boolean;
  /** true when nothing satisfies the relation */
  empty: boolean;
}

const DEDUP = 1e-9;

function uniqSorted(xs: number[]): number[] {
  const out: number[] = [];
  for (const x of xs.slice().sort((p, q) => p - q)) {
    if (out.length === 0 || Math.abs(x - out[out.length - 1]) > DEDUP * (1 + Math.abs(x))) out.push(x);
  }
  return out;
}

/**
 * Build the solution set of f(x) OP 0 from a root scan: split the line at every
 * root / pole / gap edge, test one point per segment, then probe outward beyond
 * the visible range to decide whether the outer segments extend to ±∞.
 */
export function solveRelation(node: Node, scan: RootScan, op: RelOp): SolutionSet {
  const f = (x: number): number => {
    try {
      return evaluate(node, x);
    } catch {
      return NaN;
    }
  };
  const poly = asPolynomial(node);
  const d = poly ? degree(poly) : Infinity;
  const global = !!poly && d <= 2;
  let [r0, r1] = scan.range;
  let rootXs = scan.roots.map(r => r.x);
  if (global && poly) {
    const [c = 0, b = 0, a = 0] = poly.c;
    rootXs = [];
    if (d === 1) rootXs = [-c / b];
    if (d === 2) {
      const discriminant = b * b - 4 * a * c;
      if (discriminant === 0) rootXs = [-b / (2 * a)];
      else if (discriminant > 0) {
        const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
        rootXs = [q / a, c / q].sort((x,y) => x-y);
      }
    }
    const bound = Math.max(1, ...rootXs.map(x => Math.abs(x) + 1));
    r0 = -bound; r1 = bound;
  }
  const strict = op === '<' || op === '>';
  const splitXs = uniqSorted([
    ...rootXs,
    ...(global ? [] : scan.poles),
    ...(global ? [] : scan.gaps.flatMap(([a,b]) => [a,b])),
  ].filter(x => x > r0 && x < r1));
  const isRoot = (x: number) => rootXs.some(rx => Math.abs(rx-x) <= 1e-9 * (1+Math.abs(x)));

  // segment edges across the visible range
  const edges = [r0, ...splitXs, r1];
  const intervals: Interval[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    if (hi - lo < DEDUP * (1 + Math.abs(hi))) continue;
    const test = (lo + hi) / 2;
    if (!holds(f(test), op)) continue;

    let a: number | null = lo;
    let b: number | null = hi;
    let aInc = false;
    let bInc = false;

    if (i === 0 && global) a = null;
    else aInc = isRoot(lo) ? !strict : holds(f(lo), op);
    if (i === edges.length - 2 && global) b = null;
    else bInc = isRoot(hi) ? !strict : holds(f(hi), op);

    intervals.push({ a, b, aInc, bInc });
  }

  if (!strict) for (const x of rootXs) {
    if (x < r0 || x > r1) continue;
    if (!intervals.some(iv => (iv.a === null || x >= iv.a) && (iv.b === null || x <= iv.b))) {
      intervals.push({ a: x, b: x, aInc: true, bInc: true });
    }
  }
  intervals.sort((a,b) => (a.a ?? -Infinity) - (b.a ?? -Infinity));
  // merge adjacent intervals joined at an included root, e.g. (x−2)² ≥ 0
  const merged: Interval[] = [];
  for (const iv of intervals) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.b !== null &&
      iv.a !== null &&
      Math.abs(prev.b - iv.a) <= 1e-6 * (1 + Math.abs(prev.b)) &&
      prev.bInc &&
      iv.aInc
    ) {
      prev.b = iv.b;
      prev.bInc = iv.bInc;
      continue;
    }
    merged.push({ ...iv });
  }

  const allReal = merged.length === 1 && merged[0].a === null && merged[0].b === null;
  return { intervals: merged, allReal, empty: merged.length === 0, range: global ? undefined : scan.range };
}

/** One sign-chart row per segment: interval label, test point, f(test), verdict. */
export function signChart(node: Node, scan: RootScan, op: RelOp, maxRows = 8): SignRow[] {
  const f = (x: number): number => {
    try {
      return evaluate(node, x);
    } catch {
      return NaN;
    }
  };
  const [r0, r1] = scan.range;
  const splitXs = uniqSorted([
    ...scan.roots.map((r) => r.x),
    ...scan.poles,
    ...scan.gaps.flatMap(([a, b]) => [a, b]),
  ].filter((x) => x > r0 + DEDUP && x < r1 - DEDUP));
  const edges = [r0, ...splitXs, r1];

  const rows: SignRow[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    if (hi - lo < DEDUP * (1 + Math.abs(hi))) continue;
    // test point: midpoint, nudged inside when the visible edge is a gap boundary
    let test = (lo + hi) / 2;
    if (!Number.isFinite(f(test))) {
      const alt = lo + (hi - lo) * 0.25;
      test = Number.isFinite(f(alt)) ? alt : hi - (hi - lo) * 0.25;
    }
    const y = f(test);
    const left = formatNumber(lo, 6);
    const right = formatNumber(hi, 6);
    rows.push({
      label: `(${left}, ${right})`,
      testX: test,
      fx: y,
      holds: holds(y, op),
    });
  }
  if (rows.length > maxRows) {
    const head = rows.slice(0, maxRows - 1);
    const last = rows[rows.length - 1];
    head.push(last);
    return head;
  }
  return rows;
}

/** Format the solution set the way a teacher would write it. */
export function solutionText(set: SolutionSet, op: RelOp): string {
  const scope = set.range ? ' (numerical estimate in ' + formatNumber(set.range[0], 6) + ' ≤ x ≤ ' + formatNumber(set.range[1], 6) + ')' : '';
  if (set.empty) return set.range ? 'No solutions detected' + scope : 'no solution';
  if (set.allReal) return 'all real x';
  const nonStrict = op === '≤' || op === '≥';
  const parts = set.intervals.map((iv) => {
    if (iv.a !== null && iv.a === iv.b) return 'x = ' + formatNumber(iv.a, 10);
    if (iv.a === null && iv.b === null) return 'all real x';
    if (iv.a === null) return `x ${iv.bInc && nonStrict ? '≤' : '<'} ${formatNumber(iv.b as number, 10)}`;
    if (iv.b === null) return `x ${iv.aInc && nonStrict ? '≥' : '>'} ${formatNumber(iv.a, 10)}`;
    // bounded interval: x sits between a and b, so both bounds read < / ≤
    const loSym = iv.aInc && nonStrict ? '≤' : '<';
    const hiSym = iv.bInc && nonStrict ? '≤' : '<';
    return `${formatNumber(iv.a, 10)} ${loSym} x ${hiSym} ${formatNumber(iv.b, 10)}`;
  });
  return parts.join('  or  ') + scope;
}
