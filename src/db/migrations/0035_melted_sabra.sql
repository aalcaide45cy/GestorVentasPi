ALTER TABLE "estado_vehiculo" ADD COLUMN "capsula_color" varchar(50);--> statement-breakpoint
ALTER TABLE "estado_vehiculo" ADD COLUMN "punto" varchar(8);--> statement-breakpoint
ALTER TABLE "estado_vehiculo" ADD COLUMN "punto_color" varchar(50);--> statement-breakpoint
ALTER TABLE "estado_vehiculo" ADD COLUMN "prevalece" varchar(10) DEFAULT 'marca' NOT NULL;