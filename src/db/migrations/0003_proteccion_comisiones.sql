-- Protecciones de las liquidaciones, versiones y libro de puntos (sección 12.9.5).
-- Liquidaciones, líneas y conceptos: UPDATE/DELETE solo con app.recalculo='on' o app.restauracion='on'.
CREATE OR REPLACE FUNCTION proteger_liquidaciones() RETURNS trigger AS $$
BEGIN
  IF coalesce(current_setting('app.recalculo', true), '') = 'on'
     OR coalesce(current_setting('app.restauracion', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La tabla % solo se puede modificar durante un recálculo autorizado', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Versiones y libro de puntos: nunca se modifican ni se borran (las copias se restauran con TRUNCATE).
CREATE OR REPLACE FUNCTION proteger_solo_insercion() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción', TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER proteger_commission_liquidations
  BEFORE UPDATE OR DELETE ON commission_liquidations
  FOR EACH ROW EXECUTE FUNCTION proteger_liquidaciones();
--> statement-breakpoint
CREATE TRIGGER proteger_commission_liquidation_lines
  BEFORE UPDATE OR DELETE ON commission_liquidation_lines
  FOR EACH ROW EXECUTE FUNCTION proteger_liquidaciones();
--> statement-breakpoint
CREATE TRIGGER proteger_commission_liquidation_line_items
  BEFORE UPDATE OR DELETE ON commission_liquidation_line_items
  FOR EACH ROW EXECUTE FUNCTION proteger_liquidaciones();
--> statement-breakpoint
CREATE TRIGGER proteger_commission_liquidation_versions
  BEFORE UPDATE OR DELETE ON commission_liquidation_versions
  FOR EACH ROW EXECUTE FUNCTION proteger_solo_insercion();
--> statement-breakpoint
CREATE TRIGGER proteger_libro_puntos
  BEFORE UPDATE OR DELETE ON libro_puntos
  FOR EACH ROW EXECUTE FUNCTION proteger_solo_insercion();
