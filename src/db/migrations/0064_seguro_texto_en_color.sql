-- Las etiquetas del Seguro se pintan con el texto (y los emoticonos) en el color del estado, en vez de una cápsula con relleno: es la forma de que un emoticono escrito en el texto de la etiqueta tome el color del semáforo. Se cambia en Configuración › Expedientes › Semáforo.
UPDATE "apuntes_predefinidos" SET "estilo_etiqueta" = 'texto' WHERE "clave" = 'seguro' AND "estilo_etiqueta" = 'relleno';
