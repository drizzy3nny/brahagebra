import type { BinOp, Node } from './ast';
import { FUNCTIONS, functionNames, CONSTANTS } from './eval';
import { ParseError, tokenize, type Token } from './tokenize';

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

function suggest(name: string): string | null {
  const candidates = [...functionNames(), ...Object.keys(CONSTANTS), 'x'];
  let best: string | null = null;
  let bestDist = 3; // suggest only close matches
  for (const c of candidates) {
    const d = levenshtein(name.toLowerCase(), c.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

const KNOWN_NAMES = new Set([...functionNames(), ...Object.keys(CONSTANTS), 'x']);

/**
 * Recursive-descent parser with implicit multiplication (2x, 3(x+1), (x+1)(x-2))
 * and friendly, positioned errors.
 */
export function parse(src: string): Node {
  const toks = tokenize(src);
  if (toks.length === 1) {
    throw new ParseError('Empty expression — try something like  x^2 - 4', 0, 1);
  }
  let i = 0;
  const peek = (k = 0): Token => toks[Math.min(i + k, toks.length - 1)];
  const startsPrimary = (t: Token): boolean => t.kind === 'num' || t.kind === 'ident' || t.kind === 'lparen';

  function parseExpr(): Node {
    let node = parseTerm();
    for (;;) {
      const t = peek();
      if (t.kind === 'op' && (t.text === '+' || t.text === '-')) {
        i++;
        const rhs = parseTerm();
        node = { kind: 'bin', op: t.text as BinOp, a: node, b: rhs, pos: node.pos, len: rhs.pos + rhs.len - node.pos };
      } else break;
    }
    return node;
  }

  function parseTerm(): Node {
    let node = parseUnary();
    for (;;) {
      const t = peek();
      if (t.kind === 'op' && (t.text === '*' || t.text === '/')) {
        i++;
        const rhs = parseUnary();
        node = { kind: 'bin', op: t.text as BinOp, a: node, b: rhs, pos: node.pos, len: rhs.pos + rhs.len - node.pos };
      } else if (startsPrimary(t)) {
        // implicit multiplication: 2x, 3(x+1), (x+1)(x-2), 2sin(x)
        const rhs = parseUnary();
        node = { kind: 'bin', op: '*', a: node, b: rhs, pos: node.pos, len: rhs.pos + rhs.len - node.pos };
      } else break;
    }
    return node;
  }

  function parseUnary(): Node {
    const t = peek();
    if (t.kind === 'op' && (t.text === '-' || t.text === '+')) {
      i++;
      const arg = parseUnary();
      return t.text === '-'
        ? { kind: 'un', op: '-', arg, pos: t.pos, len: arg.pos + arg.len - t.pos }
        : arg;
    }
    return parsePower();
  }

  function parsePower(): Node {
    const base = parsePrimary();
    const t = peek();
    if (t.kind === 'op' && t.text === '^') {
      i++;
      const exp = parseUnary(); // right-associative, allows 2^-1
      return { kind: 'bin', op: '^', a: base, b: exp, pos: base.pos, len: exp.pos + exp.len - base.pos };
    }
    return base;
  }

  function parsePrimary(): Node {
    const t = peek();
    if (t.kind === 'num') {
      i++;
      return { kind: 'num', value: t.value ?? Number(t.text), text: t.text, pos: t.pos, len: t.len };
    }
    if (t.kind === 'lparen') {
      i++;
      const inner = parseExpr();
      const close = peek();
      if (close.kind !== 'rparen') {
        throw new ParseError('Missing closing parenthesis ")"', close.kind === 'eof' ? src.length : close.pos, 1);
      }
      i++;
      return inner;
    }
    if (t.kind === 'ident') {
      i++;
      const nxt = peek();
      if (nxt.kind === 'lparen') {
        if (!(t.text in FUNCTIONS)) {
          const hint = suggest(t.text);
          throw new ParseError(
            hint ? `Unknown function "${t.text}" — did you mean ${hint}()?` : `Unknown function "${t.text}"`,
            t.pos,
            t.len,
          );
        }
        i++; // consume '('
        const args: Node[] = [];
        if (peek().kind !== 'rparen') {
          for (;;) {
            args.push(parseExpr());
            if (peek().kind === 'comma') {
              i++;
              continue;
            }
            break;
          }
        }
        const close = peek();
        if (close.kind !== 'rparen') {
          throw new ParseError(`Missing ")" after ${t.text}(`, close.kind === 'eof' ? src.length : close.pos, 1);
        }
        i++;
        return { kind: 'call', name: t.text, args, pos: t.pos, len: close.pos + close.len - t.pos };
      }
      if (t.text in FUNCTIONS) {
        throw new ParseError(`${t.text}() needs parentheses — write ${t.text}(x)`, t.pos, t.len);
      }
      if (t.text === 'y') {
        throw new ParseError('Write just the right side, e.g. "x^2 - 4" ("y = ..." is also accepted)', t.pos, t.len);
      }
      if (!KNOWN_NAMES.has(t.text)) {
        const hint = suggest(t.text);
        throw new ParseError(
          hint
            ? `Unknown name "${t.text}" — did you mean ${hint}?`
            : `Unknown name "${t.text}" — only "x" can be a variable (pi and e are constants)`,
          t.pos,
          t.len,
        );
      }
      return { kind: 'var', name: t.text, pos: t.pos, len: t.len };
    }
    if (t.kind === 'eof') {
      throw new ParseError('Expression ends too early — something is missing at the end', src.length, 1);
    }
    throw new ParseError(`Unexpected "${t.text}"`, t.pos, t.len);
  }

  const node = parseExpr();
  const trailing = peek();
  if (trailing.kind !== 'eof') {
    throw new ParseError(`Unexpected "${trailing.text}"`, trailing.pos, trailing.len);
  }
  return node;
}
