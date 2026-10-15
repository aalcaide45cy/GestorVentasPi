CREATE TABLE "rejilla_filas" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_rejilla" integer NOT NULL,
	"matricula" varchar(50) NOT NULL,
	"cliente" text,
	"financiacion" text,
	"concepto" text,
	"importe" integer,
	"texto_original" text,
	"confianza" integer
);
--> statement-breakpoint
CREATE TABLE "rejillas" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"mes" varchar(7) NOT NULL,
	"origen" varchar(20) NOT NULL,
	"nombre_archivo" text,
	"total_hoja" integer,
	"notas" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creada_por" integer
);
--> statement-breakpoint
CREATE TABLE "validaciones_comision" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"mes" varchar(7) NOT NULL,
	"id_expediente" integer NOT NULL,
	"estado" varchar(12) NOT NULL,
	"nota" text,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rejilla_filas" ADD CONSTRAINT "rejilla_filas_id_rejilla_rejillas_id_fk" FOREIGN KEY ("id_rejilla") REFERENCES "public"."rejillas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejillas" ADD CONSTRAINT "rejillas_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejillas" ADD CONSTRAINT "rejillas_creada_por_usuarios_id_usuario_fk" FOREIGN KEY ("creada_por") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validaciones_comision" ADD CONSTRAINT "validaciones_comision_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validaciones_comision" ADD CONSTRAINT "validaciones_comision_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rejilla_filas_rejilla_idx" ON "rejilla_filas" USING btree ("id_rejilla");--> statement-breakpoint
CREATE UNIQUE INDEX "rejillas_usuario_mes_uq" ON "rejillas" USING btree ("id_usuario","mes");--> statement-breakpoint
CREATE UNIQUE INDEX "validaciones_comision_uq" ON "validaciones_comision" USING btree ("id_usuario","mes","id_expediente");