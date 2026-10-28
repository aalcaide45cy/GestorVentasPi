import { and, asc, desc, eq, ilike, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { ExpedienteDto } from "@/lib/dto";
import type { Ejecutor } from "@/db";
import {
  clientes,
  emailsClientes,
  estadoVehiculo,
  expedientes,
  importacionesBloques,
  importacionesRegistros,
  marcas,
  modelos,
  telefonosClientes,
  tiendas,
  tipoDeVenta,
  usuariosTiendas,
} from "@/db/schema";
import type { UsuarioActual } from "@/lib/auth/sesion";
import { limpiarMatricula, limpiarTelefono, parseFechaFlexible } from "@/lib/fechas-import";
import { aDto, relacionesExpediente } from "./expedientes";
import { aplicarReglasSemaforo } from "./reglas-semaforo";
import { elegirModeloExistente } from "@/lib/documentos/modelos";
import { escaparLike, hoyIso } from "./comun";
import { TareaCancelada } from "./tareas";

/* ------------------------------------------------------------------ */
/* Esquemas                                                            */
/* ------------------------------------------------------------------ */

const texto = z.string().nullable().optional();

export const esquemaImportacionCsv = z.object({
  filename: z.string().max(255).optional(),
  /** Pantalla con «Permitir expedientes duplicados» activa: no se omiten filas con bastidor o matrícula repetidos. */
  permitir_duplicados: z.boolean().optional(),
  items: z
    .array(
      z.object({
        cliente_nombre: texto,
        cliente_dni: texto,
        cliente_fecha_nacimiento: texto,
        cliente_emails: texto,
        cliente_telefonos: texto,
        marca_nombre: texto,
        marca_activo: texto,
        marca_acceso_rapido: texto,
        marca_sistema_comisiones: texto,
        modelo_nombre: texto,
        modelo_acceso_rapido: texto,
        modelo_orden_acceso_rapido: texto,
        tipo_venta_nombre: texto,
        tipo_venta_color: texto,
        estado_vehiculo_nombre: texto,
        estado_vehiculo_predeterminado: texto,
        fecha_expediente: texto,
        fecha_afectacion: texto,
        fecha_rci: texto,
        fecha_matriculacion: texto,
        fecha_entrega: texto,
        matricula: texto,
        vin: texto,
      }),
    )
    .max(20000),
});
export type EntradaImportacionCsv = z.infer<typeof esquemaImportacionCsv>;

export const esquemaVerificarExcel = z.object({
  rows: z
    .array(z.object({ rowIdx: z.number().int(), cliente: z.string().nullable().optional() }))
    .max(20000),
});

const fechaExcel = z.string().nullable().optional();
export const esquemaProcesarExcel = z.object({
  filename: z.string().max(255).optional(),
  permitir_duplicados: z.boolean().optional(),
  updates: z
    .array(
      z.object({
        id_cliente: z.number().int().positive().nullable().optional(),
        id_expediente: z.number().int().positive().nullable().optional(),
        nif: z.string().nullable().optional(),
        bastidor: z.string().nullable().optional(),
        matricula: z.string().nullable().optional(),
        f_afect: fechaExcel,
        f_mat: fechaExcel,
        email: z.string().nullable().optional(),
        f_exp: fechaExcel,
        telefono: z.union([z.string(), z.number()]).nullable().optional(),
        f_entrega: fechaExcel,
      }),
    )
    .max(20000),
});
export type EntradaProcesarExcel = z.infer<typeof esquemaProcesarExcel>;

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const limpio = (v: string | null | undefined) => (v ?? "").trim();

/** Convierte `valor:tipo|valor:tipo` en pares; el tipo por defecto es «Principal». */
function pares(cadena: string): { valor: string; tipo: string }[] {
  return cadena
    .split("|")
    .map((p) => {
      const [valor, tipo] = p.split(":");
      return { valor: (valor ?? "").trim(), tipo: tipo ? tipo.trim() : "Principal" };
    })
    .filter((p) => p.valor.length > 0);
}

async function tiendaUnica(ej: Ejecutor, idUsuario: number): Promise<number | null> {
  const filas = await ej.select().from(usuariosTiendas).where(eq(usuariosTiendas.idUsuario, idUsuario));
  return filas.length === 1 ? filas[0].idTienda : null;
}

async function crearBloque(ej: Ejecutor, usuario: UsuarioActual, nombre: string, tipo: "CSV" | "Excel") {
  const [bloque] = await ej
    .insert(importacionesBloques)
    .values({ fecha: new Date().toISOString(), nombreArchivo: nombre, tipoArchivo: tipo, usuarioId: usuario.idUsuario })
    .returning();
  return bloque;
}

/* ------------------------------------------------------------------ */
/* Importación CSV de expedientes                                      */
/* ------------------------------------------------------------------ */

async function resolverCliente(ej: Ejecutor, item: EntradaImportacionCsv["items"][number]): Promise<number | null> {
  const nombre = limpio(item.cliente_nombre);
  if (!nombre) return null;
  const dni = limpio(item.cliente_dni);
  const nacimiento = parseFechaFlexible(limpio(item.cliente_fecha_nacimiento));

  let existente = dni ? (await ej.select().from(clientes).where(and(isNull(clientes.eliminadoEn), eq(clientes.dni, dni))).limit(1))[0] : undefined;
  if (!existente) {
    existente = (await ej.select().from(clientes).where(and(isNull(clientes.eliminadoEn), ilike(clientes.nombre, escaparLike(nombre)))).limit(1))[0];
  }

  let idCliente: number;
  if (existente) {
    idCliente = existente.id;
    const cambios: Partial<typeof clientes.$inferInsert> = {};
    if (dni && existente.dni !== dni) cambios.dni = dni;
    if (nacimiento && existente.fechaDeNacimiento !== nacimiento) cambios.fechaDeNacimiento = nacimiento;
    if (Object.keys(cambios).length > 0) await ej.update(clientes).set(cambios).where(eq(clientes.id, idCliente));
  } else {
    const [nuevo] = await ej
      .insert(clientes)
      .values({ clienteId: crypto.randomUUID(), dni: dni || null, nombre, fechaDeNacimiento: nacimiento })
      .returning();
    idCliente = nuevo.id;
  }

  // Los correos y teléfonos del archivo sustituyen a los existentes (como la aplicación original).
  if (item.cliente_emails !== undefined && item.cliente_emails !== null) {
    await ej.delete(emailsClientes).where(eq(emailsClientes.idCliente, idCliente));
    const lista = pares(item.cliente_emails);
    if (lista.length > 0) {
      await ej.insert(emailsClientes).values(lista.map((p) => ({ idCliente, email: p.valor, tipoEmail: p.tipo })));
    }
  }
  if (item.cliente_telefonos !== undefined && item.cliente_telefonos !== null) {
    await ej.delete(telefonosClientes).where(eq(telefonosClientes.idCliente, idCliente));
    const lista = pares(item.cliente_telefonos);
    if (lista.length > 0) {
      await ej.insert(telefonosClientes).values(lista.map((p) => ({ idCliente, telefono: p.valor, tipoTelefono: p.tipo })));
    }
  }
  return idCliente;
}

/**
 * Enlaza con la marca y el modelo que YA existen (sin distinguir mayúsculas). Nunca crea ni modifica marcas ni modelos: lo que no
 * se reconoce deja el expediente sin modelo, para que se elija a mano.
 */
async function resolverModelo(ej: Ejecutor, item: EntradaImportacionCsv["items"][number]): Promise<number | null> {
  const nombreModelo = limpio(item.modelo_nombre);
  if (!nombreModelo) return null;
  const nombreMarca = limpio(item.marca_nombre);
  let idMarca: number | null = null;
  if (nombreMarca) {
    const [m] = await ej.select().from(marcas).where(and(ilike(marcas.nombre, escaparLike(nombreMarca)), isNull(marcas.eliminadoEn))).limit(1);
    if (!m) return null;
    idMarca = m.idMarca;
  }
  const existentes = await ej
    .select({ idModelo: modelos.idModelo, nombre: modelos.nombreModelo })
    .from(modelos)
    .where(and(isNull(modelos.eliminadoEn), idMarca ? eq(modelos.marcaId, idMarca) : undefined));
  // «Nuevo Espace» es Espace, «Clio CL6» es Clio…: solo cuenta el modelo base, y nunca se crea uno nuevo
  const exacto = existentes.find((m) => m.nombre.trim().toLowerCase() === nombreModelo.toLowerCase());
  return (exacto ?? elegirModeloExistente(nombreModelo, existentes))?.idModelo ?? null;
}

/** Enlaza con el tipo de venta que ya existe; no crea ni cambia ninguno. */
async function resolverTipoVenta(ej: Ejecutor, item: EntradaImportacionCsv["items"][number]): Promise<number | null> {
  const nombre = limpio(item.tipo_venta_nombre);
  if (!nombre) return null;
  const [existente] = await ej.select().from(tipoDeVenta).where(and(ilike(tipoDeVenta.nombreTipoVenta, escaparLike(nombre)), isNull(tipoDeVenta.eliminadoEn))).limit(1);
  return existente?.idTipoDeVenta ?? null;
}

/** Enlaza con el estado de vehículo que ya existe; no crea ni cambia ninguno. */
async function resolverEstado(ej: Ejecutor, item: EntradaImportacionCsv["items"][number]): Promise<number | null> {
  const nombre = limpio(item.estado_vehiculo_nombre);
  if (!nombre) return null;
  const [existente] = await ej
    .select()
    .from(estadoVehiculo)
    .where(and(ilike(estadoVehiculo.nombreEstadoVehiculo, escaparLike(nombre)), isNull(estadoVehiculo.eliminadoEn)))
    .limit(1);
  return existente?.idEstadoVehiculo ?? null;
}

export interface ResultadoImportacion {
  importados: number;
  omitidos: number;
  mensaje: string;
}

/**
 * Importa expedientes desde el CSV ya interpretado en el navegador. Todo el archivo va en una
 * transacción; cada fila en su propio punto de guardado, de modo que una fila defectuosa se
 * registra como omitida sin deshacer las demás.
 */
export async function importarExpedientesCsv(
  ej: Ejecutor,
  usuario: UsuarioActual,
  entrada: EntradaImportacionCsv,
): Promise<ResultadoImportacion> {
  return ej.transaction(async (tx) => {
    const idTienda = await tiendaUnica(tx, usuario.idUsuario);
    const bloque = await crearBloque(tx, usuario, entrada.filename || "archivo_importacion.csv", "CSV");
    let importados = 0;
    let omitidos = 0;

    for (const item of entrada.items) {
      const vin = limpio(item.vin);
      const matricula = limpiarMatricula(item.matricula);
      const nombreCliente = limpio(item.cliente_nombre) || "Desconocido";

      let duplicado = false;
      if (vin && !entrada.permitir_duplicados) duplicado = (await tx.select({ id: expedientes.idExpediente }).from(expedientes).where(and(isNull(expedientes.eliminadoEn), eq(expedientes.vin, vin))).limit(1)).length > 0;
      if (!duplicado && matricula && !entrada.permitir_duplicados) {
        duplicado = (await tx.select({ id: expedientes.idExpediente }).from(expedientes).where(and(isNull(expedientes.eliminadoEn), eq(expedientes.matricula, matricula))).limit(1)).length > 0;
      }
      if (duplicado) {
        omitidos++;
        await tx.insert(importacionesRegistros).values({
          bloqueId: bloque.id,
          tipoAccion: "omitido",
          clienteNombre: nombreCliente,
          matricula,
          bastidor: vin,
          cambios: "Omitido para evitar duplicidad de bastidor o matrícula.",
        });
        continue;
      }

      try {
        const idExpediente = await tx.transaction(async (sp) => {
          const idCliente = await resolverCliente(sp, item);
          const idModelo = await resolverModelo(sp, item);
          const idTipoDeVenta = await resolverTipoVenta(sp, item);
          const idEstadoVehiculo = await resolverEstado(sp, item);
          const [nuevo] = await sp
            .insert(expedientes)
            .values({
              idUsuario: usuario.idUsuario,
              idCliente,
              idModelo,
              idTienda,
              idTipoDeVenta,
              idEstadoVehiculo,
              fechaExpediente: parseFechaFlexible(item.fecha_expediente) ?? hoyIso(),
              fechaAfectacion: parseFechaFlexible(item.fecha_afectacion),
              fechaMatriculacion: parseFechaFlexible(item.fecha_matriculacion),
              fechaEntrega: parseFechaFlexible(item.fecha_entrega),
              fechaRci: parseFechaFlexible(item.fecha_rci),
              matricula: matricula || null,
              vin: vin || null,
            })
            .returning({ id: expedientes.idExpediente });
          await aplicarReglasSemaforo(sp, [nuevo.id]);
          return nuevo.id;
        });
        importados++;
        await tx.insert(importacionesRegistros).values({
          bloqueId: bloque.id,
          idExpediente,
          tipoAccion: "creado",
          clienteNombre: nombreCliente,
          matricula,
          bastidor: vin,
          cambios: "Expediente registrado desde CSV.",
        });
      } catch (e) {
        omitidos++;
        await tx.insert(importacionesRegistros).values({
          bloqueId: bloque.id,
          tipoAccion: "omitido",
          clienteNombre: nombreCliente,
          matricula,
          bastidor: vin,
          cambios: `Fila no importada: ${e instanceof Error ? e.message : "error desconocido"}`,
        });
      }
    }

    await tx.update(importacionesBloques).set({ creados: importados, omitidos }).where(eq(importacionesBloques.id, bloque.id));
    return {
      importados,
      omitidos,
      mensaje: `Importación completada: ${importados} importados, ${omitidos} duplicados omitidos.`,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Importación de Excel: verificar y procesar                          */
/* ------------------------------------------------------------------ */

export interface ExpedienteCandidato {
  id_expediente: number;
  modelo: string;
  marca: string;
  vin: string;
  matricula: string;
  fecha_afectacion: string;
  fecha_matriculacion: string;
  fecha_expediente: string;
}

export type ResultadoVerificacion =
  | { rowIdx: number; status: "no_match" }
  | {
      rowIdx: number;
      status: "ok";
      id_cliente: number;
      id_expediente: number;
      client: { nombre: string | null; dni: string | null };
      expediente: ExpedienteCandidato;
    }
  | {
      rowIdx: number;
      status: "multiple";
      id_cliente: number;
      client: { nombre: string | null; dni: string | null };
      expedientes: ExpedienteCandidato[];
    };

/** Busca, por nombre de cliente, el expediente que corresponde a cada fila del Excel. */
export async function verificarFilasExcel(
  ej: Ejecutor,
  filas: z.infer<typeof esquemaVerificarExcel>["rows"],
): Promise<ResultadoVerificacion[]> {
  const resultados: ResultadoVerificacion[] = [];
  for (const fila of filas) {
    const nombre = (fila.cliente ?? "").trim();
    if (!nombre) {
      resultados.push({ rowIdx: fila.rowIdx, status: "no_match" });
      continue;
    }
    const coincidentes = await ej.select().from(clientes).where(and(isNull(clientes.eliminadoEn), ilike(clientes.nombre, escaparLike(nombre))));
    if (coincidentes.length === 0) {
      resultados.push({ rowIdx: fila.rowIdx, status: "no_match" });
      continue;
    }
    const exps = await ej.query.expedientes.findMany({
      where: and(
        isNull(expedientes.eliminadoEn),
        inArray(
          expedientes.idCliente,
          coincidentes.map((c) => c.id),
        ),
      ),
      orderBy: [asc(expedientes.idExpediente)],
      with: { cliente: true, modelo: { with: { marca: true } } },
    });
    const candidato = (e: (typeof exps)[number]): ExpedienteCandidato => ({
      id_expediente: e.idExpediente,
      modelo: e.modelo?.nombreModelo || "Desconocido",
      marca: e.modelo?.marca?.nombre || "Desconocido",
      vin: e.vin || "",
      matricula: e.matricula || "",
      fecha_afectacion: e.fechaAfectacion || "",
      fecha_matriculacion: e.fechaMatriculacion || "",
      fecha_expediente: e.fechaExpediente || "",
    });
    if (exps.length === 0) {
      resultados.push({ rowIdx: fila.rowIdx, status: "no_match" });
    } else {
      const cliente = exps[0].cliente ?? coincidentes[0];
      const client = { nombre: cliente.nombre, dni: cliente.dni };
      if (exps.length === 1) {
        resultados.push({
          rowIdx: fila.rowIdx,
          status: "ok",
          id_cliente: cliente.id,
          id_expediente: exps[0].idExpediente,
          client,
          expediente: candidato(exps[0]),
        });
      } else {
        resultados.push({ rowIdx: fila.rowIdx, status: "multiple", id_cliente: cliente.id, client, expedientes: exps.map(candidato) });
      }
    }
  }
  return resultados;
}

/** Aplica las actualizaciones del Excel; solo se escriben los campos que traen un valor distinto. */
export async function procesarActualizacionesExcel(
  ej: Ejecutor,
  usuario: UsuarioActual,
  entrada: EntradaProcesarExcel,
  /** Para el avance de la tarea en segundo plano; si `cancelada()` es true se deshace todo (es una sola transacción). */
  seguimiento?: { avance: (hecho: number, total: number) => void; cancelada: () => boolean },
): Promise<{ procesados: number; modificados: number; omitidos: number; mensaje: string }> {
  return ej.transaction(async (tx) => {
    const bloque = await crearBloque(tx, usuario, entrada.filename || "archivo_excel.xlsx", "Excel");
    let procesados = 0;
    let modificados = 0;
    let omitidos = 0;
    let visto = 0;

    for (const u of entrada.updates) {
      if (seguimiento) {
        if (seguimiento.cancelada()) throw new TareaCancelada("Importación cancelada: no se ha cambiado nada");
        seguimiento.avance(visto++, entrada.updates.length);
      }
      if (!u.id_cliente || !u.id_expediente) {
        omitidos++;
        continue;
      }
      const idCliente = u.id_cliente;
      const idExpediente = u.id_expediente;
      const exp = await tx.query.expedientes.findFirst({ where: eq(expedientes.idExpediente, idExpediente), with: { cliente: true } });
      if (!exp) {
        omitidos++;
        continue;
      }
      const nombreCliente = exp.cliente?.nombre || "Desconocido";
      const bastidor = limpio(u.bastidor);
      const matricula = limpiarMatricula(u.matricula);

      let duplicado = false;
      if (bastidor && bastidor !== exp.vin && !entrada.permitir_duplicados) {
        duplicado =
          (await tx.select({ id: expedientes.idExpediente }).from(expedientes).where(and(isNull(expedientes.eliminadoEn), eq(expedientes.vin, bastidor), ne(expedientes.idExpediente, idExpediente))).limit(1)).length > 0;
      }
      if (!duplicado && matricula && matricula !== exp.matricula && !entrada.permitir_duplicados) {
        duplicado =
          (await tx.select({ id: expedientes.idExpediente }).from(expedientes).where(and(isNull(expedientes.eliminadoEn), eq(expedientes.matricula, matricula), ne(expedientes.idExpediente, idExpediente))).limit(1)).length > 0;
      }
      if (duplicado) {
        omitidos++;
        await tx.insert(importacionesRegistros).values({
          bloqueId: bloque.id,
          idExpediente,
          tipoAccion: "omitido",
          clienteNombre: nombreCliente,
          matricula: matricula || exp.matricula || "",
          bastidor: bastidor || exp.vin || "",
          cambios: "Omitido para evitar duplicidad de bastidor o matrícula en otro expediente.",
        });
        continue;
      }

      const cambios: Record<string, { old: string; new: string }> = {};
      const anotar = (campo: string, antes: string | null | undefined, despues: string) => {
        cambios[campo] = { old: antes ? antes : "(Vacío)", new: despues };
      };

      const cambiosCliente: Partial<typeof clientes.$inferInsert> = {};
      const nif = limpio(u.nif);
      if (nif && nif !== exp.cliente?.dni) {
        cambiosCliente.dni = nif;
        anotar("DNI/NIF", exp.cliente?.dni, nif);
      }

      const correo = limpio(u.email);
      let correoNuevo = false;
      if (correo) {
        const [ya] = await tx
          .select()
          .from(emailsClientes)
          .where(and(eq(emailsClientes.idCliente, idCliente), ilike(emailsClientes.email, escaparLike(correo))))
          .limit(1);
        if (!ya) {
          correoNuevo = true;
          anotar("Email", "(Ninguno)", correo);
        }
      }

      const telefono = limpiarTelefono(u.telefono);
      let telefonoNuevo = false;
      if (telefono) {
        const [ya] = await tx
          .select()
          .from(telefonosClientes)
          .where(and(eq(telefonosClientes.idCliente, idCliente), eq(telefonosClientes.telefono, telefono)))
          .limit(1);
        if (!ya) {
          telefonoNuevo = true;
          anotar("Teléfono", "(Ninguno)", telefono);
        }
      }

      const cambiosExp: Partial<typeof expedientes.$inferInsert> = {};
      if (bastidor && bastidor !== exp.vin) {
        cambiosExp.vin = bastidor;
        anotar("Bastidor", exp.vin, bastidor);
      }
      if (matricula && matricula !== exp.matricula) {
        cambiosExp.matricula = matricula;
        anotar("Matrícula", exp.matricula, matricula);
      }
      const fechas: [string | null | undefined, keyof typeof cambiosExp, string | null, string][] = [
        [u.f_afect, "fechaAfectacion", exp.fechaAfectacion, "Fecha Afectación"],
        [u.f_mat, "fechaMatriculacion", exp.fechaMatriculacion, "Fecha Matriculación"],
        [u.f_exp, "fechaExpediente", exp.fechaExpediente, "Fecha Expediente"],
        [u.f_entrega, "fechaEntrega", exp.fechaEntrega, "Fecha Entrega"],
      ];
      for (const [valor, campo, actual, etiqueta] of fechas) {
        const nueva = valor ? parseFechaFlexible(valor) : null;
        if (nueva && nueva !== actual) {
          (cambiosExp as Record<string, string>)[campo] = nueva;
          anotar(etiqueta, actual, nueva);
        }
      }

      if (Object.keys(cambios).length === 0) {
        omitidos++;
        procesados++;
        continue;
      }

      if (Object.keys(cambiosCliente).length > 0) await tx.update(clientes).set(cambiosCliente).where(eq(clientes.id, idCliente));
      if (correoNuevo) await tx.insert(emailsClientes).values({ idCliente, email: correo, tipoEmail: "Principal" });
      if (telefonoNuevo) await tx.insert(telefonosClientes).values({ idCliente, telefono, tipoTelefono: "Principal" });
      if (Object.keys(cambiosExp).length > 0) {
        await tx.update(expedientes).set(cambiosExp).where(eq(expedientes.idExpediente, idExpediente));
        await aplicarReglasSemaforo(tx, [idExpediente]);
      }

      modificados++;
      procesados++;
      await tx.insert(importacionesRegistros).values({
        bloqueId: bloque.id,
        idExpediente,
        tipoAccion: "modificado",
        clienteNombre: nombreCliente,
        matricula: matricula || exp.matricula || "",
        bastidor: bastidor || exp.vin || "",
        cambios: JSON.stringify(cambios),
      });
    }

    await tx.update(importacionesBloques).set({ creados: 0, modificados, omitidos }).where(eq(importacionesBloques.id, bloque.id));
    return {
      procesados,
      modificados,
      omitidos,
      mensaje: `Se han procesado con éxito ${procesados} expedientes (${modificados} modificados, ${omitidos} omitidos/sin cambios).`,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Importación CSV de clientes                                         */
/* ------------------------------------------------------------------ */

export const esquemaImportacionClientes = z.object({
  items: z
    .array(
      z.object({
        nombre: texto,
        dni: texto,
        fecha_de_nacimiento: texto,
        tienda_nombre: texto,
        emails: texto,
        telefonos: texto,
      }),
    )
    .max(20000),
});

export async function importarClientesCsv(
  ej: Ejecutor,
  entrada: z.infer<typeof esquemaImportacionClientes>,
): Promise<{ nuevos: number; actualizados: number; mensaje: string }> {
  return ej.transaction(async (tx) => {
    let nuevos = 0;
    let actualizados = 0;
    for (const item of entrada.items) {
      const nombre = limpio(item.nombre);
      if (!nombre) {
        actualizados++;
        continue;
      }
      const dni = limpio(item.dni);
      const nacimiento = parseFechaFlexible(limpio(item.fecha_de_nacimiento));
      let idTienda: number | null = null;
      if (limpio(item.tienda_nombre)) {
        const [t] = await tx.select().from(tiendas).where(ilike(tiendas.nombre, escaparLike(limpio(item.tienda_nombre)))).limit(1);
        idTienda = t?.idTienda ?? null;
      }

      let existente = dni ? (await tx.select().from(clientes).where(and(isNull(clientes.eliminadoEn), eq(clientes.dni, dni))).limit(1))[0] : undefined;
      if (!existente) existente = (await tx.select().from(clientes).where(and(isNull(clientes.eliminadoEn), ilike(clientes.nombre, escaparLike(nombre)))).limit(1))[0];

      let idCliente: number;
      if (existente) {
        idCliente = existente.id;
        const cambios: Partial<typeof clientes.$inferInsert> = {};
        if (dni && existente.dni !== dni) cambios.dni = dni;
        if (nacimiento && existente.fechaDeNacimiento !== nacimiento) cambios.fechaDeNacimiento = nacimiento;
        if (idTienda !== null && existente.tiendaId !== idTienda) cambios.tiendaId = idTienda;
        if (Object.keys(cambios).length > 0) await tx.update(clientes).set(cambios).where(eq(clientes.id, idCliente));
        actualizados++;
      } else {
        const [nuevo] = await tx
          .insert(clientes)
          .values({ clienteId: crypto.randomUUID(), dni: dni || null, nombre, fechaDeNacimiento: nacimiento, tiendaId: idTienda })
          .returning();
        idCliente = nuevo.id;
        nuevos++;
      }

      if (limpio(item.emails)) {
        await tx.delete(emailsClientes).where(eq(emailsClientes.idCliente, idCliente));
        const lista = pares(limpio(item.emails));
        if (lista.length > 0) await tx.insert(emailsClientes).values(lista.map((p) => ({ idCliente, email: p.valor, tipoEmail: p.tipo })));
      }
      if (limpio(item.telefonos)) {
        await tx.delete(telefonosClientes).where(eq(telefonosClientes.idCliente, idCliente));
        const lista = pares(limpio(item.telefonos));
        if (lista.length > 0) await tx.insert(telefonosClientes).values(lista.map((p) => ({ idCliente, telefono: p.valor, tipoTelefono: p.tipo })));
      }
    }
    return {
      nuevos,
      actualizados,
      mensaje: `Importación completada: ${nuevos} cliente(s) nuevos creados, ${actualizados} actualizado(s) o saltado(s).`,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Log de importaciones                                                */
/* ------------------------------------------------------------------ */

export interface BloqueImportacionDto {
  id: number;
  fecha: string;
  nombre_archivo: string;
  tipo_archivo: string;
  usuario_nombre: string | null;
  creados: number;
  modificados: number;
  omitidos: number;
  registros: {
    id: number;
    id_expediente: number | null;
    tipo_accion: string;
    cliente_nombre: string;
    matricula: string | null;
    bastidor: string | null;
    cambios: string | null;
    expediente: ExpedienteDto | null;
  }[];
}

export async function listarBloques(ej: Ejecutor): Promise<BloqueImportacionDto[]> {
  const filas = await ej.query.importacionesBloques.findMany({
    orderBy: [desc(importacionesBloques.id)],
    with: { registros: true, usuario: { columns: { nombre: true } } },
  });
  const idsExp = [...new Set(filas.flatMap((b) => b.registros.map((r) => r.idExpediente)).filter((i): i is number => i !== null))];
  const exps = idsExp.length ? await ej.query.expedientes.findMany({ where: inArray(expedientes.idExpediente, idsExp), with: relacionesExpediente }) : [];
  const mapa = new Map(exps.map((e) => [e.idExpediente, aDto(e)]));
  return filas.map((b) => ({
    id: b.id,
    fecha: b.fecha,
    nombre_archivo: b.nombreArchivo,
    tipo_archivo: b.tipoArchivo,
    usuario_nombre: b.usuario?.nombre ?? null,
    creados: b.creados,
    modificados: b.modificados,
    omitidos: b.omitidos,
    registros: b.registros
      .sort((a, c) => a.id - c.id)
      .map((r) => ({
        id: r.id,
        id_expediente: r.idExpediente,
        tipo_accion: r.tipoAccion,
        cliente_nombre: r.clienteNombre,
        matricula: r.matricula,
        bastidor: r.bastidor,
        cambios: r.cambios,
        expediente: r.idExpediente ? (mapa.get(r.idExpediente) ?? null) : null,
      })),
  }));
}

export async function eliminarBloques(ej: Ejecutor, ids: number[]): Promise<number> {
  const borrados = await ej.delete(importacionesBloques).where(inArray(importacionesBloques.id, ids)).returning({ id: importacionesBloques.id });
  return borrados.length;
}
