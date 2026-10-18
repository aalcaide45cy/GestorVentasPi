import { describe, expect, it } from "vitest";
import { elegirModeloExistente, mismoModeloBase } from "./modelos";

const cat = ["Espace", "Clio", "Sandero", "Twingo", "Twingo E-Tech eléctrico", "Austral"].map((nombre, id) => ({ id, nombre }));

describe("modelo base de un listado", () => {
  it("ignora Nuevo/Nueva y las variantes", () => {
    expect(elegirModeloExistente("Nuevo Espace", cat)?.nombre).toBe("Espace");
    expect(elegirModeloExistente("Clio CL6", cat)?.nombre).toBe("Clio");
    expect(elegirModeloExistente("CLIO GENERATION", cat)?.nombre).toBe("Clio");
    expect(elegirModeloExistente("CLIO (CL6)", cat)?.nombre).toBe("Clio");
    expect(elegirModeloExistente("Sandero Stepway", cat)?.nombre).toBe("Sandero");
  });
  it("gana el nombre completo si existe y no inventa modelos", () => {
    expect(elegirModeloExistente("Twingo E-Tech eléctrico", cat)?.nombre).toBe("Twingo E-Tech eléctrico");
    expect(elegirModeloExistente("Twingo Zen", cat)?.nombre).toBe("Twingo");
    expect(elegirModeloExistente("Kangoo", cat)).toBeNull();
  });
  it("compara dos nombres como el mismo modelo", () => {
    expect(mismoModeloBase("Nuevo Espace", "Espace")).toBe(true);
    expect(mismoModeloBase("Clio CL6", "Clio")).toBe(true);
    expect(mismoModeloBase("Clio", "Captur")).toBe(false);
  });
});
