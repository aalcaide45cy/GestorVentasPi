import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import {
  ajustes,
  clientes,
  estadoVehiculo,
  expedientes,
  tipoDeVenta,
  usuariosTiendas,
  type ConceptoEspecial,
} from "@/db/schema";
import type { ExpedienteDto } from "@/lib/dto";
import { esAdministrador, puedeCrearExpedientes } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import { actualizarCliente, buscarPorDni, crearCliente } from "./clientes";
import { asegurarCopiaReciente } from "./copias";
import { hoyIso } from "./comun";
import { MAX_COPIAS_TOTAL, UMBRAL_COPIA_PREVIA, type EntradaActualizarExpediente, type EntradaCrearExpediente, type EntradaDuplicarExpedientes } from "./expedientes";
import { facturacionPorDefectoVo } from "@/lib/facturacion-vo";
import { obtenerExpediente } from "./expedientes-lectura";
import { aplicarReglasSemaforo } from "./reglas-semaforo";
import { conRecalculo, type ResumenRecalculo } from "./liquidaciones";

/** Cambios producidos por el recálculo en meses ya revisados o cerrados (para avisar al usuario). */
export interface ImpactoCerrado {
  idVendedor: number;
  mes: string;
  netoAnterior: number;
  netoNuevo: number;
  diferencia: number;
}

function impactos(rs: ResumenRecalculo[]): ImpactoCerrado[] {
  return rs
    .filter((r) => r.versionGuardada && r.netoAnterior !== null)
    .map((r) => ({ idVendedor: r.idVendedor, mes: r.mes, netoAnterior: r.netoAnterior as number, netoNuevo: r.netoNuevo, diferencia: r.netoNuevo - (r.netoAnterior as number) }));
}

async function tiendaUnica(ej: Ejecutor, idUsuario: number): Promise<number | null> {
  const filas = await ej.select().from(usuariosTiendas).where(eq(usuariosTiendas.idUsuario, idUsuario));
  return filas.length === 1 ? filas[0].idTienda : null;
}

async function resolverEstado(ej: Ejecutor, id: number | null | undefined, nombre?: string): Promise<number | null> {
  if (id) return id;
  if (nombre?.toLowerCase() === "usado") {
    // «Usado» se busca por su clase (VO), no por el nombre: así se puede renombrar el estado (por ejemplo a «VO»)
    const usados = await ej.select().from(estadoVehiculo).where(and(eq(estadoVehiculo.clase, "VO"), isNull(estadoVehiculo.eliminadoEn)));
    const e = usados.find((x) => x.subtipoVo === "USADO") ?? usados.find((x) => x.nombreEstadoVehiculo.toLowerCase() === "usado") ?? usados[0];
    return e?.idEstadoVehiculo ?? null;
  }
  const [def] = await ej.select().from(estadoVehiculo).where(eq(estadoVehiculo.predeterminado, true)).limit(1);
  return def?.idEstadoVehiculo ?? null;
}

