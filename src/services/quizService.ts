// Plik: src/services/quizService.ts

import { supabase } from '@/lib/supabase';
import { PublicQuestion } from '@/types/quiz';

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
  const today = new Date().toISOString().split('T')[0];

  // Pobieramy dzisiejsze wyzwanie.
  const { data: challenge, error: challengeError } = await supabase
    .from('daily_challenges')
    .select('question_ids')
    .eq('date', today)
    .single();

  if (challengeError || !challenge) {
    console.error('Error fetching daily challenge:', challengeError);
    return null;
  }

  // UWAGA:
  // correct_index CELOWO nie znajduje się w SELECT.
  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select(`
      id,
      category,
      difficulty,
      question,
      options,
      explanation,
      tags
    `)
    .in('id', challenge.question_ids);

  if (questionsError || !questions) {
    console.error('Error fetching questions:', questionsError);
    return null;
  }

  // Przywracamy kolejność z daily_challenges.question_ids.
  const sortedQuestions = challenge.question_ids
    .map((id) => questions.find((question) => question.id === id))
    .filter((question): question is PublicQuestion => Boolean(question));

  return sortedQuestions;
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
export async function saveQuizResult(result: {
  username?: string;
  score: number;
  total_questions: number;
  answers_pattern: string;
}) {
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