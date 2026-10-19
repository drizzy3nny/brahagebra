import { useRef, type PointerEvent, type MouseEvent } from 'react';

interface Options {
  enabled: boolean;
  onDrag: (offset: number, dragging: boolean) => void;
  onDismiss: () => void;
}

/** Pointer capture keeps a swipe responsive even outside the handle. */
export function useDismissGesture({ enabled, onDrag, onDismiss }: Options) {
  const gesture = useRef<{ id: number; x: number; y: number; lastY: number; time: number; velocity: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);
  const finish = (e: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    const offset = Math.max(0, e.clientY - g.y);
    const velocity = e.timeStamp - g.time < 100 ? g.velocity : 0;
    if (!cancelled && g.dragging && (offset >= 64 || (offset > 16 && velocity > 0.5))) onDismiss();
    onDrag(0, false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      suppressClick.current = false;
      if (!enabled || !e.isPrimary || e.button !== 0) return;
      gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, lastY: e.clientY, time: e.timeStamp, velocity: 0, dragging: false };
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (!enabled || !g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.dragging) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { gesture.current = null; return; }
        if (dy < 5 || dy < Math.abs(dx)) return;
        g.dragging = true; suppressClick.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
      const elapsed = e.timeStamp - g.time;
      if (elapsed > 0) g.velocity = (e.clientY - g.lastY) / elapsed;
      g.lastY = e.clientY; g.time = e.timeStamp;
      onDrag(Math.max(0, dy), true);
    },
    onPointerUp(e: PointerEvent<HTMLElement>) { finish(e, false); },
    onPointerCancel(e: PointerEvent<HTMLElement>) { finish(e, true); },
    onLostPointerCapture(e: PointerEvent<HTMLElement>) {
      if (gesture.current?.id === e.pointerId) { gesture.current = null; onDrag(0, false); }
    },
    onClickCapture(e: MouseEvent<HTMLElement>) {
      if (suppressClick.current) { suppressClick.current = false; e.preventDefault(); e.stopPropagation(); }
    },
  };
}
