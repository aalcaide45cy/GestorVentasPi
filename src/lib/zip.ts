import { crc32 } from "node:zlib";

/**
 * ZIP mínimo sin compresión («store»): suficiente para juntar varios PDF o fotos (que ya van comprimidos) en un solo archivo de descarga.
 * Los nombres van en UTF-8 y, si se repiten, se les añade « (2)», « (3)»…
 */
export function crearZip(entradas: { nombre: string; datos: Buffer }[]): Buffer {
  const usados = new Map<string, number>();
  const nombreUnico = (n: string): string => {
    const limpio = n.replace(/[\/:*?"<>|]/g, "_").trim() || "archivo";
    const k = limpio.toLowerCase();
    const veces = (usados.get(k) ?? 0) + 1;
    usados.set(k, veces);
    if (veces === 1) return limpio;
    const punto = limpio.lastIndexOf(".");
    return punto > 0 ? `${limpio.slice(0, punto)} (${veces})${limpio.slice(punto)}` : `${limpio} (${veces})`;
  };
  const trozos: Buffer[] = [];
  const central: Buffer[] = [];
  let posicion = 0;
  const ahora = new Date();
  const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const fecha = ((Math.max(ahora.getFullYear(), 1980) - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  for (const e of entradas) {
    const nombre = Buffer.from(nombreUnico(e.nombre), "utf8");
    const crc = crc32(e.datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(fecha, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.datos.length, 18);
    local.writeUInt32LE(e.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);
    trozos.push(local, nombre, e.datos);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt16LE(hora, 12);
    dir.writeUInt16LE(fecha, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(e.datos.length, 20);
    dir.writeUInt32LE(e.datos.length, 24);
    dir.writeUInt16LE(nombre.length, 28);
    dir.writeUInt32LE(posicion, 42);
    central.push(dir, nombre);
    posicion += local.length + nombre.length + e.datos.length;
  }
  const tamanoCentral = central.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(tamanoCentral, 12);
  fin.writeUInt32LE(posicion, 16);
  return Buffer.concat([...trozos, ...central, fin]);
}
