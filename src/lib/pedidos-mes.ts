import type { ExpedienteDto } from "./dto";

export interface PedidosDelMes {
  total: number;
  contado: number;
  credito: number;
  preference: number;
}

/** Los pedidos de un mes (por fecha de pedido) y su reparto en contado, crédito (o renting) y preference. */
export function contarPedidos(
  expedientes: ExpedienteDto[],
  anio: number,
  mes: number,
): PedidosDelMes {
  const r: PedidosDelMes = { total: 0, contado: 0, credito: 0, preference: 0 };
  for (const e of expedientes) {
    const f = e.fecha_expediente;
    if (!f) continue;
    const [a, m] = f.split("-");
    if (Number(a) !== anio || Number(m) !== mes) continue;
    r.total++;
    const categoria = e.tipoDeVenta?.categoria ?? "";
    if (categoria === "CONTADO") r.contado++;
    else if (categoria === "PREFERENCE") r.preference++;
    else if (categoria === "CREDITO" || categoria === "RENTING") r.credito++;
  }
  return r;
}
