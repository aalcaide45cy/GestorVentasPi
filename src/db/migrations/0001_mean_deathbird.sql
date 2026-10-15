CREATE TABLE "codigos_recuperacion" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"codigo_hash" text NOT NULL,
	"usado_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "totp_ultimo_contador" bigint;--> statement-breakpoint
ALTER TABLE "codigos_recuperacion" ADD CONSTRAINT "codigos_recuperacion_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codigos_recuperacion_usuario_idx" ON "codigos_recuperacion" USING btree ("id_usuario");