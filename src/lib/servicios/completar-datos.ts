import { and, asc, eq, inArray, isNull, max, ne } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { adjuntos, clientes, emailsClientes, estadoVehiculo, expedientes, importacionesBloques, importacionesRegistros, marcas, modelos, pagosRci, telefonosClientes, tipoDeVenta } from "@/db/schema";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import { claveNif, nifParecido, normalizarMatricula } from "@/lib/identificadores";
import { facturacionPorEstadoCobrado } from "@/lib/facturacion-cobrado";
import { hoyIso } from "./comun";
import { conRecalculo } from "./liquidaciones";
import { aplicarReglasSemaforo } from "./reglas-semaforo";
import { reintentarPagosPendientes } from "./pagos-rci";

/**
 * Completar y corregir datos de expedientes que YA existen a partir de los listados del fabricante (Expedientes, Llamadas de
 * calidad…). Nunca crea expedientes, clientes ni modelos: solo propone rellenar huecos o corregir valores distintos, y la persona
 * elige qué aplicar. Todo queda en el log de importaciones y se puede deshacer.
 */

export const CAMPOS_COMPLETAR = ["vin", "matricula", "fecha_expediente", "fecha_afectacion", "fecha_matriculacion", "fecha_primera_matriculacion", "fecha_entrega", "fecha_facturacion", "estado_intranet", "cliente_nombre", "dni", "codigo_postal", "email", "telefono"] as const;
export type CampoCompletar = (typeof CAMPOS_COMPLETAR)[number];

/** Etiquetas del log de importaciones (las mismas que usa la importación de Excel, para poder deshacer ambas). */
export const ETIQUETA_CAMPO: Record<CampoCompletar, string> = {
  vin: "Bastidor",
  matricula: "Matrícula",
  fecha_expediente: "Fecha Expediente",
  fecha_afectacion: "Fecha Afectación",
  fecha_matriculacion: "Fecha Matriculación",
  fecha_primera_matriculacion: "Primera matriculación",
  fecha_entrega: "Fecha Entrega",
  fecha_facturacion: "Fecha Facturación",
  estado_intranet: "Estado en la intranet",
  cliente_nombre: "Nombre del cliente",
  dni: "DNI/NIF",
  codigo_postal: "Código postal",
  email: "Email",
  telefono: "Teléfono",
};

const cadena = z.string().max(300).default("");
const fechaOpc = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null);

export const esquemaFilaCompletar = z.object({
  fila: z.number().int(),
  cliente: cadena,
  nif: cadena,
  codigoPostal: cadena,
  estado: cadena,
  tipo: cadena,
  marca: cadena,
  modelo: cadena,
  bastidor: cadena,
  matricula: cadena,
  fechaDeMatricula: fechaOpc,
  fCreado: fechaOpc,
  fAfectacion: fechaOpc,
  fMatriculacion: fechaOpc,
  fEntrega: fechaOpc,
  fFactura: fechaOpc,
  email: cadena,
  telefono: cadena,
});
export type FilaCompletar = z.infer<typeof esquemaFilaCompletar>;

export const REFERENCIAS = ["bastidor", "matricula", "nif", "email", "nombre"] as const;
export type Referencia = (typeof REFERENCIAS)[number];

export const esquemaPrevisualizarCompletar = z.object({
  filas: z.array(esquemaFilaCompletar).min(1).max(5000),
  /** Expedientes elegidos a mano para filas que no se encontraron o eran dudosas (número de fila → expediente). */
  asignaciones: z.record(z.string().regex(/^\d+$/), z.number().int().positive()).default({}),
  /** Con qué datos se localiza el expediente de cada fila (por defecto, todos, en este orden). */
  referencias: z.array(z.enum(REFERENCIAS)).min(1).default([...REFERENCIAS]),
});

export interface PropuestaCampo {
  campo: CampoCompletar;
  etiqueta: string;
  actual: string | null;
  nuevo: string;
  tipo: "rellenar" | "corregir";
  /** Aviso que se enseña junto al cambio (por ejemplo, que una fecha afecta a las comisiones). */
  aviso?: string;
}

/** Un expediente de la app que podría ser el de una fila (para elegirlo a mano cuando hay dudas o no se encontró). */
export interface CandidatoExpediente {
  id: number;
  cliente: string | null;
  dni: string | null;
  vehiculo: string | null;
  vin: string | null;
  matricula: string | null;
  fecha: string | null;
  /** Por qué se sugiere. */
  motivo: string;
  /** Fuerza de la sugerencia (suma de pistas) y si es la elegida como probable. */
  puntos?: number;
  probable?: boolean;
}

export type ComoCoincide = "bastidor" | "matricula" | "nif" | "email" | "nombre" | "manual";

export interface FilaPrevisualizada {
  fila: number;
  clienteListado: string;
  /** Estado que trae el listado («Archivado», «Anulado», «Matriculación»…). */
  estadoListado: string;
  /** NIF y bastidor/matrícula del listado, para poder cotejar a mano. */
  nifListado: string;
  bastidorListado: string;
  matriculaListado: string;
  /** Datos del listado que ayudan a reconocer el coche. */
  resumen: string;
  idExpediente: number | null;
  clienteApp: string | null;
  dniApp: string | null;
  vehiculoApp: string | null;
  /** VN o VO del expediente de la app. */
  claseApp: string | null;
  /** Si el expediente de la app ya está deshabilitado (no cuenta para comisiones). */
  deshabilitadoApp: boolean;
  /** Pedido guardado de ese expediente, para verlo en el visor. */
  idAdjuntoPedido: number | null;
  /** Cómo se ha encontrado el expediente. */
  coincide: ComoCoincide | null;
  estado: "propuestas" | "sin_cambios" | "sin_coincidencia" | "ambiguo" | "anulado";
  motivo: string | null;
  propuestas: PropuestaCampo[];
  /** Posibles expedientes cuando hay dudas o no se encontró ninguno. */
  candidatos: CandidatoExpediente[];
}

export interface ResultadoPrevisualizar {
  filas: FilaPrevisualizada[];
  resumen: { filas: number; conCambios: number; sinCambios: number; sinCoincidencia: number; ambiguos: number; anuladas: number; archivadas: number; cambios: number };
  /** Expedientes tuyos que no han encontrado ninguna fila en el listado (para entender por qué no se rellenan). */
  sinFila: { id: number; cliente: string | null; dni: string | null; vin: string | null; matricula: string | null }[];
}

