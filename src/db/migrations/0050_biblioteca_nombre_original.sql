ALTER TABLE "biblioteca" ADD COLUMN "nombre_original" text;
--> statement-breakpoint
UPDATE "biblioteca" SET "nombre_original" = "nombre" WHERE "nombre_original" IS NULL;