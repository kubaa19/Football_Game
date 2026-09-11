import 'server-only';
import { createSupabaseAdmin } from './supabaseAdmin';
import { ensureDailyChallenge, EnsureDailyChallengeError } from './ensureDailyChallenge';
import type {
  PersistedQuizAnswer,
  QuizAttemptResult,
  QuizAttemptStartResponse,
} from '@/types/quizAttempt';

const errorStatuses = {
  DAILY_CHALLENGE_NOT_FOUND: 404,
  DAILY_CHALLENGE_UNAVAILABLE: 503,
  DAILY_CHALLENGE_CHANGED: 409,
  DAILY_CHALLENGE_INVALID: 500,
  ATTEMPT_DATA_INVALID: 500,
  ATTEMPT_START_UNAVAILABLE: 503,
} as const;

export class QuizAttemptStartError extends Error {
  readonly status: number;

  constructor(readonly code: keyof typeof errorStatuses) {
    super(code);
    this.status = errorStatuses[code];
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isId = (value: unknown): value is string =>
  typeof value === 'string' && uuid.test(value);
const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const utcDay = () => new Date().toISOString().slice(0, 10);

function fail(code: keyof typeof errorStatuses): never {
  throw new QuizAttemptStartError(code);
}

function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ATTEMPT_DATA_INVALID');
  }
  return value as Record<string, unknown>;
}

interface Attempt {
  id: string;
  startedAt: string;
  completedAt: string | null;
}

function parseAttempt(value: unknown): Attempt {
  const data = row(value);
  if (!isId(data.id) || !isTimestamp(data.started_at) ||
      (data.completed_at !== null && !isTimestamp(data.completed_at))) {
    fail('ATTEMPT_DATA_INVALID');
  }
  if (data.completed_at !== null &&
      Date.parse(data.completed_at) < Date.parse(data.started_at)) {
    fail('ATTEMPT_DATA_INVALID');
  }
  return { id: data.id, startedAt: data.started_at, completedAt: data.completed_at };
}

function parseAnswers(value: unknown, ids: string[]): PersistedQuizAnswer[] {
  if (!Array.isArray(value)) fail('ATTEMPT_DATA_INVALID');
  const byId = new Map<string, PersistedQuizAnswer>();
  const allowedIds = new Set(ids);
  for (const item of value) {
    const answer = row(item);
    if (!isId(answer.question_id) || !allowedIds.has(answer.question_id) ||
        byId.has(answer.question_id) ||
        typeof answer.selected_index !== 'number' ||
        !Number.isInteger(answer.selected_index) ||
        answer.selected_index < -1 || answer.selected_index > 3 ||
        typeof answer.is_correct !== 'boolean' ||
        (answer.selected_index === -1 && answer.is_correct)) {
      fail('ATTEMPT_DATA_INVALID');
    }
    byId.set(answer.question_id, {
      questionId: answer.question_id,
      selectedIndex: answer.selected_index,
      correct: answer.is_correct,
    });
  }

  // Answers accepted by the RPC must form a prefix of the challenge order.
  const ordered: PersistedQuizAnswer[] = [];
  let gap = false;
  for (const id of ids) {
    const answer = byId.get(id);
    if (!answer) gap = true;
    else {
      if (gap) fail('ATTEMPT_DATA_INVALID');
      ordered.push(answer);
    }
  }
  return ordered;
}

function parseResult(
  value: unknown, answers: PersistedQuizAnswer[], total: number, today: string,
): QuizAttemptResult {
  const result = row(value);
  const pattern = answers.map(answer => answer.correct ? '1' : '0').join('');
  const score = answers.filter(answer => answer.correct).length;
  if (!isId(result.id) || typeof result.username !== 'string' ||
      !result.username.trim() || Array.from(result.username).length > 20 ||
      answers.length !== total || result.total_questions !== total ||
      result.score !== score || result.answers_pattern !== pattern ||
      result.played_at !== today) {
    fail('ATTEMPT_DATA_INVALID');
  }
  return {
    id: result.id,
    username: result.username,
    score,
    totalQuestions: total,
    answersPattern: pattern,
    playedAt: today,
  };
}

