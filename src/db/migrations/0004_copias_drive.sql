CREATE TABLE "conexion_drive" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"refresh_token_cifrado" text NOT NULL,
	"email" text,
	"carpeta_id" text,
	"conectada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"requiere_reconexion" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copias_seguridad" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"tipo" varchar(10) NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"tamano" bigint DEFAULT 0 NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"creada_por" integer,
	"drive_file_id" text,
	"subida_drive_en" timestamp with time zone,
	"estado" varchar(10) DEFAULT 'ok' NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "copias_seguridad" ADD CONSTRAINT "copias_seguridad_creada_por_usuarios_id_usuario_fk" FOREIGN KEY ("creada_por") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "copias_seguridad_nombre_uq" ON "copias_seguridad" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "copias_seguridad_creada_idx" ON "copias_seguridad" USING btree ("creada_en");