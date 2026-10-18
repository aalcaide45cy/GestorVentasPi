CREATE TABLE "lecturas_pedidos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer,
	"nombre" text NOT NULL,
	"tamano" integer NOT NULL,
	"huella" varchar(64) NOT NULL,
	"datos" "bytea",
	"estado" varchar(12) DEFAULT 'pendiente' NOT NULL,
	"resultado" jsonb,
	"error" text,
	"intentos" integer DEFAULT 0 NOT NULL,
	"destino" jsonb,
	"permitir_duplicados" boolean DEFAULT false NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"empezada_en" timestamp with time zone,
	"terminada_en" timestamp with time zone,
	"recogida_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "lecturas_pedidos" ADD CONSTRAINT "lecturas_pedidos_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lecturas_pedidos_estado_idx" ON "lecturas_pedidos" USING btree ("estado","id");--> statement-breakpoint
CREATE INDEX "lecturas_pedidos_usuario_idx" ON "lecturas_pedidos" USING btree ("id_usuario","huella");