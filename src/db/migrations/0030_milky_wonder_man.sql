CREATE TABLE "historial_cambios" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"grupo" uuid NOT NULL,
	"en" timestamp with time zone DEFAULT now() NOT NULL,
	"id_usuario" integer,
	"accion" text NOT NULL,
	"tabla" text NOT NULL,
	"operacion" varchar(1) NOT NULL,
	"pk" jsonb NOT NULL,
	"antes" jsonb,
	"despues" jsonb,
	"estado" varchar(12) DEFAULT 'aplicado' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "historial_cambios" ADD CONSTRAINT "historial_cambios_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historial_cambios_usuario_idx" ON "historial_cambios" USING btree ("id_usuario","estado","id");--> statement-breakpoint
CREATE INDEX "historial_cambios_grupo_idx" ON "historial_cambios" USING btree ("grupo");
--> statement-breakpoint
-- Registra cada fila cambiada en las tablas que se pueden deshacer, solo si la petición ha fijado su grupo y su usuario
CREATE OR REPLACE FUNCTION historial_registrar() RETURNS trigger AS $fn$
DECLARE
  v_grupo text := nullif(current_setting('app.hist_grupo', true), '');
  v_usuario text := nullif(current_setting('app.hist_usuario', true), '');
  v_fila jsonb;
  v_pk jsonb;
