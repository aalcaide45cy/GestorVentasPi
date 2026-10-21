-- La biblioteca ya no tiene claves foráneas (0047). Para que al borrar un cliente o un expediente suelto sus archivos queden «sin asignar»
-- (como hacía ON DELETE SET NULL), se quita la asignación con disparadores de fila. TRUNCATE no los activa: eso lo hace vaciarBaseDeDatos.
CREATE OR REPLACE FUNCTION biblioteca_soltar_cliente() RETURNS trigger AS $$
BEGIN
  UPDATE biblioteca SET id_cliente = NULL WHERE id_cliente = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER biblioteca_soltar_cliente AFTER DELETE ON clientes FOR EACH ROW EXECUTE FUNCTION biblioteca_soltar_cliente();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION biblioteca_soltar_expediente() RETURNS trigger AS $$
BEGIN
  UPDATE biblioteca SET id_expediente = NULL WHERE id_expediente = OLD.id_expediente;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER biblioteca_soltar_expediente AFTER DELETE ON expedientes FOR EACH ROW EXECUTE FUNCTION biblioteca_soltar_expediente();
