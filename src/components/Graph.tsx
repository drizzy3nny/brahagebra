import { useCallback, useEffect, useRef, useState } from 'react';
import type { Curve } from '../lib/compile';
import { formatNumber, formatTick, niceStep } from '../lib/format';
import type { RootScan } from '../lib/roots';
import { holds } from '../lib/solution';
import { quadraticVertex } from '../lib/vertex';
import type { IntersectionPoint, MarkerPose, Selection, View } from '../types';

interface Props {
  curves: PlotCurve[];
  scans: Map<string, RootScan>;
  intersections: IntersectionPoint[];
  markers: MarkerPose[];
  view: View;
  selection: Selection | null;
  onSelection: (s: Selection | null) => void;
  onView: (v: View) => void;
  onSettle: () => void;
  onSize: (w: number, h: number) => void;
}

interface Dot {
  key: string;
  px: number;
  py: number;
  sel: Selection;
  label: string;
}

const TAU = Math.PI * 2;
const INTERSECT_COLOR = '#7c3aed';
const MIN_SCALE = 4;
const MAX_SCALE = 4000;

export interface PlotCurve extends Curve {
  color: string;
}

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

function rootLabel(x: number): string {
  return Number.isInteger(x) ? `x = ${x}` : `x ≈ ${formatNumber(x, 10)}`;
}

function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'vertex' && b.kind === 'vertex') return a.curveId === b.curveId;
  if (a.kind === 'root' && b.kind === 'root') {
    return a.curveId === b.curveId && Math.abs(a.x - b.x) <= 1e-6 * (1 + Math.abs(a.x));
  }
  if (a.kind === 'intersection' && b.kind === 'intersection') {
    return a.idA === b.idA && a.idB === b.idB && Math.abs(a.x - b.x) <= 1e-6 * (1 + Math.abs(a.x));
  }
  if (a.kind === 'marker' && b.kind === 'marker') {
    return a.markerId === b.markerId && Math.abs(a.x - b.x) <= 1e-6 * (1 + Math.abs(a.x));
  }
  return false;
}

/** median |f| over the viewport — used to tell asymptotes from steep slopes */
function medianAbs(f: (x: number) => number, xMin: number, xMax: number): number {
  const vals: number[] = [];
  for (let i = 0; i < 48; i++) {
    const y = f(xMin + ((xMax - xMin) * i) / 47);
    if (Number.isFinite(y)) vals.push(Math.abs(y));
  }
  vals.sort((a, b) => a - b);
  return vals.length ? vals[Math.floor(vals.length / 2)] : 0;
}

