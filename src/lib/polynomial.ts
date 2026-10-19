import type { Node } from './ast';
import { CONSTANTS } from './eval';

/** Polynomial coefficients: c[k] is the coefficient of x^k. */
export interface Poly {
  c: number[];
}

const MAX_DEGREE = 12;

function trim(p: Poly): Poly {
  const c = p.c.slice();
  while (c.length > 1 && c.length > 0 && c[c.length - 1] === 0) c.pop();
  if (c.length === 0) c.push(0);
  return { c };
}

export function degree(p: Poly): number {
  for (let i = p.c.length - 1; i >= 0; i--) {
    if (p.c[i] !== 0) return i;
  }
  return -1; // zero polynomial
}

export function polyEval(p: Poly, x: number): number {
  let acc = 0;
  for (let i = p.c.length - 1; i >= 0; i--) acc = acc * x + p.c[i];
  return acc;
}

function polyAdd(a: Poly, b: Poly): Poly {
  const n = Math.max(a.c.length, b.c.length);
  const c = new Array<number>(n).fill(0);
  for (let i = 0; i < a.c.length; i++) c[i] += a.c[i];
  for (let i = 0; i < b.c.length; i++) c[i] += b.c[i];
  return trim({ c });
}

function polyScale(a: Poly, s: number): Poly {
  return trim({ c: a.c.map((v) => v * s) });
}

function polyMul(a: Poly, b: Poly): Poly | null {
  if (degree(a) + degree(b) > MAX_DEGREE) return null;
  const c = new Array<number>(a.c.length + b.c.length - 1).fill(0);
  for (let i = 0; i < a.c.length; i++) {
    for (let j = 0; j < b.c.length; j++) c[i + j] += a.c[i] * b.c[j];
  }
  return trim({ c });
}

export function polyDeriv(p: Poly): Poly {
  if (p.c.length <= 1) return { c: [0] };
  return trim({ c: p.c.slice(1).map((v, i) => v * (i + 1)) });
}

/** Synthetic division of p by (x - r): returns the quotient. */
export function syntheticDivide(p: Poly, r: number): Poly {
  const n = degree(p);
  if (n <= 0) return { c: [0] };
  const q = new Array<number>(n).fill(0);
  let acc = 0;
  for (let i = n; i >= 1; i--) {
    acc = acc * r + p.c[i];
    q[i - 1] = acc;
  }
  return trim({ c: q });
}

/**
 * Recognise polynomial expressions over +, -, *, / by constants and integer powers.
 * Returns null for anything else (transcendentals, variables other than x...).
 */
export function asPolynomial(node: Node): Poly | null {
  switch (node.kind) {
    case 'num':
      return { c: [node.value] };
    case 'var':
      if (node.name === 'x') return { c: [0, 1] };
      if (node.name in CONSTANTS) return { c: [CONSTANTS[node.name]] };
      return null;
    case 'un': {
      const inner = asPolynomial(node.arg);
      if (!inner) return null;
      return node.op === '-' ? polyScale(inner, -1) : inner;
    }
    case 'call':
      return null;
    case 'bin': {
      const a = asPolynomial(node.a);
      const b = asPolynomial(node.b);
      if (!a || !b) return null;
      switch (node.op) {
        case '+':
          return polyAdd(a, b);
        case '-':
          return polyAdd(a, polyScale(b, -1));
        case '*':
          return polyMul(a, b);
        case '/':
          return degree(b) === 0 ? polyScale(a, 1 / b.c[0]) : null;
        case '^': {
          if (node.b.kind !== 'num') return null;
          const e = node.b.value;
          if (!Number.isInteger(e) || e < 0 || e > MAX_DEGREE) return null;
          let acc: Poly = { c: [1] };
          for (let k = 0; k < e; k++) {
            const next = polyMul(acc, a);
            if (!next) return null;
            acc = next;
          }
          return acc;
        }
      }
    }
  }
  return null;
}

/** Scale coefficients so they are (near) integers — needed for rational-root search. */
export function integerize(p: Poly): { c: number[]; scale: number } | null {
  const maxAbs = Math.max(...p.c.map(Math.abs));
  if (maxAbs === 0 || !Number.isFinite(maxAbs)) return null;
  let scale = 1;
  for (let k = 0; k <= 9; k++) {
    const c = p.c.map((v) => v * scale);
    const tol = 1e-9 * Math.max(1, Math.max(...c.map(Math.abs)));
    if (c.every((v) => Math.abs(v - Math.round(v)) <= tol)) {
      return { c: c.map((v) => Math.round(v)), scale };
    }
    scale *= 10;
  }
  return null;
}

function divisors(n: number): number[] {
  const out = new Set<number>();
  const m = Math.abs(n);
  for (let d = 1; d * d <= m; d++) {
    if (m % d === 0) {
      out.add(d);
      if (d !== m / d) out.add(m / d);
    }
  }
  return [...out].sort((a, b) => a - b);
}

export interface RationalRoot {
  x: number;
  multiplicity: number;
}

/**
 * Rational-root theorem search (p/q candidates) with synthetic division,
 * extracting multiplicity. Only engages when coefficients scale to integers.
 */
export function rationalRoots(p: Poly): { roots: RationalRoot[]; remaining: Poly; attempts: number; candidates: number } {
  const int = integerize(p);
  const base: { roots: RationalRoot[]; remaining: Poly; attempts: number; candidates: number } = {
    roots: [],
    remaining: p,
    attempts: 0,
    candidates: 0,
  };
  if (!int || degree(p) < 1) return base;

  const ic = { c: int.c };
  const lead = ic.c[degree(ic)];
  const cons = ic.c[0];
  if (cons === 0) {
    // x is always a factor when the constant term vanishes: root 0
    let mult = 0;
    let rem = ic;
    while (degree(rem) > 0 && rem.c[0] === 0) {
      rem = syntheticDivide(rem, 0);
      mult++;
    }
    base.roots.push({ x: 0, multiplicity: mult });
    base.remaining = rem;
  }

  const cands = new Set<number>();
  const ps = divisors(Math.round(base.remaining.c[0] ?? 0));
  const qs = divisors(lead);
  if (degree(base.remaining) > 0 && base.remaining.c[0] !== 0) {
    for (const pd of divisors(Math.abs(Math.round(base.remaining.c[0])))) {
      for (const q of qs) {
        cands.add(pd / q);
        cands.add(-pd / q);
      }
    }
    void ps;
  }
  base.candidates = cands.size;

  const tol = (q: Poly, r: number) => {
    let norm = 0;
    for (let k = 0; k < q.c.length; k++) norm += Math.abs(q.c[k]) * Math.pow(Math.abs(r), k);
    return 1e-8 * Math.max(1, norm);
  };

  let guard = 0;
  while (degree(base.remaining) >= 1 && guard++ < 12) {
    let found: number | null = null;
    for (const r of [...cands].sort((a, b) => Math.abs(a) - Math.abs(b))) {
      base.attempts++;
      if (Math.abs(polyEval(base.remaining, r)) <= tol(base.remaining, r)) {
        found = r;
        break;
      }
    }
    if (found === null) break;
    let mult = 0;
    while (degree(base.remaining) >= 1 && Math.abs(polyEval(base.remaining, found)) <= tol(base.remaining, found) && mult < 12) {
      base.remaining = syntheticDivide(base.remaining, found);
      mult++;
    }
    const existing = base.roots.find((rr) => Math.abs(rr.x - found) < 1e-12);
    if (existing) existing.multiplicity += mult;
    else base.roots.push({ x: found as number, multiplicity: mult });
  }
  return base;
}
