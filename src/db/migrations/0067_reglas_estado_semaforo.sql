ALTER TABLE "apuntes_predefinidos" ADD COLUMN "reglas_estado" jsonb DEFAULT '[]'::jsonb NOT NULL;
