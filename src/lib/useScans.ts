import { useEffect, useMemo, useRef, useState } from 'react';
import type { Curve } from './compile';
import type { RootScan } from './roots';
interface Pair { idA: string; idB: string; scan: RootScan }
interface Result { key: string; scans: Map<string, RootScan>; pairs: Pair[] }
export function useScans(curves: Curve[], range: [number, number]) {
  const key = JSON.stringify([curves.map(c => ({ id: c.id, raw: c.raw })), range]);
  const [result, setResult] = useState<Result>({ key: '', scans: new Map(), pairs: [] });
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const token = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    return () => { w.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    const w = worker.current;
    if (!w) return;
    const current = ++token.current;
    setError('');
    w.onmessage = (e: MessageEvent<{ token: number; scans: [string, RootScan][]; pairs: Pair[]; error?: string }>) => {
      if (e.data.token !== token.current) return;
      if (e.data.error) { setError(e.data.error); return; }
      setResult({ key, scans: new Map(e.data.scans), pairs: e.data.pairs });
    };
    w.onerror = () => setError('Solver unavailable. Reload to try again.');
    const timer = setTimeout(() => {
      const [payload, domain] = JSON.parse(key);
      w.postMessage({ token: current, curves: payload, range: domain });
    }, 180);
    return () => clearTimeout(timer);
  }, [key]);
  return useMemo(() => ({ scans: result.key === key ? result.scans : new Map<string, RootScan>(), pairs: result.key === key ? result.pairs : [], busy: result.key !== key && !error, error }), [result, key, error]);
}
