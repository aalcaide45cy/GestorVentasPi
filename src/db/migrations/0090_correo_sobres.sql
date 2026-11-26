CREATE TABLE "correo_sobres" (
	"id_expediente" integer NOT NULL,
	"campo" varchar(24) NOT NULL,
	"verde" boolean NOT NULL,
	"cambiado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "correo_sobres_id_expediente_campo_pk" PRIMARY KEY("id_expediente","campo")
);
--> statement-breakpoint
ALTER TABLE "correo_sobres" ADD CONSTRAINT "correo_sobres_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE cascade ON UPDATE no action;
