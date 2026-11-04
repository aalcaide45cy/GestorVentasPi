CREATE TABLE "notas_etiquetas" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"nombre" varchar(30) NOT NULL,
	"color" varchar(7),
	"emoji" varchar(16)
);
--> statement-breakpoint
ALTER TABLE "notas_etiquetas" ADD CONSTRAINT "notas_etiquetas_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notas_etiquetas_uq" ON "notas_etiquetas" USING btree ("id_usuario",lower("nombre"));
