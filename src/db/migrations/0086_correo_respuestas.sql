ALTER TABLE "correo_cuentas" ADD COLUMN "leer_respuestas" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "correo_cuentas" ADD COLUMN "imap_host" varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "correo_cuentas" ADD COLUMN "imap_puerto" integer DEFAULT 993 NOT NULL;--> statement-breakpoint
CREATE TABLE "correo_respuestas" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_potencial" integer,
	"id_cuenta" integer,
	"message_id" varchar(400) NOT NULL,
	"de" varchar(255) DEFAULT '' NOT NULL,
	"asunto" varchar(300) DEFAULT '' NOT NULL,
	"fecha" timestamp with time zone,
	"extracto" text DEFAULT '' NOT NULL,
	"tipo" varchar(8) DEFAULT 'otra' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "correo_respuestas" ADD CONSTRAINT "correo_respuestas_id_potencial_potenciales_id_fk" FOREIGN KEY ("id_potencial") REFERENCES "public"."potenciales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correo_respuestas" ADD CONSTRAINT "correo_respuestas_id_cuenta_correo_cuentas_id_fk" FOREIGN KEY ("id_cuenta") REFERENCES "public"."correo_cuentas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "correo_respuestas_msg_uq" ON "correo_respuestas" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "correo_respuestas_potencial_idx" ON "correo_respuestas" USING btree ("id_potencial");
