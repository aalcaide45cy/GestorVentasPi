import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { requireSession } from "@/lib/auth/sesion";
import { errorJson, leerJson, manejar } from "@/lib/http";
import { despertarLectores } from "@/lib/servicios/lecturas-pedidos";
import { MAXIMO_SIMULTANEAS, MOTORES, cargarAjustesOcr, equipoOcr, guardarAjustesOcr, motorRecomendado, proveedorDe, type EquipoOcr, type MotorOcr } from "@/lib/servicios/ocr-ajustes";
import { nombreDeMotor } from "@/lib/ocr-motores";
import { probarRapido } from "@/lib/servicios/ocr-rapido";
import { esMacOs, visionDisponible } from "@/lib/servicios/ocr-vision";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export interface OpcionMotorDto {
  id: MotorOcr;
  nombre: string;
  /** Para qué equipo va mejor (se enseña como ayuda del desplegable). */
  equipo: string;
  detalle: string;
  recomendado: boolean;
}

export interface AjustesOcrDto {
  motor: MotorOcr;
  simultaneas: number;
  lecturaManual: boolean;
  maximoSimultaneas: number;
  equipo: EquipoOcr;
  opciones: OpcionMotorDto[];
}

function opciones(equipo: EquipoOcr): OpcionMotorDto[] {
  const rec = motorRecomendado(equipo);
  return [
    {
      id: "tesseract",
      nombre: nombreDeMotor("tesseract"),
      equipo: "Cualquier equipo (solo usa el procesador)",
      detalle: "El lector clásico: funciona en cualquier equipo, pero acierta menos con escaneos flojos (confunde cifras y letras del DNI, pierde la @ de los correos).",
      recomendado: false,
    },
    {
      id: "rapido-cpu",
      nombre: nombreDeMotor("rapido-cpu"),
      equipo: equipo.esRaspberry ? "Recomendado para la Raspberry (solo usa el procesador)" : "Recomendado para Raspberry y PC sin tarjeta NVIDIA (solo usa el procesador)",
      detalle: "Modelos PaddleOCR en ONNX: lee bastante mejor que Tesseract, también en la Raspberry. Usa solo el procesador.",
      recomendado: rec === "rapido-cpu",
    },
    {
      id: "rapido-gpu",
      nombre: nombreDeMotor("rapido-gpu", equipo.nvidia),
      equipo: equipo.nvidia ? `Usa la tarjeta gráfica ${equipo.nvidia} de este equipo` : "Para PC con tarjeta NVIDIA RTX (en este equipo no se ha detectado ninguna)",
      detalle: equipo.nvidia ? "Usa la tarjeta gráfica para leer mucho más rápido (en Windows con DirectML, en Linux con CUDA). Si la GPU no se puede usar, se lee con la CPU." : "Para PC con tarjeta NVIDIA. En este equipo no se ha detectado ninguna: si la eliges, se leerá con la CPU.",
      recomendado: rec === "rapido-gpu",
    },
    // Apple Vision solo se ofrece cuando la aplicación corre directamente en macOS
    ...(equipo.macos
      ? [
          {
            id: "vision" as const,
            nombre: nombreDeMotor("vision"),
            equipo: "Solo en Mac, con chip Apple (M1 o posterior): usa el Neural Engine",
            detalle: "El reconocimiento de texto del propio macOS (el de «Texto en vivo»): usa el Neural Engine del Mac y suele leer muy bien documentos impresos. La primera vez compila un programa pequeño (necesita las herramientas de Xcode: «xcode-select --install»). Si falla, se lee con RapidOCR.",
            recomendado: rec === "vision",
          },
        ]
      : []),
  ];
}

async function dto(): Promise<AjustesOcrDto> {
  const [a, equipo] = await Promise.all([cargarAjustesOcr(db, true), equipoOcr()]);
  return { motor: a.motor, simultaneas: a.simultaneas, lecturaManual: a.lecturaManual, maximoSimultaneas: MAXIMO_SIMULTANEAS, equipo, opciones: opciones(equipo) };
}

/** Motor de lectura de pedidos elegido, lecturas a la vez y datos del equipo para recomendar. */
export const GET = manejar(async () => {
  await requireSession("administrador");
  return NextResponse.json({ success: true, data: await dto() });
});

const esquema = z.object({ motor: z.enum(MOTORES as [MotorOcr, ...MotorOcr[]]).optional(), simultaneas: z.number().int().min(0).max(MAXIMO_SIMULTANEAS).optional(), lecturaManual: z.boolean().optional() });

const errorVisionFueraDeMac = "Apple Vision solo está disponible cuando la aplicación corre directamente en macOS.";

export const PUT = manejar(async (req: Request) => {
  await requireSession("administrador");
  const e = await leerJson(req, esquema);
  if (e.motor === "vision" && !esMacOs()) return errorJson(400, errorVisionFueraDeMac);
  await guardarAjustesOcr(db, e);
  despertarLectores();
  return NextResponse.json({ success: true, data: await dto() });
});

/** Comprueba si un motor arranca en este equipo (por ejemplo, la GPU) sin cambiar nada. */
export const POST = manejar(async (req: Request) => {
  await requireSession("administrador");
  const e = await leerJson(req, z.object({ motor: z.enum(MOTORES as [MotorOcr, ...MotorOcr[]]) }));
  if (e.motor === "vision") {
    const v = await visionDisponible();
    return NextResponse.json({ success: true, data: v.ok ? { ok: true, usado: "vision" } : v });
  }
  const proveedor = proveedorDe(e.motor);
  if (!proveedor) return NextResponse.json({ success: true, data: { ok: true, usado: "tesseract" } });
  return NextResponse.json({ success: true, data: await probarRapido(proveedor) });
});