export function Graph(props: Props) {
  const { curves, scans, intersections, view, selection, onSelection, onView, onSettle, onSize } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathCache = useRef(new Map<string, { f: (x: number) => number; geometry: string; path: Path2D }>());
  const dotsRef = useRef<Dot[]>([]);
  const dragRef = useRef<{ x: number; y: number; moved: boolean; pending: Selection | null } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; scale: number; mx: number; my: number; cx: number; cy: number } | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const report = () => setSize((prev) => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      return prev.w === w && prev.h === h ? prev : { w, h };
    });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    onSize(size.w, size.h);
  }, [size.w, size.h, onSize]);

  const screenToWorldX = useCallback(
    (px: number) => view.cx + (px - size.w / 2) / view.scale,
    [view, size.w],
  );

  const hitDot = useCallback((mx: number, my: number): Dot | null => {
    let best: Dot | null = null;
    let bestD = window.matchMedia('(pointer: coarse)').matches ? 24 : 12;
    for (const d of dotsRef.current) {
      const dist = Math.hypot(d.px - mx, d.py - my);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }, []);

  /* ---------------- drawing ---------------- */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const { w, h } = size;
    if (!canvas || w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const { cx, cy, scale } = view;
    const xMin = cx - w / 2 / scale;
    const xMax = cx + w / 2 / scale;
    const yMin = cy - h / 2 / scale;
    const yMax = cy + h / 2 / scale;
    const sx = (x: number) => (x - cx) * scale + w / 2;
    const sy = (y: number) => h / 2 - (y - cy) * scale;

    // ---- grid
    const xStep = niceStep(xMax - xMin, Math.max(5, Math.round(w / 110)));
    const yStep = niceStep(yMax - yMin, Math.max(5, Math.round(h / 80)));
    const minorX = xStep / 5;
    const minorY = yStep / 5;
    ctx.lineWidth = 1;
    if (minorX * scale >= 7) {
      ctx.strokeStyle = '#f1f5f9';
      ctx.beginPath();
      for (let g = Math.ceil(xMin / minorX) * minorX; g <= xMax; g += minorX) {
        const p = Math.round(sx(g)) + 0.5;
        ctx.moveTo(p, 0);
        ctx.lineTo(p, h);
      }
      ctx.stroke();
    }
    if (minorY * scale >= 7) {
      ctx.strokeStyle = '#f1f5f9';
      ctx.beginPath();
      for (let g = Math.ceil(yMin / minorY) * minorY; g <= yMax; g += minorY) {
        const p = Math.round(sy(g)) + 0.5;
        ctx.moveTo(0, p);
        ctx.lineTo(w, p);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    for (let g = Math.ceil(xMin / xStep) * xStep; g <= xMax; g += xStep) {
      const p = Math.round(sx(g)) + 0.5;
      ctx.moveTo(p, 0);
      ctx.lineTo(p, h);
    }
    for (let g = Math.ceil(yMin / yStep) * yStep; g <= yMax; g += yStep) {
      const p = Math.round(sy(g)) + 0.5;
      ctx.moveTo(0, p);
      ctx.lineTo(w, p);
    }
    ctx.stroke();

    // ---- axes
    const xAxisY = yMin <= 0 && yMax >= 0 ? sy(0) : null;
    const yAxisX = xMin <= 0 && xMax >= 0 ? sx(0) : null;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (xAxisY !== null) {
      ctx.moveTo(0, Math.round(xAxisY) + 0.5);
      ctx.lineTo(w, Math.round(xAxisY) + 0.5);
    }
    if (yAxisX !== null) {
      ctx.moveTo(Math.round(yAxisX) + 0.5, 0);
      ctx.lineTo(Math.round(yAxisX) + 0.5, h);
    }
    ctx.stroke();

    // ---- tick labels
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xLabelY = xAxisY !== null ? xAxisY + 6 : h - 16;
    for (let g = Math.ceil(xMin / xStep) * xStep; g <= xMax; g += xStep) {
      if (Math.abs(g) < xStep * 1e-9) continue;
      const t = formatTick(g);
      const px = sx(g);
      if (px < 14 || px > w - 14) continue;
      ctx.strokeText(t, px, xLabelY);
      ctx.fillText(t, px, xLabelY);
    }
    ctx.textAlign = yAxisX !== null ? 'right' : 'left';
    ctx.textBaseline = 'middle';
    for (let g = Math.ceil(yMin / yStep) * yStep; g <= yMax; g += yStep) {
      if (Math.abs(g) < yStep * 1e-9) continue;
      const t = formatTick(g);
      const py = sy(g);
      if (py < 10 || py > h - 10) continue;
      const lx = yAxisX !== null ? yAxisX - 8 : 8;
      ctx.strokeText(t, lx, py);
      ctx.fillText(t, lx, py);
    }

    // ---- curves
    for (const curve of curves) {
      const geometry = [w, h, cx, cy, scale].join(',');
      let cached = pathCache.current.get(curve.id);
      if (!cached || cached.f !== curve.f || cached.geometry !== geometry) {
        const path = new Path2D();
        const med = medianAbs(curve.f, xMin, xMax);
        const bigTol = 1e5 * (1 + med);
        let pen = false; let prevY = NaN;
        for (let px = 0; px <= w; px += w > 1600 ? 2 : 1) {
          const y = curve.f(xMin + px / w * (xMax - xMin));
          if (!Number.isFinite(y)) { pen = false; prevY = NaN; continue; }
          const py = sy(y);
          const jump = pen && prevY * y < 0 && (Math.abs(sy(prevY) - py) > h * 2 || (Math.abs(y) > bigTol && Math.abs(prevY) > bigTol));
          if (!pen || jump) path.moveTo(px, py); else path.lineTo(px, py);
          pen = true; prevY = y;
        }
        cached = { f: curve.f, geometry, path }; pathCache.current.set(curve.id, cached);
      }
      ctx.strokeStyle = curve.color; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke(cached.path);
    }
    for (const id of pathCache.current.keys()) if (!curves.some(c => c.id === id)) pathCache.current.delete(id);

    // ---- inequality shading: thicken the x-axis where lhs OP rhs holds
    if (xAxisY !== null) {
      for (const curve of curves) {
        if (!curve.rel) continue;
        ctx.strokeStyle = curve.color;
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const yLine = Math.round(xAxisY) + 0.5;
        let segStart: number | null = null;
        for (let px = 0; px <= w; px++) {
          const x = xMin + (px / w) * (xMax - xMin);
          const ok = holds(curve.f(x), curve.rel.op);
          if (ok && segStart === null) segStart = px;
          if ((!ok || px === w) && segStart !== null) {
            ctx.moveTo(segStart, yLine);
            ctx.lineTo(px, yLine);
            segStart = null;
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ---- crosshair
    const hovered = mouse && !dragRef.current ? hitDot(mouse.x, mouse.y) : null;
    if (mouse && !dragRef.current) {
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(mouse.x) + 0.5, 0);
      ctx.lineTo(Math.round(mouse.x) + 0.5, h);
      ctx.stroke();
      ctx.restore();
    }

    // ---- dots
    const dots: Dot[] = [];
    const showY = yMin <= 0 && yMax >= 0;
    if (showY) {
      for (const curve of curves) {
        const scan = scans.get(curve.id);
        if (!scan) continue;
        // strict inequalities exclude the boundary → hollow dots
        const excludeBoundary = curve.rel !== null && (curve.rel.op === '<' || curve.rel.op === '>');
        for (const r of scan.roots) {
          if (r.x < xMin || r.x > xMax) continue;
          const px = sx(r.x);
          const py = sy(0);
          const key = `root:${curve.id}:${r.x}`;
          const sel: Selection = { kind: 'root', curveId: curve.id, x: r.x };
          const isSel = sameSelection(selection, sel);
          drawRootDot(ctx, px, py, curve.color, excludeBoundary, isSel || hovered?.key === key);
          dots.push({ key, px, py, sel, label: rootLabel(r.x) });
        }
      }
    }
      for (const p of intersections) {
        if (p.x < xMin || p.x > xMax) continue;
        const px = sx(p.x);
        const py = sy(p.y);
        if (py < -24 || py > h + 24) continue;
        const key = `int:${p.key}`;
        const sel: Selection = { kind: 'intersection', idA: p.idA, idB: p.idB, x: p.x };
        const isSel = sameSelection(selection, sel);
        drawInterDot(ctx, px, py, isSel || hovered?.key === key);
        dots.push({
          key,
          px,
          py,
          sel,
          label: `(${formatNumber(p.x, 8)}, ${formatNumber(p.y, 8)})`,
        });
      }
      for (const m of props.markers) {
        const px = sx(m.x);
        const py = sy(m.y);
        if (px < -10 || px > w + 10 || py < -10 || py > h + 10) continue;
        const key = `marker:${m.id}`;
        const sel: Selection = { kind: 'marker', markerId: m.id, x: m.x, y: m.y };
        const isSel = sameSelection(selection, sel);
        drawMarkerDot(ctx, px, py, m.color, isSel || hovered?.key === key);
        dots.push({
          key,
          px,
          py,
          sel,
          label: `(${formatNumber(m.x, 8)}, ${formatNumber(m.y, 8)})`,
        });
      }
    // Draw vertices last so a turning point on the axis remains easy to tap.
    for (const curve of curves) {
      const vertex = quadraticVertex(curve.poly);
      if (!vertex) continue;
      const px = sx(vertex.x), py = sy(vertex.y);
      if (px < -24 || px > w + 24 || py < -24 || py > h + 24) continue;
      const key = `vertex:${curve.id}`;
      const sel: Selection = { kind: 'vertex', curveId: curve.id, ...vertex };
      drawRootDot(ctx, px, py, curve.color, false, sameSelection(selection, sel) || hovered?.key === key);
      // Prefer the vertex when it coincides with a root or intersection.
      dots.unshift({ key, px, py, sel, label: `Vertex (${formatNumber(vertex.x, 8)}, ${formatNumber(vertex.y, 8)})` });
    }
    dotsRef.current = dots;

    // ---- value pills for hovered / selected dots
    const pills: Dot[] = [];
    for (const d of dots) {
      if (hovered?.key === d.key || sameSelection(selection, d.sel)) pills.push(d);
    }
    for (const d of pills) drawPill(ctx, d.px, d.py, d.label, d.py > 60);

    // cursor feedback
    canvas.style.cursor = dragRef.current?.moved ? 'grabbing' : hovered ? 'pointer' : 'grab';
  }, [size, view, curves, scans, intersections, selection, mouse, hitDot, props.markers]);

  useEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  /* ---------------- wheel zoom about the cursor ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const newScale = clampScale(view.scale * Math.exp(-e.deltaY * 0.0016));
      const wx = view.cx + (mx - w / 2) / view.scale;
      const wy = view.cy + (h / 2 - my) / view.scale;
      onView({
        scale: newScale,
        cx: wx - (mx - w / 2) / newScale,
        cy: wy - (h / 2 - my) / newScale,
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [view, onView]);

  /* ---------------- pointer interaction ---------------- */
  const local = (e: React.PointerEvent): { mx: number; my: number } => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const { mx, my } = local(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: mx, y: my });
    if (pointersRef.current.size === 2) {
      // second finger → pinch mode, cancel any tap/drag
      const [p1, p2] = [...pointersRef.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      pinchRef.current = {
        dist: Math.max(dist, 1),
        scale: view.scale,
        mx: (p1.x + p2.x) / 2,
        my: (p1.y + p2.y) / 2,
        cx: view.cx,
        cy: view.cy,
      };
      dragRef.current = null;
      return;
    }
    const hit = hitDot(mx, my);
    dragRef.current = { x: mx, y: my, moved: false, pending: hit ? hit.sel : null };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { mx, my } = local(e);
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: mx, y: my });
    setMouse({ x: mx, y: my });

    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const [p1, p2] = [...pointersRef.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const w = size.w;
      const h = size.h;
      // world point under the *original* pinch centre stays under the current centre
      const wx = pinch.cx + (pinch.mx - w / 2) / pinch.scale;
      const wy = pinch.cy + (h / 2 - pinch.my) / pinch.scale;
      const newScale = clampScale(pinch.scale * (dist / pinch.dist));
      onView({
        scale: newScale,
        cx: wx - (midX - w / 2) / newScale,
        cy: wy - (h / 2 - midY) / newScale,
      });
      return;
    }

    const d = dragRef.current;
    if (d && e.buttons !== 0) {
      const dx = mx - d.x;
      const dy = my - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.moved) {
        onView({ ...view, cx: view.cx - dx / view.scale, cy: view.cy + dy / view.scale });
        d.x = mx;
        d.y = my;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') setMouse(null);
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      if (pinchRef.current) onSettle();
      pinchRef.current = null;
    }
    const d = dragRef.current;
    dragRef.current = null;
    if (d) {
      if (!d.moved) onSelection(d.pending);
      else onSettle();
    }
  };

  const onPointerLeave = (e: React.PointerEvent) => {
    setMouse(null);
    pointersRef.current.delete(e.pointerId);
    if (e.buttons === 0) dragRef.current = null;
  };

  const zoomBy = (k: number) => onView({ ...view, scale: clampScale(view.scale * k) });
  const reset = () => onView({ cx: 0, cy: 0, scale: 40 });

  const worldX = mouse ? screenToWorldX(mouse.x) : null;

  return (
    <div className="graph-wrap" ref={wrapRef}>
      <canvas
        aria-label="Interactive graph. Drag to pan, pinch to zoom. Select roots and intersections using the buttons in the editor."
        role="img"
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => { pointersRef.current.delete(e.pointerId); pinchRef.current = null; dragRef.current = null; setMouse(null); onSettle(); }}
        onPointerLeave={onPointerLeave}
        onDoubleClick={reset}
      />

      <div className="graph-tools">
        <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => zoomBy(1.4)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={reset} aria-label="Reset view">
          ⟲
        </button>
      </div>

      {worldX !== null && curves.length > 0 && (
        <div className="readout">
          <div className="readout-x">x = {formatNumber(worldX, 6)}</div>
          {curves.map((c) => {
            const y = c.f(worldX);
            return (
              <div className="readout-row" key={c.id}>
                <span className="readout-dot" style={{ background: c.color }} />
                <span className="readout-label">{c.label}</span>
                <span className="readout-val">{Number.isFinite(y) ? formatNumber(y, 6) : '\u2014'}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="graph-hint">drag to pan · pinch or scroll to zoom · tap a dot for the solver steps</div>
    </div>
  );
}

function drawRootDot(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  color: string,
  hollow: boolean,
  active: boolean,
): void {
  if (active) {
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, TAU);
    ctx.fillStyle = color + '2b';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(px, py, 5.4, 0, TAU);
  if (hollow) {
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawInterDot(ctx: CanvasRenderingContext2D, px: number, py: number, active: boolean): void {
  const r = 6.4;
  if (active) {
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, TAU);
    ctx.fillStyle = INTERSECT_COLOR + '2b';
    ctx.fill();
  }
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.PI / 4);
  ctx.beginPath();
  ctx.rect(-r / 1.5, -r / 1.5, (r / 1.5) * 2, (r / 1.5) * 2);
  ctx.fillStyle = INTERSECT_COLOR;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawMarkerDot(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  color: string,
  active: boolean,
): void {
  const r = 6.2;
  if (active) {
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, TAU);
    ctx.fillStyle = color + '2b';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(px, py, r + 2.2, 0, TAU);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, py, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  // crossing crosshair ring so a marker at a curve axis is easy to see
  ctx.beginPath();
  ctx.arc(px, py, r + 4.4, 0, TAU);
  ctx.lineWidth = 1.1;
  ctx.setLineDash([2.4, 2.4]);
  ctx.strokeStyle = color + '80';
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPill(ctx: CanvasRenderingContext2D, px: number, py: number, text: string, below: boolean): void {
  ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
  const tw = ctx.measureText(text).width;
  const w = tw + 18;
  const hgt = 23;
  let x = px - w / 2;
  const wrapW = ctx.canvas.width / Math.min(window.devicePixelRatio || 1, 2.5);
  x = Math.max(6, Math.min(wrapW - w - 6, x));
  const y = below ? py + 14 : py - 37;
  ctx.beginPath();
  ctx.roundRect(x, y, w, hgt, 6);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + hgt / 2 + 0.5);
}