/** Crea el expediente (y cliente, correos y teléfonos si procede) en una sola transacción. */
export async function crearExpediente(
  ej: Ejecutor,
  usuario: UsuarioActual,
  entrada: EntradaCrearExpediente,
  /** Se rellena con lo que falta pero no impide guardar. */
  avisos: AvisoGuardado[] = [],
): Promise<ExpedienteDto> {
  if (!puedeCrearExpedientes(usuario.rol)) {
    throw new HttpError(403, "No tienes permiso para crear expedientes");
  }
  const { valor: id } = await conRecalculo(ej, [], "Alta de expediente", async (tx) => {
    let idCliente: number | null = null;
    const c = entrada.cliente;
    if (c && c.nombre) {
      if (c.id) {
        idCliente = c.id;
        await tx
          .update(clientes)
          .set({
            dni: c.dni ?? null,
            nombre: c.nombre,
            fechaDeNacimiento: c.fecha_de_nacimiento ?? null,
            tiendaId: c.tienda_id ?? null,
          })
          .where(eq(clientes.id, c.id));
      } else {
        const existente = c.dni ? await buscarPorDni(tx, c.dni) : null;
        idCliente = existente ? existente.id : (await crearCliente(tx, c, null)).id;
      }
    }

    const e = entrada.expediente;
    const idTienda = e.id_tienda ?? (await tiendaUnica(tx, usuario.idUsuario));
    const idEstado = await resolverEstado(tx, e.id_estado_vehiculo, e.estado_nombre);
    const [tipoVenta] = e.id_tipo_de_venta ? await tx.select().from(tipoDeVenta).where(eq(tipoDeVenta.idTipoDeVenta, e.id_tipo_de_venta)) : [];
    if (e.fecha_matriculacion && !e.fecha_rci && tipoVenta?.requiereRciAlMatricular) avisos.push({ campo: "fecha_rci", mensaje: avisoRciObligatoria(tipoVenta.nombreTipoVenta) });
    else if (e.fecha_facturacion && !e.fecha_rci && tipoVenta?.requiereRciAlMatricular) avisos.push({ campo: "fecha_rci", mensaje: avisoRciObligatoria(tipoVenta.nombreTipoVenta, undefined, "facturar") });
    const [estadoNuevo] = idEstado ? await tx.select().from(estadoVehiculo).where(eq(estadoVehiculo.idEstadoVehiculo, idEstado)) : [];
    const [nuevo] = await tx
      .insert(expedientes)
      .values({
        idUsuario: e.id_usuario ?? usuario.idUsuario,
        idCliente,
        idModelo: e.id_modelo ?? null,
        idTienda,
        fechaExpediente: e.fecha_expediente ?? hoyIso(),
        fechaAfectacion: e.fecha_afectacion ?? null,
        fechaMatriculacion: e.fecha_matriculacion ?? null,
        fechaEntrega: e.fecha_entrega ?? null,
        fechaRci: e.fecha_rci ?? null,
        // En un VN la facturación es, por defecto, la de matriculación; en un VO, la de la RCI (o el fin de mes del pedido si es de contado)
        fechaFacturacion: e.fecha_facturacion ?? (estadoNuevo?.clase === "VN" ? (e.fecha_matriculacion ?? null) : estadoNuevo?.clase === "VO" ? facturacionPorDefectoVo(e.fecha_rci, e.fecha_expediente ?? hoyIso()) : null),
        matricula: e.matricula ?? null,
        vin: e.vin ?? null,
        comentarios: e.comentarios ?? null,
        idTipoDeVenta: e.id_tipo_de_venta ?? null,
        idEstadoVehiculo: idEstado,
        cobradoOtraFecha: e.cobrado_otra_fecha ?? false,
        fechaCobrado: e.fecha_cobrado ?? null,
      })
      .returning({ id: expedientes.idExpediente });
    await aplicarReglasSemaforo(tx, [nuevo.id]);
    return { valor: nuevo.id, idsDespues: [nuevo.id] };
  });
  const creado = await obtenerExpediente(ej, id);
  if (!creado) throw new HttpError(500, "No se pudo leer el expediente creado");
  return creado;
}

async function restringirPorTienda(ej: Ejecutor): Promise<boolean> {
  const [a] = await ej.select().from(ajustes).where(eq(ajustes.clave, "restringir_por_tienda"));
  return a?.valor === "true";
}

/**
 * Endurecimiento opcional (ajuste `restringir_por_tienda`, desactivado por defecto como el original):
 * jefe_tienda solo sobre expedientes de sus tiendas y vendedor solo sobre los propios.
 */
export async function comprobarAlcance(ej: Ejecutor, usuario: UsuarioActual, ids: number[]): Promise<void> {
  if (!(await restringirPorTienda(ej))) return;
  if (esAdministrador(usuario.rol) || usuario.rol === "director" || usuario.rol === "jefe_zona") return;
  const filas = await ej
    .select({ id: expedientes.idExpediente, u: expedientes.idUsuario, t: expedientes.idTienda })
    .from(expedientes)
    .where(inArray(expedientes.idExpediente, ids));
  if (usuario.rol === "jefe_tienda") {
    const mias = new Set(
      (await ej.select().from(usuariosTiendas).where(eq(usuariosTiendas.idUsuario, usuario.idUsuario))).map(
        (x) => x.idTienda,
      ),
    );
    if (filas.some((f) => f.t === null || !mias.has(f.t))) {
      throw new HttpError(403, "No tienes permiso sobre estos expedientes");
    }
    return;
  }
  if (filas.some((f) => f.u !== usuario.idUsuario)) {
    throw new HttpError(403, "No tienes permiso sobre estos expedientes");
  }
}

