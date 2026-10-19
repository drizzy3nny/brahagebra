import type { Node } from './ast';
import { evaluate } from './eval';
import { formatNumber } from './format';
import { asPolynomial, degree, integerize, polyEval, rationalRoots, type Poly } from './polynomial';
import { pretty } from './pretty';
import type { Root, RootScan } from './roots';
import { signChart, solutionText, solveRelation, type RelOp } from './solution';

export type StepKind = 'plan' | 'algebra' | 'numeric' | 'table' | 'verify' | 'result' | 'note';

export interface Table {
  headers: string[];
  rows: string[][];
}

export interface Step {
  kind: StepKind;
  title: string;
  body?: string;
  /** display math line */
  math?: string;
  table?: Table;
}

export interface Explanation {
  headline: string;
  sub: string;
  steps: Step[];
}

/** Anything that can be zeroed: a plotted curve or f − g for intersections. */
export interface ExplainTarget {
  label: string;
  node: Node;
  poly: Poly | null;
}

const MINUS = '\u2212';

/** Render an integer fraction like −3/2 when the decimal is exactly rational with small denominator. */
function fractionOf(x: number, maxDen = 999): string | null {
  if (!Number.isFinite(x)) return null;
  if (Number.isInteger(x)) return formatNumber(x, 15);
  const a = Math.abs(x);
  if (a >= 1e6) return null;
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(a * d);
    if (Math.abs(a - n / d) <= 1e-10 * Math.max(1, a)) {
      if (d === 1) return x < 0 ? MINUS + String(n) : String(n);
      const num = x < 0 ? MINUS + n : String(n);
      return `${num}/${d}`;
    }
  }
  return null;
}

function formatX(x: number): string {
  const frac = fractionOf(x);
  if (frac) return frac;
  return formatNumber(x, 12);
}

function isPerfectSquare(n: number): number | null {
  if (n < 0) return null;
  const r = Math.round(Math.sqrt(n));
  return r * r === n ? r : null;
}

function integerCoeffs(p: Poly): number[] | null {
  const int = integerize(p);
  if (!int) {
    if (p.c.every((v) => Number.isInteger(v))) return p.c.slice();
    return null;
  }
  return int.c;
}

function pad2(p: Poly): [number, number, number] {
  return [p.c[0] ?? 0, p.c[1] ?? 0, p.c[2] ?? 0];
}

function sup(n: number): string {
  if (n === 2) return '\u00b2';
  if (n === 3) return '\u00b3';
  return `^${n}`;
}

/** Render a polynomial as readable math: x³ − 3x + 1 */
function polyPretty(p: Poly): string {
  const d = degree(p);
  if (d <= 0) return formatNumber(p.c[0] ?? 0, 10);
  const parts: string[] = [];
  for (let k = d; k >= 0; k--) {
    const c = p.c[k];
    if (!c) continue;
    const abs = Math.abs(c);
    const coeffText = k > 0 && abs === 1 ? '' : formatNumber(abs, 10);
    const varPart = k === 0 ? '' : k === 1 ? 'x' : `x${sup(k)}`;
    const sign = parts.length === 0 ? (c < 0 ? MINUS : '') : c < 0 ? ` ${MINUS} ` : ' + ';
    parts.push(sign + coeffText + varPart);
  }
  return parts.join('') || '0';
}

/* ------------------------------------------------------------------ */
/* Exact algebraic solutions                                          */
/* ------------------------------------------------------------------ */

interface AlgebraResult {
  steps: Step[];
  /** exact display text for THIS root when algebra nails it, e.g. "x = 2" */
  exactText: string | null;
}

