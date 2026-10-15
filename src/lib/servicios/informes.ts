import { and, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { estadoVehiculo, expedientes, marcas, modelos, tipoDeVenta, usuarios } from "@/db/schema";
import type { Centimos, Centesimas } from "@/lib/comisiones";
import { calcularVendedorMes, cargarExpedientesMotor } from "./liquidaciones";

export const esquemaInforme = z.object({
  desde: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  hasta: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  idVendedor: z.number().int().positive().optional(),
  idMarca: z.number().int().positive().optional(),
});
export type FiltroInforme = z.infer<typeof esquemaInforme>;

export interface FilaVendedor {
  idUsuario: number;
  nombre: string;
  matriculados: number;
  puntos: Centesimas;
  bruto: Centimos;
  neto: Centimos;
  tramoMedio: number | null;
}

export interface Distribucion {
  nombre: string;
  total: number;
}

export interface Informe {
  filtro: FiltroInforme;
  meses: string[];
  totales: { matriculados: number; pedidosCartera: number; puntos: Centesimas; bruto: Centimos; neto: Centimos; financiados: number; ratioFinanciacion: number };
  porVendedor: FilaVendedor[];
  porMarca: Distribucion[];
  porFormaPago: Distribucion[];
  matriculados: { id: number; matricula: string | null; fecha: string; vendedor: string | null; modelo: string | null; marca: string | null; tipoVenta: string | null }[];
  cartera: { id: number; fechaPedido: string | null; vendedor: string | null; modelo: string | null; marca: string | null; tipoVenta: string | null }[];
  /** Expedientes con borrado lógico del periodo: no cuentan en comisiones, pero se conservan para estadística. */
  eliminados: { total: number; porFormaPago: Distribucion[]; porVendedor: Distribucion[] };
  avisos: string[];
}

function mesesEntre(desde: string, hasta: string): string[] {
  const res: string[] = [];
  let [a, m] = desde.split("-").map(Number);
  const [af, mf] = hasta.split("-").map(Number);
  while ((a < af || (a === af && m <= mf)) && res.length < 60) {
    res.push(`${a}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return res;
}

/** Todas las cifras económicas y de puntos salen de `calcularMes` (un único motor). */
export async function generarInforme(ej: Ejecutor, filtro: FiltroInforme, soloVendedor?: number): Promise<Informe> {
  const meses = mesesEntre(filtro.desde, filtro.hasta);
  const idVendedor = soloVendedor ?? filtro.idVendedor;
  const [anioFin, mesFin] = meses[meses.length - 1].split("-").map(Number);
  const finMes = `${meses[meses.length - 1]}-${String(new Date(Date.UTC(anioFin, mesFin, 0)).getUTCDate()).padStart(2, "0")}`;
  const inicio = `${meses[0]}-01`;

  const filasExp = await ej
    .select({
      e: expedientes,
      vendedor: usuarios.nombre,
      modelo: modelos.nombreModelo,
      marcaId: modelos.marcaId,
      marca: marcas.nombre,
      tipo: tipoDeVenta.nombreTipoVenta,
      categoria: tipoDeVenta.categoria,
      clase: estadoVehiculo.clase,
    })
    .from(expedientes)
    .leftJoin(usuarios, eq(usuarios.idUsuario, expedientes.idUsuario))
    .leftJoin(modelos, eq(modelos.idModelo, expedientes.idModelo))
    .leftJoin(marcas, eq(marcas.idMarca, modelos.marcaId))
    .leftJoin(tipoDeVenta, eq(tipoDeVenta.idTipoDeVenta, expedientes.idTipoDeVenta))
    .leftJoin(estadoVehiculo, eq(estadoVehiculo.idEstadoVehiculo, expedientes.idEstadoVehiculo))
    .where(
      and(
        isNull(expedientes.eliminadoEn),
        idVendedor ? eq(expedientes.idUsuario, idVendedor) : undefined,
        filtro.idMarca ? eq(modelos.marcaId, filtro.idMarca) : undefined,
        or(
          and(gte(expedientes.fechaMatriculacion, inicio), lte(expedientes.fechaMatriculacion, finMes)),
          and(gte(expedientes.fechaFacturacion, inicio), lte(expedientes.fechaFacturacion, finMes)),
          and(gte(expedientes.fechaCobrado, inicio), lte(expedientes.fechaCobrado, finMes)),
          and(isNull(expedientes.fechaMatriculacion), isNull(expedientes.fechaCobrado)),
        ),
      ),
    );

  const fechaCuenta = (x: (typeof filasExp)[number]) => (x.clase === "VO" || x.e.cobradoOtraFecha ? x.e.fechaCobrado : (x.e.fechaFacturacion ?? x.e.fechaMatriculacion));
  const enPeriodo = (d: string | null) => d !== null && d >= inicio && d <= finMes;
  const matriculadosFilas = filasExp.filter((x) => enPeriodo(fechaCuenta(x)));
  const carteraFilas = filasExp.filter((x) => fechaCuenta(x) === null && x.e.fechaExpediente !== null);

  const conteo = (items: string[]): Distribucion[] => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
    return [...m].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);
  };

  const filasEliminadas = await ej
    .select({ vendedor: usuarios.nombre, tipo: tipoDeVenta.nombreTipoVenta })
    .from(expedientes)
    .leftJoin(usuarios, eq(usuarios.idUsuario, expedientes.idUsuario))
    .leftJoin(modelos, eq(modelos.idModelo, expedientes.idModelo))
    .leftJoin(tipoDeVenta, eq(tipoDeVenta.idTipoDeVenta, expedientes.idTipoDeVenta))
    .where(
      and(
        isNotNull(expedientes.eliminadoEn),
        idVendedor ? eq(expedientes.idUsuario, idVendedor) : undefined,
        filtro.idMarca ? eq(modelos.marcaId, filtro.idMarca) : undefined,
        or(
          and(gte(expedientes.fechaMatriculacion, inicio), lte(expedientes.fechaMatriculacion, finMes)),
          and(gte(expedientes.fechaExpediente, inicio), lte(expedientes.fechaExpediente, finMes)),
        ),
      ),
    );

  // Motor: un cálculo por vendedor y mes
  const vendedoresIds = idVendedor
    ? [idVendedor]
    : (await ej.select({ id: usuarios.idUsuario }).from(usuarios)).map((u) => u.id);
  const avisos: string[] = [];
  const porVendedor: FilaVendedor[] = [];
  let puntos = 0;
  let bruto = 0;
  let neto = 0;
  for (const id of vendedoresIds) {
    const [u] = await ej.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.idUsuario, id));
    let p = 0;
    let b = 0;
    let n = 0;
    let tramos = 0;
    let nMeses = 0;
    const expedientesMotor = await cargarExpedientesMotor(ej, id, { desde: meses[0], hasta: meses[meses.length - 1] });
    for (const mes of meses) {
      const r = await calcularVendedorMes(ej, id, mes, expedientesMotor);
      if (!r || r.idPlan === null) continue;
      if (r.lineas.length === 0) continue;
      p += r.puntosMes;
      b += r.bruto;
      n += r.neto;
      tramos += r.tramo;
      nMeses += 1;
      avisos.push(...r.avisos.map((a) => `${u?.nombre ?? id} · ${mes}: ${a}`));
    }
    const mat = matriculadosFilas.filter((x) => x.e.idUsuario === id).length;
    if (nMeses === 0 && mat === 0) continue;
    puntos += p;
    bruto += b;
    neto += n;
    porVendedor.push({ idUsuario: id, nombre: u?.nombre ?? `Usuario ${id}`, matriculados: mat, puntos: p, bruto: b, neto: n, tramoMedio: nMeses ? Math.round((tramos * 10) / nMeses) / 10 : null });
  }
  porVendedor.sort((a, b) => b.neto - a.neto);

  const financiados = matriculadosFilas.filter((x) => x.categoria && x.categoria !== "CONTADO").length;
  return {
    filtro,
    meses,
    totales: {
      matriculados: matriculadosFilas.length,
      pedidosCartera: carteraFilas.length,
      puntos,
      bruto,
      neto,
      financiados,
      ratioFinanciacion: matriculadosFilas.length ? Math.round((financiados * 10000) / matriculadosFilas.length) / 100 : 0,
    },
    porVendedor,
    porMarca: conteo(matriculadosFilas.map((x) => x.marca ?? "Sin marca")),
    porFormaPago: conteo(matriculadosFilas.map((x) => x.tipo ?? "Sin definir")),
    matriculados: matriculadosFilas.map((x) => ({ id: x.e.idExpediente, matricula: x.e.matricula, fecha: fechaCuenta(x) as string, vendedor: x.vendedor, modelo: x.modelo, marca: x.marca, tipoVenta: x.tipo })).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    cartera: carteraFilas.map((x) => ({ id: x.e.idExpediente, fechaPedido: x.e.fechaExpediente, vendedor: x.vendedor, modelo: x.modelo, marca: x.marca, tipoVenta: x.tipo })),
    eliminados: {
      total: filasEliminadas.length,
      porFormaPago: conteo(filasEliminadas.map((x) => x.tipo ?? "Sin definir")),
      porVendedor: conteo(filasEliminadas.map((x) => x.vendedor ?? "Sin vendedor")),
    },
    avisos,
  };
}

