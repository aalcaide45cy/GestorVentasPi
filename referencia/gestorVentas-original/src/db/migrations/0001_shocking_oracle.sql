CREATE TABLE "tiendas" (
	"id_tienda" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"ciudad" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "usuarios_tiendas" (
	"id_usuario_tienda" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"id_tienda" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expedientes" ADD COLUMN "id_tienda" integer;--> statement-breakpoint
ALTER TABLE "usuarios_tiendas" ADD CONSTRAINT "usuarios_tiendas_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_tiendas" ADD CONSTRAINT "usuarios_tiendas_id_tienda_tiendas_id_tienda_fk" FOREIGN KEY ("id_tienda") REFERENCES "public"."tiendas"("id_tienda") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tienda_id_tiendas_id_tienda_fk" FOREIGN KEY ("tienda_id") REFERENCES "public"."tiendas"("id_tienda") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_tienda_tiendas_id_tienda_fk" FOREIGN KEY ("id_tienda") REFERENCES "public"."tiendas"("id_tienda") ON DELETE no action ON UPDATE no action;