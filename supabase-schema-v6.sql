-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- Adds: captura de fotos del ojo derecho e izquierdo por separado
-- (pantalla "Foto de tus ojos") y el bucket de Storage donde se guardan.

-- ── Columnas para las fotos de cada ojo ─────────────────────────────────────
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS eye_photo_od_url TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS eye_photo_oi_url TEXT;

-- ── Bucket de Storage para las fotos oculares (público) ─────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('eye-photos', 'eye-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ── Políticas de acceso ───────────────────────────────────────────────────────
CREATE POLICY "Public read eye photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'eye-photos');

CREATE POLICY "Anyone can upload eye photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'eye-photos');

CREATE POLICY "Anyone can update eye photos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'eye-photos');
