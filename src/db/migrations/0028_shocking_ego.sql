ALTER TABLE "tipo_de_venta" ADD COLUMN "cuenta_para_tasa" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "tipo_de_venta" SET "cuenta_para_tasa" = true WHERE "categoria" IN ('CREDITO', 'PREFERENCE', 'RENTING');
