CREATE TABLE "commission_finance_rates" (
	"id_finance_rate" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"id_marca" integer NOT NULL,
	"tipo_financiacion" varchar(50) NOT NULL,
	"importe" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_preference_rules" (
	"id_pref_rule" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"nombre" text NOT NULL,
	"id_marca" integer,
	"id_modelo" integer,
	"tipo_financiacion" varchar(50),
	"importe" integer DEFAULT 0 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_used_rates" (
	"id_used_rate" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"tipo_usado" varchar(50) NOT NULL,
	"importe_primera" integer DEFAULT 0 NOT NULL,
	"importe_resto" integer DEFAULT 0 NOT NULL,
	"valor_objetivo" integer DEFAULT 1 NOT NULL,
	"min_aplicar" integer DEFAULT 1 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_liquidation_lines" ADD COLUMN "comision_base_vn" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_liquidation_lines" ADD COLUMN "comision_usado" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_finance_rates" ADD CONSTRAINT "commission_finance_rates_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_finance_rates" ADD CONSTRAINT "commission_finance_rates_id_marca_marcas_id_marca_fk" FOREIGN KEY ("id_marca") REFERENCES "public"."marcas"("id_marca") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ADD CONSTRAINT "commission_preference_rules_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ADD CONSTRAINT "commission_preference_rules_id_marca_marcas_id_marca_fk" FOREIGN KEY ("id_marca") REFERENCES "public"."marcas"("id_marca") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ADD CONSTRAINT "commission_preference_rules_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_used_rates" ADD CONSTRAINT "commission_used_rates_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;