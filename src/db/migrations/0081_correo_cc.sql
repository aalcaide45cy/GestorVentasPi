ALTER TABLE "correo_plantillas" ADD COLUMN "cc" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "correo_plantillas" ADD COLUMN "cco" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "correo_cola" ADD COLUMN "cc" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "correo_cola" ADD COLUMN "cco" text DEFAULT '' NOT NULL;
