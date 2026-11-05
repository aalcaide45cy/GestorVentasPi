ALTER TABLE "correo_plantillas" ADD COLUMN "id_cuenta" integer;--> statement-breakpoint
ALTER TABLE "correo_plantillas" ADD CONSTRAINT "correo_plantillas_id_cuenta_correo_cuentas_id_fk" FOREIGN KEY ("id_cuenta") REFERENCES "public"."correo_cuentas"("id") ON DELETE set null ON UPDATE no action;
