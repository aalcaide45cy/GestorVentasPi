import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "@/db";
import { clientes, emailsClientes, expedientes, telefonosClientes } from "@/db/schema";
import type { ClienteDto } from "@/lib/dto";
import { HttpError } from "@/lib/auth/sesion";
import { escaparLike, fechaOpcional, idOpcional, textoOpcional } from "./comun";
import { clienteDto } from "./mapeos";

export const esquemaEmail = z.object({
  email: z.string().trim().min(1).max(255),
  tipo: z.string().trim().max(100).optional().nullable(),
  tipo_email: z.string().trim().max(100).optional().nullable(),
});

export const esquemaTelefono = z.object({
  telefono: z.string().trim().min(1).max(50),
  tipo: z.string().trim().max(100).optional().nullable(),
  tipo_telefono: z.string().trim().max(100).optional().nullable(),
});

export const esquemaCliente = z.object({
  id: idOpcional.optional(),
  dni: textoOpcional(50).optional(),
  nombre: z.string().trim().min(1, "Nombre es un campo obligatorio").max(255),
  fecha_de_nacimiento: fechaOpcional.optional(),
  tienda_id: idOpcional.optional(),
  emails: z.array(esquemaEmail).max(50).optional(),
  telefonos: z.array(esquemaTelefono).max(50).optional(),
});
export type EntradaCliente = z.infer<typeof esquemaCliente>;

const conContactos = { emails: true, telefonos: true } as const;

async function insertarContactos(tx: Ejecutor, idCliente: number, c: EntradaCliente): Promise<void> {
  const emails = (c.emails ?? []).filter((e) => e.email.length > 0);
  if (emails.length > 0) {
    await tx.insert(emailsClientes).values(
      emails.map((e) => ({ idCliente, email: e.email, tipoEmail: e.tipo ?? e.tipo_email ?? "Principal" })),
    );
  }
  const telefonos = (c.telefonos ?? []).filter((t) => t.telefono.length > 0);
  if (telefonos.length > 0) {
    await tx.insert(telefonosClientes).values(
      telefonos.map((t) => ({
        idCliente,
        telefono: t.telefono,
        tipoTelefono: t.tipo ?? t.tipo_telefono ?? "Principal",
      })),
    );
  }
}

export async function buscarPorDni(ej: Ejecutor, dni: string, excluirId?: number) {
  const [c] = await ej
    .select()
    .from(clientes)
    .where(and(isNull(clientes.eliminadoEn), excluirId ? and(eq(clientes.dni, dni), ne(clientes.id, excluirId)) : eq(clientes.dni, dni)))
    .limit(1);
  return c ?? null;
}

/** Crea un cliente con sus contactos. 409 si el DNI ya existe. */
export async function crearCliente(
  ej: Ejecutor,
  entrada: EntradaCliente,
  tiendaPorDefecto: number | null,
): Promise<ClienteDto> {
  return ej.transaction(async (tx) => {
    if (entrada.dni && (await buscarPorDni(tx, entrada.dni))) {
      throw new HttpError(409, "Ya existe un cliente registrado con este DNI/NIE.");
    }
    const [nuevo] = await tx
      .insert(clientes)
      .values({
        clienteId: randomUUID(),
        dni: entrada.dni ?? null,
        nombre: entrada.nombre,
        fechaDeNacimiento: entrada.fecha_de_nacimiento ?? null,
        tiendaId: entrada.tienda_id ?? tiendaPorDefecto,
      })
      .returning();
    await insertarContactos(tx, nuevo.id, entrada);
    return clienteDto(nuevo);
  });
}

/** Actualiza datos y sustituye por completo correos y teléfonos. 409 si el DNI es de otro cliente. */
export async function actualizarCliente(ej: Ejecutor, id: number, entrada: EntradaCliente): Promise<void> {
  await ej.transaction(async (tx) => {
    const [existe] = await tx.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.id, id), isNull(clientes.eliminadoEn)));
    if (!existe) throw new HttpError(404, "Cliente no encontrado");
    if (entrada.dni && (await buscarPorDni(tx, entrada.dni, id))) {
      throw new HttpError(409, "Ya existe otro cliente registrado con este DNI/NIE.");
    }
    await tx
      .update(clientes)
      .set({
        dni: entrada.dni ?? null,
        nombre: entrada.nombre,
        fechaDeNacimiento: entrada.fecha_de_nacimiento ?? null,
        tiendaId: entrada.tienda_id ?? null,
      })
      .where(eq(clientes.id, id));
    await tx.delete(emailsClientes).where(eq(emailsClientes.idCliente, id));
    await tx.delete(telefonosClientes).where(eq(telefonosClientes.idCliente, id));
    await insertarContactos(tx, id, entrada);
  });
}

/**
 * Borrado lógico de clientes: se conservan la fila, sus datos de contacto y el vínculo de sus expedientes
 * (que siguen contando en estadísticas); solo dejan de aparecer en listados y búsquedas.
 */
