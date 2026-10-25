import { open, stat } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { HttpError } from "@/lib/auth/sesion";
import { obtenerCopia } from "./copias";

/**
 * Detalle de una copia de seguridad (.dump de PostgreSQL en formato personalizado): datos de la cabecera y cuánto ocupa dentro del
 * archivo cada tabla. El índice del archivo (la lista de sus partes con el lugar donde empieza cada una) está al principio, así que
 * basta leer esa parte: el tamaño de cada tabla es lo que hay entre donde empieza su bloque y donde empieza el siguiente. Son bytes
 * reales del archivo (ya comprimidos), no una estimación.
 */

export interface TablaDeCopia {
  tabla: string;
  /** Bytes que ocupan sus datos dentro del archivo (comprimidos). */
  bytes: number;
  /** Explicación en lenguaje sencillo de qué guarda la tabla. */
  descripcion: string;
  /** Grupo al que pertenece, para ver el reparto de un vistazo. */
  grupo: string;
  /** Filas que tiene ahora en la base de datos (orientativo: la copia puede ser de otro momento). */
  filasAhora: number | null;
}

export interface GrupoDeCopia {
  grupo: string;
  bytes: number;
  tablas: number;
}

export interface DetalleCopia {
  id: number;
  nombre: string;
  /** Tamaño del archivo en disco. */
  tamano: number;
  /** Cuándo se hizo la copia según el propio archivo. */
  creadaEnArchivo: string | null;
  baseDeDatos: string | null;
  versionServidor: string | null;
  versionPgDump: string | null;
  /** Versión del formato del archivo (por ejemplo «1.15»). */
  formato: string;
  compresion: string;
  /** Número de partes del archivo: tablas con datos, índices, claves, vistas… */
  partes: number;
  tablasConDatos: number;
  /** Partes del archivo por tipo (TABLE, INDEX, CONSTRAINT…), de más a menos. */
  tiposDePartes: { tipo: string; cantidad: number }[];
  /** Parte del archivo que no es de ninguna tabla (cabecera, estructura, índice). */
  bytesEstructura: number;
  tablas: TablaDeCopia[];
  grupos: GrupoDeCopia[];
  /** Documentos adjuntos que hay AHORA en la aplicación, por tipo y situación (la copia puede ser de otro momento). */
  documentosAhora: { tipo: string; situacion: string; cantidad: number; bytes: number; mayor: number }[];
}

class Lector {
  private buf = Buffer.alloc(0);
  private inicioBuf = 0;
  constructor(private readonly fd: import("node:fs/promises").FileHandle, private readonly tamanoFichero: number) {}

  /** Posición del siguiente byte que se va a leer. */
  get pos(): number {
    return this.inicioBuf + this.cursor;
  }
  private cursor = 0;
  /** Cuántos bytes se piden al disco cada vez que se acaba el trozo leído (pocos al saltar por el archivo, muchos al leer el índice). */
  tramo = 64 * 1024;

  /** Se salta `n` bytes sin leerlos. */
  saltar(n: number): void {
    if (this.cursor + n <= this.buf.length) this.cursor += n;
    else {
      this.inicioBuf = this.inicioBuf + this.cursor + n;
      this.buf = Buffer.alloc(0);
      this.cursor = 0;
    }
  }

  private async asegurar(n: number): Promise<void> {
    if (this.cursor + n <= this.buf.length) return;
    const desde = this.inicioBuf + this.cursor;
    const leer = Math.max(n, this.tramo);
    if (desde + n > this.tamanoFichero) throw new Error("El archivo termina antes de lo esperado");
    const nuevo = Buffer.alloc(Math.min(leer, this.tamanoFichero - desde));
    const { bytesRead } = await this.fd.read(nuevo, 0, nuevo.length, desde);
    this.buf = nuevo.subarray(0, bytesRead);
    this.inicioBuf = desde;
    this.cursor = 0;
    if (this.buf.length < n) throw new Error("El archivo termina antes de lo esperado");
  }

  async byte(): Promise<number> {
    await this.asegurar(1);
    return this.buf[this.cursor++];
  }

  async bytes(n: number): Promise<Buffer> {
    await this.asegurar(n);
    const r = this.buf.subarray(this.cursor, this.cursor + n);
    this.cursor += n;
    return r;
  }

