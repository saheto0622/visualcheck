-- VisualCheck — Schema v8
-- Nuevas tablas para analytics de abandono y progreso de evaluaciones

-- ─── Analytics de pantallas (funnel de conversión) ─────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_eventos (
  id          BIGSERIAL PRIMARY KEY,
  timestamp   TIMESTAMPTZ DEFAULT NOW(),
  pantalla    TEXT        NOT NULL,
  celular     TEXT,
  session_id  TEXT,
  dispositivo TEXT
);

CREATE INDEX IF NOT EXISTS idx_analytics_pantalla   ON analytics_eventos (pantalla);
CREATE INDEX IF NOT EXISTS idx_analytics_session_id ON analytics_eventos (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp  ON analytics_eventos (timestamp DESC);

-- RLS: permitir inserts anónimos (solo escritura), lectura solo para service_role
ALTER TABLE analytics_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon insert analytics" ON analytics_eventos
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "service read analytics" ON analytics_eventos
  FOR SELECT TO service_role USING (true);


-- ─── Progreso de evaluaciones (save & resume) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS progreso_evaluaciones (
  id              BIGSERIAL   PRIMARY KEY,
  celular         TEXT        NOT NULL,
  session_id      TEXT        UNIQUE,
  nombre          TEXT,
  timestamp       TIMESTAMPTZ DEFAULT NOW(),
  pantalla_actual TEXT        NOT NULL,
  datos_json      JSONB,
  completado      BOOLEAN     DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_progreso_celular    ON progreso_evaluaciones (celular);
CREATE INDEX IF NOT EXISTS idx_progreso_session_id ON progreso_evaluaciones (session_id);
CREATE INDEX IF NOT EXISTS idx_progreso_timestamp  ON progreso_evaluaciones (timestamp DESC);

-- RLS: el paciente puede leer y escribir su propia fila por session_id
ALTER TABLE progreso_evaluaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon upsert progreso" ON progreso_evaluaciones
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon update progreso" ON progreso_evaluaciones
  FOR UPDATE TO anon USING (true);

CREATE POLICY "anon select progreso" ON progreso_evaluaciones
  FOR SELECT TO anon USING (true);


-- ─── Notas de uso ──────────────────────────────────────────────────────────────
-- analytics_eventos: insert fire-and-forget desde el cliente cada vez que
--   el usuario llega a una nueva pantalla del flujo. Permite calcular el
--   funnel de conversión en el panel admin (tab "Funnel").
--
-- progreso_evaluaciones: upsert por session_id después de que el usuario
--   ingresa su celular (mini_registro). Si el usuario vuelve dentro de las
--   24 h se le ofrece "Continuar donde quedaste". Se marca completado=TRUE
--   cuando llega a la pantalla de resultados.