function linearSteps(p: Poly, root: Root): AlgebraResult {
  const [b, a] = pad2(p);
  const steps: Step[] = [];
  steps.push({
    kind: 'algebra',
    title: 'Recognise the shape',
    body: `This is linear: ax + b = 0, with a = ${formatNumber(a, 10)} and b = ${formatNumber(b, 10)}.`,
    math: `${formatNumber(a, 10)}x ${b < 0 ? MINUS : '+'} ${formatNumber(Math.abs(b), 10)} = 0`,
  });
  const x = -b / a;
  const frac = fractionOf(x);
  steps.push({
    kind: 'algebra',
    title: 'Isolate x',
    body: 'Move b to the other side, then divide by a.',
    math: `x = ${formatNumber(-b, 10)} \u00f7 ${formatNumber(a, 10)} = ${frac ?? formatNumber(x, 12)}`,
  });
  const hit = Math.abs(x - root.x) <= 1e-6 * (1 + Math.abs(x));
  return { steps, exactText: hit ? `x = ${frac ?? formatNumber(x, 12)}` : null };
}

function quadraticSteps(p: Poly, root: Root): AlgebraResult {
  const [c, b, a] = pad2(p);
  const steps: Step[] = [];
  steps.push({
    kind: 'algebra',
    title: 'Read the coefficients',
    body: 'Write it as ax² + bx + c = 0.',
    math: `${formatNumber(a, 10)}x\u00b2 ${b < 0 ? MINUS : '+'} ${formatNumber(Math.abs(b), 10)}x ${c < 0 ? MINUS : '+'} ${formatNumber(Math.abs(c), 10)} = 0`,
  });

  const D = b * b - 4 * a * c;
  steps.push({
    kind: 'algebra',
    title: 'Discriminant',
    body: 'D = b² − 4ac decides the roots.',
    math: `D = (${formatNumber(b, 10)})\u00b2 \u2212 4\u00b7${formatNumber(a, 10)}\u00b7${formatNumber(c, 10)} = ${formatNumber(D, 12)}`,
  });
  if (D < 0) {
    steps.push({
      kind: 'algebra',
      title: 'No real roots',
      body: 'D < 0, so this curve never meets the x-axis with real numbers.',
    });
    return { steps, exactText: null };
  }

  const twoA = 2 * a;
  const rootsN = [(-b + Math.sqrt(D)) / twoA, (-b - Math.sqrt(D)) / twoA];
  const ic = integerCoeffs(p);
  const Dint = ic ? ic[1] * ic[1] - 4 * ic[0] * ic[2] : null;
  const sq = Dint !== null ? isPerfectSquare(Dint) : null;
  let exactPair: [string, string] | null = null;
  if (Dint !== null && Dint >= 0 && ic) {
    const [, bI, aI] = ic;
    const negB = -bI;
    const den = 2 * aI;
    const mk = (signStr: '+' | '-') => {
      const shown = signStr === '+' ? '+' : MINUS;
      const surdFull = `\u221a${formatNumber(Dint, 10)}`;
      const numPart = `${formatNumber(negB, 10)} ${shown} ${surdFull}`;
      const simple = sq !== null ? (negB + (signStr === '+' ? sq : -sq)) / den : null;
      const approx = (simple !== null && fractionOf(simple)) || (simple !== null ? formatNumber(simple, 12) : '');
      return `x = (${numPart}) / ${formatNumber(den, 10)}${simple !== null ? ` = ${approx}` : ` \u2248 ${formatNumber(rootsN[signStr === '+' ? 0 : 1], 12)}`}`;
    };
    exactPair = [mk('+'), mk('-')];
  }

  steps.push({
    kind: 'algebra',
    title: 'Quadratic formula',
    body: 'x = (−b ± √D) / (2a) — with the sign matching each root.',
    math:
      exactPair !== null
        ? `${exactPair[0]}\n${exactPair[1]}`
        : `x = (${formatNumber(-b, 10)} \u00b1 ${formatNumber(Math.sqrt(D), 10)}) / ${formatNumber(twoA, 10)}`,
  });

  const which = Math.abs(rootsN[0] - root.x) <= Math.abs(rootsN[1] - root.x) ? 0 : 1;
  const hit = Math.abs(rootsN[which] - root.x) <= 1e-6 * (1 + Math.abs(rootsN[which]));
  if (hit) {
    if (Dint !== null && sq !== null) {
      const simple = rootsN[which];
      const frac = fractionOf(simple);
      return { steps, exactText: `x = ${frac ?? formatNumber(simple, 12)}` };
    }
    if (exactPair) return { steps, exactText: exactPair[which] };
    return { steps, exactText: `x = ${formatX(rootsN[which])}` };
  }
  return { steps, exactText: null };
}

