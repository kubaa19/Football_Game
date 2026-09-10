// Plik: src/services/quizService.ts

import { supabase } from '@/lib/supabase';
import { PublicQuestion, QuizResultRequest } from '@/types/quiz';

/**
 * POBIERANIE CODZIENNEGO QUIZU
 *
 * SECURITY:
 * correct_index NIGDY nie jest pobierany z bazy
 * w tym zapytaniu.
 *
 * Dzięki temu przeglądarka nie zna poprawnych odpowiedzi
 * przed udzieleniem odpowiedzi przez użytkownika.
 */
export async function getDailyQuestions(): Promise<PublicQuestion[] | null> {
  try {
    const response = await fetch('/api/quiz/daily', { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error fetching daily questions:', error);
    return null;
  }
}


/**
 * LEADERBOARD
 *
 * Pobieramy tylko publiczne informacje potrzebne
 * do wyświetlenia rankingu.
 */
export interface LeaderboardEntry {
  id?: string;
  username: string;
  score: number;
  total_questions: number;
  time_taken?: number;
  played_at?: string;
}

export async function getTodayLeaderboard(): Promise<LeaderboardEntry[]> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('quiz_results')
    .select(`
      id,
      username,
      score,
      total_questions,
      time_taken,
      played_at
    `)
    .eq('played_at', today)
    .order('score', { ascending: false })
    .order('time_taken', { ascending: true })
    .limit(10);

  if (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }

  return data as LeaderboardEntry[];
}


/**
 * ZAPIS WYNIKU
 *
 * Wynik NIE jest zapisywany bezpośrednio do Supabase
 * z przeglądarki.
 *
 * Przeglądarka wysyła dane do naszego endpointu API,
 * a backend zajmuje się zapisem i walidacją.
 */
export async function saveQuizResult(result: QuizResultRequest) {
  const response = await fetch('/api/quiz/result', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(result),
  });

  if (!response.ok) {
    throw new Error('Nie udało się zapisać wyniku.');
  }

  return await response.json();
}