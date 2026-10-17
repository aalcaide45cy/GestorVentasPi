ALTER TABLE "commission_plans" ADD COLUMN "vo_fecha" varchar(12) DEFAULT 'cobro' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_plans" ADD COLUMN "vo_puntos_modo" varchar(10) DEFAULT 'cuentan' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_plans" ADD COLUMN "vo_puntos" integer;