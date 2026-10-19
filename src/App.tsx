import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Graph, type PlotCurve } from './components/Graph';
import { Sidebar, type InterVM, type PointRowVM, type RowVM } from './components/Sidebar';
import { compileEntry } from './lib/compile';
import { explainIntersection, explainRoot, explainSelection, type Explanation } from './lib/explain';
import { formatNumber } from './lib/format';
import { useScans } from './lib/useScans';
import { useWorkspace } from './lib/workspace';
import { quadraticVertex } from './lib/vertex';

import { solutionText, solveRelation } from './lib/solution';
import type { IntersectionPoint, MarkerPose, PointEntry, Selection, View } from './types';

const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#4f46e5'];

export interface Entry {
  id: string;
  raw: string;
  color: string;
  visible: boolean;
}

let idSeq = 1;
const newId = () => `e${Date.now()}-${idSeq++}`;

export function App() {
  const { entries, setEntries, markers, setMarkers, undo, redo, canUndo, canRedo, saveError } = useWorkspace();
  const [view, setView] = useState<View>({ cx: 0, cy: 0, scale: 40 });
  const [settled, setSettled] = useState<View>(view);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [graphSize, setGraphSize] = useState({ w: 1100, h: 700 });
  const [focusId, setFocusId] = useState<string | null>(null);
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);
  const colorSeq = useRef(1);

  // settle the scan domain shortly after view changes stop
  useEffect(() => {
    const t = setTimeout(() => setSettled(view), 130);
    return () => clearTimeout(t);
  }, [view]);

  const compileCache = useRef(new Map<string, { raw: string; res: ReturnType<typeof compileEntry> }>());
  const compiled = useMemo(
    () => {
      for (const id of compileCache.current.keys()) if (!entries.some(e => e.id === id)) compileCache.current.delete(id);
      return entries.map((entry) => {
      let cached = compileCache.current.get(entry.id);
      if (!cached || cached.raw !== entry.raw) {
        cached = { raw: entry.raw, res: compileEntry(entry.raw, entry.id) };
        compileCache.current.set(entry.id, cached);
      }
      return { entry, res: cached.res };
    });
    },
    [entries],
  );

  const plotCurves: PlotCurve[] = useMemo(
    () =>
      compiled
        .filter((c) => c.entry.visible && c.res.curve)
        .map((c) => ({ ...c.res.curve!, color: c.entry.color })),
    [compiled],
  );

  const domain = useMemo<[number, number]>(() => {
    const w = Math.max(300, graphSize.w);
    return [settled.cx - w / 2 / settled.scale, settled.cx + w / 2 / settled.scale];
  }, [settled, graphSize]);

  const { scans, pairs, busy, error: scanError } = useScans(plotCurves, domain);
  const interPairs = useMemo(() => pairs.flatMap(p => {
    const a = plotCurves.find(c => c.id === p.idA);
    const b = plotCurves.find(c => c.id === p.idB);
    return a && b ? [{ pairKey: p.idA + '|' + p.idB, a, b, scan: p.scan }] : [];
  }), [pairs, plotCurves]);

  const intersections: IntersectionPoint[] = useMemo(
    () =>
      interPairs.flatMap((p) =>
        p.scan.roots.map((r) => ({
          key: `${p.pairKey}|${r.x}`,
          idA: p.a.id,
          idB: p.b.id,
          x: r.x,
          y: (p.a.f(r.x) + p.b.f(r.x)) / 2,
          touches: r.touches,
        })),
      ),
    [interPairs],
  );

  const rows: RowVM[] = useMemo(
    () =>
      compiled.map((c) => {
        const scan = c.entry.visible && c.res.curve ? scans.get(c.entry.id) : undefined;
        const roots = (scan?.roots ?? []).map((r) => ({ x: r.x, touches: r.touches }));
        let summary: string | null = null;
        if (c.res.curve && scan) {
          if (c.res.curve.rel) {
            summary = solutionText(solveRelation(c.res.curve.node, scan, c.res.curve.rel.op), c.res.curve.rel.op);
          } else if (c.res.curve.equationText) {
            summary = c.res.curve.poly?.c.every(v => v === 0) ? 'All real x' :
              roots.length > 0
                ? roots
                    .map((r) =>
                      Number.isInteger(r.x) ? `x = ${r.x}` : `x ≈ ${formatNumber(r.x, 10)}`,
                    )
                    .join(', ')
                : 'No roots detected in the visible range';
          }
        }
        return {
          id: c.entry.id,
          raw: c.entry.raw,
          color: c.entry.color,
          visible: c.entry.visible,
          error: c.res.error,
          roots,
          vertex: c.res.curve ? quadraticVertex(c.res.curve.poly) : null,
          summary,
        };
      }),
    [compiled, scans],
  );

  function intersectionY(idA: string, idB: string, x: number): number | null {
    const p = intersections.find(
      (i) =>
        i.idA === idA &&
        i.idB === idB &&
        Math.abs(i.x - x) <= 1e-9 * (1 + Math.abs(x)),
    );
    return p?.y ?? null;
  }

  const pointRows: PointRowVM[] = useMemo(
    () =>
      markers.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        color: p.color,
        visible: p.visible,
      })),
    [markers],
  );

  const markerPoses: MarkerPose[] = useMemo(
    () =>
      markers
        .filter((m) => m.visible && m.x.trim() !== '' && m.y.trim() !== '' && Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.y)))
        .map((m) => {
          const x = Number(m.x);
          const y = Number(m.y);
          return {
            id: m.id,
            color: m.color,
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
          };
        }),
    [markers],
  );

  const interVMs: InterVM[] = useMemo(
    () =>
      interPairs.map((p) => ({
        pairKey: p.pairKey,
        idA: p.a.id,
        idB: p.b.id,
        labelA: p.a.label,
        labelB: p.b.label,
        points: p.scan.roots.map((r) => ({
          x: r.x,
          y: (p.a.f(r.x) + p.b.f(r.x)) / 2,
          touches: r.touches,
        })),
      })),
    [interPairs],
  );

  const explanation = useMemo<Explanation | null>(() => {
    if (!selection) return null;
    if (selection.kind === 'vertex') {
      const curve = plotCurves.find(c => c.id === selection.curveId);
      const vertex = curve ? quadraticVertex(curve.poly) : null;
      if (!curve?.poly || !vertex) return null;
      const a = curve.poly.c[2], b = curve.poly.c[1] ?? 0;
      return {
        headline: 'Vertex of the parabola',
        sub: `(${formatNumber(vertex.x, 8)}, ${formatNumber(vertex.y, 8)})`,
        steps: [
          { kind: 'plan', title: 'Find the turning point', body: `The vertex is the ${a > 0 ? 'lowest' : 'highest'} point of this parabola. Its vertical line of symmetry is x = ${formatNumber(vertex.x, 8)}.`, math: `y = ${curve.label}` },
          { kind: 'algebra', title: 'Find the horizontal coordinate', body: 'For y = ax² + bx + c, the vertex lies at x = −b / (2a).', math: `a = ${formatNumber(a, 8)}, b = ${formatNumber(b, 8)}\nx = −(${formatNumber(b, 8)}) / (2 × ${formatNumber(a, 8)}) = ${formatNumber(vertex.x, 8)}` },
          { kind: 'result', title: 'Substitute x into the curve', math: `y = f(${formatNumber(vertex.x, 8)}) = ${formatNumber(vertex.y, 8)}\nVertex = (${formatNumber(vertex.x, 8)}, ${formatNumber(vertex.y, 8)})` },
        ],
      };
    }
    if (selection.kind === 'root') {
      const c = plotCurves.find((cc) => cc.id === selection.curveId);
      if (!c) return null;
      const scan = scans.get(c.id);
      if (!scan) return null;
      const root = scan.roots.find(
        (r) => Math.abs(r.x - selection.x) <= Math.max(1e-6 * (1 + Math.abs(selection.x)), 1e-9),
      );
      if (!root) return null;
      return explainRoot(
        { label: c.label, node: c.node, poly: c.poly },
        root,
        scan,
        { equationText: c.equationText ?? undefined, rel: c.rel ?? undefined },
      );
    }
    if (selection.kind === 'intersection') {
      const pair = interPairs.find((p) => p.pairKey === `${selection.idA}|${selection.idB}`);
      if (!pair) return null;
      const root = pair.scan.roots.find(
        (r) => Math.abs(r.x - selection.x) <= Math.max(1e-6 * (1 + Math.abs(selection.x)), 1e-9),
      );
      if (!root) return null;
      return explainIntersection(pair.a, pair.b, root, pair.scan);
    }
    return explainSelection(selection);
  }, [selection, plotCurves, scans, interPairs]);

  // remember the last answer so the keyboard's `ans` key can reuse it
  useEffect(() => {
    if (!selection) return;
    if (selection.kind === 'root') setLastAnswer(formatNumber(selection.x, 10));
    else if (selection.kind === 'intersection') {
      const y = intersectionY(selection.idA, selection.idB, selection.x);
      if (y != null) setLastAnswer(formatNumber(y, 10));
    } else if (selection.kind === 'marker' || selection.kind === 'vertex') {
      const y = selection.y;
      setLastAnswer(formatNumber(y, 10));
    }
  }, [selection]);

  /* ---------------- entry actions ---------------- */
  const onChangeRaw = useCallback((id: string, raw: string) => {
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, raw } : e)));
    setSelection(null);
    setLastAnswer(null);
  }, []);

  const addEntry = useCallback(
    (afterId?: string) => {
      const color = PALETTE[colorSeq.current % PALETTE.length];
      colorSeq.current += 1;
      const entry: Entry = { id: newId(), raw: '', color, visible: true };
      setEntries((es) => {
        if (es.length >= 10) return es;
        const idx = afterId ? es.findIndex((e) => e.id === afterId) : es.length - 1;
        const next = es.slice();
        next.splice(idx + 1, 0, entry);
        return next;
      });
      setFocusId(entry.id);
    },
    [],
  );

  const addMarker = useCallback(
    (afterId?: string) => {
      const color = PALETTE[colorSeq.current % PALETTE.length];
      colorSeq.current += 1;
      const entry: PointEntry = { id: newId(), x: '0', y: '0', color, visible: true };
      setMarkers((ps) => {
        if (ps.length >= 10) return ps;
        const idx = afterId ? ps.findIndex((e) => e.id === afterId) : ps.length - 1;
        const next = ps.slice();
        next.splice(idx + 1, 0, entry);
        return next;
      });
      setFocusId(entry.id);
    },
    [],
  );

  const fillPreset = useCallback((text: string) => {
    const color = PALETTE[colorSeq.current++ % PALETTE.length];
    const id = newId();
    setEntries(es => {
      const empty = es.find(e => e.raw.trim() === '');
      if (empty) return es.map(e => e.id === empty.id ? { ...e, raw: text } : e);
      return es.length >= 10 ? es : [...es, { id, raw: text, color, visible: true }];
    });
    setSelection(null);
  }, []);

  const touchesSelection = (id: string): boolean =>
    (selection?.kind === 'root' || selection?.kind === 'vertex') && selection.curveId === id
      ? true
      : selection?.kind === 'intersection' && (selection.idA === id || selection.idB === id)
        ? true
        : selection?.kind === 'marker' && selection.markerId === id
          ? true
          : false;

  const toggleVisible = useCallback(
    (id: string) => {
      setEntries((es) => es.map((e) => (e.id === id ? { ...e, visible: !e.visible } : e)));
      const entry = entries.find((e) => e.id === id);
      if (entry?.visible && touchesSelection(id)) setSelection(null);
    },
    [entries, selection],
  );

  const togglePointVisible = useCallback(
    (id: string) => {
      setMarkers((ps) => ps.map((e) => (e.id === id ? { ...e, visible: !e.visible } : e)));
      if (touchesSelection(id)) setSelection(null);
    },
    [selection],
  );

  const deleteEntry = useCallback(
    (id: string) => {
      setEntries((es) =>
        es.length <= 1 ? [{ ...es[0], raw: '' }] : es.filter((e) => e.id !== id),
      );
      if (touchesSelection(id)) setSelection(null);
    },
    [selection],
  );

  const deleteMarker = useCallback(
    (id: string) => {
      setMarkers((ps) =>
        ps.filter((e) => e.id !== id),
      );
      if (touchesSelection(id)) setSelection(null);
    },
    [selection],
  );

  const onSelectRoot = useCallback((id: string, x: number) =>
    setSelection({ kind: 'root', curveId: id, x }),
  []);
  const onSelectIntersection = useCallback(
    (idA: string, idB: string, x: number) =>
      setSelection({ kind: 'intersection', idA, idB, x }),
    [],
  );
  const onSelectMarker = useCallback((id: string, x: number, y: number) =>
    setSelection({ kind: 'marker', markerId: id, x, y }),
    [],
  );
  const onClearSelection = useCallback(() => setSelection(null), []);

  const onView = useCallback((v: View) => setView(v), []);
  const onSettle = useCallback(() => setSettled(view), [view]);
  const onSize = useCallback(
    (w: number, h: number) => {
      setGraphSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    },
    [],
  );

  return (
    <div className="app">
      <Sidebar
        rows={rows}
        intersections={interVMs}
        points={pointRows}
        onChangePoint={(id, axis, value) => {
          setMarkers(ps => ps.map(p => p.id === id ? { ...p, [axis]: value } : p));
          setSelection(null);
        }}
        onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
        status={saveError || scanError || (busy ? 'Calculating…' : 'Saved on this device')}
        selection={selection}
        explanation={explanation}
        focusId={focusId}
        onChangeRaw={onChangeRaw}
        onAdd={addEntry}
        onAddPoint={addMarker}
        onFillPreset={fillPreset}
        onToggleVisible={toggleVisible}
        onTogglePointVisible={togglePointVisible}
        onDelete={deleteEntry}
        onDeletePoint={deleteMarker}
        onSelectRoot={onSelectRoot}
        onSelectVertex={(curveId, x, y) => setSelection({ kind: 'vertex', curveId, x, y })}
        onSelectIntersection={onSelectIntersection}
        onSelectPoint={onSelectMarker}
        onClearSelection={onClearSelection}
        ans={lastAnswer}
      />
      <Graph
        curves={plotCurves}
        scans={scans}
        intersections={intersections}
        markers={markerPoses}
        view={view}
        selection={selection}
        onSelection={setSelection}
        onView={onView}
        onSettle={onSettle}
        onSize={onSize}
      />
    </div>
  );
}
