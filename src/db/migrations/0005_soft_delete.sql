ALTER TABLE "clientes" ADD COLUMN "eliminado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estado_vehiculo" ADD COLUMN "eliminado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expedientes" ADD COLUMN "eliminado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "marcas" ADD COLUMN "eliminado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "modelos" ADD COLUMN "eliminado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tiendas" ADD COLUMN "eliminado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tipo_de_venta" ADD COLUMN "eliminado_en" timestamp with time zone;