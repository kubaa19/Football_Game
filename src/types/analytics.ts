import type { Attribution } from '@/lib/analyticsState';
export interface AnalyticsEvents {
  quiz_viewed: Attribution & { challenge_date?: string };
  quiz_started: Attribution & { challenge_date: string; resumed: boolean };
  question_answered: { challenge_date: string; question_number: 1 | 2 | 3 | 4 | 5; correct: boolean; timed_out: boolean };
  quiz_completed: Attribution & { challenge_date: string; score: number; total_questions: 5 };
  leaderboard_viewed: Record<string, never>;
}
export type AnalyticsEvent = keyof AnalyticsEvents;
