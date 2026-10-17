DROP INDEX "commission_finance_rates_uq";--> statement-breakpoint
ALTER TABLE "commission_finance_rates" ADD COLUMN "aplica_a" varchar(5) DEFAULT 'VN' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ADD COLUMN "aplica_a" varchar(5) DEFAULT 'VN' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_finance_rates_uq" ON "commission_finance_rates" USING btree ("id_plan","id_marca","tipo_financiacion","aplica_a");
--> statement-breakpoint
ALTER TABLE "commission_plans" ALTER COLUMN "vo_fecha" SET DEFAULT 'facturacion';--> statement-breakpoint
UPDATE "commission_plans" SET "vo_fecha" = 'facturacion';
