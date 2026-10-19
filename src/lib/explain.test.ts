import { describe, expect, it } from 'vitest';
import { explainIntersection, explainRoot, type Explanation } from './explain';
import { evaluate } from './eval';
import { parse } from './parser';
import { asPolynomial } from './polynomial';
import { pretty } from './pretty';
import { scanRoots } from './roots';

const stepsOf = (e: Explanation): string =>
  e.steps
    .map((s) => `${s.title} ${s.body ?? ''} ${s.math ?? ''} ${s.table ? JSON.stringify(s.table) : ''}`)
    .join('\n');

function targetFor(src: string) {
  const node = parse(src);
  return { label: pretty(node), node, poly: asPolynomial(node) };
}

describe('explainRoot: quadratic with exact roots', () => {
  const t = targetFor('x^2 - 4');
  const scan = scanRoots((x) => evaluate(t.node, x), [-10, 10]);
  const root = scan.roots.find((r) => r.x > 0)!;
  const e = explainRoot(t, root, scan);
  const text = stepsOf(e);

  it('shows the discriminant and formula steps', () => {
    expect(text).toMatch(/Discriminant/i);
    expect(text).toMatch(/D = .*16/);
    expect(text).toMatch(/Quadratic formula/i);
    expect(text).toMatch(/√16/);
  });

  it('narrates how the dot was found and verifies it', () => {
    expect(text).toMatch(/Exact hit on the sampling grid|Bracket the sign change/i);
    expect(text).toMatch(/Check the answer/i);
    expect(e.steps.some((s) => s.kind === 'result')).toBe(true);
  });

  it('gives an exact answer', () => {
    expect(e.sub).toMatch(/x = 2/);
    expect(text).toMatch(/x = 2/);
  });
});

describe('explainRoot: irrational cubic', () => {
  const t = targetFor('x^3 - 3x + 1');
  const scan = scanRoots((x) => evaluate(t.node, x), [-5, 5]);
  const root = scan.roots[0];
  const e = explainRoot(t, root, scan);
  const text = stepsOf(e);

  it('applies the rational root theorem before going numeric', () => {
    expect(text).toMatch(/rational root theorem/i);
    expect(text).toMatch(/no rational roots/i);
  });

  it('brackets the sign change and shows a refinement table', () => {
    expect(text).toMatch(/Bracket the sign change/i);
    expect(text).toMatch(/Brent/i);
    expect(e.steps.some((s) => s.kind === 'table' && s.table!.rows.length > 1)).toBe(true);
  });

  it('ends with a high-precision numeric answer', () => {
    expect(e.sub).toMatch(/≈|−1\.879/);
    expect(root.x).toBeCloseTo(-1.8793852416, 8);
  });
});

describe('explainRoot: factoring x^3 - 4x', () => {
  const t = targetFor('x^3 - 4x');
  const scan = scanRoots((x) => evaluate(t.node, x), [-5, 5]);
  const root = scan.roots.find((r) => Math.abs(r.x - 2) < 1e-9)!;
  const e = explainRoot(t, root, scan);
  const text = stepsOf(e);

  it('factors completely and reports the exact root', () => {
    expect(text).toMatch(/Test x = 2/);
    expect(text).toMatch(/factored/i);
    expect(e.sub).toMatch(/x = 2/);
  });
});

describe('explainRoot: touching root', () => {
  const t = targetFor('(x - 2)^2');
  const scan = scanRoots((x) => evaluate(t.node, x), [0, 4]);
  const root = scan.roots[0];
  expect(root.touches).toBe(true);
  const e = explainRoot(t, root, scan);
  const text = stepsOf(e);

  it('explains that there is no sign change and the curve touches', () => {
    expect(text).toMatch(/touches/i);
    expect(text).toMatch(/same sign|Golden-section/i);
    expect(e.sub).toMatch(/x = 2/);
  });
});

describe('explainIntersection: line meets parabola', () => {
  const a = targetFor('x^2');
  const b = targetFor('4 - x');
  const scan = scanRoots((x) => evaluate(a.node, x) - evaluate(b.node, x), [-5, 5]);
  const root = scan.roots[scan.roots.length - 1];
  const e = explainIntersection(a, b, root, scan);
  const text = stepsOf(e);

  it('sets the curves equal, subtracts and solves', () => {
    expect(text).toMatch(/What I am solving/i);
    expect(text).toMatch(/= 0/);
    expect(e.headline).toMatch(/∩/);
    expect(text).toMatch(/Quadratic formula/i);
  });

  it('reports the point with both coordinates', () => {
    expect(e.sub).toMatch(/\(/);
    expect(text).toMatch(/\(x, y\) =/);
    expect(root.x).toBeCloseTo((-1 + Math.sqrt(17)) / 2, 9);
  });
});
