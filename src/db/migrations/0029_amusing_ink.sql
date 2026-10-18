ALTER TABLE "commission_liquidation_line_items" ALTER COLUMN "concepto" SET DATA TYPE varchar(80);--> statement-breakpoint
ALTER TABLE "commission_finance_rates" ADD COLUMN "reparto" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ADD COLUMN "reparto" jsonb DEFAULT '[]'::jsonb NOT NULL;