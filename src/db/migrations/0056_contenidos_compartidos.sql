CREATE TABLE "contenidos_compartidos" (
	"hash" varchar(64) PRIMARY KEY NOT NULL,
	"datos" "bytea" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adjuntos_datos" ALTER COLUMN "datos" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "biblioteca_datos" ALTER COLUMN "datos" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "adjuntos_datos" ADD COLUMN "contenido_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "biblioteca_datos" ADD COLUMN "contenido_hash" varchar(64);--> statement-breakpoint
-- Un registro sin contenido propio tiene que apuntar a uno compartido
ALTER TABLE "adjuntos_datos" ADD CONSTRAINT "adjuntos_datos_contenido_chk" CHECK ("datos" IS NOT NULL OR "contenido_hash" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "biblioteca_datos" ADD CONSTRAINT "biblioteca_datos_contenido_chk" CHECK ("datos" IS NOT NULL OR "contenido_hash" IS NOT NULL);--> statement-breakpoint
CREATE INDEX "adjuntos_datos_hash_idx" ON "adjuntos_datos" ("contenido_hash");--> statement-breakpoint
CREATE INDEX "biblioteca_datos_hash_idx" ON "biblioteca_datos" ("contenido_hash");--> statement-breakpoint
-- Cuando ya ninguna ficha usa un archivo compartido (se borró el documento, se purgó la Papelera, etc.), el archivo se borra
CREATE OR REPLACE FUNCTION limpiar_contenido_compartido() RETURNS trigger AS $$
DECLARE
  h text := OLD.contenido_hash;
BEGIN
  IF h IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.contenido_hash IS NOT DISTINCT FROM h AND NEW.datos IS NULL THEN RETURN NULL; END IF;
  DELETE FROM contenidos_compartidos c
   WHERE c.hash = h
     AND NOT EXISTS (SELECT 1 FROM adjuntos_datos a WHERE a.contenido_hash = h AND a.datos IS NULL)
     AND NOT EXISTS (SELECT 1 FROM biblioteca_datos b WHERE b.contenido_hash = h AND b.datos IS NULL);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS limpiar_contenido_adjuntos ON adjuntos_datos;--> statement-breakpoint
CREATE TRIGGER limpiar_contenido_adjuntos AFTER DELETE OR UPDATE ON adjuntos_datos FOR EACH ROW EXECUTE FUNCTION limpiar_contenido_compartido();--> statement-breakpoint
DROP TRIGGER IF EXISTS limpiar_contenido_biblioteca ON biblioteca_datos;--> statement-breakpoint
CREATE TRIGGER limpiar_contenido_biblioteca AFTER DELETE OR UPDATE ON biblioteca_datos FOR EACH ROW EXECUTE FUNCTION limpiar_contenido_compartido();
