ALTER TABLE "commission_plan_model_rates" ALTER COLUMN "valor_objetivo" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "commission_plan_model_rates" ALTER COLUMN "valor_objetivo" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "commission_brand_intervention_rates" ADD COLUMN "valor_objetivo_defecto" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_plan_model_rates" ADD COLUMN "rate_x_minus_4" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_plan_model_rates" ADD COLUMN "rate_x_plus_3" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_plans" ADD COLUMN "min_coches_multiplicador" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expedientes" ADD COLUMN "valor_objetivo" double precision;--> statement-breakpoint
ALTER TABLE "expedientes" ADD COLUMN "min_coches_multiplicador" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "orden_acceso_rapido" integer DEFAULT 0;