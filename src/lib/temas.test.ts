import { describe, expect, it } from "vitest";
import { TEMAS, VARIABLES_TEMA, esTemaValido, variablesTema } from "./temas";

describe("temas de color", () => {
  it("hay 150 temas con identificadores únicos, con variedad de claridad en oscuros y claros", () => {
    expect(TEMAS).toHaveLength(150);
    expect(new Set(TEMAS.map((t) => t.id)).size).toBe(150);
    expect(TEMAS.filter((t) => t.modo === "dark")).toHaveLength(75);
    expect(new Set(TEMAS.filter((t) => t.modo === "dark").map((t) => t.n))).toEqual(new Set([8, 15, 22]));
    expect(new Set(TEMAS.filter((t) => t.modo === "light").map((t) => t.n))).toEqual(new Set([96, 90, 84]));
  });

  it("los dos originales no fijan variables propias y respetan el modo", () => {
    expect(variablesTema("oscuro")).toEqual({ claro: false, vars: {} });
    expect(variablesTema("claro")).toEqual({ claro: true, vars: {} });
    expect(variablesTema("id-que-no-existe")).toEqual({ claro: false, vars: {} });
  });

  it("solo se aceptan temas conocidos (la cookie no es de fiar)", () => {
    expect(esTemaValido("esmeralda-oscuro")).toBe(true);
    expect(esTemaValido("oscuro")).toBe(true);
    expect(esTemaValido("</style><x>")).toBe(false);
    expect(esTemaValido(undefined)).toBe(false);
  });

  it("calcula las variables de un tema oscuro y de un claro, solo con variables conocidas", () => {
    const e = variablesTema("esmeralda-oscuro");
    expect(e.claro).toBe(false);
    expect(e.vars["--primary-hue"]).toBe("155");
    expect(e.vars["--accent-rgb"]).toMatch(/^\d+, \d+, \d+$/);
    const r = variablesTema("rosa-claro");
    expect(r.claro).toBe(true);
    expect(r.vars["--primary-hue"]).toBe("335");
    const suave = variablesTema("violeta-suave");
    expect(suave.vars["--bg-app"]).toBe("hsl(230, 25%, 22%)");
    expect(suave.vars["--bg-surface"]).toBe("hsl(230, 25%, 26%)");
    const tinte = variablesTema("violeta-tinte");
    expect(tinte.claro).toBe(true);
    expect(tinte.vars["--bg-surface"]).toBe("hsl(230, 13%, 91%)");
    for (const t of TEMAS) for (const n of Object.keys(variablesTema(t.id).vars)) expect(VARIABLES_TEMA).toContain(n);
  });
});
