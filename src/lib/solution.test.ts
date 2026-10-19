import { describe, expect, it } from 'vitest';
import { evaluate } from './eval';
import { parse } from './parser';
import { scanRoots } from './roots';
import { signChart, solutionText, solveRelation } from './solution';

const RANGE: [number, number] = [-12, 12];

function solve(src: string, op: '<' | '>' | '≤' | '≥') {
  const node = parse(src);
  const scan = scanRoots((x) => {
    try {
      return evaluate(node, x);
    } catch {
      return NaN;
    }
  }, RANGE);
  return { set: solveRelation(node, scan, op), scan, node };
}

describe('solveRelation', () => {
  it('solves x^2 - 4 > 0 as the two outer rays', () => {
    const { set } = solve('x^2 - 4', '>');
    expect(set.intervals).toHaveLength(2);
    expect(set.intervals[0].b).toBeCloseTo(-2, 6);
    expect(set.intervals[0].a).toBeNull();
    expect(set.intervals[1].a).toBeCloseTo(2, 6);
    expect(set.intervals[1].b).toBeNull();
    expect(solutionText(set, '>')).toBe('x < −2  or  x > 2');
  });

  it('solves x^2 - 4 ≤ 0 as the middle interval with endpoints included', () => {
    const { set } = solve('x^2 - 4', '≤');
    expect(set.intervals).toHaveLength(1);
    const iv = set.intervals[0];
    expect(iv.a).toBeCloseTo(-2, 6);
    expect(iv.b).toBeCloseTo(2, 6);
    expect(iv.aInc).toBe(true);
    expect(iv.bInc).toBe(true);
    expect(solutionText(set, '≤')).toBe('−2 ≤ x ≤ 2');
  });

  it('excludes endpoints for strict inequalities', () => {
    const { set } = solve('x^2 - 4', '<');
    const iv = set.intervals[0];
    expect(iv.aInc).toBe(false);
    expect(iv.bInc).toBe(false);
    expect(solutionText(set, '<')).toBe('−2 < x < 2');
  });

  it('reports all real x when everything holds', () => {
    const { set } = solve('x^2 + 1', '>');
    expect(set.allReal).toBe(true);
    expect(solutionText(set, '>')).toBe('all real x');
  });

  it('reports no solution when nothing holds', () => {
    const { set } = solve('x^2 + 1', '<');
    expect(set.empty).toBe(true);
    expect(solutionText(set, '<')).toBe('no solution');
  });

  it('merges both sides at a touching root for non-strict relations', () => {
    // (x−2)² ≥ 0 holds everywhere including the root at 2
    const { set } = solve('(x-2)^2', '≥');
    expect(set.allReal).toBe(true);
  });

  it('keeps the root excluded for strict touching relations', () => {
    // (x−2)² > 0 holds everywhere except x = 2
    const { set } = solve('(x-2)^2', '>');
    expect(solutionText(set, '>')).toBe('x < 2  or  x > 2');
  });

  it('handles 1/x > 0 with the pole at 0 as boundary', () => {
    const { set } = solve('1/x', '>');
    expect(set.intervals).toHaveLength(1);
    expect(set.intervals[0].a).toBeCloseTo(0, 6);
    expect(set.intervals[0].aInc).toBe(false);
    expect(set.range).toEqual(RANGE);
    expect(solutionText(set, '>')).toContain('numerical estimate');
    expect(set.intervals[0].b).toBe(12);
  });

  it('solves linear inequalities', () => {
    const { set } = solve('2*x - 3', '≤');
    expect(set.intervals).toHaveLength(1);
    expect(set.intervals[0].b).toBeCloseTo(1.5, 6);
    expect(solutionText(set, '≤')).toBe('x ≤ 1.5');
  });
});

describe('signChart', () => {
  it('labels intervals and marks the satisfying ones', () => {
    const node = parse('x^2 - 4');
    const scan = scanRoots((x) => x * x - 4, RANGE);
    const rows = signChart(node, scan, '>');
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const held = rows.filter((r) => r.holds);
    expect(held).toHaveLength(2);
    // test points in the outer intervals really do satisfy the relation
    for (const r of held) expect(r.fx).toBeGreaterThan(0);
    for (const r of rows.filter((x) => !x.holds)) expect(r.fx).toBeLessThan(0);
  });

  it('caps very long charts', () => {
    const node = parse('sin(x) - 0.2');
    const scan = scanRoots((x) => Math.sin(x) - 0.2, RANGE);
    const rows = signChart(node, scan, '>', 6);
    expect(rows.length).toBeLessThanOrEqual(6);
  });
});