const norm = (t: string | null | undefined): string => (t ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const sinAcentos = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const nombreClave = (t: string | null | undefined): string => sinAcentos(t ?? "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
const MATRICULA_ESP = /^\d{4}[A-Z]{3}$/;
const esFecha = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

interface ExpedienteCargado {
  id: number;
  idUsuario: number | null;
  idCliente: number | null;
  vin: string | null;
  matricula: string | null;
  fechaExpediente: string | null;
  fechaAfectacion: string | null;
  fechaMatriculacion: string | null;
  fechaPrimeraMatriculacion: string | null;
  fechaEntrega: string | null;
  fechaFacturacion: string | null;
  deshabilitado: boolean;
  estadoIntranet: string | null;
  clase: string;
  marca: string;
  modelo: string;
  cliente: string | null;
  dni: string | null;
  codigoPostal: string | null;
  financiado: boolean;
  idAdjuntoPedido: number | null;
}

async function cargarExpedientes(ej: Ejecutor, usuario: UsuarioActual): Promise<ExpedienteCargado[]> {
  const donde = and(isNull(expedientes.eliminadoEn), esAdministrador(usuario.rol) ? undefined : eq(expedientes.idUsuario, usuario.idUsuario));
  const filas = await ej
    .select({
      id: expedientes.idExpediente,
      idUsuario: expedientes.idUsuario,
      idCliente: expedientes.idCliente,
      vin: expedientes.vin,
      matricula: expedientes.matricula,
      fechaExpediente: expedientes.fechaExpediente,
      fechaAfectacion: expedientes.fechaAfectacion,
      fechaMatriculacion: expedientes.fechaMatriculacion,
      fechaPrimeraMatriculacion: expedientes.fechaPrimeraMatriculacion,
      fechaEntrega: expedientes.fechaEntrega,
      fechaFacturacion: expedientes.fechaFacturacion,
      deshabilitado: expedientes.deshabilitado,
      estadoIntranet: expedientes.estadoIntranet,
      clase: estadoVehiculo.clase,
      marca: marcas.nombre,
      modelo: modelos.nombreModelo,
      cliente: clientes.nombre,
      dni: clientes.dni,
      codigoPostal: clientes.codigoPostal,
      financiado: tipoDeVenta.requiereRciAlMatricular,
    })
    .from(expedientes)
    .leftJoin(estadoVehiculo, eq(estadoVehiculo.idEstadoVehiculo, expedientes.idEstadoVehiculo))
    .leftJoin(modelos, eq(modelos.idModelo, expedientes.idModelo))
    .leftJoin(marcas, eq(marcas.idMarca, modelos.marcaId))
    .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
    .leftJoin(tipoDeVenta, eq(tipoDeVenta.idTipoDeVenta, expedientes.idTipoDeVenta))
    .where(donde)
    .orderBy(asc(expedientes.idExpediente))
    .limit(60000);
  // El último pedido guardado de cada expediente (para abrirlo en el visor)
  const pedidos = new Map<number, number>();
  for (const a of await ej
    .select({ idExpediente: adjuntos.idExpediente, id: max(adjuntos.id) })
    .from(adjuntos)
    .where(and(eq(adjuntos.tipo, "pedido"), isNull(adjuntos.eliminadoEn)))
    .groupBy(adjuntos.idExpediente)) {
    if (a.idExpediente !== null && a.id !== null) pedidos.set(a.idExpediente, a.id);
  }
  return filas.map((f) => ({ ...f, clase: f.clase ?? "VN", marca: f.marca ?? "", modelo: f.modelo ?? "", cliente: f.cliente ?? null, financiado: f.financiado ?? false, idAdjuntoPedido: pedidos.get(f.id) ?? null }));
}

interface Indices {
  vin: Map<string, ExpedienteCargado>;
  mat: Map<string, ExpedienteCargado>;
  nif: Map<string, ExpedienteCargado[]>;
  nombre: Map<string, ExpedienteCargado[]>;
  porId: Map<number, ExpedienteCargado>;
  /** Correos de cada cliente (en minúsculas) y correo → expedientes de ese cliente. */
  correosDe: Map<number, Set<string>>;
  porCorreo: Map<string, ExpedienteCargado[]>;
}

const diasEntre = (a: string | null, b: string | null): number => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000 : Number.POSITIVE_INFINITY);

/**
 * Entre varios expedientes de un mismo cliente deja los que mejor encajan con la fila: misma marca, luego el que aún no tiene
 * bastidor ni matrícula (el que se está completando) y, si sigue habiendo varios, el más cercano en fecha al listado.
 */
function afinar(fila: FilaCompletar, lista: ExpedienteCargado[]): ExpedienteCargado[] {
  if (lista.length <= 1) return lista;
  const marca = sinAcentos(fila.marca);
  const porMarca = marca ? lista.filter((e) => sinAcentos(e.marca) === marca) : lista;
  let base = porMarca.length > 0 ? porMarca : lista;
  if (base.length > 1) {
    const vehiculoListado = sinAcentos(`${fila.marca} ${fila.modelo}`);
    const porModelo = base.filter((e) => sinAcentos(e.modelo).split(" ").some((p) => p.length > 2 && vehiculoListado.includes(p)));
    if (porModelo.length > 0) base = porModelo;
  }
  if (base.length > 1) {
    const vacios = base.filter((e) => !e.vin && !e.matricula);
    if (vacios.length > 0) base = vacios;
  }
  if (base.length > 1 && fila.fCreado) {
    const cerca = base.map((e) => ({ e, d: diasEntre(e.fechaExpediente, fila.fCreado) })).sort((a, b) => a.d - b.d);
    // Solo se decide por la fecha si hay uno claramente más cercano (más de 15 días de ventaja sobre el siguiente)
    if (cerca[0].d + 15 < cerca[1].d) base = [cerca[0].e];
  }
  return base;
}

interface Hallado {
  exp: ExpedienteCargado | null;
  como: ComoCoincide | null;
  ambiguo: boolean;
  candidatos: ExpedienteCargado[];
  /** Por qué solo hay sugerencias (por ejemplo, «documento parecido»). */
  pista: string | null;
}

/**
 * Busca el expediente de una fila: bastidor, matrícula, NIF (sin ceros a la izquierda y verificado con el correo si hay varios),
 * correo y, por último, nombre. Si no hay coincidencia exacta, deja sugerencias (documento parecido) para elegir a mano.
 */
function buscar(fila: FilaCompletar, refs: ReadonlySet<Referencia>, idx: Indices): Hallado {
  const vin = norm(fila.bastidor);
  if (refs.has("bastidor") && vin && idx.vin.has(vin)) return { exp: idx.vin.get(vin)!, como: "bastidor", ambiguo: false, candidatos: [], pista: null };
  const mat = norm(normalizarMatricula(fila.matricula));
  if (refs.has("matricula") && mat && idx.mat.has(mat)) return { exp: idx.mat.get(mat)!, como: "matricula", ambiguo: false, candidatos: [], pista: null };
  const correo = fila.email.trim().toLowerCase();
  const claves: { clave: string; lista: ExpedienteCargado[]; como: "nif" | "email" | "nombre" }[] = [
    { clave: claveNif(fila.nif), lista: idx.nif.get(claveNif(fila.nif)) ?? [], como: "nif" },
    { clave: correo, lista: idx.porCorreo.get(correo) ?? [], como: "email" },
    { clave: nombreClave(fila.cliente), lista: idx.nombre.get(nombreClave(fila.cliente)) ?? [], como: "nombre" },
  ];
  for (const { clave, lista, como } of claves) {
    if (!clave || !refs.has(como) || lista.length === 0) continue;
    // Varios expedientes del mismo cliente: si el correo del listado es de uno solo, ese
    let candidatos = lista;
    if (como !== "email" && lista.length > 1 && correo) {
      const porCorreo = lista.filter((e) => e.idCliente !== null && (idx.correosDe.get(e.idCliente)?.has(correo) ?? false));
      if (porCorreo.length > 0 && porCorreo.length < lista.length) candidatos = porCorreo;
    }
    const afinados = afinar(fila, candidatos);
    if (afinados.length === 1) return { exp: afinados[0], como, ambiguo: false, candidatos: [], pista: null };
    return { exp: null, como, ambiguo: true, candidatos: afinados, pista: `Varios expedientes con el mismo ${como === "nif" ? "documento" : como === "email" ? "correo" : "nombre"}` };
  }
  // Sin coincidencia exacta: se sugieren los de documento parecido (un carácter de diferencia, típico error de lectura)
  if (refs.has("nif") && fila.nif) {
    const parecidos: ExpedienteCargado[] = [];
    for (const [clave, lista] of idx.nif) if (nifParecido(clave, fila.nif)) parecidos.push(...lista);
    if (parecidos.length > 0) return { exp: null, como: null, ambiguo: false, candidatos: parecidos.slice(0, 8), pista: "Hay expedientes con un documento muy parecido: puede ser un error de lectura" };
  }
  return { exp: null, como: null, ambiguo: false, candidatos: [], pista: null };
}

const aCandidato = (e: ExpedienteCargado, motivo: string): CandidatoExpediente => ({
  id: e.id,
  cliente: e.cliente,
  dni: e.dni,
  vehiculo: [e.marca, e.modelo].filter(Boolean).join(" ") || null,
  vin: e.vin,
  matricula: e.matricula,
  fecha: e.fechaExpediente,
  motivo,
});

const PALABRAS_VACIAS = new Set(["de", "del", "la", "las", "los", "el", "y", "da", "do", "dos", "san", "santa"]);
/** Apellidos y nombres (sin acentos) de un nombre completo, sin partículas, para ver si dos personas comparten alguno. */
const palabrasDeNombre = (t: string | null): string[] => sinAcentos(t ?? "").replace(/[^a-z ]/g, " ").split(/\s+/).filter((p) => p.length >= 3 && !PALABRAS_VACIAS.has(p));

interface PagoPendiente {
  nombre: string | null;
  nif: string | null;
}

/**
 * Cuando una fila del listado no encuentra expediente por ningún dato exacto (por ejemplo, el coche se pidió a nombre del hijo y la
 * financiera y la intranet lo tienen a nombre de la madre), se buscan los expedientes que **todavía no tienen bastidor** y encajan por
 * pistas: mismo modelo, fecha de pedido cercana, apellidos en común, mismo código postal o teléfono y un pago de RCI pendiente de ese
 * bastidor. Devuelve los mejores con el motivo de cada uno; solo hay un «probable» si destaca claramente.
 */
function sugerirPorPistas(f: FilaCompletar, todos: ExpedienteCargado[], idx: Indices, telefonos: Map<number, Set<string>>, pago: PagoPendiente | undefined): CandidatoExpediente[] {
  const vehiculoListado = sinAcentos(`${f.marca} ${f.modelo}`);
  const marca = sinAcentos(f.marca);
  const apellidosListado = new Set(palabrasDeNombre(f.cliente));
  const telefono = f.telefono.replace(/\D/g, "");
  const correo = f.email.trim().toLowerCase();
  const puntuados: { e: ExpedienteCargado; puntos: number; razones: string[] }[] = [];
  for (const e of todos) {
    // Un expediente que ya tiene bastidor o matrícula distintos a los de la fila es otro coche
    if (f.bastidor && e.vin && norm(e.vin) !== norm(f.bastidor)) continue;
    const mat = norm(normalizarMatricula(f.matricula));
    if (mat && e.matricula && norm(normalizarMatricula(e.matricula)) !== mat) continue;
    if (e.vin || e.matricula) continue;
    let puntos = 0;
    const razones: string[] = [];
    if (marca && sinAcentos(e.marca) === marca) {
      puntos += 2;
      const modeloIgual = sinAcentos(e.modelo).split(" ").some((p) => p.length > 2 && vehiculoListado.includes(p));
      if (modeloIgual) {
        puntos += 3;
        razones.push("mismo modelo");
      } else razones.push("misma marca");
    }
    const dias = diasEntre(e.fechaExpediente, f.fCreado);
    if (Number.isFinite(dias)) {
      if (dias > 120) continue;
      if (dias <= 10) {
        puntos += 3;
        razones.push(`pedido ${Math.round(dias)} día(s) de diferencia`);
      } else if (dias <= 30) {
        puntos += 2;
        razones.push(`pedido ${Math.round(dias)} días de diferencia`);
      } else if (dias <= 60) puntos += 1;
    }
    const comunes = palabrasDeNombre(e.cliente).filter((p) => apellidosListado.has(p));
    if (comunes.length > 0) {
      puntos += 3;
      razones.push(`apellido en común (${comunes.map((p) => p[0].toUpperCase() + p.slice(1)).join(", ")})`);
    }
    if (f.codigoPostal && e.codigoPostal && f.codigoPostal === e.codigoPostal) {
      puntos += 2;
      razones.push("mismo código postal");
    }
    if (e.idCliente !== null) {
      if (telefono.length >= 9 && (telefonos.get(e.idCliente)?.has(telefono) ?? false)) {
        puntos += 3;
        razones.push("mismo teléfono");
      }
      if (correo && (idx.correosDe.get(e.idCliente)?.has(correo) ?? false)) {
        puntos += 3;
        razones.push("mismo correo");
      }
    }
    if (pago && e.financiado) {
      puntos += 1;
      razones.push("pago a plazos, como el pago de RCI de ese bastidor");
    }
    if (puntos >= 5) puntuados.push({ e, puntos, razones });
  }
  puntuados.sort((a, b) => b.puntos - a.puntos);
  const mejores = puntuados.slice(0, 6);
  return mejores.map((m, i) => ({
    ...aCandidato(m.e, m.razones.join(" · ")),
    puntos: m.puntos,
    probable: i === 0 && (m.puntos >= 9 || (m.puntos >= 6 && m.puntos - (mejores[1]?.puntos ?? 0) >= 3)),
  }));
}

/** Ofrece, para cada fila del listado, lo que se rellenaría o corregiría en el expediente que le corresponde. No guarda nada. */
export async function previsualizarCompletado(
  ej: Ejecutor,
  usuario: UsuarioActual,
  filas: FilaCompletar[],
  referencias: readonly Referencia[] = REFERENCIAS,
  asignaciones: Record<string, number> = {},
): Promise<ResultadoPrevisualizar> {
  const refs = new Set<Referencia>(referencias);
  const todos = await cargarExpedientes(ej, usuario);
  const idx: Indices = { vin: new Map(), mat: new Map(), nif: new Map(), nombre: new Map(), porId: new Map(), correosDe: new Map(), porCorreo: new Map() };
  for (const e of todos) {
    idx.porId.set(e.id, e);
    if (norm(e.vin)) idx.vin.set(norm(e.vin), e);
    if (norm(normalizarMatricula(e.matricula))) idx.mat.set(norm(normalizarMatricula(e.matricula)), e);
    for (const [clave, mapa] of [[claveNif(e.dni), idx.nif] as const, [nombreClave(e.cliente), idx.nombre] as const]) {
      if (!clave) continue;
      mapa.set(clave, [...(mapa.get(clave) ?? []), e]);
    }
  }
  const idsCliente = [...new Set(todos.map((e) => e.idCliente).filter((i): i is number => i !== null))];
  const telefonos = new Map<number, Set<string>>();
  for (let i = 0; i < idsCliente.length; i += 2000) {
    const trozo = idsCliente.slice(i, i + 2000);
    for (const c of await ej.select({ id: emailsClientes.idCliente, v: emailsClientes.email }).from(emailsClientes).where(inArray(emailsClientes.idCliente, trozo))) {
      if (c.id !== null) idx.correosDe.set(c.id, (idx.correosDe.get(c.id) ?? new Set()).add(c.v.toLowerCase()));
    }
    for (const t of await ej.select({ id: telefonosClientes.idCliente, v: telefonosClientes.telefono }).from(telefonosClientes).where(inArray(telefonosClientes.idCliente, trozo))) {
      if (t.id !== null) telefonos.set(t.id, (telefonos.get(t.id) ?? new Set()).add(t.v.replace(/\D/g, "")));
    }
  }
  for (const e of todos) {
    if (e.idCliente === null) continue;
    for (const c of idx.correosDe.get(e.idCliente) ?? []) idx.porCorreo.set(c, [...(idx.porCorreo.get(c) ?? []), e]);
  }

  // Pagos de la financiera pendientes, por bastidor: si el listado trae el mismo bastidor, es una pista (y se le dice a la persona)
  const pagosPendientes = new Map<string, PagoPendiente>();
  for (const p of await ej.select({ vin: pagosRci.bastidor, nombre: pagosRci.nombre, nif: pagosRci.nif }).from(pagosRci).where(eq(pagosRci.estado, "pendiente"))) {
    if (p.vin) pagosPendientes.set(norm(p.vin), { nombre: p.nombre, nif: p.nif });
  }

  const salida: FilaPrevisualizada[] = [];
  for (const f of filas) {
    const anuladoListado = /anulad/i.test(f.estado);
    const base = {
      fila: f.fila,
      clienteListado: f.cliente,
      estadoListado: f.estado,
      nifListado: f.nif,
      bastidorListado: f.bastidor,
      matriculaListado: normalizarMatricula(f.matricula),
      resumen: [f.marca, f.modelo, f.bastidor || normalizarMatricula(f.matricula)].filter(Boolean).join(" · "),
    };
    const manual = asignaciones[String(f.fila)];
    const elegido = manual !== undefined ? idx.porId.get(manual) : undefined;
    const hallado: Hallado = elegido ? { exp: elegido, como: "manual", ambiguo: false, candidatos: [], pista: null } : buscar(f, refs, idx);
    const { exp, como, ambiguo } = hallado;
    if (!exp) {
      const motivo = ambiguo ? `${hallado.pista ?? "Hay varios expedientes posibles"}: elige cuál a mano (no se toca ninguno)` : (hallado.pista ?? "No hay ningún expediente tuyo que coincida (no se crea nada)");
      const estado = anuladoListado ? "anulado" : ambiguo ? "ambiguo" : "sin_coincidencia";
      const pago = f.bastidor ? pagosPendientes.get(norm(f.bastidor)) : undefined;
      // Sin candidatos exactos ni parecidos: se sugieren los expedientes sin bastidor que encajan por pistas (otro titular, mismo coche)
      const porPistas = hallado.candidatos.length === 0 && !anuladoListado ? sugerirPorPistas(f, todos, idx, telefonos, pago) : [];
      const textoPago = pago ? ` Hay un pago de RCI pendiente con este bastidor a nombre de ${pago.nombre ?? "otra persona"}${pago.nif ? ` (${pago.nif})` : ""}.` : "";
      const textoPistas = porPistas.length > 0 ? " Estos expedientes sin bastidor podrían ser el suyo (otro titular, mismo coche): elige a mano." : "";
      salida.push({ ...base, idExpediente: null, clienteApp: null, dniApp: null, vehiculoApp: null, claseApp: null, deshabilitadoApp: false, idAdjuntoPedido: null, coincide: como, estado, motivo: (anuladoListado ? `Anulado en el listado y sin expediente en la app. ${motivo}` : motivo) + textoPago + textoPistas, propuestas: [], candidatos: [...hallado.candidatos.map((e) => aCandidato(e, hallado.pista ?? "Mismo cliente")), ...porPistas] });
      continue;
    }
    const props: PropuestaCampo[] = [];
    const proponer = (campo: CampoCompletar, actual: string | null, nuevo: string | null, aviso?: string) => {
      if (!nuevo) return;
      const igual = campo === "vin" || campo === "matricula" ? norm(actual) === norm(nuevo) : campo === "dni" ? claveNif(actual) === claveNif(nuevo) : (actual ?? "") === nuevo;
      if (igual) return;
      props.push({ campo, etiqueta: ETIQUETA_CAMPO[campo], actual: actual && actual !== "" ? actual : null, nuevo, tipo: actual ? "corregir" : "rellenar", aviso });
    };
    const esVo = exp.clase === "VO";
    proponer("vin", exp.vin, f.bastidor || null);
    const matricula = normalizarMatricula(f.matricula);
    proponer("matricula", exp.matricula, matricula && (MATRICULA_ESP.test(matricula) || matricula.length >= 5) ? matricula : null);
    proponer("fecha_expediente", exp.fechaExpediente, f.fCreado);
    proponer("fecha_afectacion", exp.fechaAfectacion, f.fAfectacion);
    const fechaMatriculacion = f.fMatriculacion ?? f.fechaDeMatricula;
    if (esVo) {
      // En un usado la fecha de matriculación es la del vehículo (años atrás): se guarda aparte y no cuenta para comisionar
      proponer("fecha_primera_matriculacion", exp.fechaPrimeraMatriculacion, fechaMatriculacion);
    } else {
      proponer("fecha_matriculacion", exp.fechaMatriculacion, fechaMatriculacion, "Cambia el mes en que cuenta el coche para las comisiones");
    }
    proponer("fecha_entrega", exp.fechaEntrega, f.fEntrega);
    // En un usado la facturación es la «Fra. prevista» del listado (cuenta para comisionar); en un nuevo, la fecha de factura
    proponer("fecha_facturacion", exp.fechaFacturacion, f.fFactura, "Cambia el mes en que cuenta el coche para las comisiones");
    // Un nuevo que el listado deja en Matriculación, Post-venta o Archivado ya está cobrado: cuenta desde su facturación (la matriculación si ya la tiene; si no, hoy)
    const facturacionCobrado = facturacionPorEstadoCobrado({ esUsado: esVo, estadoListado: f.estado, facturacionActual: exp.fechaFacturacion, facturacionListado: f.fFactura, matriculacion: fechaMatriculacion ?? exp.fechaMatriculacion, hoy: hoyIso() });
    if (facturacionCobrado) proponer("fecha_facturacion", exp.fechaFacturacion, facturacionCobrado, "El listado lo deja cobrado (Matriculación o posterior): cuenta para las comisiones desde esta fecha de facturación");
    // El documento solo se corrige si de verdad es otro: «03217951K» y «3217951K» son el mismo
    // El estado del listado queda guardado para poder filtrar y revisar a mano (anulados, archivados…)
    const estadoListado = f.estado.trim().slice(0, 40);
    if (estadoListado && (exp.estadoIntranet ?? "").toLowerCase() !== estadoListado.toLowerCase()) proponer("estado_intranet", exp.estadoIntranet, estadoListado);
    // Si el documento del listado es de otra persona (o la fila se asoció a mano), el titular del expediente cambia: se propone el nombre
    const otroTitular = f.cliente.trim() !== "" && nombreClave(f.cliente) !== nombreClave(exp.cliente) && (como === "manual" || (f.nif !== "" && exp.dni !== null && claveNif(f.nif) !== claveNif(exp.dni)));
    if (otroTitular) proponer("cliente_nombre", exp.cliente, f.cliente.trim(), `Cambia el titular: el pedido era de «${exp.cliente ?? "—"}» y el listado lo tiene a nombre de esta persona. Se anotará en los comentarios del cliente y del expediente`);
    proponer("dni", exp.dni, f.nif || null, otroTitular && exp.dni ? "Cambia el documento del titular" : undefined);
    proponer("codigo_postal", exp.codigoPostal, f.codigoPostal || null);
    if (f.email && exp.idCliente !== null && !(idx.correosDe.get(exp.idCliente)?.has(f.email.toLowerCase()) ?? false)) props.push({ campo: "email", etiqueta: ETIQUETA_CAMPO.email, actual: null, nuevo: f.email, tipo: "rellenar", aviso: "Se añade como correo del cliente" });
    const tel = f.telefono.replace(/\D/g, "");
    if (tel.length >= 9 && exp.idCliente !== null && !(telefonos.get(exp.idCliente)?.has(tel) ?? false)) props.push({ campo: "telefono", etiqueta: ETIQUETA_CAMPO.telefono, actual: null, nuevo: f.telefono, tipo: "rellenar", aviso: "Se añade como teléfono del cliente" });

    const vehiculoListado = sinAcentos(`${f.marca} ${f.modelo}`);
    const modeloDistinto = f.modelo && !sinAcentos(`${exp.marca} ${exp.modelo}`).split(" ").some((p) => p.length > 2 && vehiculoListado.includes(p));
    const avisos: string[] = [];
    if (anuladoListado) avisos.push(exp.deshabilitado ? "Anulado en el listado (en la app ya está deshabilitado)" : "Anulado en el listado y activo en la app: revísalo; puedes deshabilitarlo");
    else if (!esVo && !matricula && !/archivad/i.test(f.estado)) avisos.push("Sin matrícula todavía en el listado: venta en proceso (o que no salió adelante)");
    if (modeloDistinto) avisos.push(`El modelo del listado («${f.marca} ${f.modelo}») se llama distinto en la app: no se toca el modelo`);
    // Un NIF que difiere de verdad (no solo en ceros) merece una pista aparte
    const nifDifiere = f.nif && exp.dni && claveNif(f.nif) !== claveNif(exp.dni);
    if (nifDifiere && como !== "nif") avisos.push("El documento del listado no es el del cliente de la app: comprueba que es el expediente correcto");
    salida.push({
      ...base,
      idExpediente: exp.id,
      clienteApp: exp.cliente,
      dniApp: exp.dni,
      vehiculoApp: [exp.marca, exp.modelo].filter(Boolean).join(" ") || null,
      claseApp: exp.clase,
      deshabilitadoApp: exp.deshabilitado,
      idAdjuntoPedido: exp.idAdjuntoPedido,
      coincide: como,
      estado: anuladoListado ? "anulado" : props.length > 0 ? "propuestas" : "sin_cambios",
      motivo: avisos.length > 0 ? avisos.join(" · ") : null,
      propuestas: props,
      candidatos: [],
    });
  }
  const cuenta = (e: FilaPrevisualizada["estado"]) => salida.filter((s) => s.estado === e).length;
  const encontrados = new Set(salida.map((s) => s.idExpediente).filter((i): i is number => i !== null));
  const sinFila = todos.filter((e) => !encontrados.has(e.id)).slice(0, 500).map((e) => ({ id: e.id, cliente: e.cliente, dni: e.dni, vin: e.vin, matricula: e.matricula }));
  return {
    filas: salida,
    sinFila,
    resumen: {
      filas: salida.length,
      conCambios: cuenta("propuestas"),
      sinCambios: cuenta("sin_cambios"),
      sinCoincidencia: cuenta("sin_coincidencia"),
      ambiguos: cuenta("ambiguo"),
      anuladas: cuenta("anulado"),
      archivadas: salida.filter((s) => /archivad/i.test(s.estadoListado)).length,
      cambios: salida.reduce((s, f) => s + f.propuestas.length, 0),
    },
  };
}

export const esquemaAplicarCompletado = z.object({
  archivo: z.string().max(255).default("listado"),
  cambios: z
    .array(z.object({ id_expediente: z.number().int().positive(), campos: z.array(z.object({ campo: z.enum(CAMPOS_COMPLETAR), valor: z.string().min(1).max(300) })).min(1).max(CAMPOS_COMPLETAR.length) }))
    .max(5000)
    .default([]),
  /** Expedientes anulados en el listado que la persona quiere deshabilitar (no cuentan para las comisiones). */
  deshabilitar: z.array(z.number().int().positive()).max(5000).default([]),
});
export type EntradaAplicarCompletado = z.input<typeof esquemaAplicarCompletado>;

const COLUMNA_EXPEDIENTE: Partial<Record<CampoCompletar, "vin" | "matricula" | "fechaExpediente" | "fechaAfectacion" | "fechaMatriculacion" | "fechaPrimeraMatriculacion" | "fechaEntrega" | "fechaFacturacion" | "estadoIntranet">> = {
  vin: "vin",
  matricula: "matricula",
  fecha_expediente: "fechaExpediente",
  fecha_afectacion: "fechaAfectacion",
  fecha_matriculacion: "fechaMatriculacion",
  fecha_primera_matriculacion: "fechaPrimeraMatriculacion",
  fecha_entrega: "fechaEntrega",
  fecha_facturacion: "fechaFacturacion",
  estado_intranet: "estadoIntranet",
};

/** Aplica solo lo que la persona ha elegido, recalcula las comisiones afectadas y lo deja en el log de importaciones. */
export async function aplicarCompletado(ej: Ejecutor, usuario: UsuarioActual, entradaCruda: EntradaAplicarCompletado): Promise<{ expedientesCambiados: number; camposCambiados: number; omitidos: string[]; pagosEnlazados: number }> {
  const entrada = esquemaAplicarCompletado.parse(entradaCruda);
  if (entrada.cambios.length === 0 && entrada.deshabilitar.length === 0) throw new HttpError(400, "No hay nada que aplicar");
  const ids = [...new Set([...entrada.cambios.map((c) => c.id_expediente), ...entrada.deshabilitar])];
  const { valor } = await conRecalculo(ej, ids, "Completar datos desde un listado", async (tx) => {
    const [bloque] = await tx.insert(importacionesBloques).values({ fecha: new Date().toISOString(), nombreArchivo: entrada.archivo, tipoArchivo: "Completar datos", usuarioId: usuario.idUsuario }).returning();
    let expCambiados = 0;
    let campos = 0;
    const omitidos: string[] = [];
    for (const c of entrada.cambios) {
      const exp = await tx.query.expedientes.findFirst({ where: and(eq(expedientes.idExpediente, c.id_expediente), isNull(expedientes.eliminadoEn)), with: { cliente: true } });
      if (!exp) {
        omitidos.push(`Expediente ${c.id_expediente}: ya no existe`);
        continue;
      }
      if (!esAdministrador(usuario.rol) && exp.idUsuario !== usuario.idUsuario) {
        omitidos.push(`Expediente ${c.id_expediente}: no es tuyo`);
        continue;
      }
      const cambios: Record<string, { old: string; new: string }> = {};
      const setExp: Record<string, string> = {};
      const setCli: Record<string, string> = {};
      for (const { campo, valor: valorCrudo } of c.campos) {
        const valor = campo === "matricula" ? normalizarMatricula(valorCrudo) : valorCrudo.trim();
        const col = COLUMNA_EXPEDIENTE[campo];
        if (col && col.startsWith("fecha") && !esFecha(valor)) {
          omitidos.push(`Expediente ${exp.idExpediente}: ${ETIQUETA_CAMPO[campo]} «${valorCrudo}» no es una fecha válida (AAAA-MM-DD)`);
          continue;
        }
        if (col) {
          const actual = (exp as unknown as Record<string, string | null>)[col];
          if ((campo === "vin" || campo === "matricula") && norm(valor) !== norm(actual)) {
            const colDb = campo === "vin" ? expedientes.vin : expedientes.matricula;
            const [otro] = await tx.select({ id: expedientes.idExpediente }).from(expedientes).where(and(isNull(expedientes.eliminadoEn), eq(colDb, valor), ne(expedientes.idExpediente, exp.idExpediente))).limit(1);
            if (otro) {
              omitidos.push(`Expediente ${exp.idExpediente}: ${ETIQUETA_CAMPO[campo]} ${valor} ya está en el expediente ${otro.id}`);
              continue;
            }
          }
          if ((actual ?? "") === valor) continue;
          setExp[col] = campo === "vin" ? valor.toUpperCase() : valor;
          cambios[ETIQUETA_CAMPO[campo]] = { old: actual || "(Vacío)", new: setExp[col] };
        } else if (campo === "dni" || campo === "codigo_postal" || campo === "cliente_nombre") {
          const colCli = campo === "dni" ? "dni" : campo === "cliente_nombre" ? "nombre" : "codigoPostal";
          const actual = (exp.cliente as unknown as Record<string, string | null> | null)?.[colCli] ?? null;
          if ((actual ?? "") === valor) continue;
          setCli[colCli] = valor;
          cambios[ETIQUETA_CAMPO[campo]] = { old: actual || "(Vacío)", new: valor };
        } else if (exp.idCliente !== null) {
          if (campo === "email") {
            const [ya] = await tx.select({ id: emailsClientes.idEmailCliente }).from(emailsClientes).where(and(eq(emailsClientes.idCliente, exp.idCliente), eq(emailsClientes.email, valor.toLowerCase()))).limit(1);
            if (ya) continue;
            await tx.insert(emailsClientes).values({ idCliente: exp.idCliente, email: valor.toLowerCase(), tipoEmail: "Principal" });
          } else {
            const [ya] = await tx.select({ id: telefonosClientes.idTelefonoCliente }).from(telefonosClientes).where(and(eq(telefonosClientes.idCliente, exp.idCliente), eq(telefonosClientes.telefono, valor))).limit(1);
            if (ya) continue;
            await tx.insert(telefonosClientes).values({ idCliente: exp.idCliente, telefono: valor, tipoTelefono: "Principal" });
          }
          cambios[ETIQUETA_CAMPO[campo]] = { old: "(Ninguno)", new: valor };
        }
      }
      if (Object.keys(cambios).length === 0) continue;
      // Cambio de titular (el pedido se hizo a nombre de otra persona): se deja anotado en los comentarios del cliente y del expediente
      const dniAnterior = exp.cliente?.dni ?? "";
      const titularCambia = setCli.nombre !== undefined || (setCli.dni !== undefined && dniAnterior !== "" && claveNif(setCli.dni) !== claveNif(dniAnterior));
      if (titularCambia && exp.idCliente !== null) {
        const hoy = new Date().toISOString().slice(0, 10).split("-").reverse().join("/");
        const persona = (nombre: string | null | undefined, dni: string | null | undefined) => `${nombre?.trim() || "—"}${dni ? ` (${dni})` : ""}`;
        const nota = `[${hoy}] Cambio de titular al completar datos desde el listado «${entrada.archivo}»: el pedido se hizo a nombre de ${persona(exp.cliente?.nombre, dniAnterior)} y el listado de la intranet lo tiene a nombre de ${persona(setCli.nombre ?? exp.cliente?.nombre, setCli.dni ?? dniAnterior)}. Los datos anteriores quedan anotados aquí.`;
        const unir = (previo: string | null | undefined) => (previo && previo.trim() !== "" ? `${previo}\n\n${nota}` : nota);
        setExp.comentarios = unir(exp.comentarios);
        setCli.comentarios = unir(exp.cliente?.comentarios);
        cambios["Comentario del expediente"] = { old: exp.comentarios || "(Vacío)", new: setExp.comentarios };
        cambios["Comentario del cliente"] = { old: exp.cliente?.comentarios || "(Vacío)", new: setCli.comentarios };
      }
      if (Object.keys(setExp).length > 0) await tx.update(expedientes).set(setExp).where(eq(expedientes.idExpediente, exp.idExpediente));
      if (Object.keys(setCli).length > 0 && exp.idCliente !== null) await tx.update(clientes).set(setCli).where(eq(clientes.id, exp.idCliente));
      expCambiados++;
      campos += Object.keys(cambios).length;
      await tx.insert(importacionesRegistros).values({ bloqueId: bloque.id, idExpediente: exp.idExpediente, tipoAccion: "modificado", clienteNombre: exp.cliente?.nombre ?? "Desconocido", matricula: setExp.matricula ?? exp.matricula ?? "", bastidor: setExp.vin ?? exp.vin ?? "", cambios: JSON.stringify(cambios) });
    }
    for (const idExp of entrada.deshabilitar) {
      const exp = await tx.query.expedientes.findFirst({ where: and(eq(expedientes.idExpediente, idExp), isNull(expedientes.eliminadoEn)), with: { cliente: true } });
      if (!exp) {
        omitidos.push(`Expediente ${idExp}: ya no existe`);
        continue;
      }
      if (!esAdministrador(usuario.rol) && exp.idUsuario !== usuario.idUsuario) {
        omitidos.push(`Expediente ${idExp}: no es tuyo`);
        continue;
      }
      if (exp.deshabilitado) continue;
      await tx.update(expedientes).set({ deshabilitado: true }).where(eq(expedientes.idExpediente, exp.idExpediente));
      expCambiados++;
      campos++;
      await tx.insert(importacionesRegistros).values({ bloqueId: bloque.id, idExpediente: exp.idExpediente, tipoAccion: "modificado", clienteNombre: exp.cliente?.nombre ?? "Desconocido", matricula: exp.matricula ?? "", bastidor: exp.vin ?? "", cambios: JSON.stringify({ Deshabilitado: { old: "No", new: "Sí" } }) });
    }
    await tx.update(importacionesBloques).set({ creados: 0, modificados: expCambiados, omitidos: omitidos.length }).where(eq(importacionesBloques.id, bloque.id));
    await aplicarReglasSemaforo(tx, ids);
    return { valor: { expedientesCambiados: expCambiados, camposCambiados: campos, omitidos }, idsDespues: ids };
  });
  // Los expedientes ya tienen bastidor, matrícula o documento nuevos: los pagos de la financiera que esperaban pueden engancharse ahora
  const pagos = await reintentarPagosPendientes(ej, usuario).catch(() => ({ revisados: 0, enlazados: 0 }));
  return { ...valor, pagosEnlazados: pagos.enlazados };
}

const ETIQUETA_A_CAMPO = new Map(Object.entries(ETIQUETA_CAMPO).map(([campo, etiqueta]) => [etiqueta, campo as CampoCompletar]));

export interface ResultadoDeshacer {
  eliminados: number;
  revertidos: number;
  conservados: string[];
}

/**
 * Deshace una importación: los expedientes que creó pasan a eliminados y los datos que cambió vuelven a su valor anterior (solo si
 * nadie los ha vuelto a cambiar desde entonces; si no, se conservan y se avisa). Después quita el bloque del log.
 */
export async function deshacerBloque(ej: Ejecutor, usuario: UsuarioActual, idBloque: number): Promise<ResultadoDeshacer> {
  if (!esAdministrador(usuario.rol)) throw new HttpError(403, "Solo el administrador puede deshacer una importación");
  const [bloque] = await ej.select().from(importacionesBloques).where(eq(importacionesBloques.id, idBloque));
  if (!bloque) throw new HttpError(404, "Importación no encontrada");
  const registros = await ej.select().from(importacionesRegistros).where(eq(importacionesRegistros.bloqueId, idBloque));
  const ids = [...new Set(registros.map((r) => r.idExpediente).filter((i): i is number => i !== null))];
  const { valor } = await conRecalculo(ej, ids, "Deshacer una importación", async (tx) => {
    const res: ResultadoDeshacer = { eliminados: 0, revertidos: 0, conservados: [] };
    for (const r of registros) {
      if (r.idExpediente === null) continue;
      const exp = await tx.query.expedientes.findFirst({ where: eq(expedientes.idExpediente, r.idExpediente), with: { cliente: true } });
      if (!exp) continue;
      if (r.tipoAccion === "creado") {
        if (exp.eliminadoEn === null) {
          await tx.update(expedientes).set({ eliminadoEn: new Date() }).where(eq(expedientes.idExpediente, exp.idExpediente));
          res.eliminados++;
        }
        continue;
      }
      if (r.tipoAccion !== "modificado" || !r.cambios?.trim().startsWith("{")) continue;
      let cambios: Record<string, { old: string; new: string }>;
      try {
        cambios = JSON.parse(r.cambios) as Record<string, { old: string; new: string }>;
      } catch {
        continue;
      }
      for (const [etiqueta, { old, new: nuevo }] of Object.entries(cambios)) {
        if (etiqueta === "Deshabilitado") {
          if (exp.deshabilitado) {
            await tx.update(expedientes).set({ deshabilitado: false }).where(eq(expedientes.idExpediente, exp.idExpediente));
            res.revertidos++;
          }
          continue;
        }
        if (etiqueta === "Comentario del expediente" || etiqueta === "Comentario del cliente") {
          const delCliente = etiqueta === "Comentario del cliente";
          const actual = delCliente ? (exp.cliente?.comentarios ?? "") : (exp.comentarios ?? "");
          const previo = old === "(Vacío)" ? null : old;
          if (actual !== nuevo || (delCliente && exp.idCliente === null)) {
            res.conservados.push(`${etiqueta} de ${exp.idExpediente}: se cambió después, se deja como está`);
          } else if (delCliente) {
            await tx.update(clientes).set({ comentarios: previo }).where(eq(clientes.id, exp.idCliente as number));
            res.revertidos++;
          } else {
            await tx.update(expedientes).set({ comentarios: previo }).where(eq(expedientes.idExpediente, exp.idExpediente));
            res.revertidos++;
          }
          continue;
        }
        const campo = ETIQUETA_A_CAMPO.get(etiqueta);
        const anterior = old === "(Vacío)" || old === "(Ninguno)" ? null : old;
        if (!campo) {
          res.conservados.push(`Expediente ${exp.idExpediente}: «${etiqueta}» no se puede deshacer automáticamente`);
          continue;
        }
        const col = COLUMNA_EXPEDIENTE[campo];
        if (col) {
          const actual = (exp as unknown as Record<string, string | null>)[col];
          if ((actual ?? "") !== nuevo) {
            res.conservados.push(`Expediente ${exp.idExpediente}: ${etiqueta} se cambió después (ahora «${actual ?? ""}»), se deja como está`);
            continue;
          }
          await tx.update(expedientes).set({ [col]: anterior }).where(eq(expedientes.idExpediente, exp.idExpediente));
          res.revertidos++;
        } else if ((campo === "dni" || campo === "codigo_postal" || campo === "cliente_nombre") && exp.idCliente !== null) {
          const colCli = campo === "dni" ? "dni" : campo === "cliente_nombre" ? "nombre" : "codigoPostal";
          const actual = (exp.cliente as unknown as Record<string, string | null> | null)?.[colCli] ?? null;
          if ((actual ?? "") !== nuevo) {
            res.conservados.push(`Cliente de ${exp.idExpediente}: ${etiqueta} se cambió después, se deja como está`);
            continue;
          }
          await tx.update(clientes).set({ [colCli]: anterior }).where(eq(clientes.id, exp.idCliente));
          res.revertidos++;
        } else if (exp.idCliente !== null && campo === "email") {
          await tx.delete(emailsClientes).where(and(eq(emailsClientes.idCliente, exp.idCliente), eq(emailsClientes.email, nuevo.toLowerCase())));
          res.revertidos++;
        } else if (exp.idCliente !== null && campo === "telefono") {
          await tx.delete(telefonosClientes).where(and(eq(telefonosClientes.idCliente, exp.idCliente), eq(telefonosClientes.telefono, nuevo)));
          res.revertidos++;
        }
      }
    }
    await tx.delete(importacionesBloques).where(eq(importacionesBloques.id, idBloque));
    return { valor: res, idsDespues: ids };
  });
  return valor;
}
