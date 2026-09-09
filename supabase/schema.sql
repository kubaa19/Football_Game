-- 1. Tabela Pytań
CREATE TABLE questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  difficulty SMALLINT CHECK (difficulty BETWEEN 1 AND 3),
  question TEXT NOT NULL,
  options JSONB NOT NULL, -- Tablica ["opcja1", "opcja2", "opcja3", "opcja4"]
  correct_index SMALLINT CHECK (correct_index BETWEEN 0 AND 3),
  explanation TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela Wyzwań Dnia (mapowanie daty na zestaw pytań)
CREATE TABLE daily_challenges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  question_ids UUID[] NOT NULL, -- Tablica ID z tabeli questions (np. 5 pytań)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela Wyników (Ranking)
CREATE TABLE quiz_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id), -- Opcjonalne (jeśli jest Auth)
  username TEXT, -- Dla graczy niezalogowanych/anonimowych
  score SMALLINT NOT NULL,
  total_questions SMALLINT NOT NULL,
  time_taken INTEGER, -- czas w sekundach
  answers_pattern TEXT, -- np. "11011" (1=dobrze, 0=źle)
  played_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indeks dla szybkich rankingów
CREATE INDEX idx_quiz_results_date_score ON quiz_results(played_at, score DESC);
