import { describe, expect, it } from 'vitest';
import { asPolynomial, degree, polyEval, rationalRoots, syntheticDivide } from './polynomial';
import { parse } from './parser';

const poly = (src: string) => asPolynomial(parse(src));

describe('asPolynomial', () => {
  it('expands products of factors', () => {
    const p = poly('(x-1)(x+2)');
    expect(p).not.toBeNull();
    expect(degree(p!)).toBe(2);
    expect(p!.c).toEqual([-2, 1, 1]);
  });

  it('handles coefficients, division by constants, integer powers', () => {
    expect(poly('2x^2 - 4')!.c).toEqual([-4, 0, 2]);
    expect(poly('x^2/2')!.c).toEqual([0, 0, 0.5]);
    expect(poly('3(x+1)^2')!.c).toEqual([3, 6, 3]);
    expect(poly('pi*x')!.c).toEqual([0, Math.PI]);
  });

  it('rejects non-polynomials', () => {
    expect(poly('sin(x)')).toBeNull();
    expect(poly('1/x')).toBeNull();
    expect(poly('e^x')).toBeNull();
    expect(poly('ln(x)+2')).toBeNull();
  });
});

describe('synthetic division', () => {
  it('divides x^2 - 1 by (x - 1)', () => {
    const q = syntheticDivide({ c: [-1, 0, 1] }, 1);
    expect(q.c).toEqual([1, 1]); // x + 1
    expect(polyEval(q, 2)).toBe(3); // x + 1 at x = 2
  });
});

describe('rationalRoots', () => {
  it('factors x^3 - 4x into x, x-2, x+2', () => {
    const { roots, remaining } = rationalRoots({ c: [0, -4, 0, 1] });
    expect(roots.map((r) => r.x).sort((a, b) => a - b)).toEqual([-2, 0, 2]);
    expect(degree(remaining)).toBeLessThanOrEqual(0);
  });

  it('detects multiplicity for (x - 2)^3', () => {
    const p = poly('(x-2)^3')!;
    const { roots } = rationalRoots(p);
    expect(roots).toHaveLength(1);
    expect(roots[0].x).toBeCloseTo(2, 12);
    expect(roots[0].multiplicity).toBe(3);
  });

  it('finds fractional roots of 2x^2 - 3x + 1', () => {
    const { roots } = rationalRoots(poly('2x^2 - 3x + 1')!);
    expect(roots.map((r) => r.x).sort((a, b) => a - b)).toEqual([0.5, 1]);
  });

  it('finds nothing for x^3 - 3x + 1 (irrational roots)', () => {
    const { roots, remaining } = rationalRoots(poly('x^3 - 3x + 1')!);
    expect(roots).toHaveLength(0);
    expect(degree(remaining)).toBe(3);
  });
});
