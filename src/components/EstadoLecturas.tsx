"use client";

import { useState, useSyncExternalStore } from "react";
import { accionSobreLecturas, cancelarLecturas, leerResumenLecturas, listarNoPedidos, suscribirResumenLecturas } from "@/lib/lecturas-pedidos-cliente";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import type { LecturaDto } from "@/lib/servicios/lecturas-pedidos";

/**
 * Qué ha pasado con los documentos subidos para leer: cuántos faltan, cuántos no eran pedidos y cuántos dieron error (con
 * «Reintentar»). Así ningún documento desaparece sin que se sepa.
 */
export default function EstadoLecturas() {
  const r = useSyncExternalStore(suscribirResumenLecturas, leerResumenLecturas, () => null);
  const [lista, setLista] = useState<LecturaDto[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | "error" | "descartado" | "cancelado">("todos");
  if (!r || r.subiendo + r.pendientes + r.leyendo + r.descartados + r.errores === 0) return null;

  const ejecutar = async (f: () => Promise<void>) => {
    setOcupado(true);
    try {
      await f();
      if (lista) setLista(await listarNoPedidos());
    } finally {
      setOcupado(false);
    }
  };
  const ORDEN_ESTADO: Record<string, number> = { error: 0, descartado: 1, cancelado: 2 };
  const columnasLecturas: ColumnaTabla<LecturaDto>[] = [
    { clave: "estado", etiqueta: "Qué pasó", valor: (l) => ORDEN_ESTADO[l.estado] ?? 9, celda: (l) => <span style={{ color: l.estado === "error" ? "var(--danger)" : undefined, fontWeight: 600 }}>{l.estado === "error" ? "⚠️ Error" : l.estado === "cancelado" ? "✖ Cancelado" : "🗑️ Ignorado"}</span>, ayuda: "Error: no se pudo leer. Ignorado: no era un pedido o estaba repetido. Cancelado: lo cancelaste" },
    { clave: "nombre", etiqueta: "Archivo", valor: (l) => l.nombre, celda: (l) => <span style={{ whiteSpace: "normal", fontWeight: 600 }}>{l.nombre}</span> },
    { clave: "motivo", etiqueta: "Motivo", valor: (l) => (l.estado === "cancelado" ? "Cancelado por ti antes de leerlo" : (l.error ?? "")), celda: (l) => <span style={{ whiteSpace: "normal", color: l.estado === "error" ? "var(--danger)" : "var(--text-secondary)" }}>{l.estado === "cancelado" ? "Cancelado por ti antes de leerlo" : (l.error ?? "—")}</span>, ayuda: "El error exacto o por qué se ignoró" },
    { clave: "fecha", etiqueta: "Subido", valor: (l) => l.creadaEn, celda: (l) => new Date(l.creadaEn).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }), ayuda: "Cuándo se subió" },
    {
      clave: "acciones",
      etiqueta: "",
      valor: () => "",
      celda: (l) => (
        <span style={{ display: "inline-flex", gap: "6px" }}>
          {l.estado === "error" && (
            <button type="button" className="btn btn-secondary" style={{ padding: "1px 8px" }} disabled={ocupado} onClick={() => void ejecutar(() => accionSobreLecturas("reintentar", [l.id]))} title="Vuelve a intentar leerlo (solo si el fichero sigue guardado)">
              🔁 Reintentar
            </button>
          )}
          <button type="button" className="btn btn-secondary" style={{ padding: "1px 8px" }} disabled={ocupado} onClick={() => void ejecutar(() => accionSobreLecturas("limpiar", [l.id]))} title="Quita esta fila de la lista">
            ✕ Quitar
          </button>
        </span>
      ),
    },
  ];
  const abrirLista = () => void ejecutar(async () => setLista(lista ? null : await listarNoPedidos()));

  return (
    <div className="glass-panel" style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.85rem" }}>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        {r.subiendo > 0 && <span style={{ color: "var(--primary)", fontWeight: 600 }}>📤 {r.subiendo} subidos, esperando a que termine la carga para empezar a leerlos</span>}
        {r.pendientes + r.leyendo > 0 && (
          <span style={{ color: "var(--primary)", fontWeight: 600 }}>
            ⏳ {r.leyendo} leyéndose y {r.pendientes} en espera ({r.lectores} lecturas a la vez, hasta {r.maximo} si el equipo aguanta)
          </span>
        )}
        {r.descartados > 0 && <span>🗑️ {r.descartados} no eran pedidos o estaban repetidos (ignorados)</span>}
        {r.errores > 0 && <span style={{ color: "var(--danger)" }}>⚠️ {r.errores} con error</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {r.pendientes + r.subiendo > 0 && (
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={ocupado} onClick={() => void ejecutar(cancelarLecturas)}>
              ✖ Cancelar lo pendiente
            </button>
          )}
          {r.errores > 0 && (
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={ocupado} onClick={() => void ejecutar(() => accionSobreLecturas("reintentar"))}>
              🔁 Reintentar los errores
            </button>
          )}
          {r.descartados + r.errores > 0 && (
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={ocupado} onClick={abrirLista}>
              {lista ? "Ocultar detalle" : "Ver cuáles"}
            </button>
          )}
          {r.descartados > 0 && (
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={ocupado} onClick={() => void ejecutar(() => accionSobreLecturas("limpiar"))} title="Quita de la lista los ignorados">
              Limpiar ignorados
            </button>
          )}
        </span>
      </div>
      {lista && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ color: "var(--text-secondary)" }}>Ver:</span>
            {(["todos", "error", "descartado", "cancelado"] as const).map((f) => {
              const n = f === "todos" ? lista.length : lista.filter((l) => l.estado === f).length;
              return (
                <button key={f} type="button" className={`btn ${filtro === f ? "btn-primary" : "btn-secondary"}`} style={{ padding: "2px 10px" }} onClick={() => setFiltro(f)} title={f === "error" ? "Documentos que dieron error al leerse" : f === "descartado" ? "Documentos que no eran un pedido o ya estaban en la cola" : f === "cancelado" ? "Lecturas que cancelaste" : "Todos"}>
                  {f === "todos" ? "Todos" : f === "error" ? "⚠️ Con error" : f === "descartado" ? "🗑️ Ignorados" : "✖ Cancelados"} ({n})
                </button>
              );
            })}
          </div>
          <TablaDatos<LecturaDto>
            id="estado-lecturas"
            columnas={columnasLecturas}
            filas={lista.filter((l) => filtro === "todos" || l.estado === filtro)}
            clave={(l) => l.id}
            compacta
            ordenInicial={{ clave: "estado", asc: true }}
            placeholder="Buscar por archivo o por motivo…"
            vacio="Nada que mostrar con este filtro."
          />
        </div>
      )}
    </div>
  );
}
