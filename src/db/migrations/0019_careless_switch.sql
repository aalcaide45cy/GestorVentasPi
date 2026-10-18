ALTER TABLE "commission_plans" ALTER COLUMN "vo_fecha" SET DEFAULT 'facturacion';--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "comentarios" text;--> statement-breakpoint
ALTER TABLE "expedientes" ADD COLUMN "comentarios" text;