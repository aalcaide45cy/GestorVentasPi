CREATE TABLE "alias_modelos" (
	"id" serial PRIMARY KEY NOT NULL,
	"alias" text NOT NULL,
	"id_modelo" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alias_modelos" ADD CONSTRAINT "alias_modelos_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alias_modelos_alias_uq" ON "alias_modelos" USING btree ("alias");