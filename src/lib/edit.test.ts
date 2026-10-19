import { describe, expect, it } from 'vitest';
import { backspace, insertAt, moveCaret } from './edit';

describe('insertAt', () => {
  it('inserts at an empty caret', () => {
    expect(insertAt('', 0, 0, 'x')).toEqual({ text: 'x', caret: 1 });
  });

  it('inserts in the middle, pushing the tail right', () => {
    expect(insertAt('x^2', 1, 1, '-4')).toEqual({ text: 'x-4^2', caret: 3 });
  });

  it('replaces the selection', () => {
    expect(insertAt('abcdef', 1, 4, 'X')).toEqual({ text: 'aXef', caret: 2 });
  });

  it('places the caret inside parens with caretBack', () => {
    // typing sqrt() into "2x" at the end should leave the caret between the parens
    const r = insertAt('2x', 2, 2, 'sqrt()', 1);
    expect(r.text).toBe('2xsqrt()');
    expect(r.caret).toBe(7); // between "(" and ")"
    expect(r.text.slice(0, r.caret)).toBe('2xsqrt(');
  });

  it('appends at the end by default', () => {
    expect(insertAt('sin(x', 5, 5, ')')).toEqual({ text: 'sin(x)', caret: 6 });
  });
});

describe('backspace', () => {
  it('deletes the character before the caret', () => {
    expect(backspace('x^2', 3, 3)).toEqual({ text: 'x^', caret: 2 });
  });

  it('deletes a selection in one go', () => {
    expect(backspace('x^2 - 4', 1, 7)).toEqual({ text: 'x', caret: 1 });
  });

  it('is a no-op at position zero', () => {
    expect(backspace('x', 0, 0)).toEqual({ text: 'x', caret: 0 });
  });

  it('never splits a surrogate pair', () => {
    // 𝜋 is two UTF-16 code units; backspacing it must remove both
    const text = 'x\ud835\udc6c'; // mathematical pi
    const r = backspace(text, text.length, text.length);
    expect(r.text).toBe('x');
    expect(r.caret).toBe(1);
  });
});

describe('moveCaret', () => {
  it('steps left and right', () => {
    expect(moveCaret('abc', 1, 1, -1)).toBe(0);
    expect(moveCaret('abc', 1, 1, 1)).toBe(2);
  });

  it('clamps at the ends', () => {
    expect(moveCaret('abc', 0, 0, -1)).toBe(0);
    expect(moveCaret('abc', 3, 3, 1)).toBe(3);
  });

  it('collapses a selection toward the direction of travel', () => {
    expect(moveCaret('abcdef', 1, 4, -1)).toBe(1);
    expect(moveCaret('abcdef', 1, 4, 1)).toBe(4);
  });
});
