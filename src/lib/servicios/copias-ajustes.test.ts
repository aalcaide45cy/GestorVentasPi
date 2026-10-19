import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { copiasSeguridad } from "@/db/schema";
import { AJUSTES_POR_DEFECTO, avisoEspacioCopias, guardarAjustesCopias, leerAjustesCopias } from "./copias";
import { tocaSubirAutomatica } from "./drive";
import { reiniciarBd } from "../../../tests/ayudas";

// Una carpeta de copias vacía propia: contar las copias que haya en la del equipo (decenas, en uso real) falsearía el aviso
let dir = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "gv-aviso-"));
  process.env.BACKUP_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(reiniciarBd);

const copia = (nombre: string, tamano: number, extra: Partial<typeof copiasSeguridad.$inferInsert> = {}) => db.insert(copiasSeguridad).values({ nombre, tipo: "auto", tamano, sha256: nombre.padEnd(64, "0"), ...extra });

describe("ajustes de copias: Drive y aviso de espacio", () => {
  it("guarda y lee frecuencia de Drive, carpeta y límites del aviso", async () => {
    expect(await leerAjustesCopias(db)).toEqual(AJUSTES_POR_DEFECTO);
    await guardarAjustesCopias(db, { ...AJUSTES_POR_DEFECTO, driveAutomatica: true, driveFrecuencia: "semanal", driveCarpeta: "Copias Alfonso", avisoMaxCopias: 5, avisoMaxGb: 2 });
    expect(await leerAjustesCopias(db)).toMatchObject({ driveAutomatica: true, driveFrecuencia: "semanal", driveCarpeta: "Copias Alfonso", avisoMaxCopias: 5, avisoMaxGb: 2 });
    await expect(guardarAjustesCopias(db, { ...AJUSTES_POR_DEFECTO, driveCarpeta: "  " })).rejects.toThrow();
    await expect(guardarAjustesCopias(db, { ...AJUSTES_POR_DEFECTO, driveFrecuencia: "diaria" })).rejects.toThrow();
  });

  it("el aviso salta por número de copias o por GB, y 0 lo desactiva", async () => {
    const base = (await avisoEspacioCopias(db)).copias;
    for (let i = 0; i < 4; i++) await copia(`gv_aviso_${i}.dump`, 1024 ** 3); // 4 copias de 1 GB
    const total = base + 4;
    expect(await avisoEspacioCopias(db)).toMatchObject({ excede: false, copias: total });
    await guardarAjustesCopias(db, { ...AJUSTES_POR_DEFECTO, avisoMaxCopias: total - 1 });
    expect(await avisoEspacioCopias(db)).toMatchObject({ excede: true, motivo: expect.stringContaining(`${total} copias`) });
    await guardarAjustesCopias(db, { ...AJUSTES_POR_DEFECTO, avisoMaxCopias: 0, avisoMaxGb: 3 });
    expect(await avisoEspacioCopias(db)).toMatchObject({ excede: true, motivo: expect.stringContaining("GB") });
    await guardarAjustesCopias(db, { ...AJUSTES_POR_DEFECTO, avisoMaxCopias: 0, avisoMaxGb: 0 });
    expect((await avisoEspacioCopias(db)).excede).toBe(false);
  });

  it("subida automática semanal o mensual: solo si hace tiempo que no se sube ninguna", async () => {
    const ahora = new Date("2026-10-17T12:00:00Z");
    expect(await tocaSubirAutomatica(db, "todas", ahora)).toBe(true);
    expect(await tocaSubirAutomatica(db, "semanal", ahora)).toBe(true); // nunca se ha subido
    await copia("gv_a.dump", 10, { driveFileId: "x", subidaDriveEn: new Date("2026-10-15T12:00:00Z") });
    expect(await tocaSubirAutomatica(db, "semanal", ahora)).toBe(false); // hace 2 días
    expect(await tocaSubirAutomatica(db, "mensual", ahora)).toBe(false);
    expect(await tocaSubirAutomatica(db, "semanal", new Date("2026-10-23T12:00:00Z"))).toBe(true); // hace 8 días
    expect(await tocaSubirAutomatica(db, "mensual", new Date("2026-10-23T12:00:00Z"))).toBe(false);
    expect(await tocaSubirAutomatica(db, "mensual", new Date("2026-11-20T12:00:00Z"))).toBe(true);
  });
});
