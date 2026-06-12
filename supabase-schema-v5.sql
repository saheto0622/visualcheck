-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- Adds: sistema de generación de fórmulas médicas (prescripción óptica estimada por IA),
-- prueba de astigmatismo + lente cruzada, y pregunta de rango de edad.

-- ── Prescripción óptica estimada (IA) ────────────────────────────────────────
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS od_esfera   DECIMAL(4,2);
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS od_cilindro DECIMAL(4,2);
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS od_eje      INTEGER;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS oi_esfera   DECIMAL(4,2);
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS oi_cilindro DECIMAL(4,2);
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS oi_eje      INTEGER;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS adicion     DECIMAL(3,2);

ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS prescripcion_confianza TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS prescripcion_notas     TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS prescripcion_validada  BOOLEAN DEFAULT FALSE;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS prescripcion_ajustada  BOOLEAN DEFAULT FALSE;

-- ── Historia clínica: rango de edad ──────────────────────────────────────────
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS edad_rango TEXT;

-- ── Nuevas pruebas visuales: astigmatismo y lente cruzada (15 pruebas) ───────
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS astigmatismo  TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS lente_cruzada TEXT;
