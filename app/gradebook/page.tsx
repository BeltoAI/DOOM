'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Entry = {
  id: string;
  student: string;
  className: string;
  total: number;
  max: number;
  passFail: 'PASS'|'FAIL';
  timestamp: string;
};

function loadGB(): Record<string, Entry[]> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem('gradebook') || '{}'); } catch { return {}; }
}
function saveGB(gb: Record<string, Entry[]>) {
  localStorage.setItem('gradebook', JSON.stringify(gb));
}

export default function GradebookPage() {
  const [gb, setGb] = useState<Record<string, Entry[]>>({});
  const [cls, setCls] = useState<string>('');

  useEffect(() => {
    const data = loadGB();
    setGb(data);
    const first = Object.keys(data)[0] || 'Class A';
    setCls(first);
  }, []);

  const entries = useMemo(() => gb[cls] || [], [gb, cls]);

  function exportCSV() {
    const header = ['Class','Student','Total','Max','Pass/Fail','Timestamp'];
    const rows = entries.map(e => [e.className, e.student, e.total, e.max, e.passFail, e.timestamp]);
    const csv = [header, ...rows]
      .map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gradebook_${cls.replace(/\s+/g,'_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function clearClass() {
    if (!confirm(`Delete all entries for "${cls}"?`)) return;
    const next = { ...gb };
    next[cls] = [];
    setGb(next);
    saveGB(next);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="border-b border-slate-200 bg-white">
        <div>
          <div className="text-lg font-semibold">Gradebook</div>
          <Link href="/" className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 hover:bg-slate-50">Back</Link>
        </div>
      </div>

      <div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-500">Class</div>
            <select value={cls} onChange={(e)=>setCls(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2">
              {Object.keys(gb).length === 0 ? <option>Class A</option> :
                Object.keys(gb).map(c => <option key={c} value={c}>{c}</option>)
              }
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="h-9 rounded-lg bg-emerald-600 px-3 text-white hover:bg-emerald-700">Export CSV</button>
            <button onClick={clearClass} className="h-9 rounded-lg bg-red-600 px-3 text-white hover:bg-red-700">Clear Class</button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {entries.length === 0 ? (
            <div className="text-sm text-slate-500">No entries yet for this class.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left p-2 border-t border-slate-200">Student</th>
                    <th className="text-left p-2 border-t border-slate-200">Total</th>
                    <th className="text-left p-2 border-t border-slate-200">Max</th>
                    <th className="text-left p-2 border-t border-slate-200">Pass/Fail</th>
                    <th className="text-left p-2 border-t border-slate-200">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id} className="border-t border-slate-200">
                      <td className="p-2">{e.student}</td>
                      <td className="p-2">{e.total}</td>
                      <td className="p-2">{e.max}</td>
                      <td className="p-2">{e.passFail}</td>
                      <td className="p-2">{new Date(e.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
