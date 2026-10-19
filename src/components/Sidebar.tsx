import { Tutor } from './Tutor';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CompileError } from '../lib/compile';
import { backspace, insertAt, moveCaret, type EditResult } from '../lib/edit';
import type { Explanation } from '../lib/explain';
import { formatNumber } from '../lib/format';
import type { Selection } from '../types';
import { MathKeyboard, type KeyAction } from './MathKeyboard';

export interface RowVM {
  vertex: { x: number; y: number } | null;
  id: string;
  raw: string;
  color: string;
  visible: boolean;
  error: CompileError | null;
  roots: { x: number; touches: boolean }[];
  /** one-line answer shown under the input, e.g. "x = -2, x = 2" */
  summary: string | null;
}

export interface InterVM {
  pairKey: string;
  idA: string;
  idB: string;
  labelA: string;
  labelB: string;
  points: { x: number; y: number; touches: boolean }[];
}

export interface PointRowVM {
  id: string;
  x: string;
  y: string;
  color: string;
  visible: boolean;
}

export interface PointChipProps {
  row: PointRowVM;
  coords: { x: string; y: string };
  selected: boolean;
  onSelect: (id: string, x: number, y: number) => void;
}

function PointChip({ row, coords, selected, onSelect }: PointChipProps) {
  if (!coords.x.trim() || !coords.y.trim() || !Number.isFinite(Number(coords.x)) || !Number.isFinite(Number(coords.y))) return null;
  const x0 = Number(coords.x);
  const y0 = Number(coords.y);
  return (
    <button
      type="button"
      className={`marker-point${selected ? ' marker-point-on' : ''}`}
      onClick={() => onSelect(row.id, x0, y0)}
      title="See the steps"
    >
      <span className="mini-dot" aria-hidden />
      {pointChipLabel(x0, y0)}
    </button>
  );
}

export function pointChipLabel(x: number, y: number): string {
  if (Number.isInteger(x) && Number.isInteger(y)) return `(${x}, ${y})`;
  return `(${formatNumber(x, 8)}, ${formatNumber(y, 8)})`;
}

function rootChipLabel(x: number): string {
  return Number.isInteger(x) ? `x = ${x}` : `x ≈ ${formatNumber(x, 10)}`;
}

const short = (s: string, n = 26): string =>
  s.length > n ? s.slice(0, n - 1) + '…' : s;

export const PRESETS = ['x^2 - 4', 'sin(x) - 0.5', 'x^3 - 3x + 1', '(x-1)^2 - 2', 'x^2 - 4 > 0', 'e^-x - x', '1/x'];

interface Props {
  onSelectVertex: (id: string, x: number, y: number) => void;
  onChangePoint: (id: string, axis: 'x' | 'y', value: string) => void;
  onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean; status: string;
  rows: RowVM[];
  intersections: InterVM[];
  points: PointRowVM[];
  selection: Selection | null;
  explanation: Explanation | null;
  focusId: string | null;
  onChangeRaw: (id: string, raw: string) => void;
  onAdd: (afterId?: string) => void;
  onAddPoint: (afterId?: string) => void;
  onFillPreset: (text: string) => void;
  onToggleVisible: (id: string) => void;
  onTogglePointVisible: (id: string) => void;
  onDelete: (id: string) => void;
  onDeletePoint: (id: string) => void;
  onSelectRoot: (id: string, x: number) => void;
  onSelectIntersection: (idA: string, idB: string, x: number) => void;
  onSelectPoint: (id: string, x: number, y: number) => void;
  onClearSelection: () => void;
  /** last computed answer, used by the keyboard's ans key */
  ans: string | null;
}

