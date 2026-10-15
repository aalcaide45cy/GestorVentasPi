/** Convierte una fecha ISO `AAAA-MM-DD` (o con hora) a `DD/MM/AAAA`. Devuelve "" si no es válida. */
export function formatDate(valor: string | Date | null | undefined): string {
  if (!valor) return "";
  const texto = typeof valor === "string" ? valor : valor.toISOString();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
