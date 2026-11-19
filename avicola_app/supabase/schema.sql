-- ============================================================================
-- GEMELO DIGITAL CAUSAL AVÍCOLA (AV-1 & AV-2) — ESQUEMA SUPABASE POSTGRESQL
-- Incluye Event Sourcing inmutable, tablas relacionales normalizadas, puente
-- CI/CD de RFCs hacia Antigravity y publicaciones Supabase Realtime.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Snapshots del estado vivo completo del Gemelo Digital
CREATE TABLE IF NOT EXISTS public.twin_state_snapshots (
  id TEXT PRIMARY KEY DEFAULT 'active-farm-twin',
  version BIGINT NOT NULL DEFAULT 1,
  project_name TEXT NOT NULL DEFAULT 'Proyecto Avícola Cúcuta (AV-1 & AV-2)',
  state_json JSONB NOT NULL,
  computed_summary JSONB,
  updated_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ledger inmutable de eventos operativos (Event Sourcing)
CREATE TABLE IF NOT EXISTS public.operational_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  event_type TEXT NOT NULL, -- DAILY_LOG | SAMPLE_WEIGHING | FEED_PURCHASE | PARAM_UPDATE | HARVEST_LIQUIDATION | EXCEL_HYDRATION
  source_channel TEXT NOT NULL DEFAULT 'web', -- web | voice_realtime | telegram | excel_hydration | system
  payload JSONB NOT NULL,
  actor TEXT DEFAULT 'operator',
  state_version_after BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Camadas / Lotes activos (AV-2)
CREATE TABLE IF NOT EXISTS public.lots (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  aves_iniciadas INTEGER NOT NULL,
  fecha_ingreso DATE NOT NULL,
  edad_objetivo_dias INTEGER NOT NULL DEFAULT 42,
  mortalidad_esperada_pct NUMERIC(6,4) NOT NULL DEFAULT 0.0300,
  origen_pollito TEXT NOT NULL DEFAULT 'bucaramanga',
  precio_pollito_cop NUMERIC(12,2) NOT NULL,
  programa_alimento TEXT NOT NULL DEFAULT '100% Comercial',
  meses_arriendo NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  estado TEXT NOT NULL DEFAULT 'en_granja',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Bitácora diaria normalizada (Días 1 a 49 por lote)
CREATE TABLE IF NOT EXISTS public.daily_logs (
  lot_id TEXT NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  dia INTEGER NOT NULL CHECK (dia BETWEEN 1 AND 49),
  fecha DATE,
  mortalidad INTEGER,
  descarte INTEGER,
  alim_real_kg NUMERIC(10,2),
  temp_c NUMERIC(5,2),
  agua_l NUMERIC(10,2),
  observacion TEXT,
  source_channel TEXT DEFAULT 'web',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lot_id, dia)
);

-- 5. Movimientos de inventario y compras de alimento por fase
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id TEXT REFERENCES public.lots(id) ON DELETE SET NULL,
  fase TEXT NOT NULL, -- Master Pollito | Nutrepollo Cr SP | Broiler I Pel SP | Alimento Propio
  tipo_movimiento TEXT NOT NULL, -- COMPRA_INICIAL | COMPRA_ADICIONAL | AJUSTE | CONSUMO
  bultos NUMERIC(10,2) NOT NULL,
  precio_bulto_cop NUMERIC(12,2),
  proveedor TEXT,
  evidencia_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Puente CI/CD Agéntico hacia Antigravity (Velocidad 3: RFCs con aprobación humana)
CREATE TABLE IF NOT EXISTS public.antigravity_rfcs (
  rfc_code TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'modelo_financiero', -- modelo_financiero | zootecnia | frontend | backend
  source_channel TEXT NOT NULL DEFAULT 'web',
  propuesta_json JSONB NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente_aprobacion', -- pendiente_aprobacion | aprobado | ejecutado | rechazado
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_operational_events_type_created
  ON public.operational_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_antigravity_rfcs_estado
  ON public.antigravity_rfcs (estado, created_at DESC);

-- Habilitar Supabase Realtime para las tablas clave (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'twin_state_snapshots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.twin_state_snapshots;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'operational_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.operational_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'daily_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_logs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'antigravity_rfcs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.antigravity_rfcs;
  END IF;
END $$;
