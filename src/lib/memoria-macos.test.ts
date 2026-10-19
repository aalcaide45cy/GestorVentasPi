import { describe, expect, it } from "vitest";
import { calcularMemoriaMac, memoriaMacOs } from "./memoria-macos";

const GB = 1024 ** 3;

/** Salida de `vm_stat` de un Mac de 16 GB con páginas de 16 KB (valores de ejemplo con mucha caché de archivos). */
const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               20000.
Pages active:                            400000.
Pages inactive:                          380000.
Pages speculative:                        30000.
Pages throttled:                              0.
Pages wired down:                        110000.
Pages purgeable:                          25000.
"Translation faults":                 123456789.
Pages copy-on-write:                    1234567.
Pages zero filled:                     12345678.
Pages reactivated:                       123456.
Pages purged:                            234567.
File-backed pages:                       500000.
Anonymous pages:                         310000.
Pages stored in compressor:              150000.
Pages occupied by compressor:             60000.
`;

describe("memoria de macOS", () => {
  it("la caché de archivos cuenta como disponible: un Mac de 16 GB con poca memoria de apps no sale lleno", () => {
    const m = calcularMemoriaMac(VM_STAT, 16 * GB, "total = 2048.00M  used = 512.50M  free = 1535.50M  (encrypted)");
    expect(m).not.toBeNull();
    // usadas = (anónimas − purgables) + cableadas + comprimidas = 285000 + 110000 + 60000 = 455000 páginas = 6,9 GB
    const usadoGb = (m!.totalBytes - m!.disponibleBytes) / GB;
    expect(usadoGb).toBeCloseTo((455000 * 16384) / GB, 2);
    expect(usadoGb).toBeLessThan(8);
    // Con os.freemem() (solo las libres, 20000 páginas = 0,3 GB) habría salido casi al 98 % usado
    expect(m!.swapTotalBytes).toBe(2048 * 1024 ** 2);
    expect(m!.swapUsadoBytes).toBeCloseTo(512.5 * 1024 ** 2, 0);
  });

  it("sin páginas anónimas (macOS antiguo) suma libres + inactivas + especulativas + purgables", () => {
    const sin = VM_STAT.replace(/^Anonymous pages:.*\n/m, "");
    const m = calcularMemoriaMac(sin, 16 * GB);
    expect(m!.disponibleBytes).toBe((20000 + 380000 + 30000 + 25000) * 16384);
  });

  it("no se pasa del total ni baja de cero, y una salida que no es de vm_stat da null", () => {
    expect(calcularMemoriaMac(VM_STAT, 1 * GB)!.disponibleBytes).toBe(0);
    expect(calcularMemoriaMac("otra cosa", 16 * GB)).toBeNull();
  });

  it("fuera de macOS no se usa (Linux y Windows siguen con su cálculo de siempre)", () => {
    if (process.platform === "darwin") return;
    expect(memoriaMacOs(16 * GB)).toBeNull();
  });
});
