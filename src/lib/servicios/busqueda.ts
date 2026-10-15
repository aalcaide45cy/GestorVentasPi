import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
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

/** Ids de expedientes que coinciden por matrícula, VIN, cliente, DNI, modelo, marca o número. */
async function idsCoincidentes(ej: Ejecutor, q: string, limite?: number): Promise<number[]> {
  const patron = `%${escaparLike(q.trim())}%`;
  const consulta = ej
    .selectDistinct({ id: expedientes.idExpediente })
    .from(expedientes)
    .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
    .leftJoin(modelos, eq(modelos.idModelo, expedientes.idModelo))
    .leftJoin(marcas, eq(marcas.idMarca, modelos.marcaId))
    .where(
      and(
        isNull(expedientes.eliminadoEn),
      or(
        ilike(expedientes.matricula, patron),
        ilike(expedientes.vin, patron),
        ilike(clientes.nombre, patron),
        ilike(clientes.dni, patron),
        ilike(modelos.nombreModelo, patron),
        ilike(marcas.nombre, patron),
        sql`${expedientes.idExpediente}::text like ${patron}`,
      ),
      ),
    )
    .orderBy(desc(expedientes.idExpediente));
  const filas = await (limite ? consulta.limit(limite) : consulta);
  return filas.map((f) => f.id);
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
        label: `#EXP-${String(e.idExpediente).padStart(4, "0")} - ${cliente} - ${marca} ${modelo}${matricula}`,
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