type CamposActualizables = Partial<typeof expedientes.$inferInsert>;

/** Copia al destino solo las claves con valor definido (null sí cuenta: borra el dato). */
function fusionar(destino: CamposActualizables, origen: CamposActualizables): void {
  for (const [k, v] of Object.entries(origen)) {
    if (v !== undefined) (destino as Record<string, unknown>)[k] = v;
  }
}

/** Algo que falta o no cuadra pero que NO impide guardar: el expediente se guarda igualmente y la pantalla avisa y señala el campo. */
export interface AvisoGuardado {
  /** Campo del expediente al que se refiere (por ejemplo «fecha_rci»). */
  campo: string;
  mensaje: string;
  idExpediente?: number;
}

/** Mensaje cuando un tipo de pago exige fecha RCI y se intenta matricular o facturar sin ella. */
function avisoRciObligatoria(nombreTipo: string, idExpediente?: number, accion: "matricular" | "facturar" = "matricular"): string {
  return `${idExpediente ? `Expediente ${idExpediente}: ` : ""}falta la fecha RCI (contratación de la financiera): los pagos «${nombreTipo}» la piden para poder ${accion}. Se ha guardado igualmente; indícala cuando la tengas.`;
}

/**
 * Reglas de fechas al escribir expedientes (antes de aplicar los cambios):
 * 1. Si el tipo de pago exige fecha RCI («Requerido al matricular»), no se puede poner fecha de matriculación ni de facturación sin ella.
 * 2. En un VN la fecha de facturación acompaña a la de matriculación mientras no se haya cambiado a mano (vacía o igual a la
 *    matriculación anterior); si el vendedor la fija a otra fecha, se respeta y es la que cuenta para comisionar.
 * Devuelve las facturaciones que hay que fijar después de aplicar el cambio, agrupadas por valor.
 */
async function prepararFechas(tx: Ejecutor, ids: number[], set: CamposActualizables, avisos: AvisoGuardado[]): Promise<{ ids: number[]; fecha: string | null }[]> {
  const toca = set.fechaMatriculacion !== undefined || set.fechaExpediente !== undefined || set.fechaFacturacion !== undefined || set.fechaRci !== undefined || set.idTipoDeVenta !== undefined || set.idEstadoVehiculo !== undefined;
  if (!toca || ids.length === 0) return [];
  const filas = await tx
    .select({ id: expedientes.idExpediente, mat: expedientes.fechaMatriculacion, rci: expedientes.fechaRci, fexp: expedientes.fechaExpediente, fact: expedientes.fechaFacturacion, tipo: expedientes.idTipoDeVenta, estado: expedientes.idEstadoVehiculo })
    .from(expedientes)
    .where(and(inArray(expedientes.idExpediente, ids), isNull(expedientes.eliminadoEn)));
  const tipos = new Map((await tx.select().from(tipoDeVenta)).map((t) => [t.idTipoDeVenta, t]));
  const clases = new Map((await tx.select().from(estadoVehiculo)).map((e) => [e.idEstadoVehiculo, e.clase]));
  const grupos = new Map<string | null, number[]>();
  for (const f of filas) {
    const mat = set.fechaMatriculacion !== undefined ? set.fechaMatriculacion : f.mat;
    const rci = set.fechaRci !== undefined ? set.fechaRci : f.rci;
    const tipo = tipos.get(set.idTipoDeVenta !== undefined ? (set.idTipoDeVenta ?? -1) : (f.tipo ?? -1));
    // Facturación: solo se comprueba si se está poniendo ahora, o si se quita la RCI o se cambia el tipo de pago (los expedientes
    // que ya incumplían la regla no se tocan mientras no se edite ninguno de esos datos)
    const factFinal = set.fechaFacturacion !== undefined ? set.fechaFacturacion : f.fact;
    // (los formularios envían todos los campos aunque no se hayan tocado: solo cuenta lo que cambia respecto a lo guardado)
    const revisaFact = (set.fechaFacturacion !== undefined && !!set.fechaFacturacion && set.fechaFacturacion !== f.fact) || (set.fechaRci !== undefined && set.fechaRci !== f.rci) || (set.idTipoDeVenta !== undefined && set.idTipoDeVenta !== f.tipo);
    if (mat && !rci && tipo?.requiereRciAlMatricular) avisos.push({ campo: "fecha_rci", idExpediente: f.id, mensaje: avisoRciObligatoria(tipo.nombreTipoVenta, ids.length > 1 ? f.id : undefined) });
    else if (revisaFact && factFinal && !rci && tipo?.requiereRciAlMatricular) avisos.push({ campo: "fecha_rci", idExpediente: f.id, mensaje: avisoRciObligatoria(tipo.nombreTipoVenta, ids.length > 1 ? f.id : undefined, "facturar") });
    const clase = clases.get(set.idEstadoVehiculo !== undefined ? (set.idEstadoVehiculo ?? -1) : (f.estado ?? -1));
    const manual = set.fechaFacturacion !== undefined && set.fechaFacturacion !== f.fact;
    if (clase === "VN" && !manual && (f.fact === null || f.fact === f.mat) && (mat ?? null) !== f.fact) {
      const clave = mat ?? null;
      grupos.set(clave, [...(grupos.get(clave) ?? []), f.id]);
    }
    // En un VO la facturación sigue a la RCI (o al fin de mes del pedido) mientras no se haya fijado a mano otra fecha
    if (clase === "VO" && !manual) {
      const antes = facturacionPorDefectoVo(f.rci, f.fexp);
      const despues = facturacionPorDefectoVo(rci, set.fechaExpediente !== undefined ? set.fechaExpediente : f.fexp);
      if ((f.fact === null || f.fact === antes) && despues !== f.fact) grupos.set(despues, [...(grupos.get(despues) ?? []), f.id]);
    }
  }
  return [...grupos].map(([fecha, idsGrupo]) => ({ ids: idsGrupo, fecha }));
}

