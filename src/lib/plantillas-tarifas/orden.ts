/**
 * Orden de los modelos dentro de cada marca en las tarifas VN. Tras aplicar una plantilla se vuelven a numerar los modelos de cada
 * marca (0, 1, 2…) respetando el orden que traen; los modelos sin orden claro quedan detrás, por nombre.
 */
export function renumerarOrden<T extends { idModelo: number; orden: number }>(tarifas: T[], modelos: { id: number; nombre: string; marcaId: number | null }[]): T[] {
  const info = new Map(modelos.map((m) => [m.id, m]));
  const porMarca = new Map<number | null, Map<number, number>>();
  for (const t of tarifas) {
    const marca = info.get(t.idModelo)?.marcaId ?? null;
    const g = porMarca.get(marca) ?? new Map<number, number>();
    g.set(t.idModelo, Math.min(g.get(t.idModelo) ?? Number.MAX_SAFE_INTEGER, t.orden));
    porMarca.set(marca, g);
  }
  const nuevo = new Map<number, number>();
  for (const g of porMarca.values()) {
    [...g.entries()]
      .sort((a, b) => a[1] - b[1] || (info.get(a[0])?.nombre ?? "").localeCompare(info.get(b[0])?.nombre ?? "", "es"))
      .forEach(([id], i) => nuevo.set(id, i));
  }
  return tarifas.map((t) => ({ ...t, orden: nuevo.get(t.idModelo) ?? t.orden }));
}
