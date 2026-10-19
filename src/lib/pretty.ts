import type { BinOp, Node } from './ast';
import { formatNumber } from './format';

const PREC: Record<BinOp | 'un', number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4, un: 3 };

const SUP: Record<string, string> = { '2': '\u00b2', '3': '\u00b3', '4': '\u2074', '5': '\u2075' };

function needsParens(child: Node, parentPrec: number, side: 'a' | 'b', op: BinOp | 'un'): boolean {
  if (child.kind === 'num' && child.value < 0) return true;
  if (child.kind === 'un') return PREC.un < parentPrec;
  if (child.kind !== 'bin') return false;
  const p = PREC[child.op];
  if (p > parentPrec) return false;
  if (p < parentPrec) return true;
  // same precedence: parenthesize the right side of non-associative mixes
  if (op === '-' || op === '/') return side === 'b';
  if (op === '^') return side === 'a';
  return false;
}

/** Pretty-print an AST as readable math with unicode minus and superscripts. */
export function pretty(node: Node): string {
  switch (node.kind) {
    case 'num':
      return formatNumber(node.value, 12);
    case 'var':
      return node.name;
    case 'un':
      return node.op === '-' ? '-' + wrap(node.arg, PREC.un, 'a', 'un') : pretty(node.arg);
    case 'call': {
      const inner = node.args.map(pretty).join(', ');
      const name = node.name === 'ln' ? 'ln' : node.name;
      return `${name}(${inner})`;
    }
    case 'bin': {
      const prec = PREC[node.op];
      if (node.op === '^') {
        const base = wrap(node.a, prec, 'a', '^');
        if (node.b.kind === 'num' && Number.isInteger(node.b.value) && node.b.value >= 0 && node.b.value <= 5) {
          const sup = SUP[String(node.b.value)];
          if (sup && (node.a.kind === 'var' || node.a.kind === 'num' || node.a.kind === 'call')) {
            return pretty(node.a) + sup;
          }
          if (sup) return `(${base})${sup}`;
        }
        return `${base}^${wrap(node.b, prec, 'b', '^')}`;
      }
      if (node.op === '/') {
        return `${wrap(node.a, prec, 'a', '/')} \u00f7 ${wrap(node.b, prec, 'b', '/')}`;
      }
      if (node.op === '*') {
        return `${wrap(node.a, prec, 'a', '*')}\u00b7${wrap(node.b, prec, 'b', '*')}`;
      }
      const sym = node.op === '+' ? ' + ' : ' \u2212 ';
      return `${wrap(node.a, prec, 'a', node.op)}${sym}${wrap(node.b, prec, 'b', node.op)}`;
    }
  }
}

function wrap(node: Node, parentPrec: number, side: 'a' | 'b', op: BinOp | 'un'): string {
  const s = pretty(node);
  return needsParens(node, parentPrec, side, op) ? `(${s})` : s;
}
