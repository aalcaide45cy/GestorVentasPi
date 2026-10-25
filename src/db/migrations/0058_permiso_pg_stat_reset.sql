-- «Contar desde ahora» (panel de rendimiento) pone a cero los contadores de PostgreSQL con pg_stat_reset(), que solo puede ejecutar un administrador de la base de datos.
-- Si el usuario con el que se aplica la migración tiene permiso para darlo, se lo concede al propio usuario de la aplicación; si no (un PostgreSQL con un usuario normal,
-- como el de Homebrew con un rol sin privilegios), no pasa nada: la aplicación explicará cómo darlo a mano.
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION pg_stat_reset() TO %I', current_user);
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END
$$;
