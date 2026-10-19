import type { Node } from './ast';

export class EvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvalError';
  }
}

export const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  π: Math.PI,
  e: Math.E,
};

type Fn = { minArgs: number; maxArgs: number; fn: (args: number[]) => number };

export const FUNCTIONS: Record<string, Fn> = {
  sin: { minArgs: 1, maxArgs: 1, fn: (a) => Math.sin(a[0]) },
  cos: { minArgs: 1, maxArgs: 1, fn: (a) => Math.cos(a[0]) },
  tan: { minArgs: 1, maxArgs: 1, fn: (a) => Math.tan(a[0]) },
  asin: { minArgs: 1, maxArgs: 1, fn: (a) => Math.asin(a[0]) },
  acos: { minArgs: 1, maxArgs: 1, fn: (a) => Math.acos(a[0]) },
  atan: { minArgs: 1, maxArgs: 1, fn: (a) => Math.atan(a[0]) },
  sinh: { minArgs: 1, maxArgs: 1, fn: (a) => Math.sinh(a[0]) },
  cosh: { minArgs: 1, maxArgs: 1, fn: (a) => Math.cosh(a[0]) },
  tanh: { minArgs: 1, maxArgs: 1, fn: (a) => Math.tanh(a[0]) },
  ln: { minArgs: 1, maxArgs: 1, fn: (a) => Math.log(a[0]) },
  log: { minArgs: 1, maxArgs: 2, fn: (a) => (a.length === 2 ? Math.log(a[1]) / Math.log(a[0]) : Math.log10(a[0])) },
  sqrt: { minArgs: 1, maxArgs: 1, fn: (a) => Math.sqrt(a[0]) },
  cbrt: { minArgs: 1, maxArgs: 1, fn: (a) => Math.cbrt(a[0]) },
  abs: { minArgs: 1, maxArgs: 1, fn: (a) => Math.abs(a[0]) },
  exp: { minArgs: 1, maxArgs: 1, fn: (a) => Math.exp(a[0]) },
  floor: { minArgs: 1, maxArgs: 1, fn: (a) => Math.floor(a[0]) },
  ceil: { minArgs: 1, maxArgs: 1, fn: (a) => Math.ceil(a[0]) },
  round: { minArgs: 1, maxArgs: 1, fn: (a) => Math.round(a[0]) },
  sign: { minArgs: 1, maxArgs: 1, fn: (a) => Math.sign(a[0]) },
  min: { minArgs: 1, maxArgs: 8, fn: (a) => Math.min(...a) },
  max: { minArgs: 1, maxArgs: 8, fn: (a) => Math.max(...a) },
  mod: { minArgs: 2, maxArgs: 2, fn: (a) => (a[1] === 0 ? NaN : a[0] - a[1] * Math.floor(a[0] / a[1])) },
};

export function functionNames(): string[] {
  return Object.keys(FUNCTIONS);
}

/** Evaluate an AST for a given value of the free variable x. */
export function evaluate(node: Node, x: number): number {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'var': {
      if (node.name === 'x') return x;
      const c = CONSTANTS[node.name];
      if (c !== undefined) return c;
      throw new EvalError(`Unknown name "${node.name}" — this graph only uses the variable x`);
    }
    case 'un':
      return node.op === '-' ? -evaluate(node.arg, x) : evaluate(node.arg, x);
    case 'bin': {
      const a = evaluate(node.a, x);
      const b = evaluate(node.b, x);
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '^':
          return Math.pow(a, b);
      }
      break;
    }
    case 'call': {
      const spec = FUNCTIONS[node.name];
      if (!spec) throw new EvalError(`Unknown function "${node.name}"`);
      if (node.args.length < spec.minArgs || node.args.length > spec.maxArgs) {
        const want = spec.minArgs === spec.maxArgs ? `${spec.minArgs}` : `${spec.minArgs}–${spec.maxArgs}`;
        throw new EvalError(`${node.name}() takes ${want} argument${spec.maxArgs > 1 ? 's' : ''}, got ${node.args.length}`);
      }
      const args = node.args.map((a) => evaluate(a, x));
      return spec.fn(args);
    }
  }
  return NaN;
}
