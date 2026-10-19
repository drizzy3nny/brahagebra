import { useState } from 'react';

export type KeyAction =
  | { kind: 'insert'; text: string; back?: number }
  | { kind: 'backspace' }
  | { kind: 'move'; dir: -1 | 1 }
  | { kind: 'enter' };

interface Props {
  onKey: (a: KeyAction) => void;
  onHide: () => void;
  /** last computed answer for the `ans` key, or null when none exists yet */
  ans: string | null;
}

interface KeyDef {
  label: React.ReactNode;
  aria: string;
  act: KeyAction;
  /** gray function-style key (ans, ⌫, arrows, ↵) */
  fn?: boolean;
  disabled?: boolean;
}

const ins = (text: string, back = 0): KeyAction => ({ kind: 'insert', text, back });
const BS: KeyAction = { kind: 'backspace' };
const ENTER: KeyAction = { kind: 'enter' };
const LEFT: KeyAction = { kind: 'move', dir: -1 };
const RIGHT: KeyAction = { kind: 'move', dir: 1 };

/* ---------------- key tables ---------------- */

function keys123(ans: string | null): KeyDef[][][] {
  // [math block (4 cols), numeric block (5 cols)] — matches the reference layout
  const math: KeyDef[][] = [
    [
      { label: <i>x</i>, aria: 'x', act: ins('x') },
      { label: '(', aria: 'open parenthesis', act: ins('(') },
      { label: 'π', aria: 'pi', act: ins('π') },
      { label: <i>e</i>, aria: 'e', act: ins('e') },
    ],
    [
      { label: <span>x<sup>2</sup></span>, aria: 'x squared', act: ins('²') },
      { label: <span>x<sup>n</sup></span>, aria: 'x to the power n', act: ins('^') },
      { label: '√', aria: 'square root', act: ins('sqrt()', 1) },
      { label: <span>|<i>x</i>|</span>, aria: 'absolute value', act: ins('abs()', 1) },
    ],
    [
      { label: '<', aria: 'less than', act: ins('<') },
      { label: '>', aria: 'greater than', act: ins('>') },
      { label: <span className="kb-frac">a⁄b</span>, aria: 'fraction', act: ins('/') },
      { label: 'log', aria: 'log', act: ins('log()', 1) },
    ],
    [
      {
        label: 'ans',
        aria: 'last answer',
        act: ins(ans ?? ''),
        fn: true,
        disabled: ans === null,
      },
      { label: ',', aria: 'comma', act: ins(',') },
      { label: '(', aria: 'open parenthesis', act: ins('(') },
      { label: ')', aria: 'close parenthesis', act: ins(')') },
    ],
  ];
  const num: KeyDef[][] = [
    [
      { label: '7', aria: '7', act: ins('7') },
      { label: '8', aria: '8', act: ins('8') },
      { label: '9', aria: '9', act: ins('9') },
      { label: '×', aria: 'times', act: ins('×') },
      { label: '÷', aria: 'divide', act: ins('÷') },
    ],
    [
      { label: '4', aria: '4', act: ins('4') },
      { label: '5', aria: '5', act: ins('5') },
      { label: '6', aria: '6', act: ins('6') },
      { label: '+', aria: 'plus', act: ins('+') },
      { label: '−', aria: 'minus', act: ins('−') },
    ],
    [
      { label: '1', aria: '1', act: ins('1') },
      { label: '2', aria: '2', act: ins('2') },
      { label: '3', aria: '3', act: ins('3') },
      { label: '=', aria: 'equals', act: ins('=') },
      { label: '⌫', aria: 'backspace', act: BS, fn: true },
    ],
    [
      { label: '0', aria: '0', act: ins('0') },
      { label: '.', aria: 'decimal point', act: ins('.') },
      { label: <i>x</i>, aria: 'x', act: ins('x') },
      { label: '→', aria: 'cursor right', act: RIGHT, fn: true },
      { label: '↵', aria: 'new expression', act: ENTER, fn: true },
    ],
  ];
  return [math, num];
}

const fnRow = (name: string): KeyDef => ({ label: name, aria: name, act: ins(`${name}()`, 1) });

const FX_KEYS: KeyDef[][] = [
  [{ label: '←', aria: 'cursor left', act: LEFT }, { label: '→', aria: 'cursor right', act: RIGHT }],
  [{ label: 'x²', aria: 'squared', act: ins('²') }, { label: '^', aria: 'power', act: ins('^') }, { label: '(', aria: 'open parenthesis', act: ins('(') }, { label: ')', aria: 'close parenthesis', act: ins(')') }],
  [fnRow('sin'), fnRow('cos'), fnRow('tan'), fnRow('ln'), fnRow('log')],
  [fnRow('sqrt'), fnRow('abs'), fnRow('exp'), fnRow('floor'), fnRow('ceil')],
  [fnRow('asin'), fnRow('acos'), fnRow('atan'), fnRow('round'), fnRow('sign')],
  [fnRow('min'), fnRow('max'), fnRow('mod'), { label: 'π', aria: 'pi', act: ins('π') }, { label: <i>e</i>, aria: 'e', act: ins('e') }],
];

