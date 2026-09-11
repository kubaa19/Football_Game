'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Share2, Home } from 'lucide-react';

interface SummaryScreenProps {
  score: number;
  totalQuestions: number;
  answers: boolean[]; // true = correct, false = incorrect/skipped
  attemptState: 'ready_to_finish' | 'completed';
  onFinish?: (username: string) => Promise<void>;
  finishPending?: boolean;
  finishError?: string | null;
  finishRetryable?: boolean;
  lockedUsername?: string | null;
  finishConfirmed?: boolean;
  finishSyncing?: boolean;
  finishSyncError?: string | null;
  resultUsername?: string;
  onFinishSynchronize?: () => void;
}

export default function SummaryScreen({
  score,
  totalQuestions,
  answers,
  attemptState,
  onFinish, finishPending = false, finishError, finishRetryable = false,
  lockedUsername = null, finishConfirmed = false, finishSyncing = false,
  finishSyncError, resultUsername, onFinishSynchronize,
}: SummaryScreenProps) {
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (attemptState === 'completed') return;
    try {
      const savedName = localStorage.getItem('footquiz_username');
      if (savedName) setUsername(savedName);
    } catch { /* A preference must not block finalization. */ }
  }, [attemptState]);
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
      <>
          {attemptState === 'completed' || finishConfirmed ? (
            <p className="mb-6 text-sm text-green-700">
              Wynik tej próby został zapisany{resultUsername ? ' jako ' + resultUsername : ''}.
            </p>
          ) : (
            <form onSubmit={event => {
              event.preventDefault();
              if (!finishPending && (lockedUsername === null || finishRetryable)) {
                void onFinish?.(lockedUsername ?? username.trim());
              }
            }} className="w-full mb-6">
              <label htmlFor="attempt-username" className="block mb-2 text-sm font-bold">Twój nick</label>
              <input id="attempt-username" value={lockedUsername ?? username}
                onChange={event => setUsername(event.target.value)}
                disabled={finishPending || lockedUsername !== null}
                required
                className="w-full rounded-xl bg-slate-100 p-3 mb-3" />
              <button type="submit"
                disabled={!onFinish || finishPending ||
                  (lockedUsername !== null ? !finishRetryable :
                    !username.trim() || Array.from(username.trim()).length > 20)}
                className="w-full rounded-xl bg-blue-600 text-white p-3 font-bold disabled:opacity-50">
                {finishPending ? 'Zapisujemy...' : lockedUsername !== null ? 'Ponów zapis z tym samym nickiem' : 'Zapisz wynik'}
              </button>
              {finishError && <p role="alert" className="mt-3 text-red-700">{finishError}</p>}
            </form>
          )}
          {finishSyncing && <p role="status">Wynik zapisany. Odświeżamy stan próby...</p>}
          {finishSyncError && <p role="alert" className="mb-3">{finishSyncError}</p>}
          {(finishSyncError || (finishError && !finishPending)) && (
            <button onClick={onFinishSynchronize} disabled={finishSyncing}
              className="mb-6 w-full rounded-xl border p-3">
              Ponów synchronizację
            </button>
          )}
      </>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 gap-3 w-full">
        <button
          onClick={generateShareText}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-green-100"
        >
          <Share2 size={20} />
          Udostępnij wynik
        </button>

        <div className="grid grid-cols-1 gap-3">
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
