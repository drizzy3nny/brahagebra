import { describe, expect, it } from 'vitest';
import { compileEntry } from './compile';
import { scanRoots } from './roots';
import { solutionText, solveRelation } from './solution';
import { insertAt } from './edit';

function relation(src: string) {
  const c = compileEntry(src, 'test').curve!;
  const scan = scanRoots(c.f, [-5, 5]);
  return solveRelation(c.node, scan, c.rel!.op);
}
describe('correctness regressions', () => {
  it('includes an isolated non-strict solution', () => {
    expect(solutionText(relation('x^2 <= 0'), '≤')).toBe('x = 0');
    expect(solutionText(relation('-(x-2)^2 >= 0'), '≥')).toBe('x = 2');
  });
  it('solves a linear inequality outside the graph', () => {
    expect(solutionText(relation('x >= 100'), '≥')).toBe('x ≥ 100');
  });
  it('does not extend sampled periodic solutions to infinity', () => {
    const set = relation('sin(x) > 0');
    expect(set.range).toEqual([-5, 5]);
    for (const iv of set.intervals) {
      expect(iv.a).not.toBeNull(); expect(iv.b).not.toBeNull();
    }
    expect(solutionText(set, '>')).toContain('numerical estimate');
  });
  it('keeps nearby distinct roots', () => {
    const scan = scanRoots(x => x * (x - 0.002), [-1, 1]);
    expect(scan.roots).toHaveLength(2);
  });
  it('finds touching roots between sample positions', () => {
    const scan = scanRoots(x => (x - 0.12345) ** 2, [-1, 1]);
    expect(scan.roots.some(r => Math.abs(r.x - 0.12345) < 1e-8)).toBe(true);
  });
  it('does not turn an identity into hundreds of dots', () => {
    expect(scanRoots(() => 0, [-5, 5]).roots).toHaveLength(0);
  });
  it('positions a function argument once', () => {
    const first = insertAt('', 0, 0, 'sqrt()', 1);
    expect(insertAt(first.text, first.caret, first.caret, '9').text).toBe('sqrt(9)');
  });
  it('accepts whitespace before a function definition', () => {
    expect(compileEntry('  y = x^2', 'test').error).toBeNull();
  });
});
