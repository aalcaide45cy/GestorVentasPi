/** Llamada JSON a la API con el formato `{ success, data }` / `{ message }`. */
export async function llamar<T>(url: string, init?: { method?: string; cuerpo?: unknown }): Promise<{ data: T; extra: Record<string, unknown> }> {
  const r = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init?.cuerpo !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.cuerpo !== undefined ? JSON.stringify(init.cuerpo) : undefined,
    credentials: "same-origin",
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await r.json()) as Record<string, unknown>;
  } catch {
    /* respuesta sin cuerpo */
  }
  if (!r.ok) throw new Error(typeof json.message === "string" ? json.message : `Error ${r.status}`);
  return { data: json.data as T, extra: json };
}

export const textoError = (e: unknown): string => (e instanceof Error ? e.message : "Error inesperado");
