// Plik: src/app/api/quiz/result/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error('Brak konfiguracji Supabase po stronie serwera.');
}

// WAŻNE:
// Secret key jest używany wyłącznie po stronie serwera.
// Nigdy nie używamy go w kodzie klienta ani w zmiennej NEXT_PUBLIC_*.
const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseSecretKey
);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      username,
      score,
      total_questions,
      answers_pattern,
    } = body;

    // Podstawowa walidacja danych otrzymanych od przeglądarki.
    if (
      typeof username !== 'string' ||
      username.trim().length < 1 ||
      username.trim().length > 20
    ) {
      return NextResponse.json(
        { error: 'Nieprawidłowy nick.' },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(score) ||
      !Number.isInteger(total_questions) ||
      score < 0 ||
      total_questions < 1 ||
      score > total_questions
    ) {
      return NextResponse.json(
        { error: 'Nieprawidłowy wynik.' },
        { status: 400 }
      );
    }

    if (
      typeof answers_pattern !== 'string' ||
      answers_pattern.length !== total_questions ||
      !/^[01]+$/.test(answers_pattern)
    ) {
      return NextResponse.json(
        { error: 'Nieprawidłowy wzór odpowiedzi.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('quiz_results')
      .insert({
        username: username.trim(),
        score,
        total_questions,
        answers_pattern,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving quiz result:', error);

      return NextResponse.json(
        { error: 'Nie udało się zapisać wyniku.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result: data,
    });
  } catch (error) {
    console.error('Unexpected error saving quiz result:', error);

    return NextResponse.json(
      { error: 'Nieprawidłowe żądanie.' },
      { status: 400 }
    );
  }
}