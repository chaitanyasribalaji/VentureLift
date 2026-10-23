-- Supabase database setup for VentureLift
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- Use the service role key in SUPABASE_KEY on the server. The Node app handles
-- auth with its own JWT cookies; RLS is disabled so the backend can read/write.

-- Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'founder' CHECK (role IN ('founder', 'mentor', 'admin')),
  expertise TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ventures (name is unique for seed upserts)
CREATE TABLE IF NOT EXISTS ventures (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL UNIQUE,
  founder TEXT NOT NULL DEFAULT '',
  sector TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'Idea',
  problem TEXT NOT NULL DEFAULT '',
  solution TEXT NOT NULL DEFAULT '',
  customer TEXT NOT NULL DEFAULT '',
  traction TEXT NOT NULL DEFAULT '',
  goals TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI reports (venture_id optional for FAQ and similar)
CREATE TABLE IF NOT EXISTS ai_reports (
  id SERIAL PRIMARY KEY,
  venture_id INTEGER REFERENCES ventures(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL CHECK (
    report_type IN ('validation', 'nlp', 'faq', 'suggestion', 'roadmap')
  ),
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_ventures_user_id ON ventures(user_id);
CREATE INDEX IF NOT EXISTS idx_ventures_name ON ventures(name);
CREATE INDEX IF NOT EXISTS idx_ai_reports_venture_id ON ai_reports(venture_id);

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE ventures DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_reports DISABLE ROW LEVEL SECURITY;
