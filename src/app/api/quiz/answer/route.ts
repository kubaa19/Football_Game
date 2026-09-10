import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowy JSON.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Nieprawidłowe dane.' }, { status: 400 });
  }

  const { questionId, selectedIndex } = body as Record<string, unknown>;
  if (
    typeof questionId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionId) ||
    typeof selectedIndex !== 'number' ||
    !Number.isInteger(selectedIndex) ||
    selectedIndex < -1 || selectedIndex > 3
  ) {
    return NextResponse.json({ error: 'Nieprawidłowe pytanie lub odpowiedź.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) {
    return NextResponse.json({ error: 'Brak konfiguracji serwera.' }, { status: 500 });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const today = new Date().toISOString().split('T')[0];
    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from('daily_challenges')
      .select('question_ids')
      .eq('date', today)
      .maybeSingle();
    if (challengeError) {
      return NextResponse.json({ error: 'Nie uda?o si? pobra? wyzwania.' }, { status: 500 });
    }
    if (!challenge) {
      return NextResponse.json({ error: 'Brak wyzwania na dzisiaj.' }, { status: 404 });
    }
    if (!Array.isArray(challenge.question_ids) ||
        !challenge.question_ids.every((id: unknown) => typeof id === 'string')) {
      return NextResponse.json({ error: 'Nieprawid?owe dane wyzwania.' }, { status: 500 });
    }
    if (!challenge.question_ids.includes(questionId.toLowerCase())) {
      return NextResponse.json({ error: 'Pytanie nie nale?y do dzisiejszego wyzwania.' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('questions')
      .select('correct_index, explanation')
      .eq('id', questionId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Nie udało się sprawdzić odpowiedzi.' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Nie znaleziono pytania.' }, { status: 404 });
    }

    const correctIndex: unknown = data.correct_index;
    if (
      typeof correctIndex !== 'number' ||
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 || correctIndex > 3
    ) {
      return NextResponse.json({ error: 'Nieprawidłowe dane pytania.' }, { status: 500 });
    }

    return NextResponse.json({
      correct: selectedIndex !== -1 && selectedIndex === correctIndex,
      correctIndex,
      explanation: data.explanation ?? '',
    });
  } catch {
    return NextResponse.json({ error: 'Nie udało się sprawdzić odpowiedzi.' }, { status: 500 });
  }
}
