import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/server/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const db = createSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await db.from('quiz_results')
      .select('id, username, score, total_questions')
      .eq('played_at', today)
      .order('score', { ascending: false })
      .order('time_taken', { ascending: true })
      .limit(10);
    if (error || !Array.isArray(data)) throw new Error('Leaderboard unavailable');
    const leaderboard = data.map(row => ({
      id: row.id,
      username: row.username ?? 'Anonim',
      score: row.score,
      totalQuestions: row.total_questions,
    }));
    return NextResponse.json({ leaderboard }, { headers });
  } catch {
    return NextResponse.json({ error: { code: 'LEADERBOARD_UNAVAILABLE' } }, { status: 500, headers });
  }
}
