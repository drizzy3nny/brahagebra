export type TokKind = 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eq' | 'eof';

export interface Token {
  kind: TokKind;
  text: string;
  pos: number;
  len: number;
  value?: number;
}

export class ParseError extends Error {
  readonly pos: number;
  readonly len: number;
  constructor(message: string, pos: number, len = 1) {
    super(message);
    this.name = 'ParseError';
    this.pos = pos;
    this.len = Math.max(1, len);
  }
}

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c);

/** 1-char operator aliases typed by users coming from word processors */
const OP_ALIASES: Record<string, string> = {
  '×': '*',
  '·': '*',
  '⋅': '*',
  '÷': '/',
  '−': '-',
  '–': '-',
  '—': '-',
};

export function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (isDigit(c) || c === '.') {
      const start = i;
      while (i < src.length && isDigit(src[i])) i++;
      if (i < src.length && src[i] === '.') {
        i++;
        while (i < src.length && isDigit(src[i])) i++;
      }
      if (i < src.length && (src[i] === 'e' || src[i] === 'E')) {
        let j = i + 1;
        if (j < src.length && (src[j] === '+' || src[j] === '-')) j++;
        if (j < src.length && isDigit(src[j])) {
          i = j;
          while (i < src.length && isDigit(src[i])) i++;
        }
      }
      const text = src.slice(start, i);
      const value = Number(text);
      if (!Number.isFinite(value)) {
        throw new ParseError(`"${text}" is not a valid number`, start, i - start);
      }
      toks.push({ kind: 'num', text, pos: start, len: i - start, value });
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      i++;
      while (i < src.length && isIdentPart(src[i])) i++;
      toks.push({ kind: 'ident', text: src.slice(start, i), pos: start, len: i - start });
      continue;
    }
    if (c === 'π') {
      toks.push({ kind: 'ident', text: 'π', pos: i, len: 1 });
      i++;
      continue;
    }
    if (c === '²' || c === '³') {
      const exp = c === '²' ? '2' : '3';
      toks.push({ kind: 'op', text: '^', pos: i, len: 1 });
      toks.push({ kind: 'num', text: exp, pos: i, len: 0, value: Number(exp) });
      i++;
      continue;
    }
    if (c in OP_ALIASES) {
      toks.push({ kind: 'op', text: OP_ALIASES[c], pos: i, len: 1 });
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') {
      toks.push({ kind: 'op', text: c, pos: i, len: 1 });
      i++;
      continue;
    }
    if (c === '(') {
      toks.push({ kind: 'lparen', text: c, pos: i, len: 1 });
      i++;
      continue;
    }
    if (c === ')') {
      toks.push({ kind: 'rparen', text: c, pos: i, len: 1 });
      i++;
      continue;
    }
    if (c === ',') {
      toks.push({ kind: 'comma', text: c, pos: i, len: 1 });
      i++;
      continue;
    }
    if (c === '=') {
      toks.push({ kind: 'eq', text: c, pos: i, len: 1 });
      i++;
      continue;
    }
    if (c === '√') {
      throw new ParseError('Write square roots as sqrt(...) instead of √', i, 1);
    }
    if (c === '<' || c === '>' || c === '≤' || c === '≥') {
      throw new ParseError(
        `\"${c}\" only works once, at the top level — e.g.  x^2 ${c} 4`,
        i,
        1,
      );
    }
    throw new ParseError(`Unsupported character "${c}"`, i, 1);
  }
  toks.push({ kind: 'eof', text: '', pos: src.length, len: 0 });
  return toks;
}
