'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Share2, RotateCcw, Home, CheckCircle2 } from 'lucide-react';
import type { QuizAnswer } from '@/types/quiz';
import { saveQuizResult } from '@/services/quizService';

interface SummaryScreenProps {
  submittedAnswers: QuizAnswer[] | null;
  score: number;
  totalQuestions: number;
  answers: boolean[]; // true = correct, false = incorrect/skipped
  onRestart?: () => void;
  attemptState?: 'ready_to_finish' | 'completed';
  alreadyCompleted: boolean;
}

export default function SummaryScreen({
  submittedAnswers,
  score,
  totalQuestions,
  answers,
  onRestart,
  attemptState
}: SummaryScreenProps) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const canSave = !attemptState && submittedAnswers !== null && submittedAnswers.length === totalQuestions;
  const [saved, setSaved] = useState(false);
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (attemptState) return;
    // Automatyczny zapis anonimowy lub pod podaną nazwą
    const savedName = localStorage.getItem('footquiz_username');
    if (savedName) {
      setUsername(savedName);
    }
  }, [attemptState]);

  const handleSaveResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (attemptState || !username.trim() || saved || !canSave || !submittedAnswers) return;
    setIsSubmitting(true);
    setSaveError(null);
    try {
      localStorage.setItem('footquiz_username', username.trim());
      await saveQuizResult({ username: username.trim(), answers: submittedAnswers });
      setSaved(true);
    } catch {
      setSaveError('Nie udało się zapisać wyniku. Spróbuj ponownie.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Funkcja generująca kafelki w stylu Wordle
  const generateShareText = () => {
    const tiles = answers
      .map(isCorrect => (isCorrect ? '🟩' : '🟥'))
      .join('');
    
    const text = `FootQuiz Daily ⚽\nWynik: ${score}/${totalQuestions}\n${tiles}\n\nGraj na: footquiz.pl`;
    
    if (navigator.share) {
      navigator.share({
        title: 'FootQuiz Result',
        text: text,
      }).catch(() => {
        navigator.clipboard.writeText(text);
        alert('Skopiowano do schowka!');
      });
    } else {
      navigator.clipboard.writeText(text);
      alert('Skopiowano do schowka!');
    }
  };

  const getRank = () => {
    const percentage = (score / totalQuestions) * 100;
    if (percentage === 100) return { title: "Legenda Futbolu", icon: "🏆" };
    if (percentage >= 80) return { title: "Ekspert", icon: "🥇" };
    if (percentage >= 60) return { title: "Solidny Ligowiec", icon: "🥈" };
    if (percentage >= 40) return { title: "Adept", icon: "🥉" };
    return { title: "Junior", icon: "👟" };
  };

  const rank = getRank();

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto p-6 text-center animate-in fade-in zoom-in duration-500">
      {/* Trophy & Score */}
      <div className="mb-6 mt-2">
        <div className="text-6xl mb-3">{rank.icon}</div>
        <h1 className="text-3xl font-black text-slate-900 mb-1">{rank.title}</h1>
        <p className="text-slate-500 font-medium">Twój dzisiejszy wynik</p>
      </div>

      <div className="bg-slate-50 rounded-3xl p-6 w-full border-2 border-slate-100 mb-6">
        <div className="text-6xl font-black text-blue-600 mb-4">
          {score}<span className="text-slate-300 text-4xl">/{totalQuestions}</span>
        </div>
        
        {/* Tiles */}
        <div className="flex justify-center gap-2 mb-2">
          {answers.map((isCorrect, idx) => (
            <div 
              key={idx}
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg transition-all
                ${isCorrect ? 'bg-green-500 shadow-[0_4px_0_0_rgba(21,128,61,1)]' : 'bg-red-500 shadow-[0_4px_0_0_rgba(185,28,28,1)]'}`}
            >
              {isCorrect ? '✓' : '✕'}
            </div>
          ))}
        </div>
      </div>

      {/* Save Result Form */}
      {saveError && <p role="alert">{saveError}</p>}
      {attemptState ? (
        <p className="mb-6 text-sm text-slate-600">
          {attemptState === 'completed'
            ? 'Wynik tej próby został zapisany.'
            : 'Odpowiedzi zostały zapisane. Wynik oczekuje na finalizację, która nie jest jeszcze dostępna.'}
        </p>
      ) : !canSave ? (
        <p className="mb-6 text-sm text-slate-500">Ten lokalny wynik nie zawiera kompletu wyborów potrzebnych do zapisu.</p>
      ) : !saved ? (
        <form onSubmit={handleSaveResult} className="w-full mb-6">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Zapisz wynik do tabeli liderów
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Twój nick..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="flex-1 px-4 py-3 bg-slate-100 border-2 border-slate-200 rounded-xl font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              maxLength={20}
              required
            />
            <button
              type="submit"
              disabled={isSubmitting || !username.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-5 py-3 rounded-xl transition-all"
            >
              {isSubmitting ? '...' : 'Zapisz'}
            </button>
          </div>
        </form>
      ) : (
        <div className="w-full bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 mb-6 flex items-center justify-center gap-2 font-bold text-sm">
          <CheckCircle2 size={18} />
          Wynik zapisany w tabeli liderów!
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-1 gap-3 w-full">
        <button
          onClick={generateShareText}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-green-100"
        >
          <Share2 size={20} />
          Udostępnij wynik
        </button>

        <div className={attemptState ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"}>
          {!attemptState && onRestart && <button
            onClick={onRestart}
            className="bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <RotateCcw size={18} />
            Powtórz
          </button>}
          <Link
            href="/"
            className="bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <Home size={18} />
            Menu
          </Link>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-400 font-medium">
        Kolejne wyzwanie już jutro o 00:00!
      </p>
    </div>
  );
}