BEGIN
  IF v_grupo IS NULL OR v_usuario IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
    RETURN NULL;
  END IF;
  v_fila := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  SELECT jsonb_object_agg(a.attname, v_fila -> a.attname) INTO v_pk
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
   WHERE i.indrelid = TG_RELID AND i.indisprimary;
  -- Un cambio nuevo descarta lo que se podía rehacer
  IF NOT EXISTS (SELECT 1 FROM historial_cambios WHERE grupo = v_grupo::uuid) THEN
    UPDATE historial_cambios SET estado = 'descartado' WHERE id_usuario = v_usuario::integer AND estado = 'deshecho';
  END IF;
  INSERT INTO historial_cambios (grupo, id_usuario, accion, tabla, operacion, pk, antes, despues)
  VALUES (
    v_grupo::uuid,
    v_usuario::integer,
    coalesce(nullif(current_setting('app.hist_accion', true), ''), 'Cambio'),
    TG_TABLE_NAME,
    left(TG_OP, 1),
    v_pk,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN NULL;
END
$fn$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tiendas', 'marcas', 'modelos', 'alias_modelos', 'tipo_de_venta', 'estado_vehiculo',
    'clientes', 'emails_clientes', 'telefonos_clientes', 'expedientes',
    'commission_plans', 'commission_plan_vendedores', 'promociones_puntos', 'commission_plan_model_rates', 'commission_model_points',
    'commission_used_rates', 'commission_vo_patterns', 'commission_finance_rates', 'commission_preference_rules', 'commission_rules',
    'commission_bonus_rules', 'commission_brand_intervention_rates', 'commission_plan_pending', 'pendientes_cobro',
    'plantillas_tarifas_vn', 'plantillas_plan', 'validaciones_comision'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_historial_%1$s ON %1$I', t);
    -- El nombre empieza por zz: se dispara siempre después de los disparadores de integridad (RI_…), así que un borrado en cascada
    -- registra primero los hijos y luego el padre, y al deshacer se vuelve a crear en el orden correcto
    EXECUTE format('CREATE TRIGGER zz_historial_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION historial_registrar()', t);
  END LOOP;
END
$do$;
--> statement-breakpoint
-- Deshace o rehace un grupo de cambios de un usuario. Si alguna fila ha cambiado después (por otro usuario o por otra vía), lanza
-- HIST_CONFLICTO sin tocar nada, salvo que se fuerce. Las filas se recrean aunque el orden del registro ponga un hijo antes que su
-- padre (un borrado en cascada anota primero el padre): lo que falla por una clave ajena se reintenta cuando ya existe lo demás.
CREATE OR REPLACE FUNCTION historial_aplicar(p_grupo uuid, p_usuario integer, p_direccion text, p_forzar boolean) RETURNS integer AS $fn$
DECLARE
  r historial_cambios;
  v_origen text;
  v_destino text;
  v_cond text;
  v_set text;
  v_actual jsonb;
  v_objetivo jsonb;
  v_esperado jsonb;
  v_pendientes bigint[];
  v_siguientes bigint[];
  v_id bigint;
  v_n integer := 0;
BEGIN
  -- Estos cambios no se anotan en el historial
  PERFORM set_config('app.hist_grupo', '', true);
  v_origen := CASE WHEN p_direccion = 'deshacer' THEN 'aplicado' ELSE 'deshecho' END;
  v_destino := CASE WHEN p_direccion = 'deshacer' THEN 'deshecho' ELSE 'aplicado' END;
  IF NOT EXISTS (SELECT 1 FROM historial_cambios WHERE grupo = p_grupo AND id_usuario = p_usuario AND estado = v_origen) THEN
    RAISE EXCEPTION 'HIST_NO_ENCONTRADO';
  END IF;
  SELECT array_agg(id ORDER BY CASE WHEN p_direccion = 'deshacer' THEN -id ELSE id END) INTO v_pendientes
    FROM historial_cambios WHERE grupo = p_grupo AND estado = v_origen;
  WHILE coalesce(array_length(v_pendientes, 1), 0) > 0 LOOP
    v_siguientes := ARRAY[]::bigint[];
    FOREACH v_id IN ARRAY v_pendientes LOOP
      SELECT * INTO r FROM historial_cambios WHERE id = v_id;
      SELECT string_agg(format('t.%I = %L', k, v), ' AND ') INTO v_cond FROM jsonb_each_text(r.pk) AS e(k, v);
      SELECT string_agg(format('%I = n.%I', column_name, column_name), ', ') INTO v_set
        FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.tabla;
      EXECUTE format('SELECT to_jsonb(t) FROM %I AS t WHERE %s', r.tabla, v_cond) INTO v_actual;
      IF p_direccion = 'deshacer' THEN
        v_esperado := r.despues;
        v_objetivo := r.antes;
      ELSE
        v_esperado := r.antes;
        v_objetivo := r.despues;
      END IF;
      -- Ya está como se quiere (por ejemplo, un hijo que se borró en cascada con su padre)
      IF v_actual IS NOT DISTINCT FROM v_objetivo THEN
        v_n := v_n + 1;
        CONTINUE;
      END IF;
      IF NOT p_forzar AND v_actual IS DISTINCT FROM v_esperado THEN
        RAISE EXCEPTION 'HIST_CONFLICTO' USING DETAIL = r.tabla || ' ' || r.pk::text;
      END IF;
      BEGIN
        IF v_objetivo IS NULL THEN
          EXECUTE format('DELETE FROM %I AS t WHERE %s', r.tabla, v_cond);
        ELSIF v_actual IS NOT NULL THEN
          EXECUTE format('UPDATE %1$I AS t SET %2$s FROM jsonb_populate_record(NULL::%1$I, $1) AS n WHERE %3$s', r.tabla, v_set, v_cond) USING v_objetivo;
        ELSE
          EXECUTE format('INSERT INTO %1$I SELECT * FROM jsonb_populate_record(NULL::%1$I, $1)', r.tabla) USING v_objetivo;
        END IF;
        v_n := v_n + 1;
      EXCEPTION WHEN foreign_key_violation THEN
        v_siguientes := v_siguientes || v_id;
      END;
    END LOOP;
    IF coalesce(array_length(v_siguientes, 1), 0) >= array_length(v_pendientes, 1) THEN
      RAISE EXCEPTION 'HIST_REFERENCIAS' USING DETAIL = 'Hay registros que dependen de otros que ya no existen';
    END IF;
    v_pendientes := v_siguientes;
  END LOOP;
  UPDATE historial_cambios SET estado = v_destino WHERE grupo = p_grupo AND estado = v_origen;
  RETURN v_n;
END
$fn$ LANGUAGE plpgsql;
