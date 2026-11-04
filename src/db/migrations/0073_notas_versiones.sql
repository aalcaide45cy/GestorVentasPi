CREATE TABLE "notas_versiones" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_nota" integer NOT NULL,
	"titulo" varchar(200) DEFAULT '' NOT NULL,
	"contenido" jsonb NOT NULL,
	"texto" text DEFAULT '' NOT NULL,
	"creado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notas_versiones" ADD CONSTRAINT "notas_versiones_id_nota_notas_id_fk" FOREIGN KEY ("id_nota") REFERENCES "public"."notas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_versiones" ADD CONSTRAINT "notas_versiones_creado_por_usuarios_id_usuario_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notas_versiones_nota_idx" ON "notas_versiones" USING btree ("id_nota","creado_en");
