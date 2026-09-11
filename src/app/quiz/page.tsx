'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import QuestionScreen from '@/components/QuestionScreen';
import SummaryScreen from '@/components/SummaryScreen';
import type { PublicQuestion } from '@/types/quiz';
import type { PersistedQuizAnswer, QuizAttemptStartResponse, QuizAttemptFinishRequest, QuizAttemptFinishResponse } from '@/types/quizAttempt';
import { getDailyQuestions, startDailyAttempt, validateAttemptResume, finishQuizAttempt, QuizApiError } from '@/services/quizService';
import { Loader2 } from 'lucide-react';

export default function QuizContainer() {
  const [questions, setQuestions] = useState<(PublicQuestion & { id: string })[]>([]);
  const [attempt, setAttempt] = useState<QuizAttemptStartResponse | null>(null);
  const [displayedId, setDisplayedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const [confirmedFinish, setConfirmedFinish] = useState<QuizAttemptFinishResponse | null>(null);
  const [finishPending, setFinishPending] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishRetryable, setFinishRetryable] = useState(false);
  const [lockedUsername, setLockedUsername] = useState<string | null>(null);
  const [finishSyncing, setFinishSyncing] = useState(false);
  const [finishSyncError, setFinishSyncError] = useState<string | null>(null);
  const finishRequest = useRef<QuizAttemptFinishRequest | null>(null);
  const finishBusy = useRef(false);
  const syncBusy = useRef(false);

  const synchronize = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const state = await startDailyAttempt();
      const daily = await getDailyQuestions();
      const restored = validateAttemptResume(state, daily);
      if (current !== generation.current) return;
      if (restored.attempt.state === 'completed' ||
          (finishRequest.current && finishRequest.current.attemptId !== restored.attempt.attemptId)) {
        finishRequest.current = null;
        setLockedUsername(null);
        setFinishError(null);
        setFinishRetryable(false);
      }
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


  const synchronizeFinished = async (confirmation: QuizAttemptFinishResponse) => {
    if (syncBusy.current) return;
    syncBusy.current = true;
    const current = generation.current;
    setFinishSyncing(true);
    setFinishSyncError(null);
    try {
      const restored = validateAttemptResume(await startDailyAttempt(), questions);
      if (current !== generation.current) return;
      if (restored.attempt.attemptId !== confirmation.attemptId ||
          restored.attempt.state !== 'completed' ||
          restored.attempt.result?.id !== confirmation.result.id) {
        throw new Error('Finished attempt not returned by resume');
      }
      setAttempt(restored.attempt);
      setDisplayedId(null);
    } catch {
      if (current === generation.current) {
        setFinishSyncError('Wynik został zapisany, ale nie udało się odświeżyć stanu tej próby. Możesz ponowić synchronizację.');
      }
    } finally {
      syncBusy.current = false;
      if (current === generation.current) setFinishSyncing(false);
    }
  };

  const handleFinish = async (name: string) => {
    if (!attempt || attempt.state !== 'ready_to_finish' || confirmedFinish || finishBusy.current) return;
    const username = name.trim();
    if (!finishRequest.current && (!username || Array.from(username).length > 20)) {
      setFinishError('Nick musi mieć od 1 do 20 znaków.');
      return;
    }
    // Preserve the exact request after any ambiguous outcome.
    const request = finishRequest.current ?? { attemptId: attempt.attemptId, username };
    finishRequest.current = request;
    finishBusy.current = true;
    const current = generation.current;
    setLockedUsername(request.username);
    setFinishPending(true);
    setFinishError(null);
    setFinishRetryable(false);
    let confirmation: QuizAttemptFinishResponse;
    try {
      confirmation = await finishQuizAttempt(request);
    } catch (error) {
      if (current !== generation.current) return;
      const code = error instanceof QuizApiError ? error.code : 'NETWORK_ERROR';
      if (code === 'INVALID_USERNAME') {
        finishRequest.current = null;
        setLockedUsername(null);
        setFinishError('Nick musi mieć od 1 do 20 znaków. Popraw go i spróbuj ponownie.');
      } else {
        const retryable = ['NETWORK_ERROR', 'FINISH_UNAVAILABLE', 'INVALID_RESPONSE', 'FINISH_DATA_INVALID', 'REQUEST_FAILED'].includes(code);
        setFinishRetryable(retryable);
        const messages: Record<string, string> = {
          ATTEMPT_INCOMPLETE: 'Nie wszystkie odpowiedzi są zapisane. Wczytaj stan quizu ponownie.',
          ATTEMPT_EXPIRED: 'Minął dzień tej próby. Nie można jej już zakończyć.',
          ANONYMOUS_IDENTITY_REQUIRED: 'Brakuje tożsamości tej próby. Wczytaj stan quizu ponownie.',
          ATTEMPT_FORBIDDEN: 'Ta próba nie należy do obecnej tożsamości.',
          ATTEMPT_NOT_FOUND: 'Nie znaleziono tej próby.',
        };
        setFinishError(messages[code] ?? (retryable
          ? 'Nie udało się potwierdzić zapisu. Ponów finalizację z tym samym nickiem.'
          : 'Nie można sfinalizować próby. Wczytaj stan quizu ponownie.'));
      }
      return;
    } finally {
      finishBusy.current = false;
      if (current === generation.current) setFinishPending(false);
    }
    if (current !== generation.current) return;
    setConfirmedFinish(confirmation);
    setDisplayedId(null);
    try { localStorage.setItem('footquiz_username', confirmation.result.username); } catch { /* optional preference */ }
    // A read failure below must never become a finish failure.
    await synchronizeFinished(confirmation);
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
  const completedResult = attempt.state === 'completed' ? attempt.result : confirmedFinish?.result;
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
            key={attempt.attemptId}
            onFinish={handleFinish}
            finishPending={finishPending}
            finishError={finishError}
            finishRetryable={finishRetryable}
            lockedUsername={lockedUsername}
            finishConfirmed={confirmedFinish !== null}
            finishSyncing={finishSyncing}
            finishSyncError={finishSyncError}
            resultUsername={completedResult?.username}
            onFinishSynchronize={() => {
              if (confirmedFinish) void synchronizeFinished(confirmedFinish);
              else void synchronize();
            }}
            score={score}
            totalQuestions={completedResult?.totalQuestions ?? questions.length}
            answers={answers}
            attemptState={attempt.state === 'completed' ? 'completed' : 'ready_to_finish'}
          />
        )}
      </div>
    </div>
  );
}
