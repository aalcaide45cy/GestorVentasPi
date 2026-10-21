/**
 * Nombres de los motores de OCR tal como se enseñan en TODOS los desplegables y avisos de la aplicación: siempre «motor · dónde se ejecuta»,
 * para que se vea de un vistazo si es Tesseract o RapidOCR, si va en CPU o en GPU, o si es Apple Vision (solo Mac).
 */
export type IdMotor = "tesseract" | "rapido-cpu" | "rapido-gpu" | "vision";

/** «NVIDIA GeForce RTX 4090» → «RTX 4090» (corto para un desplegable); si no hay tarjeta conocida, «NVIDIA». */
export function nombreCortoGpu(nvidia: string | null | undefined): string {
  const limpio = (nvidia ?? "").replace(/NVIDIA/gi, "").replace(/GeForce/gi, "").replace(/\s+/g, " ").trim();
  return limpio ? limpio : "NVIDIA";
}

export function nombreDeMotor(id: IdMotor | string, gpu?: string | null): string {
  switch (id) {
    case "tesseract":
      return "Tesseract · CPU";
    case "rapido-cpu":
      return "RapidOCR · CPU";
    case "rapido-gpu":
      return `RapidOCR · GPU ${nombreCortoGpu(gpu)}`;
    case "vision":
      return "Apple Vision · Neural Engine (solo Mac)";
    default:
      return id;
  }
}
