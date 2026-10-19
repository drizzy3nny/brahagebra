import { compileEntry } from './compile';
import { scanRoots, type RootScan } from './roots';
const cache = new Map<string, RootScan>();
self.onmessage = (event: MessageEvent<{ token: number; curves: { id: string; raw: string }[]; range: [number, number] }>) => {
  const { token, curves, range } = event.data;
  try {
    const compiled = curves.flatMap(c => { const curve = compileEntry(c.raw, c.id).curve; return curve ? [curve] : []; });
    const scan = (key: string, f: (x: number) => number) => {
      const cacheKey = JSON.stringify([key, range]);
      let result = cache.get(cacheKey);
      if (!result) { result = scanRoots(f, range); cache.set(cacheKey, result); }
      if (cache.size > 100) cache.delete(cache.keys().next().value!);
      return result;
    };
    const scans = compiled.map(c => [c.id, scan(c.raw, c.f)]);
    const pairs = [];
    for (let i = 0; i < compiled.length; i++) for (let j = i + 1; j < compiled.length; j++) {
      const a = compiled[i], b = compiled[j];
      const result = scan(JSON.stringify([a.raw, b.raw]), x => a.f(x) - b.f(x));
      if (result.roots.length) pairs.push({ idA: a.id, idB: b.id, scan: result });
    }
    self.postMessage({ token, scans, pairs });
  } catch { self.postMessage({ token, error: 'Calculation failed. Simplify the expression and try again.' }); }
};
