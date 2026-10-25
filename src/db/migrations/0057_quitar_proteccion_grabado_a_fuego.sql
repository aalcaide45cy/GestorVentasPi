-- «Grabado a fuego» pasa a significar otra cosa: las marcas, los modelos (con sus colores) y las plantillas base NO se pueden borrar con «Borrar absolutamente todo»
-- y vienen de serie en una instalación nueva, pero se pueden editar, desactivar y borrar a mano. Se quitan los disparadores que lo impedían a mano.
DROP TRIGGER IF EXISTS fuego_marcas ON marcas;--> statement-breakpoint
DROP TRIGGER IF EXISTS fuego_modelos ON modelos;--> statement-breakpoint
DROP TRIGGER IF EXISTS fuego_plantillas_tarifas ON plantillas_tarifas_vn;--> statement-breakpoint
DROP TRIGGER IF EXISTS fuego_plantillas_plan ON plantillas_plan;--> statement-breakpoint
DROP FUNCTION IF EXISTS proteger_grabado_a_fuego();
