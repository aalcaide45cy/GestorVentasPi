CREATE TABLE "preferencias_usuario" (
	"id_usuario" integer NOT NULL,
	"clave" varchar(120) NOT NULL,
	"valor" text NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferencias_usuario_id_usuario_clave_pk" PRIMARY KEY("id_usuario","clave")
);
--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD CONSTRAINT "preferencias_usuario_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;