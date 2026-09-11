import type { QuizAttemptFinishRequest, QuizAttemptFinishResponse } from '@/types/quizAttempt';
import type { QuizAttemptAnswerRequest, QuizAnswerFeedback, QuizAttemptStartResponse } from '@/types/quizAttempt';
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
/** Only the in-flight start is shared; settled resume state is never cached. */
let startingAttempt: Promise<unknown> | null = null;

export class QuizApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function readQuizResponse(response: Response): Promise<unknown> {
  let data;
  try { data = await response.json(); }
  catch { throw new QuizApiError('INVALID_RESPONSE'); }
  if (!response.ok) {
    throw new QuizApiError(typeof data?.error?.code === 'string' ? data.error.code : 'REQUEST_FAILED');
  }
  return data;
}

export function startDailyAttempt(): Promise<unknown> {
  if (!startingAttempt) {
    startingAttempt = fetch('/api/quiz/attempt/start', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    }).then(readQuizResponse).finally(() => { startingAttempt = null; });
  }
  return startingAttempt;
}

export async function recordAttemptAnswer(input: QuizAttemptAnswerRequest): Promise<QuizAnswerFeedback> {
  const data = await readQuizResponse(await fetch('/api/quiz/answer', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }));
  const value = data as QuizAnswerFeedback | null;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.correct !== 'boolean' || typeof value.replayed !== 'boolean' ||
      !Number.isInteger(value.correctIndex) || value.correctIndex < 0 || value.correctIndex > 3 ||
      typeof value.explanation !== 'string' || (input.selectedIndex === -1 && value.correct)) {
    throw new QuizApiError('INVALID_RESPONSE');
  }
  return {
    correct: value.correct, correctIndex: value.correctIndex,
    explanation: value.explanation, replayed: value.replayed,
  };
}

/** Minimal checks needed to restore the screen; the backend owns quiz rules. */
export function validateAttemptResume(value: unknown, daily: PublicQuestion[] | null): {
  attempt: QuizAttemptStartResponse;
  questions: (PublicQuestion & { id: string })[];
} {
  const invalid = () => { throw new QuizApiError('INVALID_RESUME'); };
  const isId = (id: unknown): id is string => typeof id === 'string' && id.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const state = value as QuizAttemptStartResponse;
  const ids = state.questionIds;
  if (!isId(state.attemptId) || !isId(state.challengeId) ||
      !Array.isArray(ids) || !ids.length || !ids.every(isId) ||
      new Set(ids.map(id => id.toLowerCase())).size !== ids.length ||
      !Array.isArray(daily) || daily.length !== ids.length ||
      !daily.every((q, index) => q && q.id === ids[index] &&
        typeof q.question === 'string' && typeof q.category === 'string' &&
        Array.isArray(q.options) && q.options.length === 4 &&
        q.options.every(option => typeof option === 'string'))) return invalid();

  const answers = state.answers;
  if (!Array.isArray(answers) || answers.length > ids.length ||
      !answers.every((answer, index) => answer && answer.questionId === ids[index] &&
        Number.isInteger(answer.selectedIndex) && answer.selectedIndex >= -1 &&
        answer.selectedIndex <= 3 && typeof answer.correct === 'boolean' &&
        !(answer.selectedIndex === -1 && answer.correct)) ||
      state.nextQuestionId !== (ids[answers.length] ?? null)) return invalid();

  const full = answers.length === ids.length;
  if (state.state === 'completed') {
    const result = state.result;
    const pattern = answers.map(answer => answer.correct ? '1' : '0').join('');
    if (!full || typeof state.completedAt !== 'string' || !state.completedAt ||
        !result || typeof result !== 'object' || !isId(result.id) ||
        result.totalQuestions !== ids.length || result.answersPattern !== pattern ||
        result.score !== answers.filter(answer => answer.correct).length) return invalid();
  } else if ((state.state !== 'in_progress' && state.state !== 'ready_to_finish') ||
      (state.state === 'ready_to_finish') !== full ||
      state.completedAt !== null || state.result !== null) return invalid();

  return { attempt: state, questions: daily as (PublicQuestion & { id: string })[] };
}

export async function finishQuizAttempt(input: QuizAttemptFinishRequest): Promise<QuizAttemptFinishResponse> {
  const data = await readQuizResponse(await fetch('/api/quiz/attempt/finish', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }));
  const value = data as QuizAttemptFinishResponse | null;
  const result = value?.result;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.attemptId !== input.attemptId || typeof value.replayed !== 'boolean' ||
      !result || typeof result !== 'object' || Array.isArray(result) ||
      typeof result.id !== 'string' || !result.id ||
      typeof result.username !== 'string' || !result.username.trim() ||
      typeof result.playedAt !== 'string' ||
      !Number.isInteger(result.score) || !Number.isInteger(result.totalQuestions) ||
      result.totalQuestions < 1 || result.score < 0 || result.score > result.totalQuestions ||
      typeof result.answersPattern !== 'string' ||
      result.answersPattern.length !== result.totalQuestions || /[^01]/.test(result.answersPattern)) {
    throw new QuizApiError('INVALID_RESPONSE');
  }
  return value;
}
