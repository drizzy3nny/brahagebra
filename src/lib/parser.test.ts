import { describe, expect, it } from 'vitest';
import { evaluate } from './eval';
import { parse } from './parser';
import { ParseError } from './tokenize';

const v = (src: string, x = 0): number => evaluate(parse(src), x);

describe('parser: precedence and associativity', () => {
  it('respects + and * precedence', () => {
    expect(v('2 + 3 * 4')).toBe(14);
    expect(v('2 * 3 + 4')).toBe(10);
    expect(v('12 / 4 / 3')).toBe(1);
  });

  it('treats ^ as right-associative', () => {
    expect(v('2 ^ 3 ^ 2')).toBe(512);
    expect(v('2^3^2')).toBe(512);
  });

  it('binds unary minus looser than ^', () => {
    expect(v('-2^2')).toBe(-4);
    expect(v('(-2)^2')).toBe(4);
    expect(v('2^-1')).toBe(0.5);
  });
});

describe('parser: implicit multiplication (easy input)', () => {
  it('handles 2x', () => {
    expect(v('2x', 3)).toBe(6);
    expect(v('2 x', 5)).toBe(10);
  });
  it('handles 3(x+1)', () => {
    expect(v('3(x+1)', 2)).toBe(9);
  });
  it('handles (x-1)(x+1)', () => {
    expect(v('(x-1)(x+1)', 3)).toBe(8);
  });
  it('handles 2sin(x)', () => {
    expect(v('2sin(pi/2)')).toBeCloseTo(2, 12);
  });
  it('does not swallow the minus sign as multiplication', () => {
    expect(v('2 -3')).toBe(-1);
    expect(v('5 - 2x', 2)).toBe(1);
  });
});

describe('parser: unicode input', () => {
  it('accepts superscripts, pi, and typed operators', () => {
    expect(v('x²', 4)).toBe(16);
    expect(v('x³', 3)).toBe(27);
    expect(v('π × 2')).toBeCloseTo(2 * Math.PI, 12);
    expect(v('10 ÷ 4')).toBe(2.5);
    expect(v('−3')).toBe(-3);
  });
});

describe('parser: friendly errors', () => {
  const err = (src: string): ParseError => {
    try {
      parse(src);
    } catch (e) {
      if (e instanceof ParseError) return e;
      throw e;
    }
    throw new Error(`expected a ParseError for: ${src}`);
  };

  it('flags unclosed parentheses at the position where ) is missing', () => {
    const e = err('(x+1');
    expect(e.message).toMatch(/closing parenthesis/i);
    expect(e.pos).toBe(4);
  });

  it('flags trailing operators', () => {
    expect(err('2+').message).toMatch(/ends too early/i);
  });

  it('suggests a near-miss function name', () => {
    expect(err('sinn(x)').message).toMatch(/did you mean sin/i);
  });

  it('rejects bare y with a helpful hint', () => {
    expect(err('y').message).toMatch(/right side/i);
  });

  it('rejects functions called without parentheses', () => {
    expect(err('sin pi').message).toMatch(/needs parentheses/i);
  });

  it('flags empty input', () => {
    expect(err('   ').message).toMatch(/empty/i);
  });

  it('flags unsupported characters with a sqrt hint', () => {
    expect(err('√4').message).toMatch(/sqrt/i);
  });

  it('reports the offending token position', () => {
    const e = err('2 + * 3');
    expect(e.pos).toBe(4);
  });
});

describe('evaluator', () => {
  it('knows constants', () => {
    expect(v('pi')).toBeCloseTo(Math.PI, 12);
    expect(v('e')).toBeCloseTo(Math.E, 12);
    expect(v('pi/2')).toBeCloseTo(Math.PI / 2, 12);
  });

  it('knows functions', () => {
    expect(v('sin(pi/2)')).toBeCloseTo(1, 12);
    expect(v('ln(e)')).toBeCloseTo(1, 12);
    expect(v('log(100)')).toBe(2);
    expect(v('log(2, 8)')).toBe(3);
    expect(v('sqrt(2)^2')).toBeCloseTo(2, 12);
    expect(v('abs(-7)')).toBe(7);
    expect(v('min(3, 8)')).toBe(3);
    expect(v('mod(-7, 3)')).toBe(2);
  });

  it('propagates IEEE results instead of throwing', () => {
    expect(v('1/0')).toBe(Infinity);
    expect(Number.isNaN(v('0/0'))).toBe(true);
    expect(Number.isNaN(v('ln(-1)'))).toBe(true);
  });
});
