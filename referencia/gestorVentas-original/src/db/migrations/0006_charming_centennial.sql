CREATE TABLE "commission_bonus_rules" (
	"id_bonus" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"tipo_evento" varchar(50) NOT NULL,
	"id_marca" integer,
	"id_modelo" integer,
	"importe" integer DEFAULT 0 NOT NULL,
	"afecta_objetivo" boolean DEFAULT false NOT NULL,
	"valor_objetivo" integer DEFAULT 0 NOT NULL,
	"fecha_inicio" date,
	"fecha_fin" date,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_finance_rules" (
	"id_finance" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"importe_normal" integer DEFAULT 0 NOT NULL,
	"importe_preference" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_liquidation_line_items" (
	"id_line_item" serial PRIMARY KEY NOT NULL,
	"id_line" integer NOT NULL,
	"concepto" text NOT NULL,
	"importe" integer DEFAULT 0 NOT NULL,
	"afecta_objetivo" boolean DEFAULT false NOT NULL,
	"valor_objetivo" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_liquidation_lines" (
	"id_line" serial PRIMARY KEY NOT NULL,
	"id_liquidation" integer NOT NULL,
	"id_expediente" integer,
	"vendedor_nombre" text NOT NULL,
	"cliente_nombre" text NOT NULL,
	"marca_nombre" text NOT NULL,
	"modelo_nombre" text NOT NULL,
	"fecha_pedido" date,
	"fecha_afectacion" date,
	"fecha_matriculacion" date,
	"entra_por_pedido" boolean DEFAULT false NOT NULL,
	"entra_por_afectacion" boolean DEFAULT false NOT NULL,
	"entra_por_matriculacion" boolean DEFAULT false NOT NULL,
	"valor_para_objetivo" integer DEFAULT 0 NOT NULL,
	"comision_base" integer DEFAULT 0 NOT NULL,
	"comision_financiacion" integer DEFAULT 0 NOT NULL,
	"comision_preference" integer DEFAULT 0 NOT NULL,
	"bonus_acumulado" integer DEFAULT 0 NOT NULL,
	"total_generado" integer DEFAULT 0 NOT NULL,
	"mes_generacion" varchar(50) NOT NULL,
	"mes_pago_estimado" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_liquidations" (
	"id_liquidation" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"estado" varchar(50) DEFAULT 'borrador' NOT NULL,
	"fecha_calculo" date NOT NULL,
	"objetivo_base_snapshot" integer NOT NULL,
	"arrastre_snapshot" integer NOT NULL,
	"x_calculado_snapshot" integer NOT NULL,
	"total_computables_snapshot" integer DEFAULT 0 NOT NULL,
	"tramo_alcanzado_snapshot" varchar(20) NOT NULL,
	"matriculaciones_reales_snapshot" integer DEFAULT 0 NOT NULL,
	"cumple_minimo_snapshot" boolean DEFAULT false NOT NULL,
	"total_comision_economica" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_plan_model_rates" (
	"id_rate" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"id_modelo" integer NOT NULL,
	"rate_x_minus_3" integer DEFAULT 0 NOT NULL,
	"rate_x_minus_2" integer DEFAULT 0 NOT NULL,
	"rate_x_minus_1" integer DEFAULT 0 NOT NULL,
	"rate_x" integer DEFAULT 0 NOT NULL,
	"rate_x_plus_1" integer DEFAULT 0 NOT NULL,
	"rate_x_plus_2" integer DEFAULT 0 NOT NULL,
	"valor_objetivo" integer DEFAULT 1 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_plans" (
	"id_plan" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date NOT NULL,
	"estado" varchar(50) DEFAULT 'borrador' NOT NULL,
	"objetivo_base" integer DEFAULT 0 NOT NULL,
	"arrastre" integer DEFAULT 0 NOT NULL,
	"min_matriculaciones" integer DEFAULT 6 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id_rule" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"nombre" text NOT NULL,
	"tipo_evento" varchar(50) NOT NULL,
	"id_marca" integer,
	"id_modelo" integer,
	"afecta_objetivo" boolean DEFAULT false NOT NULL,
	"valor_objetivo" integer DEFAULT 0 NOT NULL,
	"afecta_comision" boolean DEFAULT false NOT NULL,
	"importe" integer DEFAULT 0 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_bonus_rules" ADD CONSTRAINT "commission_bonus_rules_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_bonus_rules" ADD CONSTRAINT "commission_bonus_rules_id_marca_marcas_id_marca_fk" FOREIGN KEY ("id_marca") REFERENCES "public"."marcas"("id_marca") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_bonus_rules" ADD CONSTRAINT "commission_bonus_rules_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_finance_rules" ADD CONSTRAINT "commission_finance_rules_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_liquidation_line_items" ADD CONSTRAINT "commission_liquidation_line_items_id_line_commission_liquidation_lines_id_line_fk" FOREIGN KEY ("id_line") REFERENCES "public"."commission_liquidation_lines"("id_line") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_liquidation_lines" ADD CONSTRAINT "commission_liquidation_lines_id_liquidation_commission_liquidations_id_liquidation_fk" FOREIGN KEY ("id_liquidation") REFERENCES "public"."commission_liquidations"("id_liquidation") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_liquidation_lines" ADD CONSTRAINT "commission_liquidation_lines_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_liquidations" ADD CONSTRAINT "commission_liquidations_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_model_rates" ADD CONSTRAINT "commission_plan_model_rates_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_model_rates" ADD CONSTRAINT "commission_plan_model_rates_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_id_marca_marcas_id_marca_fk" FOREIGN KEY ("id_marca") REFERENCES "public"."marcas"("id_marca") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE set null ON UPDATE no action;