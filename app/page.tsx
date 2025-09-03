'use client';
import { useState } from 'react';

type LooseResult = {
  raw: string;
  grade?: number;
  feedback?: string;
  extracted?: { method: string; note?: string };
};

export default function Page() {
  const [rubric, setRubric] = useState('');
  const [submission, setSubmission] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LooseResult | null>(null);

  async function grade() {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ rubric, submission }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || 'Unknown error');
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{maxWidth: 860, margin: '2rem auto', fontFamily:'Inter, ui-sans-serif, system-ui'}}>
      <h1>Belto Grader — Loose Mode</h1>
      <p>Paste rubric + submission. We show the model’s full reply and try to extract a grade if it’s there.</p>

      <label style={{display:'block', margin:'1rem 0'}}>
        <strong>Rubric</strong>
        <textarea rows={8} value={rubric} onChange={e=>setRubric(e.target.value)} style={{width:'100%'}} />
      </label>

      <label style={{display:'block', margin:'1rem 0'}}>
        <strong>Submission</strong>
        <textarea rows={12} value={submission} onChange={e=>setSubmission(e.target.value)} style={{width:'100%'}} />
      </label>

      <button onClick={grade} disabled={loading || !rubric || !submission}>
        {loading ? 'Grading…' : 'Grade'}
      </button>

      {error && <p style={{color:'red'}}>{error}</p>}

      {result && (
        <section style={{marginTop:'2rem'}}>
          <h2>Result</h2>
          {typeof result.grade === 'number' ? (
            <p><strong>Extracted Grade:</strong> {result.grade}/100</p>
          ) : (
            <p><em>No numeric grade detected.</em></p>
          )}
          {result.feedback && <p><strong>Extracted Feedback:</strong> {result.feedback}</p>}
          {result.extracted && (
            <p style={{color:'#667'}}><small>Extraction: {result.extracted.method}{result.extracted.note ? ` — ${result.extracted.note}` : ''}</small></p>
          )}
          <details open>
            <summary><strong>Raw Model Output</strong></summary>
            <pre style={{whiteSpace:'pre-wrap', background:'#f6f7f9', padding:'1rem', borderRadius:8}}>{result.raw}</pre>
          </details>
        </section>
      )}
    </main>
  );
}
