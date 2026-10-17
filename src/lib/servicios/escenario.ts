import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { clientes, expedientes as tablaExpedientes, marcas, modelos } from "@/db/schema";
import { aplicarEscenario, calcularMes, contarCambios, mesDe, type CambiosEscenario, type ResultadoMes } from "@/lib/comisiones";
import { fechaQueCuenta } from "@/lib/comisiones/util";
import { HttpError } from "@/lib/auth/sesion";
import { cargarExpedientesMotor, cargarVendedor, planDelMes } from "./liquidaciones";

const entero = z.number().int().min(-1_000_000_000).max(1_000_000_000);
const mapa = <T extends z.ZodTypeAny>(valor: T) => z.record(z.string().regex(/^\d+$/), valor);

export const esquemaCambios = z.object({
  objetivoBase: entero.optional(),
  arrastre: entero.optional(),
  puntosPorPedido: entero.optional(),
  penalizacionImporte: entero.optional(),
  tramoMin: z.number().int().min(-20).max(0).optional(),
  tramoMax: z.number().int().min(0).max(20).optional(),
  tasas: mapa(z.object({ objetivo: entero.optional(), tipoTasa: z.enum(["porcentaje", "unidades"]).optional(), puntosDefecto: entero.optional() })).optional(),
  reglas: mapa(z.object({ activa: z.boolean().optional(), importe: entero.optional(), puntos: entero.optional() })).optional(),
  promociones: mapa(z.object({ puntosEspeciales: entero.optional(), minimoUnidades: entero.optional(), puntosSiNoCumple: entero.optional() })).optional(),
  tarifas: z.array(z.object({ idModelo: z.number().int().positive(), tasaCumplida: z.boolean(), tramo: z.number().int().min(-20).max(20), importe: entero })).max(500).optional(),
});

export const esquemaEscenario = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes no válido (AAAA-MM)"),
  cambios: esquemaCambios.default({}),
});

/** Valores actuales del plan que el laboratorio permite tocar (para rellenar sus controles). */
export interface PlanEditableEscenario {
  idPlan: number;
  nombre: string | null;
  objetivoBase: number;
  arrastre: number;
  puntosPorPedido: number;
  penalizacionImporte: number;
  tramoMin: number;
  tramoMax: number;
  tasas: { idMarca: number; nombre: string; tipoTasa: "porcentaje" | "unidades"; objetivo: number; puntosDefecto: number }[];
  reglas: { id: number; nombre: string; evento: string; importe: number; puntos: number; activa: boolean; esPenalizacion: boolean }[];
  promociones: { id: number; nombre: string; puntosEspeciales: number; minimoUnidades: number; puntosSiNoCumple: number }[];
  /** Tarifas VN de los modelos que cuentan en el mes (cumplida y no cumplida), con todos sus tramos. */
  tarifas: { idModelo: number; nombre: string; tasaCumplida: boolean; importes: Record<string, number> }[];
}

export interface RespuestaEscenario {
  hayPlan: boolean;
  plan: PlanEditableEscenario | null;
  /** Resultado con el plan real. */
  base: ResultadoMes | null;
  /** Resultado con los cambios aplicados. */
  escenario: ResultadoMes | null;
  cambios: number;
  /** Datos legibles de los expedientes que aparecen en el resultado y en los avisos (cliente, vehículo, matrícula). */
  expedientes: Record<string, { cliente: string; vehiculo: string; matricula: string | null }>;
}

