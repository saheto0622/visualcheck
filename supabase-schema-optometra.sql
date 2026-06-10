-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- Adds the optometrist panel: secret-code accounts, case assignment and
-- the medical formula validation workflow.

CREATE TABLE IF NOT EXISTS optometristas (
  id         BIGINT PRIMARY KEY,
  nombre     TEXT NOT NULL,
  codigo     TEXT UNIQUE NOT NULL,
  activo     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE optometristas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_opt" ON optometristas
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_opt" ON optometristas
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_opt" ON optometristas
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Case assignment + validation state
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS optometrista_id      BIGINT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS optometrista_nombre  TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS estado_validacion    TEXT DEFAULT 'pendiente';

-- Medical formula (OD = ojo derecho, OI = ojo izquierdo)
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS esfera_od    NUMERIC;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS cilindro_od  NUMERIC;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS eje_od       INTEGER;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS adicion_od   NUMERIC;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS esfera_oi    NUMERIC;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS cilindro_oi  NUMERIC;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS eje_oi       INTEGER;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS adicion_oi   NUMERIC;

ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS observaciones_optometra TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS validado_en             TIMESTAMPTZ;
