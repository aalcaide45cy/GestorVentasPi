import type { PagoRciDto } from "@/lib/servicios/pagos-rci";

/** Error de la API de pagos de RCI con su código (el 409 significa «el documento no coincide»: se puede forzar). */
export class ErrorPagoRci extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
  }
}

/** Sube un pago (PDF o foto). Con `idExpediente` se aplica directamente a ese expediente. */
export async function subirPagoRci(f: File, opciones: { idExpediente?: number; forzar?: boolean } = {}): Promise<PagoRciDto> {
  const q = new URLSearchParams({ nombre: f.name });
  if (opciones.idExpediente) q.set("idExpediente", String(opciones.idExpediente));
  if (opciones.forzar) q.set("forzar", "1");
  const r = await fetch(`/api/pagos-rci?${q.toString()}`, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f, credentials: "same-origin" });
  const json = (await r.json().catch(() => ({}))) as { data?: PagoRciDto; message?: string };
  if (!r.ok || !json.data) throw new ErrorPagoRci(json.message ?? "No se pudo subir el pago", r.status);
  return json.data;
}

/** A qué expediente se ha asignado un pago, en una frase («expediente nº 12 de Ana Ruiz (1234ABC)»); `null` si aún no tiene. */
export const textoExpedientePago = (p: { idExpediente: number | null; clienteExpediente: string | null; matricula: string | null }): string | null =>
  p.idExpediente ? `expediente nº ${p.idExpediente}${p.clienteExpediente ? ` de ${p.clienteExpediente}` : ""}${p.matricula ? ` (${p.matricula})` : ""}` : null;

export interface ResumenSubidaPagos {
  /** Qué pago ha ido a qué expediente (los aplicados), para decirlo en el aviso. */
  asignados: string[];
  aplicados: number;
  pendientes: number;
  ignorados: number;
  duplicados: number;
  errores: string[];
}

/** Sube muchos pagos (de dos en dos) y cuenta qué ha pasado con cada uno. `alProgreso` recibe los que van hechos. */
export async function subirPagosRci(ficheros: File[], alProgreso: (hechos: number, total: number) => void): Promise<ResumenSubidaPagos> {
  const r: ResumenSubidaPagos = { asignados: [], aplicados: 0, pendientes: 0, ignorados: 0, duplicados: 0, errores: [] };
  let siguiente = 0;
  let hechos = 0;
  const trabajar = async () => {
    for (let i = siguiente++; i < ficheros.length; i = siguiente++) {
      try {
        const p = await subirPagoRci(ficheros[i]);
        if (p.duplicado) r.duplicados++;
        else if (p.estado === "aplicado") {
          r.aplicados++;
          r.asignados.push(`${p.nombre ?? p.nombreArchivo} → ${textoExpedientePago(p) ?? "su expediente"}`);
        }
        else if (p.estado === "ignorado") r.ignorados++;
        else r.pendientes++;
      } catch (e) {
        r.errores.push(`${ficheros[i].name}: ${e instanceof Error ? e.message : "error"}`);
      }
      alProgreso(++hechos, ficheros.length);
    }
  };
  await Promise.all([trabajar(), trabajar()]);
  return r;
}

export const euros = (cent: number | null): string => (cent === null ? "—" : (cent / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" }));
export const fechaCorta = (iso: string | null): string => (iso ? iso.split("-").reverse().join("/") : "—");
