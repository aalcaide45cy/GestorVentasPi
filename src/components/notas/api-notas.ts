import type { FicheroNotaDto } from "@/lib/notas";
import { avisarCambioDeDatosTrasPausa } from "@/lib/datos-version";

/** Sube un fichero a una nota con barra de progreso (pueden pesar hasta 500 MB). */
export function subirFicheroNota(
  idNota: number,
  archivo: File,
  alProgreso?: (porcentaje: number) => void,
): Promise<FicheroNotaDto> {
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `/api/notas/ficheros?idNota=${idNota}&nombre=${encodeURIComponent(archivo.name || "archivo")}`,
    );
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && alProgreso)
        alProgreso(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const r = JSON.parse(xhr.responseText) as {
          success?: boolean;
          data?: FicheroNotaDto;
          message?: string;
          error?: string;
        };
        if (xhr.status >= 200 && xhr.status < 300 && r.data) {
          avisarCambioDeDatosTrasPausa();
          resolver(r.data);
        } else
          rechazar(
            new Error(
              r.message ?? r.error ?? "No se ha podido subir el archivo",
            ),
          );
      } catch {
        rechazar(
          new Error(
            xhr.status === 413
              ? "El archivo es demasiado grande (máximo 500 MB)."
              : "No se ha podido subir el archivo",
          ),
        );
      }
    };
    xhr.onerror = () =>
      rechazar(new Error("Se ha cortado la conexión al subir el archivo"));
    xhr.send(archivo);
  });
}

export const urlFichero = (id: number, miniatura = false): string =>
  `/api/notas/ficheros?id=${id}${miniatura ? "&miniatura=1" : ""}`;

export const esImagen = (mime: string): boolean => mime.startsWith("image/");

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2).replace(".", ",")} GB`;
}

/** «hace 5 min», «ayer», «12/10/2026»: para la lista de notas. */
export function fechaRelativa(iso: string): string {
  const d = new Date(iso);
  const dif = Date.now() - d.getTime();
  if (dif < 60_000) return "ahora";
  if (dif < 3_600_000) return `hace ${Math.floor(dif / 60_000)} min`;
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString())
    return d.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const ayer = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === ayer.toDateString()) return "ayer";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