const ABC_ROWS = ['xpie', 'sinc', 'otal', 'grbf'];

const SYM_KEYS: KeyDef[][] = [
  [
    { label: '=', aria: 'equals', act: ins('=') },
    { label: '≤', aria: 'less or equal', act: ins('≤') },
    { label: '≥', aria: 'greater or equal', act: ins('≥') },
    { label: '<', aria: 'less than', act: ins('<') },
    { label: '>', aria: 'greater than', act: ins('>') },
  ],
  [
    { label: '+', aria: 'plus', act: ins('+') },
    { label: '−', aria: 'minus', act: ins('−') },
    { label: '×', aria: 'times', act: ins('×') },
    { label: '÷', aria: 'divide', act: ins('÷') },
    { label: '/', aria: 'slash', act: ins('/') },
  ],
  [
    { label: '^', aria: 'power', act: ins('^') },
    { label: '*', aria: 'times', act: ins('*') },
    { label: '(', aria: 'open parenthesis', act: ins('(') },
    { label: ')', aria: 'close parenthesis', act: ins(')') },
    { label: ',', aria: 'comma', act: ins(',') },
  ],
  [
    { label: '.', aria: 'decimal point', act: ins('.') },
    { label: <span>x<sup>2</sup></span>, aria: 'x squared', act: ins('²') },
    { label: <span>x<sup>3</sup></span>, aria: 'x cubed', act: ins('³') },
    { label: 'π', aria: 'pi', act: ins('π') },
    { label: <i>e</i>, aria: 'e', act: ins('e') },
  ],
];

type TabId = '123' | 'fx' | 'abc' | 'sym';

const TABS: { id: TabId; label: string }[] = [
  { id: '123', label: '123' },
  { id: 'fx', label: 'f(x)' },
  { id: 'abc', label: 'ABC' },
  { id: 'sym', label: '#&¬' },
];

/* ---------------- component ---------------- */

export function MathKeyboard({ onKey, onHide, ans }: Props) {
  const [tab, setTab] = useState<TabId>('123');

  // keep focus in the expression input: cancel the mousedown that would steal it
  const swallow = (e: React.PointerEvent) => e.preventDefault();

  const renderKey = (k: KeyDef, i: number) => (
    <button
      type="button"
      key={`${k.aria}-${i}`}
      className={`kb-key${k.fn ? ' kb-fn' : ''}${k.disabled ? ' kb-off' : ''}`}
      aria-label={k.aria}
      disabled={k.disabled}
      onClick={() => onKey(k.act)}
    >
      {k.label}
    </button>
  );

  return (
    <div className="kb" onPointerDown={swallow} role="group" aria-label="Math keyboard">
      <div className="kb-tabs">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`kb-tab${tab === t.id ? ' kb-tab-on' : ''}`}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button type="button" className="kb-hide" aria-label="Hide keyboard" onClick={onHide}>
          ⌄
        </button>
      </div>

      {tab === '123' && (
        <div className="kb-body">
          <div className="kb-block kb-block-wide">
            {keys123(ans)[1].map((row, ri) => (
              <div className="kb-row" key={ri}>{row.map(renderKey)}</div>
            ))}
          </div>
        </div>
      )}

      {tab === 'fx' && (
        <div className="kb-block kb-block-wide">
          {FX_KEYS.map((row, ri) => (
            <div className="kb-row" key={ri}>
              {row.map(renderKey)}
            </div>
          ))}
        </div>
      )}

      {tab === 'abc' && (
        <div className="kb-block kb-block-abc">
          {ABC_ROWS.map((letters, ri) => (
            <div className="kb-row" key={ri}>
              {letters.split('').map((ch) => (
                <button
                  type="button"
                  key={ch}
                  className="kb-key kb-letter"
                  aria-label={ch}
                  onClick={() => onKey(ins(ch))}
                >
                  {ch}
                </button>
              ))}
              {ri === ABC_ROWS.length - 1 && (
                <>
                  {renderKey({ label: '⌫', aria: 'backspace', act: BS, fn: true }, 0)}
                  {renderKey({ label: '↵', aria: 'new expression', act: ENTER, fn: true }, 1)}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'sym' && (
        <div className="kb-block kb-block-wide">
          {SYM_KEYS.map((row, ri) => (
            <div className="kb-row" key={ri}>
              {row.map(renderKey)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
