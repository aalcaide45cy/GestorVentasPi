CREATE TABLE "biblioteca" (
	"id" serial PRIMARY KEY NOT NULL,
	"categoria" varchar(12) DEFAULT 'otro' NOT NULL,
	"nombre" text NOT NULL,
	"mime" varchar(120) NOT NULL,
	"tamano" integer NOT NULL,
	"huella" varchar(64) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" integer
);
--> statement-breakpoint
CREATE TABLE "biblioteca_datos" (
	"id_archivo" integer PRIMARY KEY NOT NULL,
	"datos" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "biblioteca" ADD CONSTRAINT "biblioteca_creado_por_usuarios_id_usuario_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biblioteca_datos" ADD CONSTRAINT "biblioteca_datos_id_archivo_biblioteca_id_fk" FOREIGN KEY ("id_archivo") REFERENCES "public"."biblioteca"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "biblioteca_huella_idx" ON "biblioteca" USING btree ("huella");