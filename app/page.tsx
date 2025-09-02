'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type GradeResult = {
  total_score: number;
  max_score: number;
  pass_fail: 'PASS' | 'FAIL';
  rubric_breakdown: { criterion: string; max_points: number; points_awarded: number; reason: string }[];
  strengths: string[];
  weaknesses: string[];
  deductions: string[];
  summary_feedback: string;
  _raw?: string;
};

const defaultRubric = `Title: Generic 100-point Rubric (Strict)
Scoring rules:
- Grade what's present only; do not infer.
- Never exceed per-criterion or overall max.
- Penalize missing structure, off-topic content, and lack of evidence.

Criteria:
1) Understanding & Accuracy (max 30)
2) Structure & Clarity (max 20)
3) Depth & Evidence (max 25)
4) Technical Quality (max 15)
5) Originality & Insight (max 10)

Passing threshold: 60/100`;

const clean = (s: string) => s.replace(/\s+$/g, '').trim();
const concise = (r: GradeResult | null) => {
  if (!r) return '';
  const a = r.strengths?.[0] ? `+ ${r.strengths[0]}` : '';
  const b = r.weaknesses?.[0] ? `- ${r.weaknesses[0]}` : '';
  const sum = (r.summary_feedback || '').replace(/\s+/g, ' ').slice(0, 140);
  return [a, b, sum && `• ${sum}`].filter(Boolean).join('  ');
};

