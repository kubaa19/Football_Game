'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Question } from '@/types/quiz';
import { Timer, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';

interface QuestionScreenProps {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  onNext: (isCorrect: boolean) => void;
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

  // Timer logic
  useEffect(() => {
    if (timeLeft > 0 && !isLocked) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && !isLocked) {
      handleSelect(-1); // Time out - nothing selected
    }
  }, [timeLeft, isLocked]);

  const handleSelect = (index: number) => {
    if (isLocked) return;
    setSelectedOption(index);
    setIsLocked(true);
  };

  const isCorrect = selectedOption === question.correct_index;

  const getOptionStyles = (index: number) => {
    if (!isLocked) {
      return "border-slate-200 hover:border-blue-500 hover:bg-blue-50 active:bg-blue-100";
    }

    if (index === question.correct_index) {
      return "border-green-500 bg-green-50 text-green-700 font-bold ring-2 ring-green-500";
    }

    if (index === selectedOption && index !== question.correct_index) {
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
              style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
            />
          </div>
        </div>

        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${
          timeLeft <= 5 ? 'border-red-200 bg-red-50 text-red-600 animate-pulse' : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}>
          <Timer size={16} />
          <span className="font-mono font-bold">{timeLeft}s</span>
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
            disabled={isLocked}
            onClick={() => handleSelect(index)}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex justify-between items-center ${getOptionStyles(index)}`}
          >
            <span className="font-medium">{option}</span>
            {isLocked && index === question.correct_index && (
              <CheckCircle2 size={20} className="text-green-600" />
            )}
            {isLocked && index === selectedOption && index !== question.correct_index && (
              <XCircle size={20} className="text-red-600" />
            )}
          </button>
        ))}
      </div>

      {/* Feedback & Explanation */}
      {isLocked && (
        <div className="mt-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={`p-4 rounded-xl mb-6 ${isCorrect ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
            <p className="text-sm font-bold mb-1">
              {isCorrect ? 'Świetnie!' : 'Niestety...'}
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">
              {question.explanation}
            </p>
          </div>

          <button
            onClick={() => onNext(isCorrect)}
            className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
          >
            {questionNumber === totalQuestions ? 'Zobacz wynik' : 'Następne pytanie'}
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
