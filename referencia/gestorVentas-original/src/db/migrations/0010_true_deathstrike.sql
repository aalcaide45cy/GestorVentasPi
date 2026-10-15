CREATE TABLE "commission_brand_intervention_rates" (
	"id_intervention_rate" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"id_marca" integer NOT NULL,
	"tasa_intervencion" integer DEFAULT 70 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_plan_model_rates" ADD COLUMN "tasa_intervencion_cumplida" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_brand_intervention_rates" ADD CONSTRAINT "commission_brand_intervention_rates_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_brand_intervention_rates" ADD CONSTRAINT "commission_brand_intervention_rates_id_marca_marcas_id_marca_fk" FOREIGN KEY ("id_marca") REFERENCES "public"."marcas"("id_marca") ON DELETE cascade ON UPDATE no action;