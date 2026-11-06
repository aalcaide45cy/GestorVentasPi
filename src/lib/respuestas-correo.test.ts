import { describe, expect, it } from "vitest";
import { extracto, pideLaBaja, textoNuevo } from "./respuestas-correo";

describe("respuestas a los correos a potenciales", () => {
  it("quita el texto citado de nuestro correo", () => {
    const t =
      "Baja, gracias\n\nEl vie, 6 nov 2026 a las 11:00, Alfonso <a@b.test> escribió:\n> Buenos días Marta, estuvimos viendo un Dacia\n> Si no quieres recibir más mensajes, responde con la palabra BAJA.";
    expect(textoNuevo(t)).toBe("Baja, gracias");
    expect(extracto(t)).toBe("Baja, gracias");
  });

  it("detecta quien pide la baja", () => {
    for (const t of [
      "BAJA",
      "baja",
      "Baja.",
      "Por favor, baja",
      "Hola, BAJA",
      "Dame de baja por favor",
      "No quiero recibir más correos",
      "No me escribáis más",
      "Solicito la baja de sus comunicaciones",
      "unsubscribe",
      "Quiero la baja",
    ])
      expect(pideLaBaja(t), t).toBe(true);
    // Aunque lo único nuevo sea la baja, lo citado de nuestro correo (que dice «responde con BAJA») no cuenta
    expect(
      pideLaBaja(
        "Gracias\n> Si no quieres recibir más mensajes, responde con la palabra BAJA.",
      ),
    ).toBe(false);
    expect(
      pideLaBaja(
        "baja\n> Si no quieres recibir más mensajes, responde con la palabra BAJA.",
      ),
    ).toBe(true);
  });

  it("no confunde otras respuestas con una baja", () => {
    for (const t of [
      "Me interesa, ¿puedes llamarme mañana?",
      "Tengo que dar de baja mi coche actual antes de comprar",
      "Gracias, ya compré otro coche",
      "¿Qué promoción hay? Un saludo",
      "El precio ha bajado, ¿verdad?",
      "",
    ])
      expect(pideLaBaja(t), t).toBe(false);
  });
});
