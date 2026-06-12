-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- Adds: medición de distancia pupilar (PD).

-- ── Distancia pupilar (PD) ───────────────────────────────────────────────────
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS pd_binocular NUMERIC;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS pd_od        NUMERIC;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS pd_oi        NUMERIC;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS pd_precision TEXT;