function cubicAndUpSteps(p: Poly, root: Root): AlgebraResult {
  const steps: Step[] = [];
  const int = integerCoeffs(p);
  const { roots: rat, remaining, attempts, candidates } = rationalRoots(p);
  const testedHint = (n: number): string => {
    const samples: string[] = [];
    for (let k = 0; k < n; k++) {
      const cand = [1, -1, 2, -2, 3, -3, 4, -4][k];
      if (cand === undefined) break;
      samples.push(`f(${cand}) = ${formatNumber(polyEval(p, cand), 6)}`);
    }
    return samples.join(', ');
  };

  if (int) {
    steps.push({
      kind: 'algebra',
      title: 'Integer coefficients → rational root theorem',
      body: 'For integer coefficients, any rational root p/q has p dividing the constant term and q dividing the leading coefficient.',
      math: `possible roots: \u00b1(p | ${int[0]}) / (q | ${int[degree(p)]})`,
    });
  }

  if (rat.length === 0) {
    steps.push({
      kind: 'algebra',
      title: 'No rational roots',
      body: candidates
        ? `I tested ${attempts} candidates (e.g. ${testedHint(4)}) — none gives zero, so every root is irrational and needs numerical refinement.`
        : 'The coefficients are not integers, so the rational-root shortcut does not apply; refine numerically.',
    });
    return { steps, exactText: null };
  }

  let current = p;
  const factorLines: string[] = [];
  for (const r of rat.slice(0, 6)) {
    const val = polyEval(current, r.x);
    const at = formatX(r.x);
    if (degree(current) >= 1) {
      steps.push({
        kind: 'algebra',
        title: `Test x = ${at}`,
        body: 'Plug the candidate into the polynomial.',
        math: `f(${at}) = ${formatNumber(val, 10)} ${Math.abs(val) < 1e-9 ? '= 0 \u2713' : ''}`,
      });
      current = rationalRootsStepDivide(current, r.x);
      factorLines.push(r.multiplicity > 1 ? `(x ${MINUS} ${at})^${r.multiplicity}` : `(x ${MINUS} ${at})`);
    }
  }
  if (degree(current) >= 1) {
    factorLines.push(polyPretty(current));
    steps.push({
      kind: 'algebra',
      title: 'Factor it down',
      body: 'Synthetic division peels off each root; what is left has no more rational roots.',
      math: factorLines.join(' \u00b7 '),
    });
  } else {
    steps.push({
      kind: 'algebra',
      title: 'Fully factored',
      body: 'Synthetic division reduced it to a constant — every root is accounted for.',
      math: factorLines.join(' \u00b7 '),
    });
  }

  const match = rat.find((r) => Math.abs(r.x - root.x) <= 1e-6 * (1 + Math.abs(r.x)));
  if (match) {
    const at = formatX(match.x);
    const mult = match.multiplicity > 1 ? ` (multiplicity ${match.multiplicity} — the curve flattens against the axis)` : '';
    return { steps, exactText: `x = ${at}` + mult };
  }
  if (degree(remaining) >= 1) {
    steps.push({
      kind: 'algebra',
      title: 'This dot comes from the leftover factor',
      body: `${polyPretty(remaining)} = 0 has no rational roots — the graph dot is one of its irrational solutions, so I refine it numerically below.`,
    });
  }
  return { steps, exactText: null };
}

/** Divide out a known root so the factor list can keep building. */
function rationalRootsStepDivide(p: Poly, r: number): Poly {
  const n = degree(p);
  const q = new Array<number>(Math.max(0, n)).fill(0);
  let acc = 0;
  for (let i = n; i >= 1; i--) {
    acc = acc * r + p.c[i];
    q[i - 1] = acc;
  }
  const c = q.slice();
  while (c.length > 1 && c[c.length - 1] === 0) c.pop();
  if (c.length === 0) c.push(0);
  return { c };
}

