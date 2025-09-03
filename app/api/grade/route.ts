import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type LooseResult = {
  raw: string;
  grade?: number;
  feedback?: string;
  extracted?: { method: string; note?: string };
};

function promptLoose(rubric: string, submission: string) {
  return `
You are grading an assignment. Be concise.

RUBRIC:
${rubric}

SUBMISSION:
${submission}

Please reply with a short result like:
"Grade: 84/100
Feedback: One tight paragraph with concrete reasons."

If you include anything else, that's fine — we will show the full text.
`.trim();
}

async function callLLM(url: string, model: string, prompt: string) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ model, prompt, max_tokens: 500, temperature: 0 }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text());
  const raw = await res.json();
  const text: string = raw?.choices?.[0]?.text ?? raw?.choices?.[0]?.message?.content ?? '';
  return text || '';
}

// Try to pull a 0–100 from common patterns, but never block on it.
function extractGradeAndFeedback(text: string): { grade?: number; feedback?: string; method: string; note?: string } {
  const t = text.trim();

  // 1) JSON object with { "grade": N, "feedback": "..." }
  const jsonMatch = t.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      if (typeof obj.grade === 'number' && obj.grade >= 0 && obj.grade <= 100) {
        return { grade: Math.round(obj.grade), feedback: typeof obj.feedback === 'string' ? obj.feedback : undefined, method: 'json' };
      }
    } catch { /* ignore */ }
  }

  // 2) "Grade: 87/100" or "Score: 87/100"
  const g1 = t.match(/(?:grade|score)\s*[:\-]?\s*(\d{1,3})\s*\/\s*100/i);
  if (g1) {
    const n = Number(g1[1]);
    if (n >= 0 && n <= 100) {
      const fbLine = t.split('\n').find(l => /feedback\s*[:\-]/i.test(l));
      return { grade: n, feedback: fbLine ? fbLine.replace(/feedback\s*[:\-]\s*/i,'').trim() : undefined, method: 'pattern-GradeN/100' };
    }
  }

  // 3) "Grade: 87" (implicitly /100)
  const g2 = t.match(/(?:grade|score)\s*[:\-]?\s*(\d{1,3})(?!\s*\/)/i);
  if (g2) {
    const n = Number(g2[1]);
    if (n >= 0 && n <= 100) {
      const fbLine = t.split('\n').find(l => /feedback\s*[:\-]/i.test(l));
      return { grade: n, feedback: fbLine ? fbLine.replace(/feedback\s*[:\-]\s*/i,'').trim() : undefined, method: 'pattern-GradeN' };
    }
  }

  // 4) First standalone 0–100 number (not a year). Heuristic; last resort.
  const nums = [...t.matchAll(/\b(\d{1,3})\b/g)].map(m => Number(m[1])).filter(n => n <= 100);
  if (nums.length) {
    return { grade: nums[0], feedback: undefined, method: 'first-0-100', note: 'heuristic integer catch' };
  }

  return { method: 'none' };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rubric = String(body.rubric || '');
    const submission = String(body.submission || '');
    if (!rubric.trim() || !submission.trim()) {
      return NextResponse.json({ error: 'rubric and submission are required' }, { status: 400 });
    }

    const url = process.env.LLM_COMPLETIONS_URL;
    const model = process.env.LLM_MODEL_NAME || 'local';
    if (!url) return NextResponse.json({ error: 'LLM_COMPLETIONS_URL missing' }, { status: 500 });

    const text = await callLLM(url, model, promptLoose(rubric, submission));
    const ex = extractGradeAndFeedback(text);

    const out: LooseResult = { raw: text };
    if (typeof ex.grade === 'number') out.grade = ex.grade;
    if (ex.feedback) out.feedback = ex.feedback;
    out.extracted = { method: ex.method, ...(ex.note ? { note: ex.note } : {}) };

    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unexpected error' }, { status: 500 });
  }
}
