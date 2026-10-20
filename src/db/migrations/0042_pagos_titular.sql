ALTER TABLE "pagos_rci" ADD COLUMN "domicilio" text;--> statement-breakpoint
ALTER TABLE "pagos_rci" ADD COLUMN "codigo_postal" varchar(10);--> statement-breakpoint
ALTER TABLE "pagos_rci" ADD COLUMN "titular_anterior" jsonb;