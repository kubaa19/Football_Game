'use client';

import React, { useState, useEffect } from 'react';
import { PublicQuestion } from '@/types/quiz';
import { Timer, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';

interface QuestionScreenProps {
  question: PublicQuestion;
  questionNumber: number;
  totalQuestions: number;
  onNext: (isCorrect: boolean, selectedIndex: number) => void;
  timeLimit?: number;
}

export default function QuestionScreen({
  question,
  questionNumber,
  totalQuestions,
  onNext,
  timeLimit = 15
}: QuestionScreenProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [isLocked, setIsLocked] = useState(false);

  // Wynik sprawdzony przez backend.
  //
  // SECURITY:
  // Nie porównujemy tutaj selectedOption z correct_index,
  // ponieważ correct_index NIE znajduje się już w przeglądarce.
  const [explanation, setExplanation] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  // Zapamiętujemy indeks poprawnej odpowiedzi WYŁĄCZNIE
  // po otrzymaniu informacji od backendu.
  //
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number | null>(null);

  // Zapobiega wielokrotnemu wysłaniu odpowiedzi.
  const [isCheckingAnswer, setIsCheckingAnswer] = useState(false);

  // Timer logic
  useEffect(() => {
    if (timeLeft > 0 && !isLocked) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);

      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && !isLocked) {
      handleSelect(-1);
    }
  }, [timeLeft, isLocked]);

  /**
   * Wysyła odpowiedź do backendu.
   *
   * SECURITY:
   * Przeglądarka wysyła tylko:
   * - questionId
   * - selectedIndex
   *
   * Nigdy nie wysyłamy correct_index.
   */
  const checkAnswer = async (selectedIndex: number) => {
    try {
      setIsCheckingAnswer(true);

      const response = await fetch('/api/quiz/answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          questionId: question.id,
          selectedIndex,
        }),
      });

      if (!response.ok) {
        throw new Error('Nie udało się sprawdzić odpowiedzi.');
      }

      const result = await response.json();

      setIsCorrect(result.correct);
      setExplanation(result.explanation);
      setCorrectAnswerIndex(result.correctIndex);
      setIsLocked(true);

    } catch (error) {
      console.error('Error checking answer:', error);

      // Jeśli backend nie odpowiada, pozwalamy użytkownikowi
      // spróbować ponownie.
      setIsLocked(false);
      setSelectedOption(null);
      setIsCorrect(null);
      setExplanation('');

      alert('Nie udało się sprawdzić odpowiedzi. Spróbuj ponownie.');
    } finally {
      setIsCheckingAnswer(false);
    }
  };

  const handleSelect = (index: number) => {
    if (isLocked || isCheckingAnswer) return;

    setSelectedOption(index);

    // -1 oznacza timeout.
    // W takim przypadku wysyłamy -1 jako brak odpowiedzi.
    checkAnswer(index);
  };

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
            disabled={isLocked || isCheckingAnswer}
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
            onClick={() => onNext(isCorrect, selectedOption ?? -1)}
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