ALTER TABLE "apuntes_predefinidos" ADD COLUMN "estado_inicial" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- El disparador que añade los apuntes «por defecto» a los expedientes nuevos empieza ahora en el estado inicial configurado de cada semáforo
CREATE OR REPLACE FUNCTION "apuntes_por_defecto"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "apuntes_expediente" ("id_expediente", "id_predefinido", "titulo", "descripcion", "etiqueta", "color", "mostrar_etiqueta", "estado_semaforo")
  SELECT NEW."id_expediente", p."id", p."titulo", p."descripcion", p."etiqueta",
         CASE WHEN p."semaforo" THEN COALESCE(p."semaforo_estados"->LEAST(p."estado_inicial", GREATEST(jsonb_array_length(p."semaforo_estados") - 1, 0))->>'color', p."color") ELSE p."color" END,
         p."mostrar_etiqueta",
         CASE WHEN p."semaforo" THEN LEAST(p."estado_inicial", GREATEST(jsonb_array_length(p."semaforo_estados") - 1, 0)) ELSE NULL END
  FROM "apuntes_predefinidos" p WHERE p."por_defecto" = true
  ON CONFLICT ("id_expediente", "id_predefinido") WHERE "id_predefinido" IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
