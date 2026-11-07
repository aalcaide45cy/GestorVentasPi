import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import {
  ajustes,
  alertas,
  correoCola,
  correoCuentas,
  correoRespuestas,
  potenciales,
} from "@/db/schema";
import { descifrar } from "@/lib/auth/cifrado";
import { extracto, pideLaBaja } from "@/lib/respuestas-correo";

/**
 * Lee, solo en modo lectura, las respuestas que llegan al buzón de una cuenta de envío y que contestan a correos a clientes potenciales. Solo se
 * miran los mensajes de las direcciones de personas a las que la app ha escrito; el resto del buzón ni se abre. Quien pide la baja (BAJA) queda
 * dado de baja y sus correos pendientes se cancelan; cualquier otra respuesta se guarda en su ficha y avisa.
 */

export interface MensajeEntrante {
  messageId: string;
  /** Dirección de quien escribe, en minúsculas. */
  de: string;
  asunto: string;
  fecha: Date | null;
  texto: string;
}
export interface Buzon {
  /** Los mensajes que han llegado desde esa fecha de las direcciones indicadas. */
  mensajes(desde: Date, direcciones: Set<string>): Promise<MensajeEntrante[]>;
  cerrar(): Promise<void>;
}
export type FabricaBuzon = (
  cuenta: typeof correoCuentas.$inferSelect,
  clave: string,
) => Promise<Buzon>;

const SERVIDOR_IMAP: Record<string, { host: string; puerto: number }> = {
  gmail: { host: "imap.gmail.com", puerto: 993 },
  ionos: { host: "imap.ionos.es", puerto: 993 },
  outlook: { host: "outlook.office365.com", puerto: 993 },
};
/** El servidor de entrada de una cuenta: el que se haya puesto, el habitual del proveedor o el de salida cambiando «smtp» por «imap». */
export function servidorImap(
  c: Pick<
    typeof correoCuentas.$inferSelect,
    "proveedor" | "host" | "imapHost" | "imapPuerto"
  >,
): { host: string; puerto: number } {
  if (c.imapHost.trim())
    return { host: c.imapHost.trim(), puerto: c.imapPuerto };
  return (
    SERVIDOR_IMAP[c.proveedor] ?? {
      host: c.host.replace(/^smtp/i, "imap"),
      puerto: c.imapPuerto,
    }
  );
}

/** El buzón real (IMAP, solo lectura). Los mensajes se buscan por fecha y solo se abren los de las direcciones conocidas. */
export const buzonImap: FabricaBuzon = async (cuenta, clave) => {
  const s = servidorImap(cuenta);
  const cliente = new ImapFlow({
    host: s.host,
    port: s.puerto,
    secure: s.puerto === 993,
    auth: { user: cuenta.usuarioSmtp, pass: clave },
    logger: false,
    socketTimeout: 60_000,
  });
  await cliente.connect();
  return {
    async mensajes(desde, direcciones) {
      const candado = await cliente.getMailboxLock("INBOX", { readOnly: true });
      try {
        const salida: MensajeEntrante[] = [];
        const uids =
          (await cliente.search({ since: desde }, { uid: true })) || [];
        for (const uid of uids) {
          const m = await cliente.fetchOne(
            String(uid),
            { envelope: true, internalDate: true },
            { uid: true },
          );
          if (!m) continue;
          const de = (m.envelope?.from?.[0]?.address ?? "").toLowerCase();
          if (!direcciones.has(de)) continue;
          const completo = await cliente.fetchOne(
            String(uid),
            { source: true },
            { uid: true },
          );
          if (!completo || !completo.source) continue;
          const parsed = await simpleParser(completo.source);
          salida.push({
            messageId: m.envelope?.messageId ?? `${cuenta.id}:${uid}`,
            de,
            asunto: (m.envelope?.subject ?? "").slice(0, 300),
            fecha: m.internalDate instanceof Date ? m.internalDate : null,
            texto: parsed.text ?? "",
          });
        }
        return salida;
      } finally {
        candado.release();
      }
    },
    async cerrar() {
      await cliente.logout().catch(() => undefined);
    },
  };
};

export interface ResumenRevision {
  cuentas: number;
  mensajes: number;
  bajas: number;
  respuestas: number;
  errores: string[];
}

const claveDesde = (id: number) => `correo.imap.${id}.desde`;
const claveError = (id: number) => `correo.imap.${id}.error`;
const claveUltima = (id: number) => `correo.imap.${id}.ultima`;

