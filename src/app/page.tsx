'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Play, Trophy, Calendar, Zap, TrendingUp, Loader2 } from 'lucide-react';
import { getTodayLeaderboard, LeaderboardEntry } from '@/services/quizService';

export default function HomePage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const stats = {
    currentStreak: 1,
    topScore: "5/5"
  };

  const today = new Date().toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        const data = await getTodayLeaderboard();
        setLeaderboard(data);
      } catch (err) {
        console.error('Failed to load leaderboard:', err);
      } finally {
        setLoading(false);
      }
    }

    loadLeaderboard();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
        
        {/* Hero Section */}
        <div className="bg-blue-600 p-8 pt-12 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-blue-500 rounded-full opacity-50 blur-2xl"></div>
          <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-24 h-24 bg-blue-700 rounded-full opacity-50 blur-xl"></div>
          
          <div className="relative z-10">
            <h1 className="text-4xl font-black italic tracking-tighter mb-2">FOOTQUIZ</h1>
            <p className="text-blue-100 font-medium">Udowodnij, że jesteś ekspertem.</p>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-6 flex-1 flex flex-col">
          
          {/* Daily Challenge Card */}
          <div className="bg-slate-900 rounded-2xl p-5 mb-6 -mt-12 relative z-20 shadow-xl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="flex items-center gap-1.5 text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">
                  <Calendar size={14} />
                  Wyzwanie Dnia
                </span>
                <h2 className="text-white text-xl font-bold">{today}</h2>
              </div>
              <div className="bg-slate-800 px-3 py-1 rounded-full text-white text-xs font-bold flex items-center gap-1">
                <Zap size={12} className="fill-yellow-400 text-yellow-400" />
                5 pytań
              </div>
            </div>

            <Link 
              href="/quiz" 
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] group"
            >
              <Play size={20} className="fill-white group-hover:translate-x-1 transition-transform" />
              GRAJ TERAZ
            </Link>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            <div className="bg-white border-2 border-slate-100 p-4 rounded-2xl">
              <div className="text-slate-400 mb-1 font-medium text-sm flex items-center gap-1">
                <TrendingUp size={14} />
                Streak
              </div>
              <div className="text-2xl font-black text-slate-900">
                {stats.currentStreak} <span className="text-sm font-bold text-orange-500">dni</span>
              </div>
            </div>
            <div className="bg-white border-2 border-slate-100 p-4 rounded-2xl">
              <div className="text-slate-400 mb-1 font-medium text-sm flex items-center gap-1">
                <Trophy size={14} />
                Rekord
              </div>
              <div className="text-2xl font-black text-slate-900">
                {stats.topScore}
              </div>
            </div>
          </div>

          {/* Leaderboard Preview */}
          <div className="flex-1">
            <h3 className="text-slate-900 font-bold mb-3 px-1">Dzisiejsi liderzy</h3>
            
            {loading ? (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <Loader2 className="animate-spin mr-2" size={20} />
                Ładowanie wyników...
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="bg-slate-50 rounded-2xl p-6 text-center text-slate-500 text-sm font-medium">
                Bądź pierwszy i zagraj dzisiaj!
              </div>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((leader, i) => (
                  <div key={leader.id || i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-400 w-4">{i + 1}.</span>
                      <span className="font-bold text-slate-700">{leader.username}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-blue-600">
                        {leader.score}/{leader.total_questions}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="mt-8 text-center text-slate-400 text-xs font-medium">
            <p>Baza danych połączona z Supabase ✨</p>
          </div>
        </div>
      </div>
    </div>
  );
}
