-- Los apuntes de los expedientes (y el estado de sus semáforos) y los apuntes predefinidos entran en el historial de deshacer y rehacer
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['apuntes_expediente', 'apuntes_predefinidos'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_historial_%1$s ON %1$I', t);
    EXECUTE format('CREATE TRIGGER zz_historial_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION historial_registrar()', t);
  END LOOP;
END
$do$;
--> statement-breakpoint
-- Al deshacer o rehacer con el historial, los apuntes vuelven tal como estaban: el disparador de los apuntes «por defecto» no debe crearlos antes
CREATE OR REPLACE FUNCTION "apuntes_por_defecto"() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.restauracion_completa', true) = 'on' THEN
    RETURN NEW;
  END IF;
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
