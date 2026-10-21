ALTER TABLE "biblioteca" ADD COLUMN "id_cliente" integer;--> statement-breakpoint
ALTER TABLE "biblioteca" ADD COLUMN "id_expediente" integer;--> statement-breakpoint
ALTER TABLE "biblioteca" ADD CONSTRAINT "biblioteca_id_cliente_clientes_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biblioteca" ADD CONSTRAINT "biblioteca_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "biblioteca_cliente_idx" ON "biblioteca" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX "biblioteca_expediente_idx" ON "biblioteca" USING btree ("id_expediente");