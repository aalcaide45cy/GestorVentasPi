CREATE TABLE "expedientes_no_se_cobra" (
	"id_expediente" integer PRIMARY KEY NOT NULL,
	"motivo" text,
	"creado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expedientes_no_se_cobra" ADD CONSTRAINT "expedientes_no_se_cobra_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes_no_se_cobra" ADD CONSTRAINT "expedientes_no_se_cobra_creado_por_usuarios_id_usuario_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;
