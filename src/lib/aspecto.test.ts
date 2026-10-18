import { describe, expect, it } from "vitest";
import { aspectoVehiculo } from "./aspecto";

const marca = { color: "#22c55e", punto: "●", punto_color: "#facc15" };
const estado = (prevalece: "marca" | "estado", extra: { capsula_color?: string | null; punto?: string | null; punto_color?: string | null } = {}) => ({ capsula_color: "#ef4444", punto: ",", punto_color: "#3b82f6", prevalece, ...extra });

describe("aspecto del coche (marca o estado)", () => {
  it("por defecto manda la marca", () => {
    expect(aspectoVehiculo(marca, estado("marca"))).toEqual({ capsula: "#22c55e", punto: "●", puntoColor: "#facc15" });
  });

  it("si el estado prevalece, manda el estado", () => {
    expect(aspectoVehiculo(marca, estado("estado"))).toEqual({ capsula: "#ef4444", punto: ",", puntoColor: "#3b82f6" });
  });

  it("el que no manda rellena lo que le falte al otro", () => {
    expect(aspectoVehiculo({ color: null, punto: null, punto_color: null }, estado("marca"))).toEqual({ capsula: "#ef4444", punto: ",", puntoColor: "#3b82f6" });
    expect(aspectoVehiculo(marca, estado("estado", { capsula_color: null, punto: null }))).toEqual({ capsula: "#22c55e", punto: "●", puntoColor: "#3b82f6" });
  });

  it("sin marca ni estado no hay aspecto", () => {
    expect(aspectoVehiculo(null, null)).toEqual({ capsula: null, punto: null, puntoColor: null });
  });
});
