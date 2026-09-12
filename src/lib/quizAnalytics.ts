import type { QuizAttemptStartResponse, QuizAttemptFinishResponse } from '@/types/quizAttempt';
import type { AnalyticsEvent, AnalyticsEvents } from '@/types/analytics';
import { enqueueAnalytics } from './analytics';
import { claimAnalyticsEvent, readAttribution } from './analyticsState';

function once<E extends AnalyticsEvent>(key: string, name: E, data: AnalyticsEvents[E]): void {
  try {
    if (claimAnalyticsEvent(key)) enqueueAnalytics(name, data);
  } catch { /* No telemetry error may affect gameplay. */ }
}
export function quizViewed(key: string): void {
  once('view:' + key, 'quiz_viewed', readAttribution());
}
export function quizStarted(state: QuizAttemptStartResponse): void {
  if (state.state !== 'in_progress' || !state.nextQuestionId) return;
  once('start:' + state.attemptId, 'quiz_started', {
    ...readAttribution(), challenge_date: state.challengeDate, resumed: state.resumed,
  });
}
export function questionAnswered(attemptId: string, date: string, number: number, correct: boolean, timedOut: boolean): void {
  if (!Number.isInteger(number) || number < 1 || number > 5) return;
  once('answer:' + attemptId + ':' + number, 'question_answered', {
    challenge_date: date, question_number: number as 1 | 2 | 3 | 4 | 5, correct, timed_out: timedOut,
  });
}
export function quizCompleted(confirmation: QuizAttemptFinishResponse): void {
  if (confirmation.result.totalQuestions !== 5) return;
  once('complete:' + confirmation.attemptId, 'quiz_completed', {
    ...readAttribution(), challenge_date: confirmation.result.playedAt,
    score: confirmation.result.score, total_questions: 5,
  });
}
export function leaderboardViewed(key: string): void {
  once('leaders:' + key, 'leaderboard_viewed', {});
}
