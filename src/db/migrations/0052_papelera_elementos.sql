CREATE TABLE "papelera_elementos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" varchar(30) NOT NULL,
	"etiqueta" text NOT NULL,
	"detalle" text,
	"datos" jsonb NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"eliminado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_por" integer
);
--> statement-breakpoint
CREATE INDEX "papelera_elementos_tipo_idx" ON "papelera_elementos" USING btree ("tipo","eliminado_en");