export async function eliminarClientes(ej: Ejecutor, ids: number[]): Promise<number> {
  const filas = await ej
    .update(clientes)
    .set({ eliminadoEn: new Date() })
    .where(and(inArray(clientes.id, ids), isNull(clientes.eliminadoEn)))
    .returning({ id: clientes.id });
  return filas.length;
}

/**
 * Máximo de clientes que se envían al navegador al abrir la lista (los más recientes): la lista filtra en el cliente y
 * con 200.000 clientes serían ~36 MB. El resto se encuentra con el buscador.
 */
export const LIMITE_LISTA_CLIENTES = 5000;

export async function contarClientes(ej: Ejecutor): Promise<number> {
  const [{ n }] = await ej.select({ n: count() }).from(clientes).where(isNull(clientes.eliminadoEn));
  return n;
}

export async function listarClientes(ej: Ejecutor, opciones: { limite?: number } = {}): Promise<(ClienteDto & { num_expedientes: number })[]> {
  const filas = await ej.query.clientes.findMany({
    where: isNull(clientes.eliminadoEn),
    with: conContactos,
    orderBy: opciones.limite ? [desc(clientes.id)] : [asc(clientes.nombre)],
    limit: opciones.limite,
  });
  if (opciones.limite) filas.sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"));
  // Recuento de expedientes: con una lista acotada, solo de esos clientes (por el índice de cliente); con todos, agrupado
  const ids = filas.map((c) => c.id);
  const acotado = ids.length > 0 && ids.length <= 20000;
  const cuentas = ids.length === 0
    ? []
    : await ej
        .select({ id: expedientes.idCliente, n: count() })
        .from(expedientes)
        .where(and(isNull(expedientes.eliminadoEn), acotado ? inArray(expedientes.idCliente, ids) : sql`${expedientes.idCliente} is not null`))
        .groupBy(expedientes.idCliente);
  const mapa = new Map(cuentas.map((c) => [c.id, c.n]));
  return filas.map((c) => ({ ...clienteDto(c), num_expedientes: mapa.get(c.id) ?? 0 }));
}

export async function obtenerCliente(ej: Ejecutor, id: number): Promise<ClienteDto | null> {
  const c = await ej.query.clientes.findFirst({ where: and(eq(clientes.id, id), isNull(clientes.eliminadoEn)), with: conContactos });
  return c ? clienteDto(c) : null;
}

/** Autocompletado por nombre o DNI (máx. 10 resultados). */
export async function buscarClientes(ej: Ejecutor, q: string): Promise<ClienteDto[]> {
  const patron = `%${escaparLike(q.trim())}%`;
  const filas = await ej.query.clientes.findMany({
    where: and(isNull(clientes.eliminadoEn), or(ilike(clientes.nombre, patron), ilike(clientes.dni, patron))),
    with: conContactos,
    orderBy: [asc(clientes.nombre)],
    limit: 10,
  });
  return filas.map(clienteDto);
}

export const esquemaCoincidencias = z.object({ dni: z.string().nullish(), nombre: z.string().nullish() });

export interface CoincidenciaCliente {
  id: number;
  nombre: string | null;
  dni: string | null;
  /** true si coincide el DNI/NIE (lo más fiable); false si solo coincide el nombre. */
  porDni: boolean;
}

const sinSeparadores = (t: string) => t.toUpperCase().replace(/[\s.-]/g, "");

/**
 * Clientes que podrían ser la misma persona que un pedido o documento: primero los que tienen el mismo DNI/NIE y después los que
 * contienen todas las palabras del nombre (en cualquier orden). Máximo 8, solo clientes no eliminados.
 */
export async function buscarCoincidencias(ej: Ejecutor, entrada: z.infer<typeof esquemaCoincidencias>): Promise<CoincidenciaCliente[]> {
  const dni = entrada.dni ? sinSeparadores(entrada.dni) : "";
  const palabras = (entrada.nombre ?? "")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)
    .slice(0, 5);
  const resultado = new Map<number, CoincidenciaCliente>();

  if (dni.length >= 5) {
    const porDni = await ej
      .select({ id: clientes.id, nombre: clientes.nombre, dni: clientes.dni })
      .from(clientes)
      .where(and(isNull(clientes.eliminadoEn), sql`upper(regexp_replace(${clientes.dni}, '[[:space:].-]', '', 'g')) = ${dni}`))
      .limit(8);
    for (const c of porDni) resultado.set(c.id, { ...c, porDni: true });
  }
  if (palabras.length > 0 && resultado.size < 8) {
    const porNombre = await ej
      .select({ id: clientes.id, nombre: clientes.nombre, dni: clientes.dni })
      .from(clientes)
      .where(and(isNull(clientes.eliminadoEn), ...palabras.map((p) => ilike(clientes.nombre, `%${escaparLike(p)}%`))))
      .orderBy(asc(clientes.nombre))
      .limit(8);
    for (const c of porNombre) if (!resultado.has(c.id)) resultado.set(c.id, { ...c, porDni: false });
  }
  return [...resultado.values()].slice(0, 8);
}
