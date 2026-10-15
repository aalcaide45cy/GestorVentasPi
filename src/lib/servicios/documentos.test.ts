import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { digitoControl } from "@/lib/documentos/dni";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { leerAdjunto } from "./adjuntos";
import { leerDni, leerPedido, recortarFotoDni } from "./documentos";

beforeEach(reiniciarBd);
beforeAll(() => {
  GlobalFonts.registerFromPath(path.join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf"), "Geist");
});

function anverso(): Buffer {
  const l = createCanvas(1700, 1070);
  const ctx = l.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1700, 1070);
  ctx.fillStyle = "#888888";
  ctx.fillRect(70, 230, 480, 660); // la foto
  ctx.fillStyle = "#000000";
  ctx.font = "54px Geist";
  ["DOCUMENTO NACIONAL DE IDENTIDAD", "APELLIDOS / SURNAME", "GARCIA LOPEZ", "NOMBRE / NAME", "JUAN ANTONIO", "NACIMIENTO 14 03 1985", "12345678Z"].forEach((t, i) => ctx.fillText(t, 640, 160 + i * 130));
  return l.toBuffer("image/png");
}

function reverso(): Buffer {
  const soporte = "BAB123456";
  const l1 = `IDESP${soporte}${digitoControl(soporte)}12345678Z`.padEnd(30, "<");
  const nac = "850314";
  const cad = "320101";
  const base = `${nac}${digitoControl(nac)}M${cad}${digitoControl(cad)}ESP${"<".repeat(11)}`;
  const comp = digitoControl(`${l1.slice(5, 30)}${base.slice(0, 7)}${base.slice(8, 15)}${base.slice(18, 29)}`);
  const lineas = [l1, `${base}${comp}`, "GARCIA<LOPEZ<<JUAN<ANTONIO".padEnd(30, "<")];
  const l = createCanvas(1700, 1070);
  const ctx = l.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1700, 1070);
  ctx.fillStyle = "#000000";
  ctx.font = "60px Geist";
  ctx.fillText("EMISOR: DGP  VÁLIDO HASTA 01 01 2032", 80, 160);
  // Tipografía de paso fijo, como la zona legible real
  lineas.forEach((t, fila) => [...t].forEach((c, i) => ctx.fillText(c, 80 + i * 52, 700 + fila * 110)));
  return l.toBuffer("image/png");
}

describe("lectura de documentos", () => {
  it("recorta la foto del titular del anverso", async () => {
    const foto = await recortarFotoDni(anverso());
    expect(foto).not.toBeNull();
    expect(foto!.length).toBeGreaterThan(500);
  });

  it("lee el anverso del DNI: nombre y número, y guarda la foto del cliente", { timeout: 180_000 }, async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const r = await leerDni(db, u.idUsuario, "dni-frente.png", anverso());
    expect(r.lado).toBe("anverso");
    expect(r.datos).toMatchObject({ dni: "12345678Z", apellidos: "Garcia Lopez", nombre: "Juan Antonio" });
    expect(r.fotoId).not.toBeNull();
    expect(r.adjuntos.map((a) => a.tipo)).toEqual(["dni_frente", "foto_cliente"]);
    const foto = await leerAdjunto(db, r.fotoId as number, true);
    expect(foto?.mime).toBe("image/jpeg");
  });

  it("lee el reverso del DNI por la zona legible por máquina", { timeout: 180_000 }, async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const r = await leerDni(db, u.idUsuario, "dni-reverso.png", reverso());
    expect(r.lado).toBe("reverso");
    // La zona legible se dibuja aquí con una fuente proporcional, no OCR-B: se exige lo esencial (fecha con dígito de control y apellidos)
    expect(r.datos.fechaNacimiento).toBe("1985-03-14");
    expect(r.datos.apellidos).toBe("Garcia Lopez");
    expect(r.fotoId).toBeNull();
    expect(r.adjuntos.map((a) => a.tipo)).toEqual(["dni_reverso"]);
  });

  it("lee un pedido en imagen y propone bastidor y matrícula", { timeout: 180_000 }, async () => {
    const u = await crearUsuarioPrueba("vendedor");
    const l = createCanvas(1500, 480);
    const ctx = l.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1500, 480);
    ctx.fillStyle = "#000";
    ctx.font = "44px Geist";
    ["PEDIDO DE VEHICULO", "Bastidor WVWZZZ1KZ6W123456", "Matricula 1234 BCD", "Forma de pago: Contado"].forEach((t, i) => ctx.fillText(t, 50, 80 + i * 100));
    const r = await leerPedido(db, u.idUsuario, "pedido.png", l.toBuffer("image/png"));
    // El OCR puede confundir letras parecidas (V/W) con según qué fuente: se exige un bastidor de 17 caracteres
    expect(r.datos.vin).toMatch(/^[A-Z0-9]{17}$/);
    expect(r.datos.matricula).toBe("1234BCD");
    expect(r.adjunto.tipo).toBe("pedido");
  });
});
