CREATE TABLE "potenciales" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"nombre" varchar(255) NOT NULL,
	"email" varchar(255) DEFAULT '' NOT NULL,
	"telefono" varchar(30) DEFAULT '' NOT NULL,
	"poblacion" varchar(120) DEFAULT '' NOT NULL,
	"provincia" varchar(80) DEFAULT '' NOT NULL,
	"codigo_postal" varchar(10) DEFAULT '' NOT NULL,
	"estado" varchar(10) DEFAULT 'activo' NOT NULL,
	"id_expediente" integer,
	"ignorar_posible" boolean DEFAULT false NOT NULL,
	"baja_en" timestamp with time zone,
	"baja_motivo" varchar(200),
	"notas" text DEFAULT '' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presupuestos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_potencial" integer NOT NULL,
	"numero" varchar(20) NOT NULL,
	"referencia" varchar(40),
	"fecha" date,
	"hora" varchar(5),
	"marca" varchar(80) DEFAULT '' NOT NULL,
	"modelo" varchar(120) DEFAULT '' NOT NULL,
	"id_modelo" integer,
	"modelo_texto" text DEFAULT '' NOT NULL,
	"color" varchar(80) DEFAULT '' NOT NULL,
	"total_centimos" integer,
	"vendedor" varchar(120) DEFAULT '' NOT NULL,
	"id_adjunto" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "correo_cola" ADD COLUMN "id_potencial" integer;--> statement-breakpoint
ALTER TABLE "correo_cola" ADD COLUMN "id_presupuesto" integer;--> statement-breakpoint
ALTER TABLE "correo_cola" ADD COLUMN "lote" varchar(60);--> statement-breakpoint
ALTER TABLE "correo_cola" ADD COLUMN "espera" integer;--> statement-breakpoint
ALTER TABLE "potenciales" ADD CONSTRAINT "potenciales_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "potenciales" ADD CONSTRAINT "potenciales_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_id_potencial_potenciales_id_fk" FOREIGN KEY ("id_potencial") REFERENCES "public"."potenciales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_id_adjunto_adjuntos_id_fk" FOREIGN KEY ("id_adjunto") REFERENCES "public"."adjuntos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correo_cola" ADD CONSTRAINT "correo_cola_id_potencial_potenciales_id_fk" FOREIGN KEY ("id_potencial") REFERENCES "public"."potenciales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correo_cola" ADD CONSTRAINT "correo_cola_id_presupuesto_presupuestos_id_fk" FOREIGN KEY ("id_presupuesto") REFERENCES "public"."presupuestos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "potenciales_usuario_estado_idx" ON "potenciales" USING btree ("id_usuario","estado");--> statement-breakpoint
CREATE INDEX "potenciales_email_idx" ON "potenciales" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "potenciales_telefono_idx" ON "potenciales" USING btree ("telefono");--> statement-breakpoint
CREATE UNIQUE INDEX "presupuestos_numero_uq" ON "presupuestos" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "presupuestos_potencial_idx" ON "presupuestos" USING btree ("id_potencial");
