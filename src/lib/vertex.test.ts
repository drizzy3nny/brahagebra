import { describe, expect, it } from 'vitest';
import { compileEntry } from './compile';
import { quadraticVertex } from './vertex';

const vertex = (raw: string) => quadraticVertex(compileEntry(raw, 'test').curve?.poly ?? null);

describe('parabola vertices', () => {
  it('finds the vertex of the starting example', () => {
    expect(vertex('x^2 - 4')).toEqual({ x: 0, y: -4 });
  });
  it('handles shifted and downward opening parabolas', () => {
    expect(vertex('(x-3)^2+2')).toEqual({ x: 3, y: 2 });
    expect(vertex('-2x^2+8x-1')).toEqual({ x: 2, y: 7 });
  });
  it('uses the coordinates of the plotted equation or inequality', () => {
    expect(vertex('y = (x+1)^2+5')).toEqual({ x: -1, y: 5 });
    expect(vertex('x^2 = 4')).toEqual({ x: 0, y: -4 });
    expect(vertex('x^2 > 4')).toEqual({ x: 0, y: -4 });
  });
  it('does not invent vertices for non-quadratic graphs', () => {
    for (const raw of ['x', 'x^3', 'sin(x)', '4', 'x^2-x^2']) expect(vertex(raw)).toBeNull();
  });
  it('rejects nonfinite coordinates', () => {
    expect(quadraticVertex({ c: [Infinity, 0, 1] })).toBeNull();
  });
});
