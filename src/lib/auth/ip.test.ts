import { describe, expect, it } from "vitest";
import { ipDeCabeceras } from "./ip";

const cab = (c: Record<string, string>) => (n: string) => c[n] ?? null;

describe("ipDeCabeceras", () => {
  it("prefiere la IP que pone Cloudflare", () => {
    expect(
      ipDeCabeceras(
        cab({
          "cf-connecting-ip": "203.0.113.7",
          "x-forwarded-for": "1.1.1.1, 203.0.113.7",
        }),
      ),
    ).toBe("203.0.113.7");
  });
  it("de x-forwarded-for vale el último elemento: los anteriores los puede inventar quien llama", () => {
    expect(
      ipDeCabeceras(cab({ "x-forwarded-for": "9.9.9.9, 198.51.100.4" })),
    ).toBe("198.51.100.4");
    expect(ipDeCabeceras(cab({ "x-forwarded-for": "198.51.100.4" }))).toBe(
      "198.51.100.4",
    );
  });
  it("sin cabeceras (red local, directo) no hay IP", () => {
    expect(ipDeCabeceras(cab({}))).toBeNull();
    expect(ipDeCabeceras(cab({ "x-real-ip": "192.0.2.1" }))).toBe("192.0.2.1");
  });
});
