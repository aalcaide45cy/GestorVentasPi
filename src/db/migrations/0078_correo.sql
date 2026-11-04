ALTER TABLE "clientes" ADD COLUMN "no_enviar_correos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "correo_cuentas" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"email" varchar(255) NOT NULL,
	"proveedor" varchar(12) DEFAULT 'otro' NOT NULL,
	"host" varchar(255) NOT NULL,
	"puerto" integer DEFAULT 587 NOT NULL,
	"seguro" boolean DEFAULT false NOT NULL,
	"usuario_smtp" varchar(255) NOT NULL,
	"password_cifrada" text NOT NULL,
	"firma" text DEFAULT '' NOT NULL,
	"limite_diario" integer DEFAULT 200 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correo_plantillas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"asunto" varchar(300) DEFAULT '' NOT NULL,
	"cuerpo" text DEFAULT '' NOT NULL,
	"creado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "correo_cola" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"id_cuenta" integer,
	"id_plantilla" integer,
	"id_expediente" integer,
	"id_cliente" integer,
	"para" text DEFAULT '' NOT NULL,
	"asunto" varchar(300) DEFAULT '' NOT NULL,
	"cuerpo" text DEFAULT '' NOT NULL,
	"adjuntos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estado" varchar(12) DEFAULT 'borrador' NOT NULL,
	"origen" varchar(12) DEFAULT 'manual' NOT NULL,
	"id_regla" integer,
	"error" text,
	"intentos" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "correo_cuentas" ADD CONSTRAINT "correo_cuentas_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correo_plantillas" ADD CONSTRAINT "correo_plantillas_creado_por_usuarios_id_usuario_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correo_cola" ADD CONSTRAINT "correo_cola_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correo_cola" ADD CONSTRAINT "correo_cola_id_cuenta_correo_cuentas_id_fk" FOREIGN KEY ("id_cuenta") REFERENCES "public"."correo_cuentas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correo_cola" ADD CONSTRAINT "correo_cola_id_plantilla_correo_plantillas_id_fk" FOREIGN KEY ("id_plantilla") REFERENCES "public"."correo_plantillas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correo_cola" ADD CONSTRAINT "correo_cola_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correo_cola" ADD CONSTRAINT "correo_cola_id_cliente_clientes_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correo_cola" ADD CONSTRAINT "correo_cola_id_regla_alertas_reglas_id_fk" FOREIGN KEY ("id_regla") REFERENCES "public"."alertas_reglas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "correo_cola_usuario_estado_idx" ON "correo_cola" USING btree ("id_usuario","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "correo_cola_regla_exp_uq" ON "correo_cola" USING btree ("id_regla","id_expediente");
