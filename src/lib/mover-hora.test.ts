import { describe, expect, it } from "vitest";
import { moverHora } from "@/components/SelectorHora";

describe("moverHora", () => {
  it("sube y baja la hora de 1 en 1 dando la vuelta a las 24 h, y los minutos de 15 en 15", () => {
    expect(moverHora("10:30", "hora", 1)).toBe("11:30");
    expect(moverHora("23:30", "hora", 1)).toBe("00:30");
    expect(moverHora("00:15", "hora", -1)).toBe("23:15");
    expect(moverHora("10:30", "min", 1)).toBe("10:45");
    expect(moverHora("10:45", "min", 1)).toBe("10:00");
    expect(moverHora("10:00", "min", -1)).toBe("10:45");
    expect(moverHora("10:20", "min", 1)).toBe("10:30");
  });
  it("sin hora parte de las 09:00", () => {
    expect(moverHora("", "hora", 1)).toBe("10:00");
    expect(moverHora("", "min", 1)).toBe("09:15");
  });
});
