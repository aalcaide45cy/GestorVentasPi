ALTER TABLE "commission_bonus_rules" ALTER COLUMN "tipo_vehiculo" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "commission_bonus_rules" ALTER COLUMN "tipo_vehiculo" SET DEFAULT 'cualquiera';--> statement-breakpoint
ALTER TABLE "commission_finance_rates" ALTER COLUMN "aplica_a" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "commission_finance_rates" ALTER COLUMN "aplica_a" SET DEFAULT 'VN';--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ALTER COLUMN "aplica_a" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ALTER COLUMN "aplica_a" SET DEFAULT 'VN';--> statement-breakpoint
ALTER TABLE "commission_rules" ALTER COLUMN "tipo_vehiculo" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "commission_rules" ALTER COLUMN "tipo_vehiculo" SET DEFAULT 'cualquiera';--> statement-breakpoint
ALTER TABLE "commission_vo_patterns" ADD COLUMN "rotativo" boolean DEFAULT false NOT NULL;