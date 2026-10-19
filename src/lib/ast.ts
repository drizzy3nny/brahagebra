export type BinOp = '+' | '-' | '*' | '/' | '^';

export interface Pos {
  /** character offset in the source string */
  pos: number;
  /** length of the source span */
  len: number;
}

export type Node =
  | (Pos & { kind: 'num'; value: number; text: string })
  | (Pos & { kind: 'var'; name: string })
  | (Pos & { kind: 'un'; op: '-' | '+'; arg: Node })
  | (Pos & { kind: 'bin'; op: BinOp; a: Node; b: Node })
  | (Pos & { kind: 'call'; name: string; args: Node[] });

export function walk(node: Node, fn: (n: Node) => void): void {
  fn(node);
  switch (node.kind) {
    case 'un':
      walk(node.arg, fn);
      break;
    case 'bin':
      walk(node.a, fn);
      walk(node.b, fn);
      break;
    case 'call':
      for (const a of node.args) walk(a, fn);
      break;
    case 'num':
    case 'var':
      break;
  }
}
