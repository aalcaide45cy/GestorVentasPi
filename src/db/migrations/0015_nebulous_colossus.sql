CREATE TABLE "plantillas_plan" (
	"id" serial PRIMARY KEY NOT NULL,
	"ambito" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"datos" jsonb NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plantillas_plan_ambito_nombre_uq" ON "plantillas_plan" USING btree ("ambito","nombre");