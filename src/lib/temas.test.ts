import { describe, expect, it } from "vitest";
import { TEMAS, scriptTema } from "./temas";

/** Ejecuta el script de arranque contra un «documento» de pega y devuelve lo que fija en la página. */
function ejecutar(guardado: Record<string, string>) {
  const estilos: Record<string, string> = {};
  const atributos: Record<string, string> = {};
  const almacen = { ...guardado };
  const ventana: { __gvTema?: (id: string) => void } = {};
  const documento = {
    documentElement: {
      style: {
        setProperty: (n: string, v: string | number) => {
          estilos[n] = String(v);
        },
        removeProperty: (n: string) => {
          delete estilos[n];
        },
      },
      setAttribute: (n: string, v: string) => {
        atributos[n] = v;
      },
    },
  };
  const localStorage = { getItem: (k: string) => almacen[k] ?? null, setItem: (k: string, v: string) => (almacen[k] = v) };
  new Function("window", "document", "localStorage", scriptTema())(ventana, documento, localStorage);
  return { estilos, atributos, almacen, aplicar: (id: string) => ventana.__gvTema?.(id) };
}

describe("temas de color", () => {
  it("hay 150 temas con identificadores únicos, con variedad de claridad en oscuros y claros", () => {
    expect(TEMAS).toHaveLength(150);
    expect(new Set(TEMAS.map((t) => t.id)).size).toBe(150);
    expect(TEMAS.filter((t) => t.modo === "dark")).toHaveLength(75);
    expect(new Set(TEMAS.filter((t) => t.modo === "dark").map((t) => t.n))).toEqual(new Set([8, 15, 22]));
    expect(new Set(TEMAS.filter((t) => t.modo === "light").map((t) => t.n))).toEqual(new Set([96, 90, 84]));
  });

  it("sin tema guardado deja el diseño original (sin variables propias)", () => {
    const r = ejecutar({});
    expect(r.atributos["data-theme"]).toBe("dark");
    expect(Object.keys(r.estilos)).toHaveLength(0);
  });

  it("respeta el modo claro anterior de quien ya usaba el interruptor", () => {
    const r = ejecutar({ theme: "light" });
    expect(r.atributos["data-theme"]).toBe("light");
    expect(Object.keys(r.estilos)).toHaveLength(0);
  });

  it("aplica un tema guardado, lo cambia y vuelve al original limpiando las variables", () => {
    const r = ejecutar({ colorTheme: "esmeralda-oscuro" });
    expect(r.atributos["data-theme"]).toBe("dark");
    expect(r.estilos["--primary-hue"]).toBe("155");
    expect(r.estilos["--accent-rgb"]).toMatch(/^\d+, \d+, \d+$/);
    r.aplicar("rosa-claro");
    expect(r.atributos["data-theme"]).toBe("light");
    expect(r.estilos["--primary-hue"]).toBe("335");
    expect(r.almacen.theme).toBe("light");
    expect(r.almacen.colorTheme).toBe("rosa-claro");
    // Un oscuro «suave» y un claro «tinte» cambian también las superficies
    r.aplicar("violeta-suave");
    expect(r.estilos["--bg-app"]).toBe("hsl(230, 25%, 22%)");
    expect(r.estilos["--bg-surface"]).toBe("hsl(230, 25%, 26%)");
    r.aplicar("violeta-tinte");
    expect(r.atributos["data-theme"]).toBe("light");
    expect(r.estilos["--bg-surface"]).toBe("hsl(230, 13%, 91%)");
    r.aplicar("oscuro");
    expect(r.atributos["data-theme"]).toBe("dark");
    expect(Object.keys(r.estilos)).toHaveLength(0);
  });
});
