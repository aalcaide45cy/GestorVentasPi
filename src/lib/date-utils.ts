/** Convierte una fecha ISO `AAAA-MM-DD` (o con hora) a `DD/MM/AAAA`. Devuelve "" si no es válida. */
export function formatDate(valor: string | Date | null | undefined): string {
  if (!valor) return "";
  const texto = typeof valor === "string" ? valor : valor.toISOString();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Fecha de hoy en el navegador (`AAAA-MM-DD`, zona horaria local). */
export function hoyIsoCliente(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Número de expediente para mostrar: `#EXP-0042`. */
export function codigoExpediente(id: number): string {
  return `#EXP-${String(id).padStart(4, "0")}`;
}
