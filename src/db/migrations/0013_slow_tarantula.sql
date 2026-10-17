ALTER TABLE "expedientes" ADD COLUMN "copia_etiqueta" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "expedientes" SET "copia_etiqueta" = true WHERE "copia_de" IS NOT NULL;
