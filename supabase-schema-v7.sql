-- VisualCheck — Schema v7 (E-commerce: tabla pedidos)
-- Ejecutar en: Supabase → SQL Editor
-- Requiere que las tablas de versiones anteriores ya existan (evaluaciones, optometristas).

-- ── Tabla pedidos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pedidos (
  id                    BIGINT PRIMARY KEY,           -- timestamp ms (generado en cliente)
  fecha                 TIMESTAMPTZ DEFAULT NOW(),

  -- Datos del cliente
  nombre                TEXT,
  cedula                TEXT,
  direccion             TEXT,
  ciudad                TEXT,
  celular               TEXT,

  -- Productos (array de objetos: {montura, montura_id, tipo_lente, filtro_azul, precio})
  items                 JSONB NOT NULL DEFAULT '[]',

  -- Totales
  subtotal              NUMERIC(12, 2) DEFAULT 0,
  tipo_pago             TEXT DEFAULT 'completo',      -- 'completo' | 'parcial'
  monto_pagado_mp       NUMERIC(12, 2) DEFAULT 0,     -- monto cobrado por MP
  saldo_pendiente       NUMERIC(12, 2) DEFAULT 0,     -- monto contraentrega (incluye recargo + envío)
  costo_envio           NUMERIC(12, 2) DEFAULT 0,

  -- Estado del pedido
  estado                TEXT DEFAULT 'pendiente_pago',
  -- Valores válidos: pendiente_pago | pagado_parcial | pagado_completo |
  --                  en_produccion  | enviado        | entregado | pago_fallido

  -- Vínculo con evaluación / fórmula validada (opcional)
  evaluacion_id         BIGINT REFERENCES public.evaluaciones(id) ON DELETE SET NULL,

  -- MercadoPago
  mercadopago_payment_id TEXT,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Índices útiles para consultas del panel admin
CREATE INDEX IF NOT EXISTS idx_pedidos_estado    ON public.pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_cedula    ON public.pedidos(cedula);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha     ON public.pedidos(fecha DESC);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pedidos_updated_at ON public.pedidos;
CREATE TRIGGER pedidos_updated_at
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS (Row Level Security) ───────────────────────────────────────────────────
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

-- Política de inserción: cualquier anon puede crear un pedido (checkout sin auth)
CREATE POLICY "pedidos_insert" ON public.pedidos
  FOR INSERT TO anon WITH CHECK (true);

-- Política de lectura: solo el service_role puede leer (admin usa service_role desde el panel)
-- Para el panel admin que usa anon key, permitir lectura:
CREATE POLICY "pedidos_select" ON public.pedidos
  FOR SELECT TO anon USING (true);

-- Política de actualización: solo anon puede actualizar estado
-- (en producción real, restringir esto con auth o al service_role)
CREATE POLICY "pedidos_update" ON public.pedidos
  FOR UPDATE TO anon USING (true);
