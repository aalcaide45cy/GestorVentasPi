import { and, desc, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { clientes, expedientes, marcas, modelos } from "@/db/schema";
import type { ClienteDto, ExpedienteDto } from "@/lib/dto";
import { escaparLike } from "./comun";
import { aDto, relacionesExpediente } from "./expedientes";
import { clienteDto } from "./mapeos";

export interface SugerenciasBusqueda {
  clientes: { id: number; nombre: string | null; dni: string | null; label: string }[];
  expedientes: { id_expediente: number; label: string }[];
}

/**
 * Ids de expedientes que coinciden por matrícula, VIN, cliente, DNI, modelo, marca o número exacto. Cada criterio es una
 * consulta propia (con su índice de trigramas) y se mezclan los más recientes: un único OR sobre varias tablas obligaba a
 * recorrer todos los expedientes, que con un millón tardaba segundos.
 */
async function idsCoincidentes(ej: Ejecutor, q: string, limite = 100): Promise<number[]> {
  const texto = q.trim();
  const patron = `%${escaparLike(texto)}%`;
  const vivo = isNull(expedientes.eliminadoEn);
  const primeros = (condicion: SQL | undefined) =>
    ej
      .select({ id: expedientes.idExpediente })
      .from(expedientes)
      .where(and(vivo, condicion))
      .orderBy(desc(expedientes.idExpediente))
      .limit(limite);
  // Los clientes y modelos que coinciden se resuelven antes (son pocos): con una subconsulta, si no coincide ninguno el
  // planificador recorre al revés todos los expedientes buscando uno, que con un millón son segundos.
  const [clientesQue, modelosQue] = await Promise.all([
    ej
      .select({ id: clientes.id })
      .from(clientes)
      .where(and(isNull(clientes.eliminadoEn), or(ilike(clientes.nombre, patron), ilike(clientes.dni, patron))))
      .limit(500),
    ej
      .select({ id: modelos.idModelo })
      .from(modelos)
      .leftJoin(marcas, eq(marcas.idMarca, modelos.marcaId))
      .where(or(ilike(modelos.nombreModelo, patron), ilike(marcas.nombre, patron))),
  ]);
  const consultas = [
    primeros(ilike(expedientes.matricula, patron)),
    primeros(ilike(expedientes.vin, patron)),
    ...(clientesQue.length ? [primeros(inArray(expedientes.idCliente, clientesQue.map((c) => c.id)))] : []),
    ...(modelosQue.length ? [primeros(inArray(expedientes.idModelo, modelosQue.map((m) => m.id)))] : []),
    ...(/^\d{1,9}$/.test(texto) ? [primeros(eq(expedientes.idExpediente, Number(texto)))] : []),
  ];
  const ids = new Set<number>();
  for (const filas of await Promise.all(consultas)) for (const f of filas) ids.add(f.id);
  return [...ids].sort((a, b) => b - a).slice(0, limite);
}

export async function sugerencias(ej: Ejecutor, q: string): Promise<SugerenciasBusqueda> {
  if (!q.trim()) return { clientes: [], expedientes: [] };
  const patron = `%${escaparLike(q.trim())}%`;

  const cs = await ej
    .select()
    .from(clientes)
    .where(and(isNull(clientes.eliminadoEn), or(ilike(clientes.nombre, patron), ilike(clientes.dni, patron))))
    .limit(5);

  const ids = await idsCoincidentes(ej, q, 5);
  const exps = ids.length
    ? await ej.query.expedientes.findMany({
        where: inArray(expedientes.idExpediente, ids),
        orderBy: [desc(expedientes.idExpediente)],
        with: { cliente: true, modelo: { with: { marca: true } } },
      })
    : [];

  return {
    clientes: cs.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      dni: c.dni,
      label: `${c.nombre} (${c.dni || "DNI N/D"})`,
    })),
    expedientes: exps.map((e) => {
      const modelo = e.modelo?.nombreModelo || "VO";
      const marca = e.modelo?.marca?.nombre || "";
      const cliente = e.cliente?.nombre || "Sin Cliente";
      const matricula = e.matricula ? ` [${e.matricula}]` : "";
      return {
        id_expediente: e.idExpediente,
        label: `#EXP-${String(e.idExpediente).padStart(4, "0")} - ${cliente} - ${marca} ${modelo}${matricula}${/anulad/i.test(e.estadoIntranet ?? "") ? " · ANULADO" : ""}${e.deshabilitado ? " · DESHABILITADO" : ""}`,
      };
    }),
  };
}

/** Resultados completos para `/dashboard/buscar`: clientes y expedientes con las columnas de la lista. */
export async function resultadosBusqueda(
  ej: Ejecutor,
  q: string,
): Promise<{ clientes: ClienteDto[]; expedientes: ExpedienteDto[] }> {
  if (!q.trim()) return { clientes: [], expedientes: [] };
  const patron = `%${escaparLike(q.trim())}%`;
  const cs = await ej.query.clientes.findMany({
    where: and(isNull(clientes.eliminadoEn), or(ilike(clientes.nombre, patron), ilike(clientes.dni, patron))),
    with: { emails: true, telefonos: true },
    limit: 50,
  });
  const ids = await idsCoincidentes(ej, q, 100);
  const exps = ids.length
    ? await ej.query.expedientes.findMany({
        where: inArray(expedientes.idExpediente, ids),
        orderBy: [desc(expedientes.idExpediente)],
        with: relacionesExpediente,
      })
    : [];
  return { clientes: cs.map(clienteDto), expedientes: exps.map(aDto) };
}
