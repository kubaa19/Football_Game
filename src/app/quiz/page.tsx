'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import QuestionScreen from '@/components/QuestionScreen';
import SummaryScreen from '@/components/SummaryScreen';
import type { PublicQuestion } from '@/types/quiz';
import type { PersistedQuizAnswer, QuizAttemptStartResponse } from '@/types/quizAttempt';
import { getDailyQuestions, startDailyAttempt, validateAttemptResume } from '@/services/quizService';
import { Loader2 } from 'lucide-react';

export default function QuizContainer() {
  const [questions, setQuestions] = useState<(PublicQuestion & { id: string })[]>([]);
  const [attempt, setAttempt] = useState<QuizAttemptStartResponse | null>(null);
  const [displayedId, setDisplayedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const synchronize = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const state = await startDailyAttempt();
      const daily = await getDailyQuestions();
      const restored = validateAttemptResume(state, daily);
      if (current !== generation.current) return;
      setQuestions(restored.questions);
      setAttempt(restored.attempt);
      setDisplayedId(restored.attempt.nextQuestionId);
    } catch {
      if (current === generation.current) {
        setError('Nie udało się odtworzyć dzisiejszego quizu. Wczytaj zestaw ponownie.');
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void synchronize();
    return () => { generation.current++; };
  }, [synchronize]);

  const handleRecorded = (answer: PersistedQuizAnswer) => {
    setAttempt(previous => {
      if (!previous || previous.state === 'completed' ||
          previous.answers.some(item => item.questionId === answer.questionId) ||
          previous.nextQuestionId !== answer.questionId) return previous;
      const answers = [...previous.answers, answer];
      return {
        ...previous,
        answers,
        nextQuestionId: previous.questionIds[answers.length] ?? null,
        state: answers.length === previous.questionIds.length ? 'ready_to_finish' : 'in_progress',
      };
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Przygotowujemy wyzwanie...</p>
        </div>
      </div>
    );
  }

  if (error || !attempt || questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-[32px] shadow-xl max-w-md w-full text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Nie można wczytać quizu</h2>
          <p role="alert" className="text-slate-600 mb-6">{error || 'Brak dostępnego zestawu.'}</p>
          <button onClick={() => void synchronize()}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold">
            Wczytaj dzisiejszy zestaw
          </button>
        </div>
      </div>
    );
  }

  const currentIndex = questions.findIndex(question => question.id === displayedId);
  const completedResult = attempt.state === 'completed' ? attempt.result : null;
  const answers = completedResult
    ? [...completedResult.answersPattern].map(bit => bit === '1')
    : attempt.answers.map(answer => answer.correct);
  const score = completedResult?.score ?? answers.filter(Boolean).length;

  return (
    <div className="min-h-screen bg-white md:bg-slate-50 flex items-center justify-center p-0 md:p-4">
      <div className="w-full max-w-md bg-white md:rounded-[32px] md:shadow-2xl md:border md:border-slate-100 overflow-hidden min-h-[100dvh] md:min-h-[700px] flex flex-col">
        {currentIndex >= 0 ? (
          <QuestionScreen
            key={attempt.attemptId + ':' + displayedId}
            attemptId={attempt.attemptId}
            question={questions[currentIndex]}
            questionNumber={currentIndex + 1}
            totalQuestions={questions.length}
            onRecorded={handleRecorded}
            onNext={() => setDisplayedId(attempt.nextQuestionId)}
            onSynchronize={() => void synchronize()}
          />
        ) : (
          <SummaryScreen
            score={score}
            totalQuestions={completedResult?.totalQuestions ?? questions.length}
            answers={answers}
            submittedAnswers={null}
            alreadyCompleted={attempt.state === 'completed'}
            attemptState={attempt.state === 'completed' ? 'completed' : 'ready_to_finish'}
          />
        )}
      </div>
    </div>
  );
}