async function leerAjuste(ej: Ejecutor, clave: string): Promise<string | null> {
  return (
    (await ej.select().from(ajustes).where(eq(ajustes.clave, clave)))[0]
      ?.valor ?? null
  );
}
async function guardarAjuste(
  ej: Ejecutor,
  clave: string,
  valor: string,
): Promise<void> {
  await ej
    .insert(ajustes)
    .values({ clave, valor })
    .onConflictDoUpdate({ target: ajustes.clave, set: { valor } });
}

/** Da de baja a una persona y cancela lo que tuviera pendiente en la cola. */
export async function darDeBajaPotencial(
  ej: Ejecutor,
  idPotencial: number,
  motivo: string,
): Promise<number> {
  await ej
    .update(potenciales)
    .set({
      estado: "baja",
      bajaEn: new Date(),
      bajaMotivo: motivo.slice(0, 200),
    })
    .where(eq(potenciales.id, idPotencial));
  const cancelados = await ej
    .update(correoCola)
    .set({
      estado: "cancelado",
      error: "No se envía: esta persona se ha dado de baja",
    })
    .where(
      and(
        eq(correoCola.idPotencial, idPotencial),
        inArray(correoCola.estado, ["borrador", "programado"]),
      ),
    )
    .returning({ id: correoCola.id });
  return cancelados.length;
}

/**
 * Revisa el buzón de las cuentas con la lectura de respuestas activada. `fabrica` permite sustituir el buzón real (pruebas). Solo se pide a
 * una cuenta las direcciones de personas a las que ha escrito en los últimos 120 días.
 */