function algebraicSteps(target: ExplainTarget, root: Root): AlgebraResult {
  const p = target.poly;
  if (!p) return { steps: [], exactText: null };
  const d = degree(p);
  if (d < 1) return { steps: [], exactText: null };
  if (d === 1) return linearSteps(p, root);
  if (d === 2) return quadraticSteps(p, root);
  return cubicAndUpSteps(p, root);
}

/* ------------------------------------------------------------------ */
/* Numerical refinement (what actually produced the dot)              */
/* ------------------------------------------------------------------ */

function pickRows<T>(rows: T[], max = 8): T[] {
  if (rows.length <= max) return rows.slice();
  const head = rows.slice(0, Math.ceil(max / 2) - 1);
  const tail = rows.slice(-Math.floor(max / 2));
  const out: T[] = [...head];
  out.push({ ellipsis: true } as unknown as T);
  out.push(...tail);
  return out;
}

function iterationTable(root: Root): Table {
  const isTouch = root.method === 'touch';
  const headers = ['step', 'x', isTouch ? '|f(x)|' : 'f(x)', 'interval width'];
  const rows: string[][] = [];
  const chosen = pickRows(root.iters);
  for (const row of chosen) {
    const r = row as { i?: number; a?: number; b?: number; x: number; fx: number };
    if ((r as { ellipsis?: boolean }).ellipsis) {
      rows.push(['\u22ee', '', '', '']);
      continue;
    }
    const width = r.a !== undefined && r.b !== undefined ? Math.abs(r.b - r.a) : NaN;
    rows.push([
      r.i !== undefined ? String(r.i) : '',
      formatNumber(r.x, 9),
      formatNumber(r.fx, 4),
      Number.isFinite(width) ? formatNumber(width, 3) : '',
    ]);
  }
  return { headers, rows };
}

function numericSteps(target: ExplainTarget, root: Root, scan: RootScan): Step[] {
  const steps: Step[] = [];
  const label = target.label;
  const [a, b] = root.bracket;

  if (root.method === 'exact') {
    steps.push({
      kind: 'numeric',
      title: root.touches ? 'Exact zero on the grid — the curve touches' : 'Exact hit on the sampling grid',
      body: `The sample spacing is ${formatNumber(scan.sampleStep, 3)}, and one sample landed exactly on a zero of ${label}.${
        root.touches
          ? ' The values on both sides keep the same sign, so the curve touches the axis here instead of crossing it.'
          : ' The values on either side flip sign, so the curve crosses the axis here.'
      }`,
      math: `f(${formatNumber(root.x, 10)}) = 0`,
    });
    return steps;
  }

  if (root.method === 'touch') {
    steps.push({
      kind: 'numeric',
      title: 'No sign change → the curve only touches',
      body: `f keeps the same sign on both sides of x \u2248 ${formatNumber(root.x, 6)}, so there is nothing to bracket. Instead I minimise |f| inside [${formatNumber(a, 6)}, ${formatNumber(b, 6)}] — where |f| bottoms out is the touching root.`,
      math: `f(${formatNumber(a, 6)}) = ${formatNumber(evaluate(target.node, a), 6)},  f(${formatNumber(b, 6)}) = ${formatNumber(evaluate(target.node, b), 6)}  (same sign)`,
    });
    steps.push({
      kind: 'table',
      title: 'Golden-section search on |f|',
      body: 'Each row narrows the window by the golden ratio until it is at machine precision.',
      table: iterationTable(root),
    });
    return steps;
  }

  const fa = evaluate(target.node, a);
  const fb = evaluate(target.node, b);
  steps.push({
    kind: 'numeric',
    title: 'Bracket the sign change',
    body: `I sample every ${formatNumber(scan.sampleStep, 3)} along the range. Between these two neighbours ${label} flips sign, so a root must sit between them (Intermediate Value Theorem).`,
    math: `f(${formatNumber(a, 9)}) = ${formatNumber(fa, 6)} ${fa < 0 ? '<' : '>'} 0,   f(${formatNumber(b, 9)}) = ${formatNumber(fb, 6)} ${fb > 0 ? '>' : '<'} 0`,
  });
  steps.push({
    kind: 'table',
    title: 'Refine with Brent\u2019s method',
    body: 'Bisection halves the bracket every step (guaranteed convergence) and adds secant / inverse-quadratic interpolation to jump ahead whenever that stays safe. It stops when the bracket is below 1e\u221213 wide.',
    table: iterationTable(root),
  });
  return steps;
}

