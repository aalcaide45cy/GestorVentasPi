import { describe, expect, it } from "vitest";
import { clasificarEquipo, identidadEquipo, nombreDelEquipo } from "./equipo";

const base = { plataforma: "win32", arquitectura: "x64", procesador: "", placa: null as string | null };

describe("tipo de equipo", () => {
  it("reconoce un PC con AMD, uno con Intel, un Mac con chip Apple y una Raspberry", () => {
    expect(clasificarEquipo({ ...base, procesador: "AMD Ryzen 9 7950X 16-Core Processor" })).toBe("AMD");
    expect(clasificarEquipo({ ...base, procesador: "Intel(R) Core(TM) i7-12700K" })).toBe("Intel");
    expect(clasificarEquipo({ ...base, plataforma: "darwin", arquitectura: "arm64", procesador: "Apple M1" })).toBe("Apple");
    expect(clasificarEquipo({ ...base, plataforma: "darwin", arquitectura: "x64", procesador: "Intel(R) Core(TM) i9" })).toBe("Intel");
    expect(clasificarEquipo({ ...base, plataforma: "linux", arquitectura: "arm64", procesador: "Cortex-A72", placa: "Raspberry Pi 4 Model B Rev 1.5" })).toBe("Raspberry");
  });

  it("en Docker no ve el modelo de la placa: un Linux ARM64 sin más datos se toma por la Raspberry", () => {
    expect(clasificarEquipo({ ...base, plataforma: "linux", arquitectura: "arm64", procesador: "" })).toBe("Raspberry");
    expect(clasificarEquipo({ ...base, plataforma: "linux", arquitectura: "x64", procesador: "QEMU Virtual CPU" })).toBe("Otro");
  });

  it("la identidad de este equipo siempre trae un tipo y un detalle", () => {
    const i = identidadEquipo();
    expect(["AMD", "Intel", "Apple", "Raspberry", "Otro"]).toContain(i.tipo);
    expect(i.detalle).toMatch(/núcleos/);
  });
});

describe("nombre del equipo", () => {
  it("prefiere el nombre del equipo anfitrión, luego la variable, y descarta el identificador de un contenedor", () => {
    expect(nombreDelEquipo({ archivoHost: "raspberry-tienda\n", variable: "otro", hostname: "a1b2c3d4e5f6" })).toBe("raspberry-tienda");
    expect(nombreDelEquipo({ archivoHost: null, variable: "Raspberry de la tienda", hostname: "a1b2c3d4e5f6" })).toBe("Raspberry de la tienda");
    expect(nombreDelEquipo({ archivoHost: null, variable: undefined, hostname: "a1b2c3d4e5f6" })).toBe("");
    expect(nombreDelEquipo({ archivoHost: "  ", variable: undefined, hostname: "PCAMD" })).toBe("PCAMD");
  });
});
