ALTER TABLE "plantillas_plan" ADD COLUMN "sistema" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- «Grabado a fuego»: las marcas, los modelos y las plantillas base no se pueden borrar nunca (ni de verdad ni con borrado lógico), ni desde la aplicación
-- ni con «Borrar todo». (TRUNCATE no activa estos disparadores, por eso ninguna limpieza masiva de la aplicación lo usa sobre estas tablas.)
CREATE OR REPLACE FUNCTION proteger_grabado_a_fuego() RETURNS trigger AS $$
BEGIN
  -- Única excepción: restaurar una copia completa (la transacción activa app.restauracion_completa='on', local a ella), que vuelve a cargar lo mismo que había
  IF coalesce(current_setting('app.restauracion_completa', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'marcas' OR TG_TABLE_NAME = 'modelos' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Las marcas y los modelos están grabados a fuego y no se pueden borrar.' USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.eliminado_en IS NULL AND NEW.eliminado_en IS NOT NULL THEN
      RAISE EXCEPTION 'Las marcas y los modelos están grabados a fuego y no se pueden eliminar.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  -- Plantillas base (sistema = true)
  IF TG_OP = 'DELETE' AND OLD.sistema THEN
    RAISE EXCEPTION 'Las plantillas base están grabadas a fuego y no se pueden borrar.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.sistema AND NOT NEW.sistema THEN
    RAISE EXCEPTION 'Las plantillas base están grabadas a fuego: no se les puede quitar la marca de base.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS fuego_marcas ON marcas;
--> statement-breakpoint
CREATE TRIGGER fuego_marcas BEFORE DELETE OR UPDATE ON marcas FOR EACH ROW EXECUTE FUNCTION proteger_grabado_a_fuego();
--> statement-breakpoint
DROP TRIGGER IF EXISTS fuego_modelos ON modelos;
--> statement-breakpoint
CREATE TRIGGER fuego_modelos BEFORE DELETE OR UPDATE ON modelos FOR EACH ROW EXECUTE FUNCTION proteger_grabado_a_fuego();
--> statement-breakpoint
DROP TRIGGER IF EXISTS fuego_plantillas_tarifas ON plantillas_tarifas_vn;
--> statement-breakpoint
CREATE TRIGGER fuego_plantillas_tarifas BEFORE DELETE OR UPDATE ON plantillas_tarifas_vn FOR EACH ROW EXECUTE FUNCTION proteger_grabado_a_fuego();
--> statement-breakpoint
DROP TRIGGER IF EXISTS fuego_plantillas_plan ON plantillas_plan;
--> statement-breakpoint
CREATE TRIGGER fuego_plantillas_plan BEFORE DELETE OR UPDATE ON plantillas_plan FOR EACH ROW EXECUTE FUNCTION proteger_grabado_a_fuego();
