/**
 * Aspecto de un coche en las tablas: borde de la cápsula de marca y modelo, y símbolo y color del punto. Lo definen la marca y el estado
 * del vehículo; en el estado se elige cuál prevalece cuando los dos tienen algo (el que prevalece va primero y el otro rellena lo que falte).
 */
export interface AspectoMarca {
  color: string | null;
  punto: string | null;
  punto_color: string | null;
}

export interface AspectoEstado {
  capsula_color: string | null;
  punto: string | null;
  punto_color: string | null;
  prevalece: "marca" | "estado";
}

export interface AspectoVehiculo {
  capsula: string | null;
  punto: string | null;
  puntoColor: string | null;
}

export function aspectoVehiculo(marca: AspectoMarca | null | undefined, estado: AspectoEstado | null | undefined): AspectoVehiculo {
  const m = { capsula: marca?.color || null, punto: marca?.punto || null, puntoColor: marca?.punto_color || null };
  const e = { capsula: estado?.capsula_color || null, punto: estado?.punto || null, puntoColor: estado?.punto_color || null };
  const [primero, segundo] = estado?.prevalece === "estado" ? [e, m] : [m, e];
  return { capsula: primero.capsula ?? segundo.capsula, punto: primero.punto ?? segundo.punto, puntoColor: primero.puntoColor ?? segundo.puntoColor };
}
