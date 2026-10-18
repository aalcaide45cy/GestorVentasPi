ALTER TABLE "commission_bonus_rules" ADD COLUMN "clave" varchar(60) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD COLUMN "clave" varchar(60) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "expedientes" ADD COLUMN "bonus_manuales" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
-- Las reglas y bonus que ya existían reciben su identificador estable
UPDATE "commission_bonus_rules" SET "clave" = gen_random_uuid()::text WHERE "clave" = '';
--> statement-breakpoint
UPDATE "commission_rules" SET "clave" = gen_random_uuid()::text WHERE "clave" = '';
