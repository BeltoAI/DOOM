import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Criterion = { criterion: string; max_points: number };

function normalizeRubric(raw: string): { criteria: Criterion[]; passThreshold: number | null; totalMax: number } {
  const text = (raw || '').replace(/\r/g,'').trim();
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  const crits: Criterion[] = [];

  // Patterns we support from messy rubrics
  const pNumMax = /^\s*\d+[\.\)\]]\s*(.+?)\s*(?:\(|-|–|—)?\s*(?:max[:\s]*)(\d+)\)?/i;  // "1) Name (max 30)"
  const pNameMax = /^(.+?)\s*\(max\s*(\d+)\s*\)$/i;                                    // "Name (max 30)"
  const pNameDash = /^(.+?)\s*(?:-|:)\s*(\d+)\s*$/;                                     // "Name - 30"
  const pBullet = /^[-*]\s*(.+?)\s*(?:\(max\s*(\d+)\))?$/i;                             // "- Name (max 20)" or "- Name"

  for (const ln of lines) {
    let m = ln.match(pNumMax); if (m) { crits.push({ criterion: m[1].trim(), max_points: Number(m[2]) }); continue; }
    m = ln.match(pNameMax);   if (m) { crits.push({ criterion: m[1].trim(), max_points: Number(m[2]) }); continue; }
    m = ln.match(pNameDash);  if (m) { crits.push({ criterion: m[1].trim(), max_points: Number(m[2]) }); continue; }
    m = ln.match(pBullet);    if (m) { crits.push({ criterion: m[1].trim(), max_points: m[2] ? Number(m[2]) : 0 }); continue;
    m = ln.match(pSectionPts);    if (m) { crits.push({ criterion: m[1].trim(), max_points: Number(m[2]) }); continue; } }
  }

  // Pull an optional pass threshold e.g. "Passing threshold: 60/100" or "Pass ≥ 70%"
  let pass: number | null = null;
  const passLine = text.match(/pass\w*\s*(?:threshold|>=|≥|:)?\s*(\d{1,3})\s*(?:\/\s*(\d{1,3})|%)/i);
  if (passLine) {
    const a = Number(passLine[1]); const b = passLine[2] ? Number(passLine[2]) : null;
    pass = b ? Math.round((a / b) * 100) : a; // store as percent for clarity
  }

  // If some criteria missing max points, distribute evenly
  const sumKnown = crits.reduce((a,b)=>a+(b.max_points||0),0);
  const zeros = crits.filter(c=>!c.max_points);
  if (zeros.length) {
    const fallbackTotal = sumKnown || 100;
    const remaining = Math.max(0, fallbackTotal - sumKnown) || Math.max(100 - sumKnown, 0);
    const per = Math.max(1, Math.floor((remaining || 100) / (zeros.length || 1)));
    for (const z of zeros) z.max_points = per;
  }

  const total = crits.reduce((a,b)=>a+b.max_points,0) || 100;
  return { criteria: crits, passThreshold: pass, totalMax: total };
}

export async function POST(req: Request) {
  const body = await req.json();
  const rubric = String(body.rubric || '');
  if (!rubric.trim()) return NextResponse.json({ error: 'rubric required' }, { status: 400 });
  const norm = normalizeRubric(rubric);
  return NextResponse.json(norm, { status: 200 });
}
