/** Public start response. Never include identity credentials or question feedback. */
export interface PersistedQuizAnswer {
  questionId: string;
  selectedIndex: number;
  correct: boolean;
}

export interface QuizAttemptResult {
  id: string;
  username: string;
  score: number;
  totalQuestions: number;
  answersPattern: string;
  playedAt: string;
}

export interface QuizAttemptStartResponse {
  attemptId: string;
  challengeId: string;
  challengeDate: string;
  resumed: boolean;
  startedAt: string;
  completedAt: string | null;
  state: 'in_progress' | 'ready_to_finish' | 'completed';
  questionIds: string[];
  answers: PersistedQuizAnswer[];
  nextQuestionId: string | null;
  result: QuizAttemptResult | null;
}
export interface QuizAttemptAnswerRequest {
  attemptId: string;
  questionId: string;
  selectedIndex: number;
}

export interface QuizAnswerFeedback {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  replayed: boolean;
}
