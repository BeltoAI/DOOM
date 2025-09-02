import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Soft-repair common JSON issues: smart quotes, single quotes, trailing commas, comments, stray text. */
function repairJsonish(input: string): string | null {
  if (!input) return null;

  let s = input;

  // Extract the most likely JSON block
  const tag = s.match(/<json>([\s\S]*?)<\/json>/i);
  if (tag) s = tag[1];
  else {
    const fence = s.match(/```json([\s\S]*?)```/i) || s.match(/```([\s\S]*?)```/i);
    if (fence) s = fence[1];
    else {
      const i = s.indexOf('{'), j = s.lastIndexOf('}');
      if (i >= 0 && j > i) s = s.slice(i, j + 1);
    }
  }

  // Normalize whitespace
  s = s.replace(/\r/g, '');

  // Replace smart quotes with "
  s = s.replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"').replace(/[\u2018\u2019\u2032]/g, "'");

  // Strip JS-style comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  // If keys look unquoted, try quoting them cautiously (key: value -> "key": value)
  s = s.replace(/([{,]\s*)([A-Za-z_][\w-]*)(\s*):/g, '$1"$2"$3:');

  // Convert single-quoted strings to double (only when it seems safe)
  s = s.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (_m, inner) => `"${inner.replace(/"/g, '\\"')}"`);

  // Remove trailing commas in objects/arrays
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Trim any text before first { or after last }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);

  try { JSON.parse(s); return s; } catch { return null; }
}

function flexibleParse(text: string) {
  // 1) Raw attempt
  try { return JSON.parse(text); } catch {}
  // 2) Repairs
  const repaired = repairJsonish(text);
  if (repaired) { try { return JSON.parse(repaired); } catch {} }
  // 3) Nothing worked
  return null;
}

function schemaText(maxScore: number, passThreshold: number) {
  return `
JSON schema (exact keys):
{
  "total_score": number,
  "max_score": number,
  "pass_fail": "PASS" | "FAIL",
  "rubric_breakdown": [
    { "criterion": string, "max_points": number, "points_awarded": number, "reason": string }
  ],
  "strengths": string[],
  "weaknesses": string[],
  "deductions": string[],
  "summary_feedback": string
}
Rules:
- total_score = sum(points_awarded), clamp 0..${maxScore}
- pass_fail = "PASS" if total_score >= ${passThreshold} else "FAIL"
- Return VALID JSON only. No markdown, no prose.
`.trim();
}

function normalPrompt(p: {rubric: string; answer: string; context: string; maxScore: number; passThreshold: number;}) {
  const ctx = p.context?.trim() ? `Assignment context:\n${p.context}\n\n` : '';
  return `
Act as a strict grader.

Wrap your JSON ONLY inside <json> ... </json>. Do not include anything else.

${schemaText(p.maxScore, p.passThreshold)}

Grading policy:
- Grade ONLY what's written; do not infer.
- Obey the rubric literally.
- Never exceed per-criterion or overall max.
- Reasons must be concise and concrete.

${ctx}Rubric:
${p.rubric}

Submission:
${p.answer}

Return:
<json>
{ ... }
</json>
`.trim();
}

function strictPrompt(p: {rubric: string; answer: string; context: string; maxScore: number; passThreshold: number;}) {
  const ctx = p.context?.trim() ? `Assignment context:\n${p.context}\n\n` : '';
  return `
RETURN ONLY THIS JSON OBJECT. NO MARKDOWN. NO PROSE.

${schemaText(p.maxScore, p.passThreshold)}

${ctx}Rubric:
${p.rubric}

Submission:
${p.answer}
`.trim();
}

async function callLLM(url: string, payload: any) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upstream error ${res.status}: ${txt}`);
  }
  const raw = await res.json();
  const text: string = raw?.choices?.[0]?.text ?? raw?.choices?.[0]?.message?.content ?? '';
  return text || '';
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rubric = String(body.rubric || '');
    const answer = String(body.answer || '');
    const context = String(body.context || '');
    const maxScore = Number(body.maxScore || 100);
    const passThreshold = Number(body.passThreshold || 60);

    if (!rubric.trim() || !answer.trim()) {
      return NextResponse.json({ error: 'rubric and answer are required' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === '1';

    const url = process.env.LLM_COMPLETIONS_URL;
    const model = process.env.LLM_MODEL_NAME || 'local';
    if (!url) {
      return NextResponse.json({ error: 'Server misconfigured: LLM_COMPLETIONS_URL missing' }, { status: 500 });
    }

    // Try #1
    const prompt1 = force ? strictPrompt({rubric, answer, context, maxScore, passThreshold})
                          : normalPrompt({rubric, answer, context, maxScore, passThreshold});

    // Use aggressive decoding guards when the server supports them
    const base = { model, max_tokens: 900, temperature: 0, stop: ['</json>','```','\n\n\n'] };

    let text = await callLLM(url, { ...base, prompt: prompt1 });
    let parsed = flexibleParse(text);

    // Try #2 (strict) if needed
    if (!parsed && !force) {
      const prompt2 = strictPrompt({rubric, answer, context, maxScore, passThreshold});
      text = await callLLM(url, { model, prompt: prompt2, max_tokens: 800, temperature: 0, stop: ['\n\n','```'] });
      parsed = flexibleParse(text);
    }

    if (!parsed) {
      // Return usable payload for UI with raw snippet
      return NextResponse.json({
        total_score: 0,
        max_score: maxScore,
        pass_fail: 'FAIL',
        rubric_breakdown: [],
        strengths: [],
        weaknesses: [],
        deductions: [],
        summary_feedback: 'Parser failed: model did not return valid JSON (even after repairs). Use Force JSON, or fix upstream.',
        _raw: String(text).slice(0, 2000),
      }, { status: 200 });
    }

    // Safety clamps
    const total = Number(parsed.total_score ?? 0);
    const safe: any = {
      total_score: Math.max(0, Math.min(maxScore, isFinite(total) ? total : 0)),
      max_score: maxScore,
      pass_fail: 'FAIL' as 'PASS' | 'FAIL',
      rubric_breakdown: Array.isArray(parsed.rubric_breakdown) ? parsed.rubric_breakdown : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      deductions: Array.isArray(parsed.deductions) ? parsed.deductions : [],
      summary_feedback: String(parsed.summary_feedback ?? ''),
    };
    safe.pass_fail = safe.total_score >= passThreshold ? 'PASS' : 'FAIL';

    return NextResponse.json(safe, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}