/** Creates/resumes today's attempt; does not answer questions or finalize results. */
export async function startQuizAttempt(ownerHash: string): Promise<QuizAttemptStartResponse> {
  const today = utcDay();
  const ensureSameDay = () => {
    if (utcDay() !== today) fail('DAILY_CHALLENGE_CHANGED');
  };

  try {
    if (!/^[0-9a-f]{64}$/.test(ownerHash)) fail('ATTEMPT_START_UNAVAILABLE');
    const db = createSupabaseAdmin();
    const readChallenge = () => db.from('daily_challenges')
      .select('id, date, question_ids').eq('date', today).maybeSingle();
    let { data: challenge, error: challengeError } = await readChallenge();
    if (challengeError) fail('ATTEMPT_START_UNAVAILABLE');
    ensureSameDay();
    if (!challenge) {
      await ensureDailyChallenge(today);
      ensureSameDay();
      ({ data: challenge, error: challengeError } = await readChallenge());
      ensureSameDay();
      if (challengeError) fail('ATTEMPT_START_UNAVAILABLE');
      if (!challenge) fail('DAILY_CHALLENGE_UNAVAILABLE');
    }

    const rawIds: unknown = challenge.question_ids;
    if (!isId(challenge.id) || challenge.date !== today ||
        !Array.isArray(rawIds) || rawIds.length !== 5 ||
        !rawIds.every(isId) || new Set(rawIds).size !== rawIds.length) {
      fail('DAILY_CHALLENGE_INVALID');
    }
    const ids: string[] = rawIds;
    const challengeId: string = challenge.id;
    const { data: questions, error: questionError } = await db
      .from('questions').select('id').in('id', ids);
    if (questionError) fail('ATTEMPT_START_UNAVAILABLE');
    if (!questions || questions.length !== ids.length ||
        new Set(questions.map(question => question.id)).size !== ids.length ||
        !ids.every(id => questions.some(question => question.id === id))) {
      fail('DAILY_CHALLENGE_INVALID');
    }

    // Owner filtering also applies to every re-read, not just the first lookup.
    const findAttempt = async (): Promise<Attempt | null> => {
      const { data, error } = await db.from('quiz_attempts')
        .select('id, started_at, completed_at')
        .eq('anonymous_token_hash', ownerHash)
        .eq('challenge_id', challengeId).maybeSingle();
      if (error) fail('ATTEMPT_START_UNAVAILABLE');
      return data === null ? null : parseAttempt(data);
    };

    let attempt = await findAttempt();
    let resumed = true;
    if (!attempt) {
      ensureSameDay();
      const { data, error } = await db.from('quiz_attempts')
        .insert({ anonymous_token_hash: ownerHash, challenge_id: challengeId })
        .select('id, started_at, completed_at').single();
      if (error) {
        if (error.code !== '23505') fail('ATTEMPT_START_UNAVAILABLE');
        // A concurrent start won. Only this exact owner/challenge is recoverable.
        attempt = await findAttempt();
        if (!attempt) fail('ATTEMPT_START_UNAVAILABLE');
      } else {
        attempt = parseAttempt(data);
        resumed = false;
      }
    }

    // Separate HTTP queries are not a transaction. Re-read completion after
    // answers/result, retrying if finish committed between those reads.
    for (let read = 0; read < 3; read++) {
      const before = attempt;
      const { data: answerRows, error: answerError } = await db
        .from('quiz_attempt_answers').select('question_id, selected_index, is_correct')
        .eq('attempt_id', before.id);
      if (answerError) fail('ATTEMPT_START_UNAVAILABLE');
      const { data: resultRow, error: resultError } = await db
        .from('quiz_results')
        .select('id, username, score, total_questions, answers_pattern, played_at')
        .eq('attempt_id', before.id).maybeSingle();
      if (resultError) fail('ATTEMPT_START_UNAVAILABLE');
      const after = await findAttempt();
      if (!after || after.id !== before.id || after.startedAt !== before.startedAt) {
        fail('ATTEMPT_DATA_INVALID');
      }
      if (before.completedAt !== after.completedAt) {
        attempt = after;
        continue;
      }

      const answers = parseAnswers(answerRows, ids);
      const completed = after.completedAt !== null;
      if (!completed && resultRow !== null) fail('ATTEMPT_DATA_INVALID');
      const result = completed ? parseResult(resultRow, answers, ids.length, today) : null;
      ensureSameDay();

      return {
        attemptId: after.id,
        challengeId,
        challengeDate: today,
        resumed,
        startedAt: after.startedAt,
        completedAt: after.completedAt,
        state: completed ? 'completed' :
          answers.length === ids.length ? 'ready_to_finish' : 'in_progress',
        questionIds: [...ids],
        answers,
        nextQuestionId: ids[answers.length] ?? null,
        result,
      };
    }
    fail('ATTEMPT_START_UNAVAILABLE');
  } catch (error) {
    ensureSameDay();
    if (error instanceof QuizAttemptStartError) throw error;
    if (error instanceof EnsureDailyChallengeError) fail(error.code);
    // Never propagate/log raw database errors or credentials.
    fail('ATTEMPT_START_UNAVAILABLE');
  }
}