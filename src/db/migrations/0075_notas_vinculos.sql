CREATE TABLE "notas_vinculos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_nota" integer NOT NULL,
	"tipo" varchar(12) NOT NULL,
	"id_destino" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notas_vinculos" ADD CONSTRAINT "notas_vinculos_id_nota_notas_id_fk" FOREIGN KEY ("id_nota") REFERENCES "public"."notas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notas_vinculos_uq" ON "notas_vinculos" USING btree ("id_nota","tipo","id_destino");--> statement-breakpoint
CREATE INDEX "notas_vinculos_destino_idx" ON "notas_vinculos" USING btree ("tipo","id_destino");--> statement-breakpoint
INSERT INTO "notas_vinculos" ("id_nota", "tipo", "id_destino") SELECT "id", 'expediente', "id_expediente" FROM "notas" WHERE "id_expediente" IS NOT NULL;--> statement-breakpoint
INSERT INTO "notas_vinculos" ("id_nota", "tipo", "id_destino") SELECT "id", 'cliente', "id_cliente" FROM "notas" WHERE "id_cliente" IS NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "notas_expediente_idx";--> statement-breakpoint
ALTER TABLE "notas" DROP COLUMN "id_expediente";--> statement-breakpoint
ALTER TABLE "notas" DROP COLUMN "id_cliente";
