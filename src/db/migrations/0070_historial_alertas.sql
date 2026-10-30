-- Las alertas y sus reglas entran en el historial de deshacer y rehacer (borrar una alerta o una regla por error se puede deshacer)
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['alertas_reglas', 'alertas'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_historial_%1$s ON %1$I', t);
    EXECUTE format('CREATE TRIGGER zz_historial_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION historial_registrar()', t);
  END LOOP;
END
$do$;