async function aplicarFacturaciones(tx: Ejecutor, grupos: { ids: number[]; fecha: string | null }[]): Promise<void> {
  for (const g of grupos) await tx.update(expedientes).set({ fechaFacturacion: g.fecha }).where(inArray(expedientes.idExpediente, g.ids));
}

/** Actualiza un expediente (solo los campos recibidos) o un lote (los campos vacíos no se tocan). */
export async function actualizarExpedientes(
  ej: Ejecutor,
  usuario: UsuarioActual,
  entrada: EntradaActualizarExpediente,
): Promise<{ actualizados: number; impactos: ImpactoCerrado[]; cliente?: { id: number; accion: "actualizado" | "creado" | "asociado_existente" }; avisos: AvisoGuardado[] }> {
  const avisos: AvisoGuardado[] = [];
  if (entrada.modo === "lote") {
    const e = entrada.expediente;
    const set: CamposActualizables = {};
    fusionar(set, {
      idModelo: e.id_modelo ?? undefined,
      idTipoDeVenta: e.id_tipo_de_venta ?? undefined,
      idUsuario: e.id_usuario ?? undefined,
      fechaExpediente: e.fecha_expediente ?? undefined,
      fechaAfectacion: e.fecha_afectacion ?? undefined,
      fechaRci: e.fecha_rci ?? undefined,
      fechaMatriculacion: e.fecha_matriculacion ?? undefined,
      fechaEntrega: e.fecha_entrega ?? undefined,
      fechaFacturacion: e.fecha_facturacion ?? undefined,
      deshabilitado: e.deshabilitado,
    });
    if (Object.keys(set).length === 0) throw new HttpError(400, "No se seleccionaron datos para modificar");
    await comprobarAlcance(ej, usuario, entrada.ids);
    const { valor, recalculos } = await conRecalculo(ej, entrada.ids, "Edición de expedientes en lote", async (tx) => {
      const facturaciones = await prepararFechas(tx, entrada.ids, set, avisos);
      const filas = await tx
        .update(expedientes)
        .set(set)
        .where(and(inArray(expedientes.idExpediente, entrada.ids), isNull(expedientes.eliminadoEn)))
        .returning({ id: expedientes.idExpediente });
      await aplicarFacturaciones(tx, facturaciones);
      await aplicarReglasSemaforo(tx, entrada.ids);
      return { valor: filas.length, idsDespues: entrada.ids };
    });
    return { actualizados: valor, impactos: impactos(recalculos), avisos };
  }

  const e = entrada.expediente;
  const set: CamposActualizables = {};
  // Un "" en una fecha equivale a borrarla (NULL); un id vacío desasigna la relación.
  fusionar(set, {
    idUsuario: e.id_usuario,
    idModelo: e.id_modelo,
    idTienda: e.id_tienda,
    idTipoDeVenta: e.id_tipo_de_venta,
    idEstadoVehiculo: e.id_estado_vehiculo,
    fechaExpediente: e.fecha_expediente,
    fechaAfectacion: e.fecha_afectacion,
    fechaMatriculacion: e.fecha_matriculacion,
    fechaEntrega: e.fecha_entrega,
    fechaRci: e.fecha_rci,
    fechaFacturacion: e.fecha_facturacion,
    fechaCobrado: e.fecha_cobrado,
    matricula: e.matricula,
    vin: e.vin,
    comentarios: e.comentarios,
    cobradoOtraFecha: e.cobrado_otra_fecha,
    comisionCobrada: e.comision_cobrada,
    comisionCocheCobrada: e.comision_coche_cobrada,
    comisionUsadoCobrada: e.comision_usado_cobrada,
    comisionFinanciacionCobrada: e.comision_financiacion_cobrada,
    comisionPreferenceCobrada: e.comision_preference_cobrada,
    comisionBonusCobrada: e.comision_bonus_cobrada,
    puntos: e.puntos,
    idPromocion: e.id_promocion,
    comisionCocheManual: e.comision_coche_manual,
    comisionFinanciacionManual: e.comision_financiacion_manual,
    conceptosEspeciales: e.conceptos_especiales as ConceptoEspecial[] | undefined,
    bonusManuales: e.bonus_manuales,
    deshabilitado: e.deshabilitado,
    idCliente: entrada.id_cliente,
  });
  if (Object.keys(set).length === 0 && !entrada.cliente) throw new HttpError(400, "No hay datos que actualizar");
  await comprobarAlcance(ej, usuario, [entrada.id_expediente]);
  let clienteResultado: { id: number; accion: "actualizado" | "creado" | "asociado_existente" } | undefined;
  const { valor, recalculos } = await conRecalculo(ej, [entrada.id_expediente], "Edición de expediente", async (tx) => {
    // Cliente y expediente se guardan juntos: si falla una de las dos partes no se guarda ninguna
    const c = entrada.cliente;
    if (c) {
      if (c.id) {
        await actualizarCliente(tx, c.id, c);
        clienteResultado = { id: c.id, accion: "actualizado" };
        set.idCliente = c.id;
      } else {
        const existente = c.dni ? await buscarPorDni(tx, c.dni) : null;
        const id = existente ? existente.id : (await crearCliente(tx, c, usuario.tiendaPredeterminadaId)).id;
        clienteResultado = { id, accion: existente ? "asociado_existente" : "creado" };
        set.idCliente = id;
      }
    }
    if (Object.keys(set).length === 0) throw new HttpError(400, "No hay datos que actualizar");
    const facturaciones = await prepararFechas(tx, [entrada.id_expediente], set, avisos);
    const filas = await tx
      .update(expedientes)
      .set(set)
      .where(and(eq(expedientes.idExpediente, entrada.id_expediente), isNull(expedientes.eliminadoEn)))
      .returning({ id: expedientes.idExpediente });
    await aplicarFacturaciones(tx, facturaciones);
    await aplicarReglasSemaforo(tx, [entrada.id_expediente]);
    return { valor: filas.length, idsDespues: [entrada.id_expediente] };
  });
  if (valor === 0) throw new HttpError(404, "Expediente no encontrado");
  return { actualizados: 1, impactos: impactos(recalculos), cliente: clienteResultado, avisos };
}

