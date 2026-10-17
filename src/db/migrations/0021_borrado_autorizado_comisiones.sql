-- Borrado autorizado: versiones de liquidación y libro de puntos siguen siendo de solo inserción, salvo cuando el administrador
-- confirma borrar un plan o un usuario con todo lo suyo (la transacción activa app.borrado_autorizado='on', local a ella).
CREATE OR REPLACE FUNCTION proteger_solo_insercion() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('app.borrado_autorizado', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'La tabla % es de solo inserción', TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION proteger_liquidaciones() RETURNS trigger AS $$
BEGIN
  IF coalesce(current_setting('app.recalculo', true), '') = 'on'
     OR coalesce(current_setting('app.restauracion', true), '') = 'on'
     OR (TG_OP = 'DELETE' AND coalesce(current_setting('app.borrado_autorizado', true), '') = 'on') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La tabla % solo se puede modificar durante un recálculo autorizado', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;
