CREATE TABLE "commission_vo_patterns" (
	"id_vo_pattern" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"tiers" text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marcas" ADD COLUMN "sistema_comisiones" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "tipo_vendedor" varchar(50) DEFAULT 'VN' NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "patron_vo" varchar(100) DEFAULT 'Estándar VO';--> statement-breakpoint
ALTER TABLE "commission_vo_patterns" ADD CONSTRAINT "commission_vo_patterns_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;