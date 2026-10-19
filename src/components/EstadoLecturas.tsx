"use client";

import { useState, useSyncExternalStore } from "react";
import { accionSobreLecturas, cancelarPedidos, iniciarLectura, leerEnMarcha, leerResumenLecturas, listarNoPedidos, solicitarCancelacion, suscribirResumenLecturas } from "@/lib/lecturas-pedidos-cliente";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import type { LecturaDto } from "@/lib/servicios/lecturas-pedidos";

/**
 * Qué ha pasado con los documentos subidos para leer: cuántos faltan, cuántos no eran pedidos y cuántos dieron error (con
 * «Reintentar»). Así ningún documento desaparece sin que se sepa.
 */
export default function EstadoLecturas() {
  const r = useSyncExternalStore(suscribirResumenLecturas, leerResumenLecturas, () => null);
  const enMarcha = useSyncExternalStore(suscribirResumenLecturas, leerEnMarcha, () => []);
  const [verMarcha, setVerMarcha] = useState(false);
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
      etiqueta: "Acciones",
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
        {r.subiendo > 0 && (
          <span style={{ color: "var(--primary)", fontWeight: 600 }}>
            📤 {r.subiendo} subidos, {r.manual ? "esperando a que pulses «Iniciar lectura»" : "esperando a que termine la carga para empezar a leerlos"}
          </span>
        )}
        {r.pendientes + r.leyendo > 0 && (
          <span style={{ color: "var(--primary)", fontWeight: 600 }}>
            ⏳ {r.leyendo} leyéndose y {r.pendientes} en espera ({r.lectores} lecturas a la vez, hasta {r.maximo} si el equipo aguanta)
          </span>
        )}
        {r.descartados > 0 && <span>🗑️ {r.descartados} no eran pedidos o estaban repetidos (ignorados)</span>}
        {r.errores > 0 && <span style={{ color: "var(--danger)" }}>⚠️ {r.errores} con error</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {r.manual && r.subiendo > 0 && (
            <button type="button" className="btn btn-primary" style={{ padding: "2px 12px" }} disabled={ocupado} onClick={() => void ejecutar(iniciarLectura)} title="Empieza a leer todos los pedidos subidos que esperan">
              ▶ Iniciar lectura ({r.subiendo})
            </button>
          )}
          {r.pendientes + r.subiendo + r.leyendo > 0 && (
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={ocupado} onClick={solicitarCancelacion} title="Pregunta y cancela la subida y la lectura de todo lo que falta, sin dejar documentos a medias. Lo que ya estaba leído se queda en la cola.">
              ✖ Cancelar subida y lectura
            </button>
          )}
          {r.pendientes + r.subiendo + r.leyendo > 0 && (
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px" }} onClick={() => setVerMarcha((v) => !v)} title="Lista de lo que se está subiendo o leyendo, para cancelar pedidos sueltos">
              {verMarcha ? "Ocultar lista" : "Ver lo que falta"}
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
      {verMarcha && enMarcha.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "260px", overflowY: "auto" }}>
          <span style={{ color: "var(--text-secondary)" }}>
            Lo que falta ({r.subiendo + r.pendientes + r.leyendo}
            {r.subiendo + r.pendientes + r.leyendo > enMarcha.length ? `, se ven los primeros ${enMarcha.length}` : ""}):
          </span>
          {enMarcha.map((l) => (
            <div key={l.id} style={{ display: "flex", gap: "10px", alignItems: "center", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px solid var(--border-light)" }}>
              <span style={{ wordBreak: "break-all" }}>
                {l.estado === "leyendo" ? "📖" : l.estado === "subiendo" ? "📤" : "⏳"} {l.nombre}
                <span style={{ color: "var(--text-muted)", marginLeft: "8px" }}>{l.estado === "leyendo" ? "leyéndose" : l.estado === "subiendo" ? "subido, esperando" : "en espera"}</span>
              </span>
              <button type="button" className="btn btn-secondary" style={{ padding: "1px 8px", flexShrink: 0 }} disabled={ocupado} onClick={() => void ejecutar(() => cancelarPedidos([l.id]))} title="Cancela solo este pedido: no se lee y no queda ningún documento a medias">
                ✖ Cancelar
              </button>
            </div>
          ))}
        </div>
      )}
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
