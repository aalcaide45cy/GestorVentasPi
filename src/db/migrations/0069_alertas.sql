CREATE TABLE "alertas_reglas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"mensaje" text DEFAULT '' NOT NULL,
	"avisar_admin" boolean DEFAULT false NOT NULL,
	"definicion" jsonb NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alertas" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_regla" integer NOT NULL,
	"id_expediente" integer NOT NULL,
	"id_usuario" integer NOT NULL,
	"mensaje" text NOT NULL,
	"estado" varchar(12) DEFAULT 'pendiente' NOT NULL,
	"pospuesta_hasta" timestamp with time zone,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelta_en" timestamp with time zone,
	"motivo" varchar(12)
);
--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_id_regla_alertas_reglas_id_fk" FOREIGN KEY ("id_regla") REFERENCES "public"."alertas_reglas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alertas_regla_exp_usuario_uq" ON "alertas" USING btree ("id_regla","id_expediente","id_usuario");--> statement-breakpoint
CREATE INDEX "alertas_usuario_estado_idx" ON "alertas" USING btree ("id_usuario","estado");
