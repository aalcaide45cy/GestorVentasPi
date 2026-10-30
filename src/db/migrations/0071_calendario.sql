CREATE TABLE "calendario_eventos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"titulo" varchar(120) NOT NULL,
	"notas" text DEFAULT '' NOT NULL,
	"fecha" date NOT NULL,
	"hora" varchar(5),
	"color" varchar(7) DEFAULT '#3b82f6' NOT NULL,
	"id_expediente" integer,
	"compartido" boolean DEFAULT false NOT NULL,
	"repeticion" varchar(10) DEFAULT 'ninguna' NOT NULL,
	"repetir_hasta" date,
	"recordatorios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hecho" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendario_avisos" (
	"id_usuario" integer NOT NULL,
	"clave" varchar(60) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendario_avisos_id_usuario_clave_pk" PRIMARY KEY("id_usuario","clave")
);
--> statement-breakpoint
ALTER TABLE "calendario_eventos" ADD CONSTRAINT "calendario_eventos_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendario_eventos" ADD CONSTRAINT "calendario_eventos_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendario_avisos" ADD CONSTRAINT "calendario_avisos_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendario_eventos_usuario_fecha_idx" ON "calendario_eventos" USING btree ("id_usuario","fecha");--> statement-breakpoint
ALTER TABLE "alertas" ALTER COLUMN "id_regla" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "alertas" ALTER COLUMN "id_expediente" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "alertas" ADD COLUMN "id_evento" integer;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_id_evento_calendario_eventos_id_fk" FOREIGN KEY ("id_evento") REFERENCES "public"."calendario_eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Las notas del calendario entran en el historial de deshacer y rehacer
DROP TRIGGER IF EXISTS zz_historial_calendario_eventos ON calendario_eventos;--> statement-breakpoint
CREATE TRIGGER zz_historial_calendario_eventos AFTER INSERT OR UPDATE OR DELETE ON calendario_eventos FOR EACH ROW EXECUTE FUNCTION historial_registrar();
