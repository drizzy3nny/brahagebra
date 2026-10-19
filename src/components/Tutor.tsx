import { useEffect, useRef, useState } from 'react';
import type { Explanation } from '../lib/explain';

export function Tutor({ explanation }: { explanation: Explanation }) {
  const [available, setAvailable] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/tutor/status', { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(v => setAvailable(v?.available === true)).catch(() => {});
    return () => { controller.abort(); request.current?.abort(); };
  }, []);
  const ask = async () => {
    if (busy || !available) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setAnswer('');
    const timeout = window.setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch('/api/tutor', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: question.trim() || 'Explain this in simpler language, and show one small example.', context: JSON.stringify(explanation).slice(0, 16000) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The tutor is unavailable. Please try again.');
      setAnswer(data.text);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not connect.'); else setError('Request stopped. You can try again.'); }
    finally { clearTimeout(timeout); setBusy(false); }
  };
  return <section className="tutor" aria-label="AI tutor">
    <h3>Understand this with AI</h3>
    {available ? <>
      <label htmlFor="tutor-question">What would you like explained?</label>
      <textarea id="tutor-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1000} placeholder="Why do we use this method?" rows={2} />
      <button className="tutor-ask" onClick={ask} disabled={busy}>{busy ? 'Explaining…' : question.trim() ? 'Ask the tutor' : 'Explain it simply'}</button>
      <small>Your question and these steps are sent to OpenAI when you ask.</small>
    </> : <p>The AI tutor is not connected yet. You can still explore the calculated steps below.</p>}
    <div aria-live="polite">{error && <p role="alert">{error}</p>}{answer && <><p className="tutor-answer">{answer}</p><small>AI explanation — check it against the calculated steps.</small></>}</div>
  </section>;
}