  /** Entero del formato de pg_dump: un byte de signo y después `tamEntero` bytes, el menos significativo primero. */
  async entero(tamEntero: number): Promise<number> {
    const signo = await this.byte();
    const b = await this.bytes(tamEntero);
    let n = 0;
    for (let i = 0; i < tamEntero; i++) n += b[i] * 2 ** (8 * i);
    return signo ? -n : n;
  }

  async cadena(tamEntero: number): Promise<string | null> {
    const l = await this.entero(tamEntero);
    if (l < 0) return null;
    return (await this.bytes(l)).toString("utf8");
  }

  /** Posición dentro del archivo: un byte que dice si está o no, y `tamPos` bytes. */
  async posicion(tamPos: number): Promise<number | null> {
    const marca = await this.byte();
    const b = await this.bytes(tamPos);
    if (marca !== 2) return null;
    let n = 0;
    for (let i = 0; i < tamPos; i++) n += b[i] * 2 ** (8 * i);
    return n;
  }
}

interface Entrada {
  id: number;
  tag: string;
  desc: string;
  /** Si tiene un bloque de datos en el archivo. */
  tieneDatos: boolean;
}

/** Qué guarda cada tabla y a qué grupo pertenece. Lo que no esté aquí sale con su nombre y en «Otros». */
const TABLAS: Record<string, { grupo: string; descripcion: string }> = {
  adjuntos_datos: { grupo: "Documentos", descripcion: "Contenido (cifrado) de los documentos adjuntos: DNI, pedidos y fotos de clientes." },
  contenidos_compartidos: { grupo: "Documentos", descripcion: "Documentos repetidos guardados una sola vez (el mismo pedido en un expediente y en la biblioteca, por ejemplo): las fichas apuntan aquí en vez de repetir el archivo." },
  adjuntos: { grupo: "Documentos", descripcion: "Ficha de cada documento adjunto (nombre, tipo, a qué cliente o expediente pertenece)." },
  lecturas_pedidos: { grupo: "Lectura de pedidos", descripcion: "Registro de los pedidos subidos para leer: el fichero de cada uno mientras se lee y el resultado de la lectura." },
  historial_cambios: { grupo: "Historial", descripcion: "Diario de cambios que permite deshacer y rehacer (se limpia solo a los 30 días)." },
  auditoria: { grupo: "Historial", descripcion: "Registro de acciones de los usuarios (accesos, exportaciones, borrados…)." },
  clientes: { grupo: "Clientes y expedientes", descripcion: "Clientes con sus datos." },
  emails_clientes: { grupo: "Clientes y expedientes", descripcion: "Correos de los clientes." },
  telefonos_clientes: { grupo: "Clientes y expedientes", descripcion: "Teléfonos de los clientes." },
  expedientes: { grupo: "Clientes y expedientes", descripcion: "Expedientes de venta con sus fechas y comisiones." },
  importaciones_bloques: { grupo: "Importaciones", descripcion: "Bloques de datos de las importaciones hechas (Excel, migración)." },
  importaciones_registros: { grupo: "Importaciones", descripcion: "Una fila por cada registro leído en las importaciones." },
  libro_puntos: { grupo: "Comisiones", descripcion: "Apuntes de puntos de cada vendedor." },
  pendientes_cobro: { grupo: "Comisiones", descripcion: "Comisiones pendientes de cobrar." },
  validaciones_comision: { grupo: "Comisiones", descripcion: "Marcas de pagado o reclamado de cada expediente y mes." },
  rejillas: { grupo: "Comisiones", descripcion: "Hojas de comisiones de la empresa guardadas para cotejar." },
  rejilla_filas: { grupo: "Comisiones", descripcion: "Filas de esas hojas." },
  copias_seccion: { grupo: "Copias internas", descripcion: "Copias internas de cada sección de datos guardadas dentro de la aplicación." },
  copias_seguridad: { grupo: "Copias internas", descripcion: "Lista de las copias de seguridad hechas (no incluye los archivos)." },
};

const GRUPOS_POR_PREFIJO: [RegExp, string][] = [
  [/^commission_/, "Comisiones"],
  [/^(plantillas_|promociones_)/, "Comisiones"],
  [/^(usuarios|sesiones|tiendas|usuarios_tiendas)/, "Usuarios y tiendas"],
  [/^(marcas|modelos|alias_modelos|tipo_de_venta|estado_vehiculo|ajustes)/, "Catálogos y ajustes"],
];

