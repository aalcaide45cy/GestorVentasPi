CREATE TABLE "incidencias" (
	"id" serial PRIMARY KEY NOT NULL,
	"huella" varchar(40) NOT NULL,
	"origen" varchar(16) NOT NULL,
	"nivel" varchar(8) DEFAULT 'error' NOT NULL,
	"titulo" text NOT NULL,
	"detalle" text,
	"ruta" text,
	"contexto" jsonb,
	"veces" integer DEFAULT 1 NOT NULL,
	"primera_vez" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_vez" timestamp with time zone DEFAULT now() NOT NULL,
	"estado" varchar(10) DEFAULT 'nueva' NOT NULL,
	"nota" text,
	"id_usuario" integer,
	"version" varchar(20)
);
--> statement-breakpoint
CREATE TABLE "incidencias_capturas" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_incidencia" integer NOT NULL,
	"mime" varchar(40) NOT NULL,
	"datos" "bytea" NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incidencias" ADD CONSTRAINT "incidencias_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidencias_capturas" ADD CONSTRAINT "incidencias_capturas_id_incidencia_incidencias_id_fk" FOREIGN KEY ("id_incidencia") REFERENCES "public"."incidencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "incidencias_huella_uq" ON "incidencias" USING btree ("huella");--> statement-breakpoint
CREATE INDEX "incidencias_estado_idx" ON "incidencias" USING btree ("estado","ultima_vez");