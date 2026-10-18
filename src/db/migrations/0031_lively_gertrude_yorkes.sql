DROP INDEX "commission_finance_rates_uq";--> statement-breakpoint
ALTER TABLE "commission_finance_rates" ADD COLUMN "concepto" varchar(80) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_finance_rates" ADD COLUMN "tasa_umbral" integer;--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ADD COLUMN "concepto" varchar(80) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ADD COLUMN "tasa_umbral" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_finance_rates_uq" ON "commission_finance_rates" USING btree ("id_plan","id_marca","tipo_financiacion","aplica_a","tasa_intervencion","tasa_ambito","concepto",coalesce("tasa_umbral", -1));
--> statement-breakpoint
-- Los repartos que ya existían (un importe dividido entre conceptos) pasan a ser líneas independientes, una por concepto
INSERT INTO "commission_finance_rates" ("id_plan", "id_marca", "tipo_financiacion", "aplica_a", "importe", "tasa_intervencion", "tasa_ambito", "concepto")
SELECT f."id_plan", f."id_marca", f."tipo_financiacion", f."aplica_a", (p.value->>'importe')::integer, f."tasa_intervencion", f."tasa_ambito", p.value->>'concepto'
  FROM "commission_finance_rates" f, jsonb_array_elements(f."reparto") AS p(value)
 WHERE jsonb_array_length(f."reparto") > 0 AND (p.value->>'importe')::integer > 0 AND coalesce(p.value->>'concepto', '') <> '';
--> statement-breakpoint
UPDATE "commission_finance_rates" f SET "importe" = greatest(0, f."importe" - (SELECT coalesce(sum((p.value->>'importe')::integer), 0) FROM jsonb_array_elements(f."reparto") AS p(value)))
 WHERE jsonb_array_length(f."reparto") > 0;
--> statement-breakpoint
INSERT INTO "commission_preference_rules" ("id_plan", "nombre", "id_marca", "id_modelo", "tipo_financiacion", "aplica_a", "importe", "activa", "tasa_intervencion", "tasa_ambito", "concepto")
SELECT r."id_plan", r."nombre", r."id_marca", r."id_modelo", r."tipo_financiacion", r."aplica_a", (p.value->>'importe')::integer, r."activa", r."tasa_intervencion", r."tasa_ambito", p.value->>'concepto'
  FROM "commission_preference_rules" r, jsonb_array_elements(r."reparto") AS p(value)
 WHERE jsonb_array_length(r."reparto") > 0 AND (p.value->>'importe')::integer > 0 AND coalesce(p.value->>'concepto', '') <> '';
--> statement-breakpoint
UPDATE "commission_preference_rules" r SET "importe" = greatest(0, r."importe" - (SELECT coalesce(sum((p.value->>'importe')::integer), 0) FROM jsonb_array_elements(r."reparto") AS p(value)))
 WHERE jsonb_array_length(r."reparto") > 0;
