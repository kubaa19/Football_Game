import 'server-only';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function saveQuizResult(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return fail('Nieprawidłowy JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Nieprawidłowe dane.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => key !== 'username' && key !== 'answers')) return fail('Nieobsługiwane pola żądania.');
  if (typeof input.username !== 'string' || !input.username.trim() || input.username.trim().length > 20) return fail('Nieprawidłowy nick.');
  if (!Array.isArray(input.answers)) return fail('Brak odpowiedzi.');
  const selections = new Map<string, number>();
  for (const answer of input.answers) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer) ||
        Object.keys(answer).some(key => key !== 'questionId' && key !== 'selectedIndex') ||
        typeof answer.questionId !== 'string' || !uuid.test(answer.questionId) ||
        typeof answer.selectedIndex !== 'number' || !Number.isInteger(answer.selectedIndex) ||
        answer.selectedIndex < -1 || answer.selectedIndex > 3) return fail('Nieprawidłowa odpowiedź.');
    const id = answer.questionId.toLowerCase();
    if (selections.has(id)) return fail('Powtórzone pytanie.');
    selections.set(id, answer.selectedIndex);
  }
  const today = new Date().toISOString().split('T')[0];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return fail('Brak konfiguracji serwera.', 500);
  try {
    const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: challenge, error: challengeError } = await db.from('daily_challenges')
      .select('question_ids').eq('date', today).maybeSingle();
    if (challengeError) return fail('Błąd pobierania wyzwania.', 500);
    if (!challenge) return fail('Brak dzisiejszego wyzwania.', 404);
    const ids: unknown = challenge.question_ids;
    if (!Array.isArray(ids) || !ids.length || !ids.every((id): id is string => typeof id === 'string' && uuid.test(id)) || new Set(ids).size !== ids.length) return fail('Nieprawidłowy zestaw pytań.', 500);
    if (selections.size !== ids.length || !ids.every(id => selections.has(id))) return fail('Wymagany jest pełny zestaw odpowiedzi na dzisiejsze pytania.');
    const { data: questions, error } = await db.from('questions').select('id, correct_index').in('id', ids);
    if (error || !questions || questions.length !== ids.length) return fail('Niekompletny zestaw pytań.', 500);
    const pattern: string[] = [];
    for (const id of ids) {
      const question = questions.find(q => q.id === id);
      if (!question || typeof question.correct_index !== 'number' || !Number.isInteger(question.correct_index) || question.correct_index < 0 || question.correct_index > 3) return fail('Nieprawidłowe dane pytania.', 500);
      pattern.push(selections.get(id) === question.correct_index ? '1' : '0');
    }
    const { data: result, error: saveError } = await db.from('quiz_results').insert({
      username: input.username.trim(),
      score: pattern.filter(bit => bit === '1').length,
      total_questions: ids.length,
      answers_pattern: pattern.join(''),
      played_at: today,
    }).select().single();
    if (saveError) return fail('Nie udało się zapisać wyniku.', 500);
    return NextResponse.json({ success: true, result });
  } catch { return fail('Nie udało się zapisać wyniku.', 500); }
}
