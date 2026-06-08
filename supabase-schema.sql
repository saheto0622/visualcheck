-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)

CREATE TABLE IF NOT EXISTS evaluaciones (
  id            BIGINT PRIMARY KEY,
  fecha         TEXT,
  nombre        TEXT,
  cedula        TEXT,
  direccion     TEXT,
  correo        TEXT,
  celular       TEXT,
  overall       INTEGER,
  left_red      INTEGER,
  right_red     INTEGER,
  asym          INTEGER,
  q_score       INTEGER,
  riesgo        TEXT,
  estado        TEXT DEFAULT 'pendiente',
  acuidad       TEXT,
  astigmatismo  TEXT,
  vision_cerca  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE evaluaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert" ON evaluaciones
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select" ON evaluaciones
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update" ON evaluaciones
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