const infoTabla = (tabla: string): { grupo: string; descripcion: string } => TABLAS[tabla] ?? { grupo: GRUPOS_POR_PREFIJO.find(([r]) => r.test(tabla))?.[1] ?? "Otros", descripcion: "Datos internos de la aplicación." };

/** Lee la cabecera y el índice de un .dump en formato personalizado de PostgreSQL. Lanza un error si no lo es. */
export async function leerIndiceDump(ruta: string): Promise<{ bloques: Map<number, number>; cabecera: Omit<DetalleCopia, "id" | "nombre" | "tamano" | "tablas" | "grupos" | "documentosAhora" | "bytesEstructura" | "tablasConDatos" | "partes" | "tiposDePartes">; entradas: Entrada[]; tamanoFichero: number }> {
  const tamanoFichero = (await stat(/*turbopackIgnore: true*/ ruta)).size;
  const fd = await open(/*turbopackIgnore: true*/ ruta, "r");
  try {
    const l = new Lector(fd, tamanoFichero);
    if ((await l.bytes(5)).toString("latin1") !== "PGDMP") throw new Error("No es un archivo .dump de PostgreSQL");
    const vmaj = await l.byte();
    const vmin = await l.byte();
    const vrev = await l.byte();
    const tamEntero = await l.byte();
    const tamPos = await l.byte();
    const formato = await l.byte();
    if (formato !== 1) throw new Error("El .dump no está en formato personalizado");
    const version = vmaj * 10000 + vmin * 100 + vrev;
    let compresion = "gzip";
    if (version >= 11500) {
      const alg = await l.byte();
      compresion = alg === 0 ? "ninguna" : alg === 1 ? "gzip" : alg === 2 ? "lz4" : alg === 3 ? "zstd" : `tipo ${alg}`;
    } else {
      const nivel = await l.entero(tamEntero);
      compresion = nivel === 0 ? "ninguna" : "gzip";
    }
    const seg = await l.entero(tamEntero);
    const min = await l.entero(tamEntero);
    const hora = await l.entero(tamEntero);
    const dia = await l.entero(tamEntero);
    const mes = await l.entero(tamEntero);
    const anio = await l.entero(tamEntero);
    await l.entero(tamEntero); // horario de verano
    const dosD = (n: number) => String(n).padStart(2, "0");
    const creadaEnArchivo = anio > 0 ? `${anio + 1900}-${dosD(mes + 1)}-${dosD(dia)}T${dosD(hora)}:${dosD(min)}:${dosD(seg)}` : null;
    const baseDeDatos = await l.cadena(tamEntero);
    const versionServidor = await l.cadena(tamEntero);
    const versionPgDump = await l.cadena(tamEntero);
    const total = await l.entero(tamEntero);
    if (total < 0 || total > 200000) throw new Error("Índice del .dump no válido");
    const entradas: Entrada[] = [];
    for (let i = 0; i < total; i++) {
      const idEntrada = await l.entero(tamEntero); // identificador
      const tieneDatos = (await l.entero(tamEntero)) !== 0; // si tiene datos
      await l.cadena(tamEntero); // oid de la tabla
      await l.cadena(tamEntero); // oid
      const tag = (await l.cadena(tamEntero)) ?? "";
      const desc = (await l.cadena(tamEntero)) ?? "";
      await l.entero(tamEntero); // sección
      await l.cadena(tamEntero); // definición
      await l.cadena(tamEntero); // borrado
      await l.cadena(tamEntero); // COPY
      await l.cadena(tamEntero); // esquema
      await l.cadena(tamEntero); // espacio de tablas
      if (version >= 11400) await l.cadena(tamEntero); // método de acceso
      if (version >= 11600) await l.entero(tamEntero); // tipo de relación
      await l.cadena(tamEntero); // propietario
      await l.cadena(tamEntero); // «with oids»
      for (;;) {
        const dep = await l.cadena(tamEntero);
        if (dep === null) break;
      }
      await l.posicion(tamPos); // en un archivo escrito por una tubería no consta: los bloques se encuentran leyéndolos en orden
      entradas.push({ id: idEntrada, tag, desc, tieneDatos });
    }
    // Bloques de datos: uno detrás de otro, cada uno con su tipo, el identificador de la entrada y trozos precedidos por su longitud
    const bloques = new Map<number, number>();
    l.tramo = 64;
    while (l.pos < tamanoFichero) {
      const inicio = l.pos;
      const tipo = await l.byte();
      if (tipo !== 1 && tipo !== 3) throw new Error("Bloque de datos desconocido en el .dump");
      const idBloque = await l.entero(tamEntero);
      for (;;) {
        const n = await l.entero(tamEntero);
        if (n === 0) break;
        if (n < 0) throw new Error("Trozo de datos no válido en el .dump");
        l.saltar(n);
      }
      bloques.set(idBloque, (bloques.get(idBloque) ?? 0) + (l.pos - inicio));
    }
    return { bloques, ...{ cabecera: { creadaEnArchivo, baseDeDatos, versionServidor, versionPgDump, formato: `${vmaj}.${vmin}`, compresion }, entradas, tamanoFichero } };
  } finally {
    await fd.close();
  }
}