export async function revisarRespuestas(
  ej: Ejecutor,
  opciones: { idUsuario?: number; fabrica?: FabricaBuzon } = {},
): Promise<ResumenRevision> {
  const fabrica = opciones.fabrica ?? buzonImap;
  const r: ResumenRevision = {
    cuentas: 0,
    mensajes: 0,
    bajas: 0,
    respuestas: 0,
    errores: [],
  };
  const cuentas = await ej
    .select()
    .from(correoCuentas)
    .where(
      and(
        eq(correoCuentas.leerRespuestas, true),
        eq(correoCuentas.activa, true),
        opciones.idUsuario
          ? eq(correoCuentas.idUsuario, opciones.idUsuario)
          : undefined,
      ),
    );
  for (const c of cuentas) {
    // Personas a las que esta cuenta ha escrito hace poco (correo enviado a un cliente potencial)
    const hace120 = new Date(Date.now() - 120 * 86_400_000);
    const enviados = await ej
      .select({
        idPotencial: correoCola.idPotencial,
        para: correoCola.para,
        enviadoEn: correoCola.enviadoEn,
      })
      .from(correoCola)
      .where(
        and(
          eq(correoCola.idCuenta, c.id),
          eq(correoCola.estado, "enviado"),
          gte(correoCola.enviadoEn, hace120),
          sql`${correoCola.idPotencial} is not null`,
        ),
      );
    if (enviados.length === 0) continue;
    // Dirección → potenciales a los que se escribió y desde cuándo: solo cuenta lo que llega DESPUÉS de nuestro primer correo
    const porDireccion = new Map<string, Map<number, Date>>();
    for (const x of enviados) {
      if (x.idPotencial === null) continue;
      for (const d of x.para
        .split(/[,;\s]+/)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)) {
        const mapa = porDireccion.get(d) ?? new Map<number, Date>();
        const desdeEnvio = x.enviadoEn ?? new Date(0);
        const previo = mapa.get(x.idPotencial);
        if (!previo || desdeEnvio < previo) mapa.set(x.idPotencial, desdeEnvio);
        porDireccion.set(d, mapa);
      }
    }
    r.cuentas++;
    let buzon: Buzon | null = null;
    try {
      buzon = await fabrica(c, descifrar(c.passwordCifrada, "correo"));
      const desdeGuardado = await leerAjuste(ej, claveDesde(c.id));
      const desde = desdeGuardado
        ? new Date(desdeGuardado)
        : new Date(Date.now() - 7 * 86_400_000);
      const ahora = new Date();
      const mensajes = await buzon.mensajes(
        new Date(desde.getTime() - 86_400_000),
        new Set(porDireccion.keys()),
      );
      for (const m of mensajes) {
        const [ya] = await ej
          .select({ id: correoRespuestas.id })
          .from(correoRespuestas)
          .where(eq(correoRespuestas.messageId, m.messageId));
        if (ya) continue;
        // Si se escribe a la misma dirección desde la que se envía, la copia del propio correo enviado no es una respuesta (una respuesta lleva «Re:»)
        if (
          m.de === c.email.toLowerCase() &&
          !/^\s*(re|rv|res)\s*:/i.test(m.asunto)
        )
          continue;
        r.mensajes++;
        const baja = pideLaBaja(m.texto);
        for (const [idPot, desdeEnvio] of porDireccion.get(m.de) ?? []) {
          // Un correo anterior a nuestro envío no puede ser su respuesta
          if (!m.fecha || m.fecha < desdeEnvio) continue;
          const [p] = await ej
            .select()
            .from(potenciales)
            .where(eq(potenciales.id, idPot));
          if (!p) continue;
          const insertado = await ej
            .insert(correoRespuestas)
            .values({
              idPotencial: idPot,
              idCuenta: c.id,
              messageId: m.messageId,
              de: m.de,
              asunto: m.asunto,
              fecha: m.fecha,
              extracto: extracto(m.texto),
              tipo: baja ? "baja" : "otra",
            })
            .onConflictDoNothing()
            .returning({ id: correoRespuestas.id });
          if (insertado.length === 0) continue;
          if (baja) {
            const cancelados = await darDeBajaPotencial(
              ej,
              idPot,
              `Pidió la baja por correo el ${(m.fecha ?? ahora).toLocaleDateString("es-ES")}`,
            );
            await ej.insert(alertas).values({
              idUsuario: p.idUsuario,
              mensaje: `🚫 ${p.nombre} ha pedido la baja por correo: ya no se le escribirá${cancelados > 0 ? ` (y se han cancelado ${cancelados} correos pendientes)` : ""}.`,
            });
            r.bajas++;
          } else {
            await ej.insert(alertas).values({
              idUsuario: p.idUsuario,
              mensaje: `💬 ${p.nombre} ha respondido a tu correo: «${extracto(m.texto, 160) || "(sin texto)"}». Está en su ficha de Potenciales.`,
            });
            r.respuestas++;
          }
        }
      }
      await guardarAjuste(ej, claveDesde(c.id), ahora.toISOString());
      await guardarAjuste(ej, claveUltima(c.id), ahora.toISOString());
      await guardarAjuste(ej, claveError(c.id), "");
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      const claro = /auth|credentials|login/i.test(motivo)
        ? "El servidor rechazó el usuario o la contraseña (en Gmail hace falta una contraseña de aplicación y tener activado IMAP)."
        : /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(motivo)
          ? "No se pudo conectar con el servidor de entrada del correo."
          : motivo.slice(0, 200);
      await guardarAjuste(ej, claveError(c.id), claro);
      r.errores.push(`${c.nombre}: ${claro}`);
    } finally {
      await buzon?.cerrar().catch(() => undefined);
    }
  }
  return r;
}

/** Cuándo se revisó por última vez cada cuenta y el último error (para enseñarlo en Cuentas). */
export async function estadoRevision(
  ej: Ejecutor,
  idsCuenta: number[],
): Promise<Record<number, { ultima: string | null; error: string | null }>> {
  const res: Record<number, { ultima: string | null; error: string | null }> =
    {};
  for (const id of idsCuenta)
    res[id] = {
      ultima: (await leerAjuste(ej, claveUltima(id))) || null,
      error: (await leerAjuste(ej, claveError(id))) || null,
    };
  return res;
}

export interface RespuestaDto {
  id: number;
  de: string;
  asunto: string;
  fecha: string | null;
  extracto: string;
  tipo: "baja" | "otra";
}
export async function respuestasDe(
  ej: Ejecutor,
  idPotencial: number,
): Promise<RespuestaDto[]> {
  const filas = await ej
    .select()
    .from(correoRespuestas)
    .where(eq(correoRespuestas.idPotencial, idPotencial))
    .orderBy(desc(correoRespuestas.id))
    .limit(20);
  return filas.map((f) => ({
    id: f.id,
    de: f.de,
    asunto: f.asunto,
    fecha: (f.fecha ?? f.creadoEn).toISOString(),
    extracto: f.extracto,
    tipo: f.tipo === "baja" ? "baja" : "otra",
  }));
}
