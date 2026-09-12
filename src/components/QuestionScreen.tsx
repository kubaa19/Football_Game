'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PublicQuestion } from '@/types/quiz';
import type { PersistedQuizAnswer } from '@/types/quizAttempt';
import { QuizApiError, recordAttemptAnswer } from '@/services/quizService';
import { Timer, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';

import { questionAnswered } from '@/lib/quizAnalytics';

interface QuestionScreenProps {
  attemptId: string;
  challengeDate: string;
  question: PublicQuestion & { id: string };
  questionNumber: number;
  totalQuestions: number;
  onRecorded: (answer: PersistedQuizAnswer) => void;
  onNext: () => void;
  onSynchronize: () => void;
  timeLimit?: number;
}

export default function QuestionScreen({
  attemptId, challengeDate, question, questionNumber, totalQuestions,
  onRecorded, onNext, onSynchronize, timeLimit = 15,
}: QuestionScreenProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [isLocked, setIsLocked] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number | null>(null);
  const [isCheckingAnswer, setIsCheckingAnswer] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const chosen = useRef<number | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const advanced = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const checkAnswer = useCallback(async (selectedIndex: number) => {
    if (pending.current) return;
    pending.current = true;
    setIsCheckingAnswer(true);
    setRequestError(null);
    setCanRetry(false);
    try {
      const result = await recordAttemptAnswer({ attemptId, questionId: question.id, selectedIndex });
      questionAnswered(attemptId, challengeDate, questionNumber, result.correct, selectedIndex === -1);
      if (!mounted.current) return;
      // Both a first acceptance and replay confirm the persisted choice.
      onRecorded({ questionId: question.id, selectedIndex, correct: result.correct });
      setIsCorrect(result.correct);
      setExplanation(result.explanation);
      setCorrectAnswerIndex(result.correctIndex);
      setIsLocked(true);
    } catch (error) {
      if (!mounted.current) return;
      const code = error instanceof QuizApiError ? error.code : 'NETWORK_ERROR';
      if (['ANSWER_ALREADY_RECORDED', 'QUESTION_OUT_OF_ORDER', 'ATTEMPT_COMPLETED'].includes(code)) {
        onSynchronize();
        return;
      }
      const messages: Record<string, string> = {
        ATTEMPT_EXPIRED: 'Zmienił się dzień wyzwania. Wczytaj dzisiejszy zestaw.',
        ANONYMOUS_IDENTITY_REQUIRED: 'Brakuje tożsamości tej próby. Wczytaj zestaw ponownie.',
        ATTEMPT_FORBIDDEN: 'Ta próba nie należy do obecnej tożsamości. Wczytaj zestaw ponownie.',
        ATTEMPT_NOT_FOUND: 'Nie znaleziono próby. Wczytaj zestaw ponownie.',
        ORIGIN_FORBIDDEN: 'Nie można wysłać odpowiedzi z tego adresu.',
      };
      const retryable = ['NETWORK_ERROR', 'ANSWER_UNAVAILABLE', 'INVALID_RESPONSE', 'REQUEST_FAILED'].includes(code);
      setCanRetry(retryable);
      setRequestError(messages[code] ?? (retryable
        ? 'Nie udało się potwierdzić zapisu. Możesz ponowić tylko ten sam wybór lub odtworzyć stan.'
        : 'Nie można przyjąć odpowiedzi. Wczytaj stan quizu ponownie.'));
    } finally {
      pending.current = false;
      if (mounted.current) setIsCheckingAnswer(false);
    }
  }, [attemptId, challengeDate, questionNumber, question.id, onRecorded, onSynchronize]);

  const handleSelect = useCallback((index: number) => {
    // Synchronous guard also covers a click racing with the timeout.
    if (chosen.current !== null) return;
    chosen.current = index;
    setSelectedOption(index);
    void checkAnswer(index);
  }, [checkAnswer]);

  useEffect(() => {
    if (chosen.current !== null) return;
    if (timeLeft === 0) {
      handleSelect(-1);
      return;
    }
    const timer = setTimeout(() => setTimeLeft(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, selectedOption, handleSelect]);

  const getOptionStyles = (index: number) => {
    // Użytkownik jeszcze nie odpowiedział.
    if (!isLocked) {
      return "border-slate-200 hover:border-blue-500 hover:bg-blue-50 active:bg-blue-100";
    }

    // Poprawna odpowiedź:
    //
    // correctAnswerIndex będzie dostępny dopiero po odpowiedzi
    // i otrzymaniu informacji z backendu.
    if (correctAnswerIndex !== null && index === correctAnswerIndex) {
      return "border-green-500 bg-green-50 text-green-700 font-bold ring-2 ring-green-500";
    }

    // Wybrana błędna odpowiedź.
    if (
      index === selectedOption &&
      isCorrect === false
    ) {
      return "border-red-500 bg-red-50 text-red-700 ring-2 ring-red-500";
    }

    return "border-slate-200 opacity-50";
  };

  return (
    <div className="flex flex-col w-full max-w-md mx-auto p-4 min-h-[600px]">

      {/* Header: Progress & Timer */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Pytanie {questionNumber} z {totalQuestions}
          </span>

          <div className="w-32 h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{
                width: `${(questionNumber / totalQuestions) * 100}%`
              }}
            />
          </div>
        </div>

        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${
            timeLeft <= 5
              ? 'border-red-200 bg-red-50 text-red-600 animate-pulse'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          <Timer size={16} />
          <span className="font-mono font-bold">
            {timeLeft}s
          </span>
        </div>
      </div>

      {/* Category Tag */}
      <div className="mb-4">
        <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-medium">
          {question.category.toUpperCase()}
        </span>
      </div>

      {/* Question */}
      <h2 className="text-xl font-bold text-slate-900 mb-8 leading-tight">
        {question.question}
      </h2>

      {/* Options */}
      <div className="grid gap-3 mb-8">
        {question.options.map((option, index) => (
          <button
            key={index}
            disabled={selectedOption !== null || isLocked || isCheckingAnswer}
            onClick={() => handleSelect(index)}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex justify-between items-center ${getOptionStyles(index)}`}
          >
            <span className="font-medium">
              {option}
            </span>

            {isLocked &&
              correctAnswerIndex !== null &&
              index === correctAnswerIndex && (
                <CheckCircle2
                  size={20}
                  className="text-green-600"
                />
              )}

            {isLocked &&
              index === selectedOption &&
              isCorrect === false && (
                <XCircle
                  size={20}
                  className="text-red-600"
                />
              )}
          </button>
        ))}
      </div>

      {isCheckingAnswer && <p role="status">Zapisujemy odpowiedź...</p>}
      {requestError && (
        <div className="mb-6 space-y-3">
          <p role="alert" className="text-red-700">{requestError}</p>
          {canRetry && (
            <button className="w-full rounded-xl bg-blue-600 p-3 text-white"
              disabled={isCheckingAnswer}
              onClick={() => { if (chosen.current !== null) void checkAnswer(chosen.current); }}>
              Ponów ten sam wybór
            </button>
          )}
          <button className="w-full rounded-xl border p-3" onClick={onSynchronize}>
            Wczytaj stan quizu
          </button>
        </div>
      )}
      {/* Feedback & Explanation */}
      {isLocked && isCorrect !== null && (
        <div className="mt-auto animate-in fade-in slide-in-from-bottom-4 duration-300">

          <div
            className={`p-4 rounded-xl mb-6 ${
              isCorrect
                ? 'bg-green-50 border border-green-100'
                : 'bg-red-50 border border-red-100'
            }`}
          >
            <p className="text-sm font-bold mb-1">
              {isCorrect ? 'Świetnie!' : 'Niestety...'}
            </p>

            <p className="text-sm text-slate-600 leading-relaxed">
              {explanation}
            </p>
          </div>

          <button
            onClick={() => { if (!advanced.current) { advanced.current = true; onNext(); } }}
            className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
          >
            {questionNumber === totalQuestions
              ? 'Zobacz wynik'
              : 'Następne pytanie'}

            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}