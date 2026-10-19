import { describe, expect, it } from 'vitest';
import { scanRoots } from './roots';

const f = (src: string) => (x: number) => {
  // tiny eval via Function to keep tests readable
  return new Function('x', `with (Math) { return (${src}); }`)(x) as number;
};

describe('scanRoots: polynomials', () => {
  it('finds the roots of x^2 - 4 exactly-ish', () => {
    const scan = scanRoots(f('x*x - 4'), [-10, 10]);
    expect(scan.roots).toHaveLength(2);
    expect(scan.roots[0].x).toBeCloseTo(-2, 9);
    expect(scan.roots[1].x).toBeCloseTo(2, 9);
    expect(Math.abs(scan.roots[0].fx)).toBeLessThan(1e-9);
    expect(scan.roots.every((r) => !r.touches)).toBe(true);
    expect(scan.poles).toHaveLength(0);
  });

  it('finds all three irrational roots of x^3 - 3x + 1', () => {
    const scan = scanRoots(f('x*x*x - 3*x + 1'), [-5, 5]);
    expect(scan.roots).toHaveLength(3);
    const known = [-1.8793852416, 0.3472963553, 1.5320888862].sort((a, b) => a - b);
    for (let i = 0; i < 3; i++) expect(scan.roots[i].x).toBeCloseTo(known[i], 8);
  });

  it('is precise on steep functions', () => {
    const scan = scanRoots((x) => 1e6 * (x - 1.23456789), [-2, 2]);
    expect(scan.roots).toHaveLength(1);
    expect(scan.roots[0].x).toBeCloseTo(1.23456789, 9);
    expect(scan.poles).toHaveLength(0);
  });

  it('handles a transcendental root precisely (e^-x = x)', () => {
    const scan = scanRoots((x) => Math.exp(-x) - x, [0, 10]);
    expect(scan.roots).toHaveLength(1);
    expect(scan.roots[0].x).toBeCloseTo(0.5671432904, 9);
  });
});

describe('scanRoots: touching roots', () => {
  it('finds a double root where the curve does not cross', () => {
    const scan = scanRoots((x) => (x - 2) * (x - 2), [0, 4]);
    expect(scan.roots).toHaveLength(1);
    expect(scan.roots[0].touches).toBe(true);
    expect(scan.roots[0].x).toBeCloseTo(2, 7);
  });

  it('does not invent a root when the curve stays above zero', () => {
    const scan = scanRoots((x) => (x - 2) * (x - 2) + 1e-3, [0, 4]);
    expect(scan.roots).toHaveLength(0);
  });
});

describe('scanRoots: poles and domain gaps', () => {
  it('rejects the sign change at 1/x instead of inventing a root', () => {
    const scan = scanRoots((x) => 1 / x, [-5, 5]);
    expect(scan.roots).toHaveLength(0);
    expect(scan.poles.length + scan.gaps.length).toBeGreaterThan(0);
  });

  it('finds the zeros of tan(x) at ±π and 0, and rejects its asymptotes', () => {
    const scan = scanRoots(Math.tan, [-5, 5]);
    expect(scan.roots).toHaveLength(3); // x = −π, 0, π
    expect(scan.roots[0].x).toBeCloseTo(-Math.PI, 9);
    expect(scan.roots[1].x).toBeCloseTo(0, 9);
    expect(scan.roots[2].x).toBeCloseTo(Math.PI, 9);
    expect(scan.poles.length).toBeGreaterThanOrEqual(3); // ±π/2, ±3π/2 are skipped
  });

  it('records domain gaps for ln(x)', () => {
    const scan = scanRoots(Math.log, [-10, 10]);
    expect(scan.gaps.length).toBeGreaterThan(0);
    expect(scan.gaps[0][1]).toBeLessThanOrEqual(1e-12);
    expect(scan.roots).toHaveLength(1);
    expect(scan.roots[0].x).toBeCloseTo(1, 9);
  });
});

describe('scanRoots: sine over a wide range', () => {
  it('finds every multiple of π in range', () => {
    const scan = scanRoots(Math.sin, [-10, 10]);
    const expected = [-3, -2, -1, 0, 1, 2, 3].map((k) => k * Math.PI);
    expect(scan.roots).toHaveLength(7);
    scan.roots.forEach((r, i) => expect(r.x).toBeCloseTo(expected[i], 9));
  });
});

describe('intersections as roots of f - g', () => {
  it('solves x^2 = 4 - x', () => {
    const scan = scanRoots((x) => x * x - (4 - x), [-5, 5]);
    expect(scan.roots).toHaveLength(2);
    expect(scan.roots[0].x).toBeCloseTo((-1 - Math.sqrt(17)) / 2, 9);
    expect(scan.roots[1].x).toBeCloseTo((-1 + Math.sqrt(17)) / 2, 9);
  });
});