/** Detalle de una copia: cabecera del archivo y reparto de su tamaño por tabla y por grupo. */
export async function detalleCopia(ej: Ejecutor, id: number): Promise<DetalleCopia> {
  const { fila, ruta } = await obtenerCopia(ej, id);
  let indice;
  try {
    indice = await leerIndiceDump(ruta);
  } catch (e) {
    throw new HttpError(422, `No se ha podido leer el detalle de esta copia: ${e instanceof Error ? e.message : "formato desconocido"}.`);
  }
  const { entradas, tamanoFichero, cabecera, bloques } = indice;
  const tamanos = entradas.filter((e) => e.tieneDatos).map((e) => ({ e, bytes: bloques.get(e.id) ?? 0 }));
  const filas = await ej.execute(sql`select relname, n_live_tup::bigint as n from pg_stat_user_tables`).catch(() => ({ rows: [] as unknown[] }));
  const filasAhora = new Map((filas.rows as { relname: string; n: string }[]).map((r) => [r.relname, Number(r.n)]));
  const tablas: TablaDeCopia[] = tamanos
    .filter((t) => t.e.desc === "TABLE DATA")
    .map((t) => ({ tabla: t.e.tag, bytes: t.bytes, ...infoTabla(t.e.tag), filasAhora: filasAhora.get(t.e.tag) ?? null }))
    .sort((a, b) => b.bytes - a.bytes);
  const grupos = new Map<string, GrupoDeCopia>();
  for (const t of tablas) {
    const g = grupos.get(t.grupo) ?? { grupo: t.grupo, bytes: 0, tablas: 0 };
    g.bytes += t.bytes;
    g.tablas++;
    grupos.set(t.grupo, g);
  }
  const docs = await ej
    .execute(sql`select tipo, ambito, (eliminado_en is not null) as eliminado, count(*)::int as n, coalesce(sum(tamano), 0)::bigint as bytes, coalesce(max(tamano), 0)::bigint as mayor from adjuntos group by 1, 2, 3 order by bytes desc`)
    .catch(() => ({ rows: [] as unknown[] }));
  const TIPOS: Record<string, string> = { pedido: "Pedidos", dni_frente: "DNI (anverso)", dni_reverso: "DNI (reverso)", foto_cliente: "Fotos de clientes", otro: "Otros documentos" };
  const documentosAhora = (docs.rows as { tipo: string; ambito: string; eliminado: boolean; n: number; bytes: string; mayor: string }[]).map((d) => ({
    tipo: TIPOS[d.tipo] ?? d.tipo,
    situacion: d.eliminado ? "Eliminados (el archivo se conserva)" : d.ambito === "pendiente" ? "Sin vincular a ningún expediente ni cliente" : d.ambito === "expediente" ? "En expedientes" : "En clientes",
    cantidad: d.n,
    bytes: Number(d.bytes),
    mayor: Number(d.mayor),
  }));
  const porTipo = new Map<string, number>();
  for (const e of entradas) porTipo.set(e.desc, (porTipo.get(e.desc) ?? 0) + 1);
  return {
    id,
    nombre: fila.nombre,
    tamano: tamanoFichero,
    ...cabecera,
    partes: entradas.length,
    tablasConDatos: tablas.length,
    tiposDePartes: [...porTipo.entries()].map(([tipo, cantidad]) => ({ tipo, cantidad })).sort((a, b) => b.cantidad - a.cantidad).slice(0, 8),
    bytesEstructura: Math.max(0, tamanoFichero - tablas.reduce((a, t) => a + t.bytes, 0)),
    tablas,
    grupos: [...grupos.values()].sort((a, b) => b.bytes - a.bytes),
    documentosAhora,
  };
}
