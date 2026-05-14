-- Supabase database setup for Venture Platform
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Enable Row Level Security (RLS) for all tables
-- This ensures data security and proper access control

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'founder' CHECK (role IN ('founder', 'mentor', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own data
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid()::text = id::text);

-- Ventures table
CREATE TABLE IF NOT EXISTS ventures (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  stage TEXT DEFAULT 'idea' CHECK (stage IN ('idea', 'mvp', 'growth', 'scale')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on ventures table
ALTER TABLE ventures ENABLE ROW LEVEL SECURITY;

-- Users can manage their own ventures
CREATE POLICY "Users can view own ventures" ON ventures
  FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can create own ventures" ON ventures
  FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update own ventures" ON ventures
  FOR UPDATE USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can delete own ventures" ON ventures
  FOR DELETE USING (user_id::text = auth.uid()::text);

-- AI Reports table
CREATE TABLE IF NOT EXISTS ai_reports (
  id SERIAL PRIMARY KEY,
  venture_id INTEGER NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('validation', 'pitch_analysis', 'market_signals')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on ai_reports table
ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;

-- Users can manage AI reports for their ventures
CREATE POLICY "Users can view AI reports for own ventures" ON ai_reports
  FOR SELECT USING (
    venture_id IN (
      SELECT id FROM ventures WHERE user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can create AI reports for own ventures" ON ai_reports
  FOR INSERT WITH CHECK (
    venture_id IN (
      SELECT id FROM ventures WHERE user_id::text = auth.uid()::text
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_ventures_user_id ON ventures(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_reports_venture_id ON ai_reports(venture_id);

-- Insert demo users (optional - for testing)
-- Note: Passwords are hashed. In production, use proper password hashing.
INSERT INTO users (email, password_hash, role) VALUES
  ('founder@venturelift.local', '$2b$10$dummy.hash.for.demo', 'founder'),
  ('mentor@venturelift.local', '$2b$10$dummy.hash.for.demo', 'mentor'),
  ('admin@venturelift.local', '$2b$10$dummy.hash.for.demo', 'admin')
ON CONFLICT (email) DO NOTHING;