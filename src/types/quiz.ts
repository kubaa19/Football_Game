/**
 * Pytanie wysyłane do przeglądarki.
 *
 * SECURITY:
 * Nie zawiera correct_index.
 * Dzięki temu poprawna odpowiedź nie trafia do klienta
 * przed udzieleniem odpowiedzi przez użytkownika.
 */
export interface PublicQuestion {
  id?: string;
  category: string;
  difficulty: number;
  question: string;
  options: string[];
  tags: string[];
}

/**
 * Pełne pytanie używane po stronie serwera.
 *
 * SECURITY:
 * correct_index może być używany wyłącznie po stronie serwera.
 * Nie wolno wysyłać obiektu tego typu bezpośrednio do klienta.
 */
export interface Question extends PublicQuestion {
  correct_index: number;
  explanation: string;
}

export interface QuizState {
  currentQuestionIndex: number;
  score: number;
  answers: (number | null)[];
  isFinished: boolean;
}
