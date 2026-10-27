CREATE TABLE "apuntes_expediente" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_expediente" integer NOT NULL,
	"id_predefinido" integer,
	"titulo" varchar(80) NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"etiqueta" varchar(24) DEFAULT '' NOT NULL,
	"color" varchar(7) DEFAULT '#3b82f6' NOT NULL,
	"mostrar_etiqueta" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apuntes_predefinidos" (
	"id" serial PRIMARY KEY NOT NULL,
	"clave" varchar(40),
	"titulo" varchar(80) NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"etiqueta" varchar(24) DEFAULT '' NOT NULL,
	"color" varchar(7) DEFAULT '#3b82f6' NOT NULL,
	"mostrar_etiqueta" boolean DEFAULT false NOT NULL,
	"rapido" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apuntes_expediente" ADD CONSTRAINT "apuntes_expediente_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apuntes_expediente" ADD CONSTRAINT "apuntes_expediente_id_predefinido_apuntes_predefinidos_id_fk" FOREIGN KEY ("id_predefinido") REFERENCES "public"."apuntes_predefinidos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apuntes_expediente_exp_idx" ON "apuntes_expediente" USING btree ("id_expediente");--> statement-breakpoint
CREATE UNIQUE INDEX "apuntes_expediente_predefinido_uq" ON "apuntes_expediente" USING btree ("id_expediente","id_predefinido") WHERE "apuntes_expediente"."id_predefinido" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "apuntes_predefinidos_clave_uq" ON "apuntes_predefinidos" USING btree ("clave") WHERE "apuntes_predefinidos"."clave" is not null;--> statement-breakpoint
-- Apuntes predefinidos de salida: SEGURO (sin etiqueta en la lista) y VO de retoma (con etiqueta «VO»; la aplicación lo añade sola al leer un pedido con retoma)
INSERT INTO "apuntes_predefinidos" ("clave", "titulo", "descripcion", "etiqueta", "color", "mostrar_etiqueta", "rapido", "orden") VALUES
  ('seguro', 'Seguro', 'Hay que contratarle el seguro del coche.', 'SEGURO', '#2563eb', false, true, 1),
  ('vo-retoma', 'VO de retoma', 'El cliente deja un vehículo usado de retoma.', 'VO', '#f59e0b', true, true, 2)
ON CONFLICT DO NOTHING;
