-- Índices para volúmenes grandes (cientos de miles o millones de expedientes).
-- Búsqueda por trozos de texto (ILIKE '%…%'): índices de trigramas.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expedientes_matricula_trgm" ON "expedientes" USING gin ("matricula" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expedientes_vin_trgm" ON "expedientes" USING gin ("vin" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clientes_nombre_trgm" ON "clientes" USING gin ("nombre" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clientes_dni_trgm" ON "clientes" USING gin ("dni" gin_trgm_ops);--> statement-breakpoint
-- El motor de comisiones busca por cualquiera de las cinco fechas de un mes.
CREATE INDEX IF NOT EXISTS "expedientes_fecha_afectacion_idx" ON "expedientes" ("fecha_afectacion");--> statement-breakpoint
-- Recuentos del panel (solo filas no eliminadas) mediante recorrido solo de índice.
CREATE INDEX IF NOT EXISTS "expedientes_activos_tipo_idx" ON "expedientes" ("id_tipo_de_venta") WHERE "eliminado_en" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clientes_activos_idx" ON "clientes" ("id") WHERE "eliminado_en" IS NULL;
