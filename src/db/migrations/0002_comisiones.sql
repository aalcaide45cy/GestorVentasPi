CREATE TABLE "commission_bonus_rules" (
	"id_bonus_rule" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"nombre" text NOT NULL,
	"evento" varchar(20) NOT NULL,
	"tipo_vehiculo" varchar(20) DEFAULT 'cualquiera' NOT NULL,
	"fecha_inicio" date,
	"fecha_fin" date,
	"id_marca" integer,
	"id_modelo" integer,
	"tasa_intervencion" varchar(20) DEFAULT 'indiferente' NOT NULL,
	"puntos" integer DEFAULT 0 NOT NULL,
	"importe" integer DEFAULT 0 NOT NULL,
	"es_penalizacion" boolean DEFAULT false NOT NULL,
	"ligar_a_credito" boolean DEFAULT false NOT NULL,
	"activa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_brand_intervention_rates" (
	"id_intervention_rate" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"id_marca" integer NOT NULL,
	"tipo_tasa" varchar(20) DEFAULT 'porcentaje' NOT NULL,
	"objetivo" integer DEFAULT 70 NOT NULL,
	"puntos_defecto" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_finance_rates" (
	"id_finance_rate" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"id_marca" integer NOT NULL,
	"tipo_financiacion" varchar(20) NOT NULL,
	"importe" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_liquidation_line_items" (
	"id_item" serial PRIMARY KEY NOT NULL,
	"id_line" integer NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"concepto" varchar(30) NOT NULL,
	"descripcion" text NOT NULL,
	"importe" integer DEFAULT 0 NOT NULL,
	"puntos" integer DEFAULT 0 NOT NULL,
	"evento" varchar(30),
	"mes_evento" varchar(7),
	"aviso" text
);
--> statement-breakpoint
CREATE TABLE "commission_liquidation_lines" (
	"id_line" serial PRIMARY KEY NOT NULL,
	"id_liquidation" integer NOT NULL,
	"id_expediente" integer,
	"clase" varchar(2) NOT NULL,
	"mes_computo" varchar(7),
	"cuenta" boolean DEFAULT false NOT NULL,
	"unidades" integer DEFAULT 0 NOT NULL,
	"puntos" integer DEFAULT 0 NOT NULL,
	"importe" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_liquidation_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_liquidation" integer NOT NULL,
	"version" integer NOT NULL,
	"motivo" text NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb NOT NULL,
	"neto_anterior" integer NOT NULL,
	"neto_nuevo" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_liquidations" (
	"id_liquidation" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"id_usuario" integer NOT NULL,
	"mes" varchar(7) NOT NULL,
	"estado" varchar(20) DEFAULT 'calculada' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"objetivo_x" integer DEFAULT 0 NOT NULL,
	"puntos_mes" integer DEFAULT 0 NOT NULL,
	"tramo" integer DEFAULT 0 NOT NULL,
	"tasa_intervencion" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avisos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bruto" integer DEFAULT 0 NOT NULL,
	"penalizacion" integer DEFAULT 0 NOT NULL,
	"neto" integer DEFAULT 0 NOT NULL,
	"mes_pago" varchar(7) NOT NULL,
	"calculada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"origen" varchar(30) DEFAULT 'motor' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_model_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"id_modelo" integer NOT NULL,
	"puntos" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_plan_model_rates" (
	"id_rate" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"id_modelo" integer NOT NULL,
	"tasa_cumplida" boolean NOT NULL,
	"importes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_plan_pending" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"concepto" text NOT NULL,
	"importe" integer NOT NULL,
	"mes_origen" varchar(7)
);
--> statement-breakpoint
CREATE TABLE "commission_plan_vendedores" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"id_usuario" integer NOT NULL,
	"objetivo_base" integer DEFAULT 1300 NOT NULL,
	"arrastre" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_plans" (
	"id_plan" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date NOT NULL,
	"estado" varchar(20) DEFAULT 'borrador' NOT NULL,
	"tramo_min" integer DEFAULT -4 NOT NULL,
	"tramo_max" integer DEFAULT 3 NOT NULL,
	"puntos_por_pedido" integer DEFAULT 0 NOT NULL,
	"penalizacion_importe" integer DEFAULT 0 NOT NULL,
	"penalizacion_titulo" text,
	"penalizacion_descripcion" text,
	"notas" text
);
--> statement-breakpoint
CREATE TABLE "commission_preference_rules" (
	"id_pref_rule" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"nombre" text,
	"id_marca" integer,
	"id_modelo" integer,
	"tipo_financiacion" varchar(20),
	"importe" integer DEFAULT 0 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id_rule" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"nombre" text NOT NULL,
	"evento" varchar(20) NOT NULL,
	"tipo_vehiculo" varchar(20) DEFAULT 'cualquiera' NOT NULL,
	"fecha_inicio" date,
	"fecha_fin" date,
	"id_marca" integer,
	"id_modelo" integer,
	"tasa_intervencion" varchar(20) DEFAULT 'indiferente' NOT NULL,
	"puntos" integer DEFAULT 0 NOT NULL,
	"importe" integer DEFAULT 0 NOT NULL,
	"es_penalizacion" boolean DEFAULT false NOT NULL,
	"ligar_a_credito" boolean DEFAULT false NOT NULL,
	"activa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_used_rates" (
	"id_used_rate" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"subtipo" varchar(30) NOT NULL,
	"importe_primera" integer DEFAULT 0 NOT NULL,
	"importe_resto" integer DEFAULT 0 NOT NULL,
	"min_aplicar" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_vo_patterns" (
	"id_vo_pattern" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"nombre" text NOT NULL,
	"aplica_a_vn" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"tiers" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "libro_puntos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"id_expediente" integer,
	"evento" varchar(20) NOT NULL,
	"fecha" date NOT NULL,
	"mes" varchar(7) NOT NULL,
	"puntos" integer NOT NULL,
	"regla" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pendientes_cobro" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"concepto" text NOT NULL,
	"importe" integer NOT NULL,
	"fecha" date,
	"mes_nomina_previsto" varchar(7),
	"cobrado" boolean DEFAULT false NOT NULL,
	"fecha_cobro" date,
	"notas" text
);
--> statement-breakpoint
CREATE TABLE "promociones_puntos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_plan" integer NOT NULL,
	"nombre" text NOT NULL,
	"puntos_especiales" integer NOT NULL,
	"minimo_unidades" integer NOT NULL,
	"puntos_si_no_cumple" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_bonus_rules" ADD CONSTRAINT "commission_bonus_rules_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_bonus_rules" ADD CONSTRAINT "commission_bonus_rules_id_marca_marcas_id_marca_fk" FOREIGN KEY ("id_marca") REFERENCES "public"."marcas"("id_marca") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_bonus_rules" ADD CONSTRAINT "commission_bonus_rules_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_brand_intervention_rates" ADD CONSTRAINT "commission_brand_intervention_rates_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_brand_intervention_rates" ADD CONSTRAINT "commission_brand_intervention_rates_id_marca_marcas_id_marca_fk" FOREIGN KEY ("id_marca") REFERENCES "public"."marcas"("id_marca") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_finance_rates" ADD CONSTRAINT "commission_finance_rates_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_finance_rates" ADD CONSTRAINT "commission_finance_rates_id_marca_marcas_id_marca_fk" FOREIGN KEY ("id_marca") REFERENCES "public"."marcas"("id_marca") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_liquidation_line_items" ADD CONSTRAINT "commission_liquidation_line_items_id_line_commission_liquidation_lines_id_line_fk" FOREIGN KEY ("id_line") REFERENCES "public"."commission_liquidation_lines"("id_line") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_liquidation_lines" ADD CONSTRAINT "commission_liquidation_lines_id_liquidation_commission_liquidations_id_liquidation_fk" FOREIGN KEY ("id_liquidation") REFERENCES "public"."commission_liquidations"("id_liquidation") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_liquidation_versions" ADD CONSTRAINT "commission_liquidation_versions_id_liquidation_commission_liquidations_id_liquidation_fk" FOREIGN KEY ("id_liquidation") REFERENCES "public"."commission_liquidations"("id_liquidation") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_liquidations" ADD CONSTRAINT "commission_liquidations_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_liquidations" ADD CONSTRAINT "commission_liquidations_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_model_points" ADD CONSTRAINT "commission_model_points_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_model_points" ADD CONSTRAINT "commission_model_points_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_model_rates" ADD CONSTRAINT "commission_plan_model_rates_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_model_rates" ADD CONSTRAINT "commission_plan_model_rates_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_pending" ADD CONSTRAINT "commission_plan_pending_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_vendedores" ADD CONSTRAINT "commission_plan_vendedores_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_plan_vendedores" ADD CONSTRAINT "commission_plan_vendedores_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ADD CONSTRAINT "commission_preference_rules_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ADD CONSTRAINT "commission_preference_rules_id_marca_marcas_id_marca_fk" FOREIGN KEY ("id_marca") REFERENCES "public"."marcas"("id_marca") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_preference_rules" ADD CONSTRAINT "commission_preference_rules_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_id_marca_marcas_id_marca_fk" FOREIGN KEY ("id_marca") REFERENCES "public"."marcas"("id_marca") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_used_rates" ADD CONSTRAINT "commission_used_rates_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_vo_patterns" ADD CONSTRAINT "commission_vo_patterns_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "libro_puntos" ADD CONSTRAINT "libro_puntos_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendientes_cobro" ADD CONSTRAINT "pendientes_cobro_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promociones_puntos" ADD CONSTRAINT "promociones_puntos_id_plan_commission_plans_id_plan_fk" FOREIGN KEY ("id_plan") REFERENCES "public"."commission_plans"("id_plan") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_brand_intervention_rates_uq" ON "commission_brand_intervention_rates" USING btree ("id_plan","id_marca");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_finance_rates_uq" ON "commission_finance_rates" USING btree ("id_plan","id_marca","tipo_financiacion");--> statement-breakpoint
CREATE INDEX "commission_liquidation_line_items_line_idx" ON "commission_liquidation_line_items" USING btree ("id_line");--> statement-breakpoint
CREATE INDEX "commission_liquidation_lines_liq_idx" ON "commission_liquidation_lines" USING btree ("id_liquidation");--> statement-breakpoint
CREATE INDEX "commission_liquidation_versions_liq_idx" ON "commission_liquidation_versions" USING btree ("id_liquidation");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_liquidations_uq" ON "commission_liquidations" USING btree ("id_plan","id_usuario","mes");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_model_points_uq" ON "commission_model_points" USING btree ("id_plan","id_modelo");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_plan_model_rates_uq" ON "commission_plan_model_rates" USING btree ("id_plan","id_modelo","tasa_cumplida");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_plan_vendedores_uq" ON "commission_plan_vendedores" USING btree ("id_plan","id_usuario");--> statement-breakpoint
CREATE INDEX "libro_puntos_usuario_mes_idx" ON "libro_puntos" USING btree ("id_usuario","mes");--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_promocion_promociones_puntos_id_fk" FOREIGN KEY ("id_promocion") REFERENCES "public"."promociones_puntos"("id") ON DELETE restrict ON UPDATE no action;