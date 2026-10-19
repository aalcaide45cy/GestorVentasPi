import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { leerJson, manejar } from "@/lib/http";
import { despertarLectores } from "@/lib/servicios/lecturas-pedidos";
import { MAXIMO_SIMULTANEAS, MOTORES, cargarAjustesOcr, equipoOcr, guardarAjustesOcr, motorRecomendado, proveedorDe, type EquipoOcr, type MotorOcr } from "@/lib/servicios/ocr-ajustes";
import { probarRapido } from "@/lib/servicios/ocr-rapido";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export interface OpcionMotorDto {
  id: MotorOcr;
  nombre: string;
  /** Entre paréntesis en el selector: para qué equipo va mejor. */
  equipo: string;
  detalle: string;
  recomendado: boolean;
}

export interface AjustesOcrDto {
  motor: MotorOcr;
  simultaneas: number;
  maximoSimultaneas: number;
  equipo: EquipoOcr;
  opciones: OpcionMotorDto[];
}

function opciones(equipo: EquipoOcr): OpcionMotorDto[] {
  const rec = motorRecomendado(equipo);
  return [
    {
      id: "tesseract",
      nombre: "Tesseract",
      equipo: "CPU, cualquier equipo",
      detalle: "El lector clásico: funciona en cualquier equipo, pero acierta menos con escaneos flojos (confunde cifras y letras del DNI, pierde la @ de los correos).",
      recomendado: false,
    },
    {
      id: "rapido-cpu",
      nombre: "RapidOCR",
      equipo: equipo.esRaspberry ? "CPU, recomendado para Raspberry" : "CPU, recomendado para Raspberry y PC sin GPU",
      detalle: "Modelos PaddleOCR en ONNX: lee bastante mejor que Tesseract, también en la Raspberry. Usa solo el procesador.",
      recomendado: rec === "rapido-cpu",
    },
    {
      id: "rapido-gpu",
      nombre: "RapidOCR",
      equipo: equipo.nvidia ? `GPU NVIDIA ${equipo.nvidia}, recomendado en este equipo` : "GPU NVIDIA RTX, recomendado en PC con RTX",
      detalle: equipo.nvidia ? "Usa la tarjeta gráfica para leer mucho más rápido (en Windows con DirectML, en Linux con CUDA). Si la GPU no se puede usar, se lee con la CPU." : "Para PC con tarjeta NVIDIA. En este equipo no se ha detectado ninguna: si la eliges, se leerá con la CPU.",
      recomendado: rec === "rapido-gpu",
    },
  ];
}

async function dto(): Promise<AjustesOcrDto> {
  const [a, equipo] = await Promise.all([cargarAjustesOcr(db, true), equipoOcr()]);
  return { motor: a.motor, simultaneas: a.simultaneas, maximoSimultaneas: MAXIMO_SIMULTANEAS, equipo, opciones: opciones(equipo) };
}

/** Motor de lectura de pedidos elegido, lecturas a la vez y datos del equipo para recomendar. */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: await dto() });
});

const esquema = z.object({ motor: z.enum(MOTORES as [MotorOcr, ...MotorOcr[]]).optional(), simultaneas: z.number().int().min(0).max(MAXIMO_SIMULTANEAS).optional() });

export const PUT = manejar(async (req: Request) => {
  await requireSession("administrador");
  const e = await leerJson(req, esquema);
  await guardarAjustesOcr(db, e);
  despertarLectores();
  return NextResponse.json({ success: true, data: await dto() });
});

/** Comprueba si un motor arranca en este equipo (por ejemplo, la GPU) sin cambiar nada. */
export const POST = manejar(async (req: Request) => {
  await requireSession("administrador");
  const e = await leerJson(req, z.object({ motor: z.enum(MOTORES as [MotorOcr, ...MotorOcr[]]) }));
  const proveedor = proveedorDe(e.motor);
  if (!proveedor) return NextResponse.json({ success: true, data: { ok: true, usado: "tesseract" } });
  return NextResponse.json({ success: true, data: await probarRapido(proveedor) });
});
