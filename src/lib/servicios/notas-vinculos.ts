import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { Ejecutor } from "@/db";
import {
  clientes,
  commissionPlans,
  expedientes,
  marcas,
  modelos,
  notas,
  notasVinculos,
  tiendas,
  usuarios,
} from "@/db/schema";
import { HttpError, type UsuarioActual } from "@/lib/auth/sesion";
import {
  TIPOS_VINCULO,
  type EntradaVinculo,
  type TipoVinculo,
  type VinculoDto,
} from "@/lib/notas";
import { escaparLike } from "./comun";
import { sugerencias } from "./busqueda";

const cod = (id: number): string => `#EXP-${String(id).padStart(4, "0")}`;

/** A qué pantalla lleva cada tipo de vínculo (los que no tienen pantalla propia, a ninguna). */
export function urlDeVinculo(tipo: TipoVinculo, id: number): string | null {
  if (tipo === "expediente") return `/dashboard/expedientes/editar/${id}`;
  if (tipo === "cliente") return `/dashboard/clientes/${id}`;
  if (tipo === "plan") return "/dashboard/comisiones";
  return null;
}

/** Los nombres con los que se enseñan los destinos (varios de golpe). Los que ya no existen salen como «(eliminado)». */
export async function textosDeDestinos(
  ej: Ejecutor,
  pares: EntradaVinculo[],
): Promise<Map<string, string>> {
  const res = new Map<string, string>();
  const ids = (t: TipoVinculo) => [
    ...new Set(pares.filter((p) => p.tipo === t).map((p) => p.id)),
  ];
  const clave = (t: TipoVinculo, id: number) => `${t}:${id}`;
  const exps = ids("expediente");
  if (exps.length) {
    const filas = await ej.query.expedientes.findMany({
      where: inArray(expedientes.idExpediente, exps),
      with: { cliente: true, modelo: { with: { marca: true } } },
    });
    for (const e of filas)
      res.set(
        clave("expediente", e.idExpediente),
        `${cod(e.idExpediente)} · ${e.cliente?.nombre || "Sin cliente"}${e.modelo ? ` · ${e.modelo.marca?.nombre ?? ""} ${e.modelo.nombreModelo}`.trimEnd() : ""}${e.eliminadoEn ? " (eliminado)" : ""}`,
      );
  }
  const cls = ids("cliente");
  if (cls.length)
    for (const c of await ej
      .select({ id: clientes.id, nombre: clientes.nombre })
      .from(clientes)
      .where(inArray(clientes.id, cls)))
      res.set(clave("cliente", c.id), c.nombre || "Sin nombre");
  const pls = ids("plan");
  if (pls.length)
    for (const p of await ej
      .select({ id: commissionPlans.idPlan, nombre: commissionPlans.nombre })
      .from(commissionPlans)
      .where(inArray(commissionPlans.idPlan, pls)))
      res.set(clave("plan", p.id), p.nombre);
  const mcs = ids("marca");
  if (mcs.length)
    for (const m of await ej
      .select({ id: marcas.idMarca, nombre: marcas.nombre })
      .from(marcas)
      .where(inArray(marcas.idMarca, mcs)))
      res.set(clave("marca", m.id), m.nombre);
  const mds = ids("modelo");
  if (mds.length)
    for (const m of await ej
      .select({
        id: modelos.idModelo,
        nombre: modelos.nombreModelo,
        marca: marcas.nombre,
      })
      .from(modelos)
      .leftJoin(marcas, eq(modelos.marcaId, marcas.idMarca))
      .where(inArray(modelos.idModelo, mds)))
      res.set(clave("modelo", m.id), `${m.marca ?? ""} ${m.nombre}`.trim());
  const tds = ids("tienda");
  if (tds.length)
    for (const t of await ej
      .select({
        id: tiendas.idTienda,
        nombre: tiendas.nombre,
        ciudad: tiendas.ciudad,
      })
      .from(tiendas)
      .where(inArray(tiendas.idTienda, tds)))
      res.set(
        clave("tienda", t.id),
        t.ciudad ? `${t.nombre} (${t.ciudad})` : t.nombre,
      );
  const vds = ids("vendedor");
  if (vds.length)
    for (const v of await ej
      .select({
        id: usuarios.idUsuario,
        nombre: usuarios.nombre,
        email: usuarios.loginEmail,
      })
      .from(usuarios)
      .where(inArray(usuarios.idUsuario, vds)))
      res.set(clave("vendedor", v.id), v.nombre || v.email);
  return res;
}

