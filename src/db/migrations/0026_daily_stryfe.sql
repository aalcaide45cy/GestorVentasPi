DROP INDEX "commission_finance_rates_uq";--> statement-breakpoint
ALTER TABLE "commission_finance_rates" ADD COLUMN "tasa_intervencion" varchar(20) DEFAULT 'indiferente' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_finance_rates" ADD COLUMN "tasa_ambito" varchar(10) DEFAULT 'marca' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_plans" ADD COLUMN "tasa_global_tipo" varchar(20) DEFAULT 'porcentaje' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_plans" ADD COLUMN "tasa_global_objetivo" integer;--> statement-breakpoint
ALTER TABLE "commission_plans" ADD COLUMN "tasa_vo_tipo" varchar(20) DEFAULT 'porcentaje' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_plans" ADD COLUMN "tasa_vo_objetivo" integer;--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ADD COLUMN "tasa_intervencion" varchar(20) DEFAULT 'indiferente' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ADD COLUMN "tasa_ambito" varchar(10) DEFAULT 'marca' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_finance_rates_uq" ON "commission_finance_rates" USING btree ("id_plan","id_marca","tipo_financiacion","aplica_a","tasa_intervencion","tasa_ambito");