function verifyStep(target: ExplainTarget, root: Root): Step {
  const fx = evaluate(target.node, root.x);
  const small = Math.abs(fx) < 1e-6;
  return {
    kind: 'verify',
    title: 'Check the answer',
    body: small
      ? 'Plugging the answer back in gives essentially zero — the residual is at the limit of double-precision arithmetic.'
      : 'The residual is tiny relative to the scale of the curve.',
    math: `f(${formatNumber(root.x, 12)}) = ${formatNumber(fx, 6)} ${small ? '\u2248 0' : ''}`,
  };
}

function environmentNotes(scan: RootScan): Step[] {
  const steps: Step[] = [];
  if (scan.poles.length > 0) {
    const list = scan.poles.slice(0, 3).map((x) => formatNumber(x, 6)).join(', ');
    steps.push({
      kind: 'note',
      title: 'Asymptotes skipped',
      body: `${scan.poles.length} sign change${scan.poles.length > 1 ? 's' : ''} happened at vertical asymptotes (x \u2248 ${list}${scan.poles.length > 3 ? ', \u2026' : ''}) — the curve explodes there instead of crossing zero, so those are not roots.`,
    });
  }
  if (scan.gaps.length > 0) {
    steps.push({
      kind: 'note',
      title: 'Undefined regions ignored',
      body: `The curve is undefined on ${scan.gaps.length} part${scan.gaps.length > 1 ? 's' : ''} of this range (e.g. before x = 0 for ln) — nothing to solve there.`,
    });
  }
  return steps;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

function buildExplanation(
  headline: string,
  sub: string,
  goal: Step,
  target: ExplainTarget,
  root: Root,
  scan: RootScan,
  result: Step,
): Explanation {
  const alg = algebraicSteps(target, root);
  const steps: Step[] = [goal, ...alg.steps, ...numericSteps(target, root, scan), verifyStep(target, root), result, ...environmentNotes(scan)];
  return { headline, sub, steps };
}

export function explainRoot(
  target: ExplainTarget,
  root: Root,
  scan: RootScan,
  extra?: { equationText?: string; rel?: { op: RelOp; text: string } },
): Explanation {
  const label = target.label;
  const rel = extra?.rel;
  const goal: Step = rel
    ? {
        kind: 'plan',
        title: 'What I am solving',
        body: `You asked where ${rel.text}. The dots are the boundary points where both sides are equal; the sign chart below shows which side of each boundary satisfies the inequality.`,
        math: `${label} = 0`,
      }
    : extra?.equationText
    ? {
        kind: 'plan',
        title: 'What I am solving',
        body: `You asked for ${extra.equationText}. Moving everything to one side gives the curve below, and its dots are the solutions.`,
        math: `${label} = 0`,
      }
    : {
        kind: 'plan',
        title: 'What I am solving',
        body: 'A root is a point where the curve meets the x-axis, so I look for f(x) = 0 across the visible range.',
        math: `${label} = 0`,
      };

  const alg = algebraicSteps(target, root);
  const exactBody =
    root.touches
      ? 'Touching root (even multiplicity): the curve reaches the axis and turns back.'
      : root.method === 'exact'
        ? 'Exact value from the sample grid, confirmed below.'
        : 'Confirmed by numerical refinement below.';
  const result: Step = alg.exactText
    ? { kind: 'result', title: 'Answer', body: exactBody, math: alg.exactText }
    : {
        kind: 'result',
        title: 'Answer',
        body: root.touches
          ? 'Touching root (even multiplicity): the curve reaches the axis and turns back.'
          : 'Numerical estimate; a decimal approximation does not establish whether a root is irrational.',
        math: `x \u2248 ${formatNumber(root.x, 12)}`,
      };

  const sub = alg.exactText ?? `x \u2248 ${formatNumber(root.x, 12)}`;
  const base = buildExplanation(label, sub, goal, target, root, scan, result);
  if (rel) return withRelationSteps(base, target, scan, rel.op);
  return base;
}

/** Replace the tail of a root explanation with the inequality sign chart + solution set. */
function withRelationSteps(
  expl: Explanation,
  target: ExplainTarget,
  scan: RootScan,
  op: RelOp,
): Explanation {
  const node = target.node;
  const set = solveRelation(node, scan, op);
  const chart = signChart(node, scan, op);
  const nonStrict = op === '≤' || op === '≥';
  const signStep: Step = {
    kind: 'table',
    title: 'Sign chart',
    body: `This chart samples intervals between detected boundaries in the visible range. Numerical scanning can miss narrow features. I need f(x) ${op} 0.`,
    table: {
      headers: ['interval', 'test x', `f(x)`, `f(x) ${op} 0?`],
      rows: chart.map((r) => [
        r.label,
        formatNumber(r.testX, 6),
        formatNumber(r.fx, 6),
        r.holds ? 'yes' : 'no',
      ]),
    },
  };
  const answer: Step = {
    kind: 'result',
    title: 'Solution set',
    body: nonStrict
      ? 'Boundary points where f = 0 are included (≤ or ≥), shown as filled dots.'
      : 'Boundary points where f = 0 are excluded (strict < or >), shown as hollow dots.',
    math: solutionText(set, op),
  };
  // keep goal → algebra/numeric → verify → notes; swap the generic answer for chart + set
  const head = expl.steps.filter((s) => s.kind !== 'result');
  return { ...expl, steps: [...head, signStep, answer], sub: solutionText(set, op) };
}

export function explainIntersection(
  a: ExplainTarget,
  b: ExplainTarget,
  root: Root,
  scan: RootScan,
): Explanation {
  const diffNode: Node = {
    kind: 'bin',
    op: '-',
    a: a.node,
    b: b.node,
    pos: 0,
    len: 0,
  };
  const diffTarget: ExplainTarget = {
    label: pretty(diffNode),
    node: diffNode,
    poly: asPolynomial(diffNode),
  };
  const y = (evaluate(a.node, root.x) + evaluate(b.node, root.x)) / 2;
  const goal: Step = {
    kind: 'plan',
    title: 'What I am solving',
    body: 'An intersection is where both curves share the same y, so set them equal and move everything to one side.',
    math: `${a.label} = ${b.label}\n\u21d2 ${diffTarget.label} = 0`,
  };
  const result: Step = {
    kind: 'result',
    title: 'Answer',
    body: root.touches ? 'The curves touch here (they graze each other) instead of crossing.' : 'The curves cross at this point.',
    math: `(x, y) = (${formatNumber(root.x, 12)}, ${formatNumber(y, 12)})`,
  };
  return buildExplanation(
    `${a.label}  \u2229  ${b.label}`,
    `(${formatNumber(root.x, 12)}, ${formatNumber(y, 12)})`,
    goal,
    diffTarget,
    root,
    scan,
    result,
  );
}

export function explainSelection(selection: import('../types').Selection | null): Explanation | null {
  if (selection?.kind === 'marker') return {
    headline: 'A point you placed',
    sub: `(${formatNumber(selection.x, 8)}, ${formatNumber(selection.y, 8)})`,
    steps: [
      { kind: 'plan', title: 'Read the coordinates', body: 'The first coordinate is the horizontal position x. The second is the vertical position y.', math: `x = ${formatNumber(selection.x, 8)}\ny = ${formatNumber(selection.y, 8)}` },
      { kind: 'note', title: 'This is a placed point', body: 'These coordinates came from your input. They are not a calculated root or intersection. Select a curve’s root or intersection to inspect its solution steps.' },
    ],
  };
  return null;
}
