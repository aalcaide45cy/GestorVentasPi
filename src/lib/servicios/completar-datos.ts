import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { clientes, emailsClientes, estadoVehiculo, expedientes, importacionesBloques, importacionesRegistros, marcas, modelos, telefonosClientes } from "@/db/schema";
import { esAdministrador } from "@/lib/auth/permisos";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import { conRecalculo } from "./liquidaciones";

/**
 * Completar y corregir datos de expedientes que YA existen a partir de los listados del fabricante (Expedientes, Llamadas de
 * calidad…). Nunca crea expedientes, clientes ni modelos: solo propone rellenar huecos o corregir valores distintos, y la persona
 * elige qué aplicar. Todo queda en el log de importaciones y se puede deshacer.
 */

export const CAMPOS_COMPLETAR = ["vin", "matricula", "fecha_expediente", "fecha_afectacion", "fecha_matriculacion", "fecha_entrega", "fecha_facturacion", "dni", "codigo_postal", "email", "telefono"] as const;
export type CampoCompletar = (typeof CAMPOS_COMPLETAR)[number];

/** Etiquetas del log de importaciones (las mismas que usa la importación de Excel, para poder deshacer ambas). */
export const ETIQUETA_CAMPO: Record<CampoCompletar, string> = {
  vin: "Bastidor",
  matricula: "Matrícula",
  fecha_expediente: "Fecha Expediente",
  fecha_afectacion: "Fecha Afectación",
  fecha_matriculacion: "Fecha Matriculación",
  fecha_entrega: "Fecha Entrega",
  fecha_facturacion: "Fecha Facturación",
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

export const esquemaPrevisualizarCompletar = z.object({ filas: z.array(esquemaFilaCompletar).min(1).max(5000) });

export interface PropuestaCampo {
  campo: CampoCompletar;
  etiqueta: string;
  actual: string | null;
  nuevo: string;
  tipo: "rellenar" | "corregir";
  /** Aviso que se enseña junto al cambio (por ejemplo, que una fecha afecta a las comisiones). */
  aviso?: string;
}

export interface FilaPrevisualizada {
  fila: number;
  clienteListado: string;
  /** Datos del listado que ayudan a reconocer el coche. */
  resumen: string;
  idExpediente: number | null;
  clienteApp: string | null;
  vehiculoApp: string | null;
  /** Cómo se ha encontrado el expediente. */
  coincide: "bastidor" | "matricula" | "nif" | "nombre" | null;
  estado: "propuestas" | "sin_cambios" | "sin_coincidencia" | "ambiguo" | "anulado";
  motivo: string | null;
  propuestas: PropuestaCampo[];
}

export interface ResultadoPrevisualizar {
  filas: FilaPrevisualizada[];
  resumen: { filas: number; conCambios: number; sinCambios: number; sinCoincidencia: number; ambiguos: number; anuladas: number; cambios: number };
}

const norm = (t: string | null | undefined): string => (t ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const sinAcentos = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const nombreClave = (t: string | null | undefined): string => sinAcentos(t ?? "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
const MATRICULA_ESP = /^\d{4}[A-Z]{3}$/;

interface ExpedienteCargado {
  id: number;
  idUsuario: number | null;
  idCliente: number | null;
  vin: string | null;
  matricula: string | null;
  fechaExpediente: string | null;
  fechaAfectacion: string | null;
  fechaMatriculacion: string | null;
  fechaEntrega: string | null;
  fechaFacturacion: string | null;
  clase: string;
  marca: string;
  modelo: string;
  cliente: string | null;
  dni: string | null;
  codigoPostal: string | null;
}

async function cargarExpedientes(ej: Ejecutor, usuario: UsuarioActual): Promise<ExpedienteCargado[]> {
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
      fechaEntrega: expedientes.fechaEntrega,
      fechaFacturacion: expedientes.fechaFacturacion,
      clase: estadoVehiculo.clase,
      marca: marcas.nombre,
      modelo: modelos.nombreModelo,
      cliente: clientes.nombre,
      dni: clientes.dni,
      codigoPostal: clientes.codigoPostal,
    })
    .from(expedientes)
    .leftJoin(estadoVehiculo, eq(estadoVehiculo.idEstadoVehiculo, expedientes.idEstadoVehiculo))
    .leftJoin(modelos, eq(modelos.idModelo, expedientes.idModelo))
    .leftJoin(marcas, eq(marcas.idMarca, modelos.marcaId))
    .leftJoin(clientes, eq(clientes.id, expedientes.idCliente))
    .where(and(isNull(expedientes.eliminadoEn), esAdministrador(usuario.rol) ? undefined : eq(expedientes.idUsuario, usuario.idUsuario)))
    .orderBy(asc(expedientes.idExpediente))
    .limit(60000);
  return filas.map((f) => ({ ...f, clase: f.clase ?? "VN", marca: f.marca ?? "", modelo: f.modelo ?? "", cliente: f.cliente ?? null }));
}

/** Busca el expediente de una fila: primero por bastidor, luego matrícula, luego NIF y, por último, nombre (siempre sin duplicar dudas). */
function buscar(fila: FilaCompletar, idx: { vin: Map<string, ExpedienteCargado>; mat: Map<string, ExpedienteCargado>; nif: Map<string, ExpedienteCargado[]>; nombre: Map<string, ExpedienteCargado[]> }): { exp: ExpedienteCargado | null; como: FilaPrevisualizada["coincide"]; ambiguo: boolean } {
  const vin = norm(fila.bastidor);
  if (vin && idx.vin.has(vin)) return { exp: idx.vin.get(vin)!, como: "bastidor", ambiguo: false };
  const mat = norm(fila.matricula);
  if (mat && idx.mat.has(mat)) return { exp: idx.mat.get(mat)!, como: "matricula", ambiguo: false };
  const afinar = (lista: ExpedienteCargado[]): ExpedienteCargado[] => {
    if (lista.length <= 1) return lista;
    const marca = sinAcentos(fila.marca);
    const porMarca = marca ? lista.filter((e) => sinAcentos(e.marca) === marca) : lista;
    const base = porMarca.length > 0 ? porMarca : lista;
    // Entre varios del mismo cliente, el que aún no tiene bastidor ni matrícula es el que se está completando
    const vacios = base.filter((e) => !e.vin && !e.matricula);
    return vacios.length > 0 ? vacios : base;
  };
  for (const [clave, mapa, como] of [[norm(fila.nif), idx.nif, "nif"] as const, [nombreClave(fila.cliente), idx.nombre, "nombre"] as const]) {
    if (!clave) continue;
    const lista = afinar(mapa.get(clave) ?? []);
    if (lista.length === 1) return { exp: lista[0], como, ambiguo: false };
    if (lista.length > 1) return { exp: null, como, ambiguo: true };
  }
  return { exp: null, como: null, ambiguo: false };
}

/** Ofrece, para cada fila del listado, lo que se rellenaría o corregiría en el expediente que le corresponde. No guarda nada. */
export async function previsualizarCompletado(ej: Ejecutor, usuario: UsuarioActual, filas: FilaCompletar[]): Promise<ResultadoPrevisualizar> {
  const todos = await cargarExpedientes(ej, usuario);
  const idx = { vin: new Map<string, ExpedienteCargado>(), mat: new Map<string, ExpedienteCargado>(), nif: new Map<string, ExpedienteCargado[]>(), nombre: new Map<string, ExpedienteCargado[]>() };
  for (const e of todos) {
    if (norm(e.vin)) idx.vin.set(norm(e.vin), e);
    if (norm(e.matricula)) idx.mat.set(norm(e.matricula), e);
    for (const [clave, mapa] of [[norm(e.dni), idx.nif] as const, [nombreClave(e.cliente), idx.nombre] as const]) {
      if (!clave) continue;
      mapa.set(clave, [...(mapa.get(clave) ?? []), e]);
    }
  }
  const idsCliente = [...new Set(todos.map((e) => e.idCliente).filter((i): i is number => i !== null))];
  const correos = new Map<number, Set<string>>();
  const telefonos = new Map<number, Set<string>>();
  for (let i = 0; i < idsCliente.length; i += 2000) {
    const trozo = idsCliente.slice(i, i + 2000);
    for (const c of await ej.select({ id: emailsClientes.idCliente, v: emailsClientes.email }).from(emailsClientes).where(inArray(emailsClientes.idCliente, trozo))) {
      if (c.id !== null) correos.set(c.id, (correos.get(c.id) ?? new Set()).add(c.v.toLowerCase()));
    }
    for (const t of await ej.select({ id: telefonosClientes.idCliente, v: telefonosClientes.telefono }).from(telefonosClientes).where(inArray(telefonosClientes.idCliente, trozo))) {
      if (t.id !== null) telefonos.set(t.id, (telefonos.get(t.id) ?? new Set()).add(t.v.replace(/\D/g, "")));
    }
  }

  const salida: FilaPrevisualizada[] = [];
  for (const f of filas) {
    const base = { fila: f.fila, clienteListado: f.cliente, resumen: [f.marca, f.modelo, f.bastidor || f.matricula].filter(Boolean).join(" · ") };
    if (/anulad/i.test(f.estado)) {
      salida.push({ ...base, idExpediente: null, clienteApp: null, vehiculoApp: null, coincide: null, estado: "anulado", motivo: "Expediente anulado en el listado", propuestas: [] });
      continue;
    }
    const { exp, como, ambiguo } = buscar(f, idx);
    if (!exp) {
      salida.push({ ...base, idExpediente: null, clienteApp: null, vehiculoApp: null, coincide: como, estado: ambiguo ? "ambiguo" : "sin_coincidencia", motivo: ambiguo ? "Hay varios expedientes posibles: no se toca ninguno" : "No hay ningún expediente tuyo que coincida (no se crea nada)", propuestas: [] });
      continue;
    }
    const props: PropuestaCampo[] = [];
    const proponer = (campo: CampoCompletar, actual: string | null, nuevo: string | null, aviso?: string) => {
      if (!nuevo) return;
      const igual = campo === "vin" || campo === "matricula" || campo === "dni" ? norm(actual) === norm(nuevo) : (actual ?? "") === nuevo;
      if (igual) return;
      props.push({ campo, etiqueta: ETIQUETA_CAMPO[campo], actual: actual && actual !== "" ? actual : null, nuevo, tipo: actual ? "corregir" : "rellenar", aviso });
    };
    const esVo = exp.clase === "VO";
    proponer("vin", exp.vin, f.bastidor || null);
    const mat = norm(f.matricula);
    proponer("matricula", exp.matricula, mat && (MATRICULA_ESP.test(mat) || mat.length >= 5) ? f.matricula : null);
    proponer("fecha_expediente", exp.fechaExpediente, f.fCreado);
    proponer("fecha_afectacion", exp.fechaAfectacion, f.fAfectacion);
    // En un usado la fecha de matriculación es la del vehículo (años atrás): no es la de la venta y no se toca
    if (!esVo) proponer("fecha_matriculacion", exp.fechaMatriculacion, f.fMatriculacion ?? f.fechaDeMatricula, "Cambia el mes en que cuenta el coche para las comisiones");
    proponer("fecha_entrega", exp.fechaEntrega, f.fEntrega);
    if (!esVo) proponer("fecha_facturacion", exp.fechaFacturacion, f.fFactura, "Cambia el mes en que cuenta el coche para las comisiones");
    proponer("dni", exp.dni, f.nif || null);
    proponer("codigo_postal", exp.codigoPostal, f.codigoPostal || null);
    if (f.email && exp.idCliente !== null && !(correos.get(exp.idCliente)?.has(f.email.toLowerCase()) ?? false)) props.push({ campo: "email", etiqueta: ETIQUETA_CAMPO.email, actual: null, nuevo: f.email, tipo: "rellenar", aviso: "Se añade como correo del cliente" });
    const tel = f.telefono.replace(/\D/g, "");
    if (tel.length >= 9 && exp.idCliente !== null && !(telefonos.get(exp.idCliente)?.has(tel) ?? false)) props.push({ campo: "telefono", etiqueta: ETIQUETA_CAMPO.telefono, actual: null, nuevo: f.telefono, tipo: "rellenar", aviso: "Se añade como teléfono del cliente" });

    const vehiculoListado = sinAcentos(`${f.marca} ${f.modelo}`);
    const modeloDistinto = f.modelo && !sinAcentos(`${exp.marca} ${exp.modelo}`).split(" ").some((p) => p.length > 2 && vehiculoListado.includes(p));
    salida.push({
      ...base,
      idExpediente: exp.id,
      clienteApp: exp.cliente,
      vehiculoApp: [exp.marca, exp.modelo].filter(Boolean).join(" ") || null,
      coincide: como,
      estado: props.length > 0 ? "propuestas" : "sin_cambios",
      motivo: modeloDistinto ? `El modelo del listado («${f.marca} ${f.modelo}») se llama distinto en la app: no se toca el modelo` : null,
      propuestas: props,
    });
  }
  const cuenta = (e: FilaPrevisualizada["estado"]) => salida.filter((s) => s.estado === e).length;
  return {
    filas: salida,
    resumen: { filas: salida.length, conCambios: cuenta("propuestas"), sinCambios: cuenta("sin_cambios"), sinCoincidencia: cuenta("sin_coincidencia"), ambiguos: cuenta("ambiguo"), anuladas: cuenta("anulado"), cambios: salida.reduce((s, f) => s + f.propuestas.length, 0) },
  };
}

export const esquemaAplicarCompletado = z.object({
  archivo: z.string().max(255).default("listado"),
  cambios: z
    .array(z.object({ id_expediente: z.number().int().positive(), campos: z.array(z.object({ campo: z.enum(CAMPOS_COMPLETAR), valor: z.string().min(1).max(300) })).min(1).max(CAMPOS_COMPLETAR.length) }))
    .min(1)
    .max(5000),
});
export type EntradaAplicarCompletado = z.infer<typeof esquemaAplicarCompletado>;

const COLUMNA_EXPEDIENTE: Partial<Record<CampoCompletar, "vin" | "matricula" | "fechaExpediente" | "fechaAfectacion" | "fechaMatriculacion" | "fechaEntrega" | "fechaFacturacion">> = {
  vin: "vin",
  matricula: "matricula",
  fecha_expediente: "fechaExpediente",
  fecha_afectacion: "fechaAfectacion",
  fecha_matriculacion: "fechaMatriculacion",
  fecha_entrega: "fechaEntrega",
  fecha_facturacion: "fechaFacturacion",
};

/** Aplica solo lo que la persona ha elegido, recalcula las comisiones afectadas y lo deja en el log de importaciones. */
export async function aplicarCompletado(ej: Ejecutor, usuario: UsuarioActual, entrada: EntradaAplicarCompletado): Promise<{ expedientesCambiados: number; camposCambiados: number; omitidos: string[] }> {
  const ids = entrada.cambios.map((c) => c.id_expediente);
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
      for (const { campo, valor } of c.campos) {
        const col = COLUMNA_EXPEDIENTE[campo];
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
          setExp[col] = campo === "vin" ? valor.toUpperCase() : campo === "matricula" ? valor.toUpperCase().replace(/\s+/g, "") : valor;
          cambios[ETIQUETA_CAMPO[campo]] = { old: actual || "(Vacío)", new: setExp[col] };
        } else if (campo === "dni" || campo === "codigo_postal") {
          const colCli = campo === "dni" ? "dni" : "codigoPostal";
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
      if (Object.keys(setExp).length > 0) await tx.update(expedientes).set(setExp).where(eq(expedientes.idExpediente, exp.idExpediente));
      if (Object.keys(setCli).length > 0 && exp.idCliente !== null) await tx.update(clientes).set(setCli).where(eq(clientes.id, exp.idCliente));
      expCambiados++;
      campos += Object.keys(cambios).length;
      await tx.insert(importacionesRegistros).values({ bloqueId: bloque.id, idExpediente: exp.idExpediente, tipoAccion: "modificado", clienteNombre: exp.cliente?.nombre ?? "Desconocido", matricula: setExp.matricula ?? exp.matricula ?? "", bastidor: setExp.vin ?? exp.vin ?? "", cambios: JSON.stringify(cambios) });
    }
    await tx.update(importacionesBloques).set({ creados: 0, modificados: expCambiados, omitidos: omitidos.length }).where(eq(importacionesBloques.id, bloque.id));
    return { valor: { expedientesCambiados: expCambiados, camposCambiados: campos, omitidos }, idsDespues: ids };
  });
  return valor;
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
        } else if ((campo === "dni" || campo === "codigo_postal") && exp.idCliente !== null) {
          const colCli = campo === "dni" ? "dni" : "codigoPostal";
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
