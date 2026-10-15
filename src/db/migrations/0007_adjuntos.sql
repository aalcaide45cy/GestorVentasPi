CREATE TABLE "adjuntos" (
	"id" serial PRIMARY KEY NOT NULL,
	"ambito" varchar(12) NOT NULL,
	"id_cliente" integer,
	"id_expediente" integer,
	"tipo" varchar(20) DEFAULT 'otro' NOT NULL,
	"nombre" text NOT NULL,
	"mime" varchar(60) NOT NULL,
	"tamano" integer NOT NULL,
	"tiene_miniatura" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" integer,
	"eliminado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "adjuntos_datos" (
	"id_adjunto" integer PRIMARY KEY NOT NULL,
	"datos" "bytea" NOT NULL,
	"miniatura" "bytea"
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "foto_adjunto_id" integer;--> statement-breakpoint
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_id_cliente_clientes_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_creado_por_usuarios_id_usuario_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjuntos_datos" ADD CONSTRAINT "adjuntos_datos_id_adjunto_adjuntos_id_fk" FOREIGN KEY ("id_adjunto") REFERENCES "public"."adjuntos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adjuntos_cliente_idx" ON "adjuntos" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX "adjuntos_expediente_idx" ON "adjuntos" USING btree ("id_expediente");