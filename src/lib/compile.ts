import type { Node } from './ast';
import { EvalError, evaluate } from './eval';
import { asPolynomial, type Poly } from './polynomial';
import { pretty } from './pretty';
import { parse } from './parser';
import { ParseError } from './tokenize';
import type { RelOp } from './solution';

export interface Curve {
  id: string;
  raw: string;
  /** pretty-printed form of the plotted expression */
  label: string;
  node: Node;
  poly: Poly | null;
  f: (x: number) => number;
  /** original text when the entry was an equation like "x^2 = 4" */
  equationText: string | null;
  /** set when the entry was an inequality like "x^2 > 4" — the curve is lhs − rhs */
  rel: { op: RelOp; text: string } | null;
}

export interface CompileError {
  message: string;
  pos: number;
  len: number;
}

export interface CompileResult {
  curve: Curve | null;
  error: CompileError | null;
}

/**
 * Accepted input forms:
 *   x^2 - 4          function
 *   y = sin(x)       (y is optional and stripped)
 *   f(x) = x^2 - 4   (definition-style prefix is stripped)
 *   x^2 = 4          equation → plotted as x^2 − 4 (dots = solutions)
 */
export function compileEntry(raw: string, id: string): CompileResult {
  if (raw.trim() === '') return { curve: null, error: null };
  if (raw.length > 2000) return { curve: null, error: { message: 'Keep expressions under 2,000 characters.', pos: 0, len: 1 } };
  const src = raw.trim();
  let pieceBase = 0;
  try {
    let text = src;
    const ym = /^y\s*=\s*/i.exec(text);
    const fm = /^[A-Za-z_]\w*\s*\(\s*[A-Za-z_]\w*\s*\)\s*=/.exec(text);
    if (ym) text = text.slice(ym[0].length);
    else if (fm) text = text.slice(fm[0].length);
    const base = src.length - text.length;

    const relMatch = /(<=|>=|≤|≥|<|>)/.exec(text);
    const eqIdx = text.indexOf('=');
    let node: Node;
    let equationText: string | null = null;
    let rel: { op: RelOp; text: string } | null = null;
    if (relMatch && (eqIdx < 0 || relMatch.index <= eqIdx)) {
      const opRaw = relMatch[0];
      const op: RelOp = opRaw === '<=' ? '≤' : opRaw === '>=' ? '≥' : (opRaw as RelOp);
      const lhsText = text.slice(0, relMatch.index);
      const rhsText = text.slice(relMatch.index + opRaw.length);
      const rhsFinal = rhsText.trim() === '' ? '0' : rhsText;
      pieceBase = base;
      const lhsNode = parse(lhsText);
      pieceBase = base + relMatch.index + opRaw.length;
      const rhsNode = parse(rhsFinal);
      node = { kind: 'bin', op: '-', a: lhsNode, b: rhsNode, pos: base, len: text.length };
      rel = { op, text: `${pretty(lhsNode)} ${op} ${pretty(rhsNode)}` };
    } else if (eqIdx >= 0) {
      const lhsText = text.slice(0, eqIdx);
      const rhsText = text.slice(eqIdx + 1);
      const rhsFinal = rhsText.trim() === '' ? '0' : rhsText;
      pieceBase = base;
      const lhsNode = parse(lhsText);
      pieceBase = base + eqIdx + 1;
      const rhsNode = parse(rhsFinal);
      node = { kind: 'bin', op: '-', a: lhsNode, b: rhsNode, pos: base, len: text.length };
      equationText = src;
    } else {
      pieceBase = base;
      node = parse(text);
    }

    for (const x of [0, 1, -1, 2.5, -2.5]) {
      try {
        evaluate(node, x);
      } catch (e) {
        if (e instanceof EvalError) {
          return { curve: null, error: { message: e.message, pos: node.pos, len: Math.max(1, node.len) } };
        }
        throw e;
      }
    }

    const f = (x: number): number => {
      try {
        return evaluate(node, x);
      } catch {
        return NaN;
      }
    };

    return {
      curve: {
        id,
        raw,
        label: pretty(node),
        node,
        poly: asPolynomial(node),
        f,
        equationText,
        rel,
      },
      error: null,
    };
  } catch (e) {
    if (e instanceof RangeError) {
      return { curve: null, error: { message: 'This expression is too deeply nested. Split it into simpler expressions.', pos: 0, len: 1 } };
    }
    if (e instanceof ParseError) {
      return { curve: null, error: { message: e.message, pos: e.pos + pieceBase, len: e.len } };
    }
    throw e;
  }
}
