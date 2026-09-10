'use client';

import React, { useState, useEffect } from 'react';
import QuestionScreen from '@/components/QuestionScreen';
import SummaryScreen from '@/components/SummaryScreen';
import { PublicQuestion, QuizAnswer } from '@/types/quiz';
import { getDailyQuestions } from '@/services/quizService';
import { Loader2 } from 'lucide-react';

export default function QuizContainer() {
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [submittedAnswers, setSubmittedAnswers] = useState<QuizAnswer[] | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const storageKey = `footquiz_completed_${todayStr}`;

  useEffect(() => {
    async function loadQuestionsAndState() {
      try {
        setLoading(true);

        // Sprawdź czy użytkownik rozwiązał już dzisiejszy quiz
        const savedResult = localStorage.getItem(storageKey);
        if (savedResult) {
          try {
            const parsed = JSON.parse(savedResult);
            setAnswers(parsed.answers || []);
            const stored = parsed.submittedAnswers;
            setSubmittedAnswers(Array.isArray(stored) && stored.length === parsed.answers?.length && stored.every(a =>
              a && typeof a.questionId === 'string' && Number.isInteger(a.selectedIndex) && a.selectedIndex >= -1 && a.selectedIndex <= 3
            ) ? stored : null);
            setIsFinished(true);
            setAlreadyCompleted(true);
          } catch (e) {
            console.error('Error parsing saved result:', e);
          }
        }

        const dailyQuestions = await getDailyQuestions();
        if (dailyQuestions && dailyQuestions.length > 0) {
          setQuestions(dailyQuestions);
        } else {
          setError('Nie udało się załadować dzisiejszych pytań.');
        }
      } catch (err) {
        console.error('Failed to load questions:', err);
        setError('Wystąpił błąd podczas ładowania pytań.');
      } finally {
        setLoading(false);
      }
    }

    loadQuestionsAndState();
  }, [storageKey]);

  const handleAnswer = (isCorrect: boolean, selectedIndex: number) => {
    const questionId = questions[currentIndex].id;
    if (!questionId) return;
    const newSubmittedAnswers = [...(submittedAnswers ?? []), { questionId, selectedIndex }];
    setSubmittedAnswers(newSubmittedAnswers);
    const newAnswers = [...answers, isCorrect];
    setAnswers(newAnswers);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsFinished(true);
      // Zapisz ukończenie w localStorage
      const score = newAnswers.filter(a => a).length;
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          score,
          totalQuestions: questions.length,
          answers: newAnswers,
          submittedAnswers: newSubmittedAnswers,
          completedAt: new Date().toISOString()
        })
      );
    }
  };

  const restartQuiz = () => {
    setCurrentIndex(0);
    setAnswers([]);
    setSubmittedAnswers(null);
    setIsFinished(false);
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

  if (error || questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-[32px] shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold">!</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Błąd</h2>
          <p className="text-slate-600 mb-6">{error || 'Brak dostępnych pytań na dziś.'}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold"
          >
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }

  const score = answers.filter(a => a).length;

  return (
    <div className="min-h-screen bg-white md:bg-slate-50 flex items-center justify-center p-0 md:p-4">
      <div className="w-full max-w-md bg-white md:rounded-[32px] md:shadow-2xl md:border md:border-slate-100 overflow-hidden min-h-[100dvh] md:min-h-[700px] flex flex-col">
        {!isFinished ? (
          <QuestionScreen
            key={currentIndex} 
            question={questions[currentIndex]}
            questionNumber={currentIndex + 1}
            totalQuestions={questions.length}
            onNext={handleAnswer}
          />
        ) : (
          <SummaryScreen
            score={score}
            totalQuestions={questions.length || 5}
            answers={answers}
            submittedAnswers={submittedAnswers}
            onRestart={restartQuiz}
            alreadyCompleted={alreadyCompleted}
          />
        )}
      </div>
    </div>
  );
}
