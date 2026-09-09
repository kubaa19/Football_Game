import { supabase } from '@/lib/supabase';
import { Question } from '@/types/quiz';

export async function getDailyQuestions(): Promise<Question[] | null> {
  const today = new Date().toISOString().split('T')[0];

  // 1. Get the challenge for today
  const { data: challenge, error: challengeError } = await supabase
    .from('daily_challenges')
    .select('question_ids')
    .eq('date', today)
    .single();

  if (challengeError || !challenge) {
    console.error('Error fetching daily challenge:', challengeError);
    return null;
  }

  // 2. Get the actual questions using the IDs from the challenge
  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select('*')
    .in('id', challenge.question_ids);

  if (questionsError || !questions) {
    console.error('Error fetching questions:', questionsError);
    return null;
  }

  // Sort questions to match the order in question_ids array
  const sortedQuestions = challenge.question_ids
    .map(id => questions.find(q => q.id === id))
    .filter(Boolean) as Question[];

  return sortedQuestions;
}

export async function saveQuizResult(result: {
  username?: string;
  score: number;
  total_questions: number;
  answers_pattern: string;
  completion_time_seconds?: number;
}) {
  const { data, error } = await supabase
    .from('quiz_results')
    .insert([result]);

  if (error) {
    console.error('Error saving result:', error);
  }
  return { data, error };
}

export interface LeaderboardEntry {
  id?: string;
  username: string;
  score: number;
  total_questions: number;
  completion_time_seconds?: number;
  created_at?: string;
}

export async function getTodayLeaderboard(): Promise<LeaderboardEntry[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('quiz_results')
    .select('*')
    .gte('created_at', todayStart.toISOString())
    .order('score', { ascending: false })
    .order('completion_time_seconds', { ascending: true })
    .limit(10);

  if (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }

  return data as LeaderboardEntry[];
}
