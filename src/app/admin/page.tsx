'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PlusCircle, Save, Database, Trash2, CheckCircle2 } from 'lucide-react';

export default function AdminPanel() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    category: '',
    difficulty: 1,
    question: '',
    options: ['', '', '', ''],
    correct_index: 0,
    explanation: '',
    tags: ''
  });

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...formData.options];
    newOptions[index] = value;
    setFormData({ ...formData, options: newOptions });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const tagsArray = formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
      
      const { error } = await supabase.from('questions').insert([
        {
          category: formData.category,
          difficulty: formData.difficulty,
          question: formData.question,
          options: formData.options,
          correct_index: formData.correct_index,
          explanation: formData.explanation,
          tags: tagsArray
        }
      ]);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Pytanie dodane pomyślnie!' });
      // Reset form except category/tags for faster entry
      setFormData({
        ...formData,
        question: '',
        options: ['', '', '', ''],
        explanation: ''
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: `Błąd: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Database className="text-blue-600" />
              Panel Administratora
            </h1>
            <p className="text-slate-500">Zarządzanie bazą pytań FootQuiz</p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-200 transition-colors">
              Lista pytań
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors flex items-center gap-2">
              <PlusCircle size={16} />
              Dodaj Nowe
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formularz */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">Nowe Pytanie</h2>
              
              {message && (
                <div className={`p-4 rounded-xl flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {message.type === 'success' ? <CheckCircle2 size={18} /> : <Trash2 size={18} />}
                  <span className="font-medium">{message.text}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Kategoria</label>
                  <input
                    required
                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="np. Champions League"
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Trudność (1-3)</label>
                  <select 
                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.difficulty}
                    onChange={(e) => setFormData({...formData, difficulty: parseInt(e.target.value)})}
                  >
                    <option value={1}>1 - Łatwy</option>
                    <option value={2}>2 - Średni</option>
                    <option value={3}>3 - Trudny</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Treść pytania</label>
                <textarea
                  required
                  className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                  placeholder="Wpisz treść pytania..."
                  value={formData.question}
                  onChange={(e) => setFormData({...formData, question: e.target.value})}
                />
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider block">Opcje odpowiedzi (zaznacz poprawną)</label>
                {formData.options.map((option, idx) => (
                  <div key={idx} className="flex gap-3 items-center">
                    <input
                      type="radio"
                      name="correct_idx"
                      checked={formData.correct_index === idx}
                      onChange={() => setFormData({...formData, correct_index: idx})}
                      className="w-5 h-5 text-blue-600"
                    />
                    <input
                      required
                      className="flex-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder={`Opcja ${idx + 1}`}
                      value={option}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Wyjaśnienie (po odpowiedzi)</label>
                <textarea
                  required
                  className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none h-20 resize-none"
                  placeholder="Krótki fakt historyczny..."
                  value={formData.explanation}
                  onChange={(e) => setFormData({...formData, explanation: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Tagi (po przecinku)</label>
                <input
                  className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="premier league, arsenal, rekordy"
                  value={formData.tags}
                  onChange={(e) => setFormData({...formData, tags: e.target.value})}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <Save size={20} />
                {loading ? 'Zapisywanie...' : 'Zapisz pytanie w bazie'}
              </button>
            </form>
          </div>

          {/* Podgląd / Info */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-900 mb-4">Wskazówki</h3>
              <ul className="text-sm text-slate-600 space-y-3">
                <li className="flex gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  Pytania powinny dotyczyć faktów, a nie opinii.
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  Wyjaśnienie powinno dodawać wartość (ciekawostkę).
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  Staraj się unikać powtarzających się kategorii tego samego dnia.
                </li>
              </ul>
            </div>

            <div className="bg-blue-600 p-6 rounded-2xl shadow-sm text-white">
              <h3 className="font-bold mb-2 uppercase text-xs opacity-80 tracking-widest">Status Bazy</h3>
              <div className="text-3xl font-black mb-1">MVP</div>
              <p className="text-blue-100 text-sm">Podłączono do: Supabase PostgreSQL</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
