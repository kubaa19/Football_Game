import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    return NextResponse.json({ error: 'Brak konfiguracji serwera.' }, { status: 500, headers });
  }

  try {
    const db = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const today = new Date().toISOString().split('T')[0];
    const { data: challenge, error: challengeError } = await db
      .from('daily_challenges').select('question_ids').eq('date', today).maybeSingle();
    if (challengeError) throw new Error('Challenge lookup failed');
    if (!challenge) {
      return NextResponse.json({ error: 'Brak wyzwania na dzisiaj.' }, { status: 404, headers });
    }
    const ids: unknown = challenge.question_ids;
    if (!Array.isArray(ids) || ids.length === 0 ||
        !ids.every((id): id is string => typeof id === 'string') ||
        new Set(ids).size !== ids.length) {
      throw new Error('Invalid challenge');
    }
    const { data: questions, error } = await db.from('questions')
      .select('id, category, difficulty, question, options, tags').in('id', ids);
    if (error || !questions || questions.length !== ids.length) {
      throw new Error('Incomplete question set');
    }
    const ordered = ids.map(id => {
      const row = questions.find(question => question.id === id);
      if (!row) throw new Error('Missing question');
      return {
        id: row.id,
        category: row.category,
        difficulty: row.difficulty,
        question: row.question,
        options: row.options,
        tags: row.tags,
      };
    });
    return NextResponse.json(ordered, { headers });
  } catch {
    return NextResponse.json({ error: 'Nie uda?o si? pobra? dzisiejszych pyta?.' }, { status: 500, headers });
  }
}