export default function Page() {
  const [rubric, setRubric] = useState(defaultRubric);
  const [context, setContext] = useState('');
  const [answer, setAnswer] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [passThreshold, setPassThreshold] = useState(60);

  const [className, setClassName] = useState('Class A');
  const [student, setStudent] = useState('');
  const [saveToBook, setSaveToBook] = useState(true);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<GradeResult | null>(null);

  const canGrade = useMemo(() => clean(rubric) && clean(answer) && !loading, [rubric, answer, loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'enter') grade();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rubric, answer, maxScore, passThreshold]);

  function saveEntry(data: GradeResult) {
    try {
      const gb = JSON.parse(localStorage.getItem('gradebook') || '{}');
      if (!gb[className]) gb[className] = [];
      gb[className].push({
        id: String(Date.now()),
        student: clean(student) || 'Unknown',
        className,
        total: data.total_score,
        max: data.max_score,
        passFail: data.pass_fail,
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem('gradebook', JSON.stringify(gb));
    } catch {}
  }

  async function call(force = false) {
    const r = await fetch(`/api/grade${force ? '?force=1' : ''}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ rubric, answer, context, maxScore, passThreshold })
    });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()) as GradeResult;
  }

  async function grade(force = false) {
    if (!canGrade) return;
    setLoading(true); setErr(null); setRes(null);
    try {
      const data = await call(force);
      setRes(data);
      if (saveToBook) saveEntry(data);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function copyShort() {
    const s = concise(res);
    if (s) navigator.clipboard.writeText(s);
  }

  const short = concise(res);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="container mx-auto px-5 py-4 flex items-center justify-between max-w-4xl">
          <div className="text-lg font-semibold">Belto Grader</div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/gradebook" className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 hover:bg-slate-50">Gradebook</Link>
            <div className="text-slate-500">Ctrl/Cmd + Enter</div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-5 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-sm text-slate-600 mb-1">Class</div>
                <input value={className} onChange={e=>setClassName(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3" />
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">Student</div>
                <input value={student} onChange={e=>setStudent(e.target.value)} placeholder="Jane Doe" className="h-10 w-full rounded-lg border border-slate-300 px-3" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={saveToBook} onChange={e=>setSaveToBook(e.target.checked)} />
              Save to gradebook on grade
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="text-sm text-slate-600">Context (optional)</div>
            <textarea rows={3} value={context} onChange={e=>setContext(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3" />
            <div className="text-sm text-slate-600">Rubric (authoritative)</div>
            <textarea rows={8} value={rubric} onChange={e=>setRubric(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-sm text-slate-600 mb-1">Max score</div>
                <input type="number" min={1} value={maxScore} onChange={e=>setMaxScore(parseInt(e.target.value||'0',10))} className="h-10 w-full rounded-lg border border-slate-300 px-3" />
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">Pass threshold</div>
                <input type="number" min={0} value={passThreshold} onChange={e=>setPassThreshold(parseInt(e.target.value||'0',10))} className="h-10 w-full rounded-lg border border-slate-300 px-3" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="text-base font-semibold">Student Submission</div>
            <textarea rows={14} value={answer} onChange={e=>setAnswer(e.target.value)} placeholder="Paste the student's answer here." className="w-full rounded-lg border border-slate-300 p-3" />
          </div>
        </section>

        {/* Results */}
        <section className="space-y-4">
          {/* Short feedback */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">Short feedback</div>
              <button onClick={copyShort} disabled={!short} className={`h-8 rounded-lg px-3 border text-sm ${!short ? 'border-slate-200 text-slate-400 cursor-not-allowed' : 'border-slate-300 hover:bg-slate-50'}`}>Copy</button>
            </div>
            <div className="text-sm mt-1">{short || '—'}</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">Results</div>
              <div className="text-sm text-slate-500">{res ? 'Ready' : (loading ? 'Grading…' : 'No result yet')}</div>
            </div>

            {err && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{String(err).slice(0,800)}</div>}

            {res && (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-3xl font-semibold">{res.total_score}/{res.max_score}</div>
                  <div className={`px-3 h-8 inline-flex items-center rounded-full text-sm ${res.pass_fail === 'PASS' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{res.pass_fail}</div>
                </div>

                {res.summary_feedback && res.summary_feedback.startsWith('Parser failed') && (
                  <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                    {res.summary_feedback}
                    <div className="mt-2 flex gap-2">
                      <button onClick={()=>grade(true)} className="h-9 rounded-lg bg-black px-4 text-white hover:opacity-90">Force JSON</button>
                      <button onClick={()=>grade(false)} className="h-9 rounded-lg border border-slate-300 px-4 hover:bg-slate-50">Retry</button>
                    </div>
                  </div>
                )}

                {res.rubric_breakdown?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left p-2 border-t border-slate-200">Criterion</th>
                          <th className="text-left p-2 border-t border-slate-200">Awarded</th>
                          <th className="text-left p-2 border-t border-slate-200">Max</th>
                          <th className="text-left p-2 border-t border-slate-200">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {res.rubric_breakdown.map((r, i) => (
                          <tr key={i} className="border-t border-slate-200">
                            <td className="p-2 w-1/4">{r.criterion}</td>
                            <td className="p-2 w-20">{r.points_awarded}</td>
                            <td className="p-2 w-20">{r.max_points}</td>
                            <td className="p-2">{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {res._raw && !res.summary_feedback.startsWith('Parser failed') && (
                  <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <summary className="cursor-pointer mb-2">Model raw output</summary>
                    <pre className="whitespace-pre-wrap">{res._raw}</pre>
                  </details>
                )}
              </>
            )}

            {!res && !err && !loading && (
              <div className="text-slate-500 text-sm">Paste rubric + answer, set scores, then press <kbd className="rounded border border-slate-300 bg-slate-50 px-1">Ctrl</kbd>/<kbd className="rounded border border-slate-300 bg-slate-50 px-1">Cmd</kbd> + <kbd className="rounded border border-slate-300 bg-slate-50 px-1">Enter</kbd>.</div>
            )}
          </div>

          {/* Action bar */}
          <div className="sticky bottom-0 z-20 backdrop-blur bg-white/90 border-t border-slate-200 px-4 py-3 flex flex-wrap gap-2 items-center justify-between rounded-t-xl">
            <div className="text-sm text-slate-600">Class: <span className="font-medium text-slate-900">{className}</span> • Student: <span className="font-medium text-slate-900">{student || '—'}</span></div>
            <div className="flex gap-2">
              <button onClick={()=>grade(false)} disabled={!canGrade} className={`h-10 rounded-lg px-4 text-white ${!canGrade ? 'bg-slate-400 cursor-not-allowed' : 'bg-black hover:opacity-90'}`}>{loading ? 'Grading…' : 'Grade'}</button>
              <button onClick={()=>grade(true)} disabled={!canGrade} className={`h-10 rounded-lg px-4 border ${!canGrade ? 'border-slate-200 text-slate-400 cursor-not-allowed' : 'border-slate-300 hover:bg-slate-50'}`}>Force JSON</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="container mx-auto max-w-4xl px-5 py-6 text-slate-500 text-sm">
        Clean. Fast. Server-only endpoint.
      </footer>
    </div>
  );
}