/** Los vínculos de varias notas a la vez (clave: id de la nota). */
export async function vinculosDeNotas(
  ej: Ejecutor,
  idsNotas: number[],
): Promise<Map<number, VinculoDto[]>> {
  const res = new Map<number, VinculoDto[]>();
  if (idsNotas.length === 0) return res;
  const filas = await ej
    .select()
    .from(notasVinculos)
    .where(inArray(notasVinculos.idNota, idsNotas))
    .orderBy(asc(notasVinculos.id));
  const textos = await textosDeDestinos(
    ej,
    filas.map((f) => ({ tipo: f.tipo as TipoVinculo, id: f.idDestino })),
  );
  for (const f of filas) {
    const tipo = f.tipo as TipoVinculo;
    const lista = res.get(f.idNota) ?? [];
    lista.push({
      tipo,
      id: f.idDestino,
      texto: textos.get(`${tipo}:${f.idDestino}`) ?? "(eliminado)",
      url: urlDeVinculo(tipo, f.idDestino),
    });
    res.set(f.idNota, lista);
  }
  return res;
}

/** Comprueba que todo lo que se vincula existe (y no se repite). Devuelve la lista limpia. */
export async function comprobarVinculos(
  ej: Ejecutor,
  lista: EntradaVinculo[],
): Promise<EntradaVinculo[]> {
  const unicos = [
    ...new Map(lista.map((v) => [`${v.tipo}:${v.id}`, v])).values(),
  ];
  if (unicos.length === 0) return unicos;
  const textos = await textosDeDestinos(ej, unicos);
  for (const v of unicos) {
    const t = textos.get(`${v.tipo}:${v.id}`);
    if (!t || (v.tipo === "expediente" && t.endsWith("(eliminado)")))
      throw new HttpError(
        400,
        `Ya no existe ${v.tipo === "expediente" ? "ese expediente" : "lo que quieres vincular"}`,
      );
  }
  return unicos;
}

/** Sustituye los vínculos de una nota por la lista dada. */
export async function fijarVinculos(
  ej: Ejecutor,
  idNota: number,
  lista: EntradaVinculo[],
): Promise<void> {
  await ej.delete(notasVinculos).where(eq(notasVinculos.idNota, idNota));
  if (lista.length > 0)
    await ej
      .insert(notasVinculos)
      .values(lista.map((v) => ({ idNota, tipo: v.tipo, idDestino: v.id })));
}

export interface OpcionVinculo {
  tipo: TipoVinculo;
  id: number;
  texto: string;
}

