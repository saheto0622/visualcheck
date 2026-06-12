-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- Adds: consentimiento informado, historia clínica básica,
-- tarjeta profesional del optómetra (firma digital).

-- ── Consentimiento informado (Ley 1581 de 2012) ─────────────────────────────
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS consentimiento_aceptado BOOLEAN DEFAULT false;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS consentimiento_fecha    TIMESTAMPTZ;

-- ── Historia clínica básica (5 preguntas) ───────────────────────────────────
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS hc_usa_gafas              TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS hc_diabetes_hipertension  TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS hc_antecedentes_familiares TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS hc_cirugia_ocular         TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS hc_ultima_formula         TEXT;

-- ── Firma digital del optómetra ─────────────────────────────────────────────
ALTER TABLE optometristas ADD COLUMN IF NOT EXISTS tarjeta_profesional TEXT;

-- Se guarda en la evaluación al momento de validar, para que el PDF
-- conserve la tarjeta profesional usada en la validación.
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS optometrista_tarjeta TEXT;
