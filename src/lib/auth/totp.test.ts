import { describe, expect, it } from "vitest";
import { cifrar, descifrar, huella } from "./cifrado";
import { generarCodigosRecuperacion, huellaCodigoRecuperacion, normalizarCodigoRecuperacion, parecidoACodigoRecuperacion } from "./recuperacion";
import { base32Codificar, base32Decodificar, codigoTotp, generarSecreto, urlOtpauth, verificarTotp } from "./totp";

/** Vectores de prueba de la RFC 6238 (SHA-1, secreto ASCII «12345678901234567890»), a 6 dígitos. */
const SECRETO_RFC = base32Codificar(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("el código en t=%i es %s", (t, esperado) => {
    expect(codigoTotp(SECRETO_RFC, t * 1000)).toBe(esperado);
  });

  it("base32 va y vuelve", () => {
    const datos = Buffer.from("secreto de prueba 123");
    expect(base32Decodificar(base32Codificar(datos)).equals(datos)).toBe(true);
    expect(() => base32Decodificar("¡no válido!")).toThrow();
  });

  it("el secreto generado tiene 160 bits (32 caracteres base32) y no se repite", () => {
    const a = generarSecreto();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(generarSecreto()).not.toBe(a);
  });

  it("acepta el paso anterior y el siguiente, pero no dos pasos de diferencia", () => {
    const t = 1_700_000_000_000;
    expect(verificarTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, t), t)).not.toBeNull();
    expect(verificarTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, t - 30_000), t)).not.toBeNull();
    expect(verificarTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, t + 30_000), t)).not.toBeNull();
    expect(verificarTotp(SECRETO_RFC, codigoTotp(SECRETO_RFC, t - 90_000), t)).toBeNull();
  });

  it("rechaza el mismo contador dos veces (anti-reutilización)", () => {
    const t = 1_700_000_000_000;
    const codigo = codigoTotp(SECRETO_RFC, t);
    const contador = verificarTotp(SECRETO_RFC, codigo, t);
    expect(contador).not.toBeNull();
    expect(verificarTotp(SECRETO_RFC, codigo, t, contador)).toBeNull();
  });

  it("rechaza entradas que no son 6 dígitos", () => {
    expect(verificarTotp(SECRETO_RFC, "12345", 0)).toBeNull();
    expect(verificarTotp(SECRETO_RFC, "abcdef", 0)).toBeNull();
    expect(verificarTotp(SECRETO_RFC, "", 0)).toBeNull();
  });

  it("la URL otpauth lleva emisor, correo, secreto, 6 dígitos y 30 s", () => {
    const url = urlOtpauth("ana@e.com", SECRETO_RFC);
    expect(url).toContain("otpauth://totp/GestorVentasPi%3Aana%40e.com");
    expect(url).toContain(`secret=${SECRETO_RFC}`);
    expect(url).toContain("issuer=GestorVentasPi");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
  });
});

describe("cifrado AES-256-GCM", () => {
  it("cifra y descifra, y cada cifrado es distinto", () => {
    const a = cifrar("JBSWY3DPEHPK3PXP", "totp");
    const b = cifrar("JBSWY3DPEHPK3PXP", "totp");
    expect(a).not.toContain("JBSWY3DPEHPK3PXP");
    expect(a).not.toBe(b);
    expect(descifrar(a, "totp")).toBe("JBSWY3DPEHPK3PXP");
  });

  it("detecta manipulación y no descifra con otro propósito", () => {
    const c = cifrar("dato", "totp");
    const partes = c.split(".");
    partes[3] = Buffer.from("otra cosa").toString("base64url");
    expect(() => descifrar(partes.join("."), "totp")).toThrow();
    expect(() => descifrar(c, "otro-proposito")).toThrow();
    expect(() => descifrar("basura", "totp")).toThrow();
  });

  it("la huella es estable y depende del propósito", () => {
    expect(huella("x", "a")).toBe(huella("x", "a"));
    expect(huella("x", "a")).not.toBe(huella("x", "b"));
  });
});

describe("códigos de recuperación", () => {
  it("son 10, únicos y con formato XXXX-XXXX", () => {
    const codigos = generarCodigosRecuperacion();
    expect(codigos).toHaveLength(10);
    expect(new Set(codigos).size).toBe(10);
    for (const c of codigos) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("se aceptan en minúsculas y sin guion, y se guardan solo como huella", () => {
    const [c] = generarCodigosRecuperacion(1);
    expect(normalizarCodigoRecuperacion(c.toLowerCase().replace("-", " "))).toBe(c.replace("-", ""));
    expect(huellaCodigoRecuperacion(c)).toBe(huellaCodigoRecuperacion(c.toLowerCase().replace("-", "")));
    expect(huellaCodigoRecuperacion(c)).not.toContain(c.replace("-", ""));
    expect(parecidoACodigoRecuperacion(c)).toBe(true);
    expect(parecidoACodigoRecuperacion("123456")).toBe(false);
  });
});
