CREATE TABLE "pagos_rci" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer,
	"nombre_archivo" text NOT NULL,
	"id_adjunto" integer,
	"estado" varchar(12) DEFAULT 'pendiente' NOT NULL,
	"motivo" text,
	"numero_operacion" varchar(40),
	"fecha_pago" date,
	"nif" varchar(20),
	"nombre" text,
	"bastidor" varchar(30),
	"matricula" varchar(20),
	"marca" varchar(60),
	"modelo" text,
	"importe_nominal_cent" integer,
	"total_liquido_cent" integer,
	"id_expediente" integer,
	"fecha_rci_anterior" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelto_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pagos_rci" ADD CONSTRAINT "pagos_rci_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_rci" ADD CONSTRAINT "pagos_rci_id_adjunto_adjuntos_id_fk" FOREIGN KEY ("id_adjunto") REFERENCES "public"."adjuntos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_rci" ADD CONSTRAINT "pagos_rci_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pagos_rci_estado_idx" ON "pagos_rci" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "pagos_rci_operacion_idx" ON "pagos_rci" USING btree ("numero_operacion");--> statement-breakpoint
CREATE INDEX "pagos_rci_expediente_idx" ON "pagos_rci" USING btree ("id_expediente");