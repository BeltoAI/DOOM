import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const url = process.env.LLM_COMPLETIONS_URL;
  const model = process.env.LLM_MODEL_NAME || 'local';
  if (!url) return NextResponse.json({ error: 'LLM_COMPLETIONS_URL missing' }, { status: 500 });

  const body = await req.json();
  const prompt = String(body.prompt || 'Return ONLY {"ok":true}');
  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ model, prompt, max_tokens: 128, temperature: 0 }),
  });
  const text = await res.text(); // do not parse; show raw server reply
  return new NextResponse(text, { status: res.status, headers: {'Content-Type':'application/json; charset=utf-8'} });
}