/** Cliente, vehículo y matrícula de unos expedientes, para enseñar «Martín Álvaro · Renault Austral» en vez de un número. */
export async function describirExpedientes(ej: Ejecutor, ids: number[]): Promise<RespuestaEscenario["expedientes"]> {
  const unicos = [...new Set(ids)].slice(0, 500);
  if (unicos.length === 0) return {};
  const filas = await ej
    .select({ id: tablaExpedientes.idExpediente, cliente: clientes.nombre, marca: marcas.nombre, modelo: modelos.nombreModelo, matricula: tablaExpedientes.matricula })
    .from(tablaExpedientes)
    .leftJoin(clientes, eq(clientes.id, tablaExpedientes.idCliente))
    .leftJoin(modelos, eq(modelos.idModelo, tablaExpedientes.idModelo))
    .leftJoin(marcas, eq(marcas.idMarca, modelos.marcaId))
    .where(inArray(tablaExpedientes.idExpediente, unicos));
  return Object.fromEntries(
    filas.map((f) => [String(f.id), { cliente: f.cliente?.trim() || "Sin cliente", vehiculo: [f.marca, f.modelo].filter(Boolean).join(" ") || "sin modelo", matricula: f.matricula ?? null }]),
  );
}

/** Calcula un mes con el plan real y con los cambios hipotéticos, sin guardar nada. */
export async function calcularEscenario(ej: Ejecutor, idVendedor: number, mes: string, cambios: CambiosEscenario): Promise<RespuestaEscenario> {
  const vendedor = await cargarVendedor(ej, idVendedor);
  if (!vendedor) throw new HttpError(404, "Vendedor no encontrado");
  const plan = await planDelMes(ej, mes);
  if (!plan) return { hayPlan: false, plan: null, base: null, escenario: null, cambios: 0, expedientes: {} };
  const expedientes = await cargarExpedientesMotor(ej, idVendedor, { desde: mes, hasta: mes });
  const base = calcularMes(plan, vendedor, mes, expedientes);
  const escenario = calcularMes(aplicarEscenario(plan, idVendedor, cambios), vendedor, mes, expedientes);

  const modelosEnJuego = new Set(expedientes.filter((e) => e.idVendedor === idVendedor && e.clase === "VN" && e.idModelo !== null && mesDe(fechaQueCuenta(e).fecha) === mes).map((e) => e.idModelo as number));
  const objetivo = plan.objetivos[idVendedor] ?? { base: 0, arrastre: 0 };
  const descripcion: PlanEditableEscenario = {
    idPlan: plan.idPlan,
    nombre: plan.nombre ?? null,
    objetivoBase: objetivo.base,
    arrastre: objetivo.arrastre,
    puntosPorPedido: plan.puntosPorPedido,
    penalizacionImporte: plan.penalizacionImporte,
    tramoMin: plan.tramoMin,
    tramoMax: plan.tramoMax,
    tasas: plan.tasaIntervencionPorMarca.map((t) => ({ idMarca: t.idMarca, nombre: plan.nombresMarca?.[t.idMarca] ?? `Marca ${t.idMarca}`, tipoTasa: t.tipoTasa, objetivo: t.objetivo, puntosDefecto: plan.puntosPorDefectoMarca[t.idMarca] ?? 100 })),
    reglas: plan.reglasYBonus.map((r) => ({ id: r.id, nombre: r.nombre, evento: r.evento, importe: r.importe, puntos: r.puntos, activa: r.activa !== false, esPenalizacion: r.esPenalizacion })),
    promociones: plan.promociones.map((x) => ({ id: x.id, nombre: x.nombre ?? `Promoción ${x.id}`, puntosEspeciales: x.puntosEspeciales, minimoUnidades: x.minimoUnidades, puntosSiNoCumple: x.puntosSiNoCumple })),
    tarifas: [...modelosEnJuego].sort((a, b) => a - b).flatMap((idModelo) =>
      [true, false].map((tasaCumplida) => ({
        idModelo,
        nombre: plan.nombresModelo?.[idModelo] ?? `Modelo ${idModelo}`,
        tasaCumplida,
        importes: plan.tarifasVN.find((t) => t.idModelo === idModelo && t.tasaCumplida === tasaCumplida)?.importes ?? {},
      })),
    ),
  };
  const ids = [...escenario.lineas.map((l) => l.idExpediente), ...escenario.avisos.flatMap((a) => [...a.matchAll(/Expediente (\d+)/g)].map((m) => Number(m[1])))];
  return { hayPlan: true, plan: descripcion, base, escenario, cambios: contarCambios(cambios), expedientes: await describirExpedientes(ej, ids) };
}
