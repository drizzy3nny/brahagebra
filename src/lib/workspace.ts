import { useCallback, useEffect, useState } from 'react';
import type { Entry } from '../App';
import type { PointEntry } from '../types';
interface Workspace { entries: Entry[]; markers: PointEntry[] }
const KEY = 'brahagebra.workspace.v1';
function load(): Workspace {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && Array.isArray(v.entries) && v.entries.length > 0 && v.entries.length <= 10 && Array.isArray(v.markers) && v.markers.length <= 10 &&
      v.entries.every((e: Entry) => typeof e.id === 'string' && typeof e.raw === 'string' && e.raw.length <= 2000 && /^#[\da-f]{6}$/i.test(e.color) && typeof e.visible === 'boolean') &&
      v.markers.every((e: PointEntry) => typeof e.id === 'string' && typeof e.x === 'string' && typeof e.y === 'string' && /^#[\da-f]{6}$/i.test(e.color) && typeof e.visible === 'boolean')) return v;
  } catch { /* Storage may be unavailable or contain an older format. */ }
  return { entries: [{ id: 'initial', raw: 'x^2 - 4', color: '#2563eb', visible: true }], markers: [] };
}
export function useWorkspace() {
  const [history, setHistory] = useState(() => ({ present: load(), past: [] as Workspace[], future: [] as Workspace[], field: '', time: 0 }));
  const { present, past, future } = history;
  const [saveError, setSaveError] = useState('');
  const commit = useCallback((fn: (w: Workspace) => Workspace, field: string) => {
    const now = Date.now();
    setHistory(h => {
      const next = fn(h.present);
      if (JSON.stringify(h.present) === JSON.stringify(next)) return h;
      const oldList = field === 'entries' ? h.present.entries : h.present.markers;
      const newList = field === 'entries' ? next.entries : next.markers;
      const changed = newList.filter((e,i) => JSON.stringify(e) !== JSON.stringify(oldList[i]));
      const structural = oldList.length !== newList.length || changed.some((e) => !oldList.some(p => p.id === e.id));
      const editField = field + ':' + changed.map(e => e.id).join(',');
      const coalesce = !structural && h.field === editField && now - h.time < 700;
      return { present: next, past: coalesce ? h.past : [...h.past.slice(-79), h.present], future: [], field: structural ? '' : editField, time: now };
    });
  }, []);
  const setEntries = useCallback((fn: (e: Entry[]) => Entry[]) => commit(w => ({ ...w, entries: fn(w.entries) }), 'entries'), [commit]);
  const setMarkers = useCallback((fn: (e: PointEntry[]) => PointEntry[]) => commit(w => ({ ...w, markers: fn(w.markers) }), 'markers'), [commit]);
  const undo = useCallback(() => setHistory(h => h.past.length ? { present: h.past[h.past.length - 1], past: h.past.slice(0,-1), future: [...h.future, h.present], field: '', time: 0 } : h), []);
  const redo = useCallback(() => setHistory(h => h.future.length ? { present: h.future[h.future.length - 1], past: [...h.past, h.present], future: h.future.slice(0,-1), field: '', time: 0 } : h), []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(present)); setSaveError(''); }
    catch { setSaveError('Could not save on this device. Keep this tab open.'); }
  }, [present]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !['z', 'y'].includes(e.key.toLowerCase())) return;
      if ((e.target as HTMLElement)?.closest('.tutor')) return;
      e.preventDefault(); if (e.shiftKey || e.key.toLowerCase() === 'y') redo(); else undo();
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [undo, redo]);
  return { ...present, setEntries, setMarkers, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0, saveError };
}