/**
 * Duplica expedientes (para probar el sistema y su rendimiento): `copias` de cada uno, en una sola transacción y con un solo
 * envío al servidor, de modo que si algo falla no se crea ninguna copia. Se copia todo (cliente, vendedor, tipo de venta,
 * fechas, comisiones a mano…) salvo el bastidor y la matrícula, que quedan vacíos para no chocar con otros expedientes, y los
 * documentos adjuntos, que no se copian. Cada copia lleva `copia_de` para localizarla y borrarla después.
 */
export async function duplicarExpedientes(
  ej: Ejecutor,
  usuario: UsuarioActual,
  entrada: EntradaDuplicarExpedientes,
): Promise<{ creados: number; impactos: ImpactoCerrado[]; copia: { nombre: string; creadaAhora: boolean; milisegundos: number } | null }> {
  if (!puedeCrearExpedientes(usuario.rol)) throw new HttpError(403, "No tienes permiso para crear expedientes");
  const ids = [...new Set(entrada.ids)];
  if (ids.length * entrada.copias > MAX_COPIAS_TOTAL) throw new HttpError(400, `Demasiadas copias de una vez (${ids.length * entrada.copias}). El máximo es ${MAX_COPIAS_TOTAL}.`);
  await comprobarAlcance(ej, usuario, ids);
  // Operación grande: antes se exige una copia de seguridad reciente y válida (se reutiliza la de los últimos 15 minutos o se crea una nueva)
  let copia: { nombre: string; creadaAhora: boolean; milisegundos: number } | null = null;
  if (ids.length * entrada.copias > UMBRAL_COPIA_PREVIA && !entrada.sin_copia) {
    try {
      copia = await asegurarCopiaReciente(ej, usuario.idUsuario, 15, "Antes de duplicar expedientes en bloque.");
    } catch (e) {
      throw new HttpError(409, `COPIA_PREVIA: No se ha duplicado nada porque no se pudo hacer la copia de seguridad previa. ${e instanceof Error ? e.message : ""}`.trim());
    }
  }
  const { valor, recalculos } = await conRecalculo(ej, [], "Duplicado de expedientes", async (tx) => {
    const origen = await tx.select().from(expedientes).where(and(inArray(expedientes.idExpediente, ids), isNull(expedientes.eliminadoEn)));
    if (origen.length !== ids.length) throw new HttpError(404, "Alguno de los expedientes seleccionados ya no existe.");
    const filas: (typeof expedientes.$inferInsert)[] = [];
    for (const o of origen) {
      const { idExpediente, matricula: _matricula, vin: _vin, eliminadoEn: _eliminado, ...datos } = o;
      void _matricula;
      void _vin;
      void _eliminado;
      for (let i = 0; i < entrada.copias; i++) {
        filas.push({
          ...datos,
          matricula: null,
          vin: null,
          copiaDe: idExpediente,
          copiaEtiqueta: entrada.etiqueta !== false,
          comisionCobrada: false,
          comisionCocheCobrada: false,
          comisionUsadoCobrada: false,
          comisionFinanciacionCobrada: false,
          comisionPreferenceCobrada: false,
          comisionBonusCobrada: false,
        });
      }
    }
    const nuevos: number[] = [];
    for (let i = 0; i < filas.length; i += 500) {
      const r = await tx.insert(expedientes).values(filas.slice(i, i + 500)).returning({ id: expedientes.idExpediente });
      nuevos.push(...r.map((x) => x.id));
    }
    return { valor: nuevos.length, idsDespues: nuevos };
  });
  return { creados: valor, impactos: impactos(recalculos), copia };
}

/** Borrado lógico: el expediente se conserva con `eliminado_en` (no cuenta en listados, comisiones ni puntos). */
export async function eliminarExpedientes(ej: Ejecutor, usuario: UsuarioActual, ids: number[]): Promise<number> {
  await comprobarAlcance(ej, usuario, ids);
  const { valor } = await conRecalculo(ej, ids, "Baja de expediente", async (tx) => {
    const filas = await tx
      .update(expedientes)
      .set({ eliminadoEn: new Date() })
      .where(and(inArray(expedientes.idExpediente, ids), isNull(expedientes.eliminadoEn)))
      .returning({ id: expedientes.idExpediente });
    return { valor: filas.length, idsDespues: [] };
  });
  return valor;
}
