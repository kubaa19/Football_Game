export interface Question {
  id?: string;
  category: string;
  difficulty: number;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  tags: string[];
}

export interface QuizState {
  currentQuestionIndex: number;
  score: number;
  answers: (number | null)[];
  isFinished: boolean;
}
