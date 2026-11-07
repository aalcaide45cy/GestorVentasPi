CREATE TABLE "correo_firmas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"creado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "correo_firmas" ADD CONSTRAINT "correo_firmas_creado_por_usuarios_id_usuario_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correo_plantillas" ADD COLUMN "id_firma" integer;--> statement-breakpoint
ALTER TABLE "correo_plantillas" ADD CONSTRAINT "correo_plantillas_id_firma_correo_firmas_id_fk" FOREIGN KEY ("id_firma") REFERENCES "public"."correo_firmas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DO $$ DECLARE r record; nid integer; BEGIN FOR r IN SELECT id, nombre, firma FROM correo_plantillas WHERE firma ~* '<img' OR btrim(regexp_replace(firma, '<[^>]*>', '', 'g')) <> '' LOOP INSERT INTO correo_firmas (nombre, html) VALUES (left('Firma de ' || r.nombre, 80), r.firma) RETURNING id INTO nid; UPDATE correo_plantillas SET id_firma = nid WHERE id = r.id; END LOOP; END $$;--> statement-breakpoint
ALTER TABLE "correo_plantillas" DROP COLUMN "firma";
