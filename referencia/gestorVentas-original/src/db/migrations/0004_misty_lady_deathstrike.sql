ALTER TABLE "estado_vehiculo" ADD COLUMN "predeterminado" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "expedientes" ADD COLUMN "vin" varchar(100);--> statement-breakpoint
ALTER TABLE "tipo_de_venta" ADD COLUMN "color" varchar(50) DEFAULT '#3b82f6';