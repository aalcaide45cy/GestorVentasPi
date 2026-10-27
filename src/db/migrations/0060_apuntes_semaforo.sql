ALTER TABLE "apuntes_expediente" ADD COLUMN "estado_semaforo" integer;--> statement-breakpoint
ALTER TABLE "apuntes_predefinidos" ADD COLUMN "por_defecto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "apuntes_predefinidos" ADD COLUMN "semaforo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "apuntes_predefinidos" ADD COLUMN "semaforo_estados" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "apuntes_predefinidos" ADD COLUMN "lado" varchar(10) DEFAULT 'derecha' NOT NULL;--> statement-breakpoint
-- El Seguro pasa a ser un semáforo que llevan todos los expedientes: rojo = aún no solicitado, amarillo = solicitado pero sin póliza emitida, verde = póliza emitida
UPDATE "apuntes_predefinidos" SET
  "por_defecto" = true,
  "semaforo" = true,
  "mostrar_etiqueta" = true,
  "lado" = 'derecha',
  "descripcion" = 'Estado del seguro del coche.',
  "semaforo_estados" = '[{"color":"#ef4444","texto":"Seguro aún no solicitado"},{"color":"#eab308","texto":"Solicitado, póliza aún no emitida"},{"color":"#22c55e","texto":"Póliza emitida"}]'::jsonb
WHERE "clave" = 'seguro';
--> statement-breakpoint
-- A los apuntes que ya existían de Seguro se les pone el estado «rojo»
UPDATE "apuntes_expediente" a SET "estado_semaforo" = 0, "mostrar_etiqueta" = true, "color" = '#ef4444'
FROM "apuntes_predefinidos" p WHERE a."id_predefinido" = p."id" AND p."clave" = 'seguro' AND a."estado_semaforo" IS NULL;
--> statement-breakpoint
-- Todos los expedientes que ya hay reciben los apuntes «por defecto» (el Seguro) si no los tenían
INSERT INTO "apuntes_expediente" ("id_expediente", "id_predefinido", "titulo", "descripcion", "etiqueta", "color", "mostrar_etiqueta", "estado_semaforo")
SELECT e."id_expediente", p."id", p."titulo", p."descripcion", p."etiqueta",
       CASE WHEN p."semaforo" THEN p."semaforo_estados"->0->>'color' ELSE p."color" END,
       p."mostrar_etiqueta", CASE WHEN p."semaforo" THEN 0 ELSE NULL END
FROM "expedientes" e CROSS JOIN "apuntes_predefinidos" p
WHERE p."por_defecto" = true
ON CONFLICT ("id_expediente", "id_predefinido") WHERE "id_predefinido" IS NOT NULL DO NOTHING;
--> statement-breakpoint
-- Los expedientes nuevos (de cualquier origen: a mano, importados, duplicados, creados desde un pedido) reciben solos los apuntes «por defecto»
CREATE OR REPLACE FUNCTION "apuntes_por_defecto"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "apuntes_expediente" ("id_expediente", "id_predefinido", "titulo", "descripcion", "etiqueta", "color", "mostrar_etiqueta", "estado_semaforo")
  SELECT NEW."id_expediente", p."id", p."titulo", p."descripcion", p."etiqueta",
         CASE WHEN p."semaforo" THEN p."semaforo_estados"->0->>'color' ELSE p."color" END,
         p."mostrar_etiqueta", CASE WHEN p."semaforo" THEN 0 ELSE NULL END
  FROM "apuntes_predefinidos" p WHERE p."por_defecto" = true
  ON CONFLICT ("id_expediente", "id_predefinido") WHERE "id_predefinido" IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "apuntes_por_defecto_trg" ON "expedientes";
--> statement-breakpoint
CREATE TRIGGER "apuntes_por_defecto_trg" AFTER INSERT ON "expedientes" FOR EACH ROW EXECUTE FUNCTION "apuntes_por_defecto"();
