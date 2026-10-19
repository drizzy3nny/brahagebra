/** Result of an edit: new text plus where the caret should land. */
export interface EditResult {
  text: string;
  caret: number;
}

/**
 * Insert `insert` at the caret, replacing any selection.
 * `caretBack` places the caret that many characters left of the end of the
 * inserted text — e.g. inserting "sqrt()" with caretBack 1 leaves the caret
 * between the parentheses.
 */
export function insertAt(text: string, start: number, end: number, insert: string, caretBack = 0): EditResult {
  // clamp a runaway caret inside the current text (catches stale caret from a
  // previous render, e.g. after typing the closing ")" of sin())
  const safeStart = Math.max(0, Math.min(text.length, start));
  const safeEnd = Math.max(0, Math.min(text.length, end));
  const head = text.slice(0, safeStart);
  const tail = text.slice(safeEnd);
  const caret = Math.max(0, head.length + insert.length - caretBack);
  return { text: head + insert + tail, caret };
}

/**
 * Delete the selection, or one character before the caret.
 * Handles surrogate pairs so exotic symbols never get split in half.
 */
export function backspace(text: string, start: number, end: number): EditResult {
  if (start !== end) {
    return { text: text.slice(0, start) + text.slice(end), caret: start };
  }
  if (start === 0) return { text, caret: 0 };
  // walk back over a full extended-unicode char (surrogate pair, or solo
  // supplementary code point). This makes backspace robust for chars like 𝜋,
  // the mathematical bold italic letters, or any future symbol we insert.
  let from = start - 1;
  const lo = from - 10; // enough to cover the longest sequence we will ever emit
  const safeLo = Math.max(0, lo);
  for (let i = from; i > safeLo; i--) {
    const c = text.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff && i > 0) {
      const prev = text.charCodeAt(i - 1);
      if (prev >= 0xd800 && prev <= 0xdbff) { from = i - 1; break; }
    }
  }
  return { text: text.slice(0, from) + text.slice(start), caret: from };
}

/** Caret position after moving one step left/right, collapsing a selection toward the direction. */
export function moveCaret(text: string, start: number, end: number, dir: -1 | 1): number {
  if (start !== end) return dir === -1 ? start : end;
  return Math.max(0, Math.min(text.length, start + dir));
}
