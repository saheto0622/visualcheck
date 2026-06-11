-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- Adds the 13-test / 17-step visual tests battery results + per-test
-- semaforo (traffic light) status to the evaluaciones table.
-- Old columns (acuidad, astigmatismo, vision_cerca) are kept for
-- backward compatibility with historical records.

ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS agudeza_lejos_od       TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS agudeza_lejos_oi       TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS agudeza_cerca_od       TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS agudeza_cerca_oi       TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS sensibilidad_contraste TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS vision_colores         TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS amsler_od              TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS amsler_oi              TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS acomodacion            TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS duocromo               TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS aniseiconia            TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS campo_visual_od        TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS campo_visual_oi        TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS laberinto              TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS fusion_binocular       TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS estereopsis            TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS coordinacion_binocular TEXT;

-- Per-test semaforo status: { "agudezaLejosOd": "green", "duocromo": "yellow", ... }
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS vt_status JSONB;