export function Sidebar(props: Props) {
  const {
    rows,
    intersections,
    points,
    selection,
    explanation,
    focusId,
    onChangeRaw,
    onAdd,
    onAddPoint,
    onFillPreset,
    onToggleVisible,
    onTogglePointVisible,
    onDelete,
    onDeletePoint,
    onSelectRoot,
    onSelectIntersection,
    onSelectPoint,
    onClearSelection,
    ans,
  } = props;

  const explainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selection) { setPanel('steps'); setCollapsed(false); setKbOpen(false); }
  }, [selection]);

  /* ---------------- custom keyboard plumbing ---------------- */
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const activeIdRef = useRef<string | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const [, setCaretRevision] = useState(0);
  const [panel, setPanel] = useState<'edit' | 'steps'>('edit');
  const [kbOpen, setKbOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // restore the caret (and focus) after React re-renders the controlled input
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !activeIdRef.current) return;
    const el = inputRefs.current.get(activeIdRef.current);
    const pos = pendingCaret.current;
    pendingCaret.current = null;
    if (el) {
      el.focus();
      el.setSelectionRange(pos, pos);
    }
  });

  const focusInput = (id: string) => {
    activeIdRef.current = id;
    setCollapsed(false);
    setPanel('edit');
    setKbOpen(true);
  };

  const handleKey = (a: KeyAction) => {
    const id = activeIdRef.current;
    const el = id ? inputRefs.current.get(id) : undefined;
    if (!id || !el) return;
    // read the live DOM value: props can lag one render behind rapid taps
    const raw = el.value;
    const start = el.selectionStart ?? raw.length;
    const end = el.selectionEnd ?? start;
    const pointTarget = /^point:(.*):(x|y)$/.exec(id);
    if (a.kind === 'enter') {
      if (pointTarget) { onAddPoint(pointTarget[1]); return; }
      onAdd(id);
      return;
    }
    let next: EditResult;
    if (a.kind === 'insert') next = insertAt(raw, start, end, a.text, a.back ?? 0);
    else if (a.kind === 'backspace') next = backspace(raw, start, end);
    else next = { text: raw, caret: moveCaret(raw, start, end, a.dir) };
    pendingCaret.current = next.caret;
    if (pointTarget) {
      const value = next.text.replace(/−/g, '-');
      if (!/^-?\d*(\.\d*)?$/.test(value)) return;
      props.onChangePoint(pointTarget[1], pointTarget[2] as 'x' | 'y', value);
    } else onChangeRaw(id, next.text);
    el.setSelectionRange(next.caret, next.caret);
    setCaretRevision(r => r + 1);

  };

  const pointSelected = (id: string): boolean =>
    selection?.kind === 'marker' && selection.markerId === id;

  const rootSelected = (id: string, x: number): boolean =>
    selection?.kind === 'root' &&
    selection.curveId === id &&
    Math.abs(selection.x - x) <= 1e-6 * (1 + Math.abs(x));
  const interSelected = (idA: string, idB: string, x: number): boolean =>
    selection?.kind === 'intersection' &&
    selection.idA === idA &&
    selection.idB === idB && Math.abs(selection.x - x) <= 1e-6 * (1 + Math.abs(x));

  return (
    <aside className={`sidebar${collapsed ? ' sheet-collapsed' : ''}`}>
      <button
        type="button"
        className="sheet-grip"
        aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
        aria-expanded={!collapsed}
        onClick={() => {
          setCollapsed((c) => !c);
          setKbOpen(false);
        }}
      >
        <span />
      </button>
      <div className="panel-toolbar">
        <div className="brand-lockup" aria-label="Brahagebra">
          <img src="/brand/brahagebra-mark.png" alt="" width="22" height="34" />
          <strong><span>Braha</span><span className="brand-wordmark-accent">gebra</span></strong>
        </div>
        <button aria-pressed={panel === 'edit'} onClick={() => { setPanel('edit'); setCollapsed(false); }}>Edit</button>
        <button aria-pressed={panel === 'steps'} onClick={() => { setPanel('steps'); setCollapsed(false); setKbOpen(false); }}>Steps</button>
        <button aria-label="Undo" disabled={!props.canUndo} onClick={props.onUndo}>↶</button>
        <button aria-label="Redo" disabled={!props.canRedo} onClick={props.onRedo}>↷</button>
      </div>
      <div className="workspace-status" role="status">{props.status}</div>
      {collapsed && <button className="compact-expression" onClick={() => setCollapsed(false)}>{rows[0]?.raw || 'Tap to enter an expression'}</button>}
      <div className={`sidebar-scroll panel-${panel}`}>
        <div className="editor-content">
        <header className="brand">
          <div className="brand-row">
            <span className="logo" aria-hidden>
              ⌖
            </span>
            <h1>Brahagebra</h1>
            <span className="ai-badge">Solver steps</span>
          </div>
          <p>Explore functions and equations — then click a dot to see exactly how the solver found it.</p>
        </header>

        <div className="section-head">
          <span>Expressions</span>
          <button type="button" className="link-btn" disabled={rows.length >= 10} onClick={() => onAdd()}>
            + Add
          </button>
        </div>

        <div className="expr-list">
          {rows.map((row) => (
            <div className={`expr-item${row.error ? ' has-error' : ''}`} key={row.id}>
              <div className="expr-row">
                <button
                  type="button"
                  className={`swatch${row.visible ? '' : ' swatch-off'}`}
                  style={{ backgroundColor: row.color }}
                  onClick={() => onToggleVisible(row.id)}
                  aria-label={row.visible ? 'Hide expression' : 'Show expression'}
                  title={row.visible ? 'Hide' : 'Show'}
                />
                <input
                  value={row.raw}
                  onChange={(e) => onChangeRaw(row.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onAdd(row.id);
                    }
                  }}
                  onFocus={() => focusInput(row.id)}
                  ref={(el) => {
                    if (el) inputRefs.current.set(row.id, el);
                    else inputRefs.current.delete(row.id);
                  }}
                  placeholder="e.g. x^2 - 4   or   x^2 = 4"
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  inputMode="none"
                  enterKeyHint="go"
                  autoFocus={row.id === focusId}
                  aria-label="Expression"
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onDelete(row.id)}
                  aria-label="Remove expression"
                  title="Remove"
                >
                  ✕
                </button>
              </div>

              {row.summary &&
                (row.roots.length > 0 ? (
                  <button
                    type="button"
                    className="expr-summary expr-summary-btn"
                    onClick={() => onSelectRoot(row.id, row.roots[0]?.x ?? 0)}
                    title="See the steps"
                  >
                    <span className="expr-summary-eq">=</span> {row.summary}
                  </button>
                ) : (
                  <div className="expr-summary">
                    <span className="expr-summary-eq">=</span> {row.summary}
                  </div>
                ))}

              {row.error && (
                <div className="expr-error" role="alert">
                  <div className="expr-error-msg">{row.error.message}</div>
                  <pre className="expr-caret">
                    {' '.repeat(Math.max(0, row.error.pos))}
                    {'^'.repeat(Math.max(1, row.error.len))}
                  </pre>
                </div>
              )}

              {row.visible && row.vertex && (
                <div className="chips">
                  <button type="button"
                    className={`chip${selection?.kind === 'vertex' && selection.curveId === row.id ? ' chip-on' : ''}`}
                    onClick={() => props.onSelectVertex(row.id, row.vertex!.x, row.vertex!.y)}
                    title="Explain the turning point">
                    Vertex ({formatNumber(row.vertex.x, 8)}, {formatNumber(row.vertex.y, 8)})
                  </button>
                </div>
              )}
              {row.visible && row.roots.length > 0 && (
                <div className="chips">
                  {row.roots.map((r) => (
                    <button
                      type="button"
                      key={r.x}
                      className={`chip${rootSelected(row.id, r.x) ? ' chip-on' : ''}`}
                      onClick={() => onSelectRoot(row.id, r.x)}
                      title={r.touches ? 'Touching root — click for steps' : 'Root — click for steps'}
                    >
                      {rootChipLabel(r.x)}
                      {r.touches ? ' ◍' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <button type="button" className="add-btn" disabled={rows.length >= 10} onClick={() => onAdd()}>
            + Add expression
          </button>
        </div>

        <div className="presets">
          <span className="presets-label">Try</span>
          {PRESETS.map((p) => (
            <button type="button" key={p} className="preset" onClick={() => onFillPreset(p)}>
              {p}
            </button>
          ))}
        </div>

        {intersections.length > 0 && (
          <>
            <div className="section-head">
              <span>Intersections</span>
            </div>
            {intersections.map((iv) => (
              <div className="inter-item" key={iv.pairKey}>
                <div className="inter-label" title={`${iv.labelA} ∩ ${iv.labelB}`}>
                  <span className="inter-diamond" aria-hidden />
                  {short(iv.labelA)} ∩ {short(iv.labelB)}
                </div>
                <div className="chips">
                  {iv.points.map((p) => (
                    <button
                      type="button"
                      key={p.x}
                      className={`chip chip-int${interSelected(iv.idA, iv.idB, p.x) ? ' chip-on' : ''}`}
                      onClick={() => onSelectIntersection(iv.idA, iv.idB, p.x)}
                    >
                      {`(${formatNumber(p.x, 8)}, ${formatNumber(p.y, 8)})`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        <div className="section-head">
          <span>Points</span>
          <button type="button" className="link-btn" disabled={points.length >= 10} onClick={() => onAddPoint()}>
            + Add point
          </button>
        </div>

        <div className="expr-list">
          {points.map((row) => {
            const coords = { x: row.x, y: row.y };
            return (
              <div className={`expr-item${row.visible ? '' : ''}`} key={row.id}>
                <div className="expr-row">
                  <button
                    type="button"
                    className={`swatch${row.visible ? '' : ' swatch-off'}`}
                    style={{ backgroundColor: row.color }}
                    onClick={() => onTogglePointVisible(row.id)}
                    aria-label={row.visible ? 'Hide point' : 'Show point'}
                    title={row.visible ? 'Hide' : 'Show'}
                  />
                  <input
                    autoFocus={row.id === focusId}
                    value={coords.x}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^-?\d*(\.\d*)?$/.test(v) || v === '') {
                        props.onChangePoint(row.id, 'x', v);
                      }
                    }}
                    onFocus={() => focusInput('point:' + row.id + ':x')}
                    ref={(el) => {
                      if (el) inputRefs.current.set('point:' + row.id + ':x', el);
                      else inputRefs.current.delete('point:' + row.id + ':x');
                    }}
                    placeholder="x"
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    inputMode="none"
                    enterKeyHint="go"
                    aria-label="Point x"
                  />
                  <span className="exprrow-sep" aria-hidden>,</span>
                  <input
                    onFocus={() => focusInput('point:' + row.id + ':y')}
                    ref={(el) => {
                      if (el) inputRefs.current.set('point:' + row.id + ':y', el);
                      else inputRefs.current.delete('point:' + row.id + ':y');
                    }}
                    value={coords.y}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^-?\d*(\.\d*)?$/.test(v) || v === '') {
                        props.onChangePoint(row.id, 'y', v);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onAddPoint(row.id);
                      }
                    }}
                    aria-label="Point y"
                    inputMode="decimal"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => onDeletePoint(row.id)}
                    aria-label="Remove point"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>

                {row.visible && (
                  <div className="chips">
                    <PointChip
                      row={row}
                      coords={coords}
                      selected={pointSelected(row.id)}
                      onSelect={onSelectPoint}
                    />
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" className="add-btn" disabled={points.length >= 10} onClick={() => onAddPoint()}>
            + Add point
          </button>
        </div>

        </div>
        <section className={`explain${explanation ? '' : ' explain-empty'}`} ref={explainRef}>
          {explanation ? (
            <>
              <header className="explain-header">
                <span className="ai-badge">✦ Solver steps</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => { onClearSelection(); setPanel('edit'); }}
                  aria-label="Close explanation"
                  title="Close"
                >
                  ✕
                </button>
              </header>
              <h2 className="explain-headline">{explanation.headline}</h2>
              <div className="explain-sub">{explanation.sub}</div>
              <Tutor key={JSON.stringify(explanation)} explanation={explanation} />
              <ol className="steps">
                {explanation.steps.map((s, i) => (
                  <li className={`step step-${s.kind}`} key={`${s.title}-${i}`}>
                    <div className="step-title">
                      <span className="step-num">{i + 1}</span>
                      {s.title}
                    </div>
                    {s.body && <p className="step-body">{s.body}</p>}
                    {s.math && <pre className="step-math">{s.math}</pre>}
                    {s.table && (
                      <table className="steps-table">
                        <thead>
                          <tr>
                            {s.table.headers.map((hd) => (
                              <th key={hd}>{hd}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {s.table.rows.map((r, ri) => (
                            <tr key={ri}>
                              {r.map((cell, ci) => (
                                <td key={ci}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <div className="explain-placeholder">
              <div className="explain-placeholder-icon" aria-hidden>
                ✦
              </div>
              <p>
                Click any dot on the graph — or a chip above — and the solver will replay every step: the exact
                algebra when it exists, the sign-change bracket, each refinement iteration, and the final check.
              </p>
            </div>
          )}
        </section>

        <details className="help editor-content">
          <summary>How the solver works</summary>
          <p>
            Results are numerical estimates in the visible range; narrow roots or discontinuities can be missed. the explainer replays the <b>same computation</b> that placed the dots. Polynomials
            get exact algebra first (rational-root theorem, factoring, quadratic formula). Everything else is found
            by dense sampling, bracketed by a sign change, then refined with Brent&rsquo;s method to double precision
            (tolerance depends on the function). Asymptotes are detected and skipped, and curves that only touch the axis are found by
            minimising |f(x)|.
          </p>
          <p>
            <b>Syntax:</b> <code>2x</code>, <code>(x+1)(x-2)</code>, <code>sin(x)</code>, <code>ln</code>,{' '}
            <code>log(x)</code>, <code>sqrt</code>, <code>abs</code>, <code>π</code>, <code>e</code>. Use{' '}
            <code>=</code> to solve equations: <code>x^2 = 4</code>, and <code>&lt;</code> <code>&gt;</code>{' '}
            <code>≤</code> <code>≥</code> for inequalities: <code>x^2 &gt; 4</code> — the axis is shaded where the
            inequality holds. Trigonometric functions use radians. On a phone the built-in keyboard pops up when you tap an input.
          </p>
        </details>
      </div>
      {kbOpen && (
        <MathKeyboard
          ans={ans}
          onKey={handleKey}
          onHide={() => {
            setKbOpen(false);
            const id = activeIdRef.current;
            if (id) inputRefs.current.get(id)?.blur();
          }}
        />
      )}
    </aside>
  );
}
