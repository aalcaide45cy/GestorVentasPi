-- El semáforo del Seguro gana un cuarto estado «apagado»: la palabra SEGURO se ve en gris y tenue (no lleva seguro). Solo si todavía tiene los tres estados de salida.
UPDATE "apuntes_predefinidos"
SET "semaforo_estados" = "semaforo_estados" || '[{"color":"#9ca3af","texto":"No lleva seguro","apagado":true}]'::jsonb
WHERE "clave" = 'seguro' AND "semaforo" = true AND jsonb_array_length("semaforo_estados") = 3;