/** Busca a qué se puede vincular (con texto vacío, los primeros de cada tipo, salvo expedientes y clientes). */
export async function buscarDestinos(
  ej: Ejecutor,
  tipo: TipoVinculo,
  q: string,
): Promise<OpcionVinculo[]> {
  const texto = q.trim();
  const patron = `%${escaparLike(texto)}%`;
  if (tipo === "expediente" || tipo === "cliente") {
    if (!texto) return [];
    const s = await sugerencias(ej, texto);
    return tipo === "expediente"
      ? s.expedientes.map((e) => ({
          tipo,
          id: e.id_expediente,
          texto: e.label,
        }))
      : s.clientes.map((c) => ({ tipo, id: c.id, texto: c.label }));
  }
  if (tipo === "plan") {
    const filas = await ej
      .select({ id: commissionPlans.idPlan, nombre: commissionPlans.nombre })
      .from(commissionPlans)
      .where(texto ? ilike(commissionPlans.nombre, patron) : undefined)
      .orderBy(desc(commissionPlans.fechaInicio))
      .limit(20);
    return filas.map((f) => ({ tipo, id: f.id, texto: f.nombre }));
  }
  if (tipo === "marca") {
    const filas = await ej
      .select({ id: marcas.idMarca, nombre: marcas.nombre })
      .from(marcas)
      .where(
        and(
          isNull(marcas.eliminadoEn),
          texto ? ilike(marcas.nombre, patron) : undefined,
        ),
      )
      .orderBy(asc(marcas.nombre))
      .limit(20);
    return filas.map((f) => ({ tipo, id: f.id, texto: f.nombre }));
  }
  if (tipo === "modelo") {
    const filas = await ej
      .select({
        id: modelos.idModelo,
        nombre: modelos.nombreModelo,
        marca: marcas.nombre,
      })
      .from(modelos)
      .leftJoin(marcas, eq(modelos.marcaId, marcas.idMarca))
      .where(
        and(
          isNull(modelos.eliminadoEn),
          texto
            ? or(
                ilike(modelos.nombreModelo, patron),
                ilike(marcas.nombre, patron),
              )
            : undefined,
        ),
      )
      .orderBy(asc(marcas.nombre), asc(modelos.nombreModelo))
      .limit(30);
    return filas.map((f) => ({
      tipo,
      id: f.id,
      texto: `${f.marca ?? ""} ${f.nombre}`.trim(),
    }));
  }
  if (tipo === "tienda") {
    const filas = await ej
      .select({
        id: tiendas.idTienda,
        nombre: tiendas.nombre,
        ciudad: tiendas.ciudad,
      })
      .from(tiendas)
      .where(
        and(
          isNull(tiendas.eliminadoEn),
          texto
            ? or(ilike(tiendas.nombre, patron), ilike(tiendas.ciudad, patron))
            : undefined,
        ),
      )
      .orderBy(asc(tiendas.nombre))
      .limit(20);
    return filas.map((f) => ({
      tipo,
      id: f.id,
      texto: f.ciudad ? `${f.nombre} (${f.ciudad})` : f.nombre,
    }));
  }
  const filas = await ej
    .select({
      id: usuarios.idUsuario,
      nombre: usuarios.nombre,
      email: usuarios.loginEmail,
    })
    .from(usuarios)
    .where(
      texto
        ? or(ilike(usuarios.nombre, patron), ilike(usuarios.loginEmail, patron))
        : undefined,
    )
    .orderBy(asc(usuarios.nombre))
    .limit(20);
  return filas.map((f) => ({ tipo, id: f.id, texto: f.nombre || f.email }));
}

/** Mis notas (y las compartidas conmigo) vinculadas a algo: para el panel de la ficha de un expediente, cliente, etc. */
export async function notasDeDestino(
  ej: Ejecutor,
  u: UsuarioActual,
  tipo: TipoVinculo,
  id: number,
): Promise<
  {
    id: number;
    tipo: string;
    titulo: string;
    extracto: string;
    color: string | null;
    actualizado_en: string;
  }[]
> {
  if (!TIPOS_VINCULO.includes(tipo)) throw new HttpError(400, "Tipo no válido");
  const filas = await ej
    .select({ n: notas })
    .from(notasVinculos)
    .innerJoin(notas, eq(notas.id, notasVinculos.idNota))
    .where(
      and(
        eq(notasVinculos.tipo, tipo),
        eq(notasVinculos.idDestino, id),
        isNull(notas.eliminadoEn),
        or(
          eq(notas.idUsuario, u.idUsuario),
          sql`exists (select 1 from notas_compartidos c where c.id_nota = ${notas.id} and (c.id_usuario = ${u.idUsuario} or c.id_usuario is null))`,
        ),
      ),
    )
    .orderBy(desc(notas.fijada), desc(notas.actualizadoEn))
    .limit(100);
  return filas.map(({ n }) => ({
    id: n.id,
    tipo: n.tipo,
    titulo: n.titulo,
    extracto: n.texto.replace(/\s+/g, " ").slice(0, 140),
    color: n.color,
    actualizado_en: n.actualizadoEn.toISOString(),
  }));
}
