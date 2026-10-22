"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { avisarCambioDeDatosTrasPausa } from "@/lib/datos-version";
import { alTerminarTarea, cancelarTareaServidor, descartarTareaServidor, leerTareas, refrescarTareas, suscribirTareas } from "@/lib/tareas-cliente";
import type { TareaDto } from "@/lib/servicios/tareas";

const SIN_TAREAS: TareaDto[] = [];
const activa = (t: TareaDto) => t.estado === "en_cola" || t.estado === "en_marcha";
const porcentaje = (t: TareaDto) => (t.total > 0 ? Math.min(100, Math.round((t.hecho / t.total) * 100)) : null);
const ETIQUETA: Record<TareaDto["estado"], string> = { en_cola: "En cola", en_marcha: "En marcha", terminada: "Terminada", error: "Con error", cancelada: "Cancelada" };
const COLOR: Record<TareaDto["estado"], string> = { en_cola: "var(--text-muted)", en_marcha: "var(--primary)", terminada: "var(--success)", error: "var(--danger)", cancelada: "var(--warning)" };

/** Barra de progreso fina: con porcentaje si se sabe el total y animada («trabajando») si no. */
function Barra({ t, alto = 4 }: { t: TareaDto; alto?: number }) {
  const p = porcentaje(t);
  return (
    <div role="progressbar" aria-valuenow={p ?? undefined} aria-valuemin={0} aria-valuemax={100} style={{ height: alto, borderRadius: alto, background: "var(--border-light)", overflow: "hidden" }}>
      <div className={p === null && t.estado === "en_marcha" ? "barra-indeterminada" : undefined} style={{ height: "100%", width: p === null ? (t.estado === "en_marcha" ? "40%" : t.estado === "terminada" ? "100%" : "0%") : `${p}%`, background: COLOR[t.estado], transition: "width 0.4s ease" }} />
    </div>
  );
}

/** Color del aviso al terminar: una creación de expedientes en la que no se ha creado nada (o ha dejado alguno sin crear) no es un éxito limpio. */
function tipoDeAviso(t: TareaDto): "exito" | "error" | "aviso" {
  if (t.estado === "error") return "error";
  if (t.estado !== "terminada") return "aviso";
  const r = t.resultado as { creados?: unknown[]; omitidos?: unknown[] } | undefined;
  if (t.tipo === "crear-expedientes" && Array.isArray(r?.creados) && Array.isArray(r?.omitidos)) return r.creados.length === 0 ? "error" : r.omitidos.length > 0 ? "aviso" : "exito";
  return "exito";
}

/** Resumen legible del resultado de una tarea (lo que devolvería la llamada normal). */
function resumenResultado(r: unknown): string[] {
  if (!r || typeof r !== "object") return [];
  const o = r as Record<string, unknown>;
  const lineas: string[] = [];
  if (Array.isArray(o.detalle) && o.detalle.length > 0) lineas.push(...o.detalle.map(String));
  else if (typeof o.purgados === "number") lineas.push(`${o.purgados.toLocaleString("es-ES")} elemento(s) purgados`);
  if (typeof o.bloqueados === "number" && o.bloqueados > 0) lineas.push(`${o.bloqueados.toLocaleString("es-ES")} se han dejado porque algo los usa aún`);
  if (typeof o.copiaPrevia === "string") lineas.push(`Copia previa: ${o.copiaPrevia}`);
  if (typeof o.message === "string") lineas.push(o.message);
  if (o.compactado && typeof o.compactado === "object") {
    const c = o.compactado as { antes?: number; despues?: number };
    if (typeof c.antes === "number" && typeof c.despues === "number") lineas.push(`La base pasó de ${(c.antes / 1048576).toFixed(0)} MB a ${(c.despues / 1048576).toFixed(0)} MB`);
  }
  if (typeof o.antes === "number" && typeof o.despues === "number") lineas.push(`La base pasó de ${(o.antes / 1048576).toFixed(0)} MB a ${(o.despues / 1048576).toFixed(0)} MB`);
  return lineas;
}

/**
 * Indicador discreto de la barra superior con las tareas en segundo plano del servidor (purgas, compactar, limpiezas…): una píldora con el
 * avance que no molesta, y al pulsarla una ventana con todas las tareas, su detalle, cancelar y quitar las terminadas. Solo se ve si hay algo.
 */
export default function IndicadorTareas() {
  const tareas = useSyncExternalStore(suscribirTareas, leerTareas, () => SIN_TAREAS);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(refrescarTareas);
  }, []);

  // Al terminar una tarea (aunque la persona esté en otra pantalla) sale una ventana con lo que ha pasado
  const { notificar } = useToast();
  useEffect(
    () =>
      alTerminarTarea((t) => {
        // Lo que haya hecho la tarea (borrar, crear, importar…) se refleja en pantalla sin recargar
        avisarCambioDeDatosTrasPausa(200);
        // La rejilla leída aparece en su pantalla: no hace falta avisar de que terminó bien
        if (t.tipo === "rejilla" && t.estado === "terminada") {
          void descartarTareaServidor(t.id);
          return;
        }
        // El aviso queda en el registro de notificaciones, así que la tarea ya no hace falta en la lista
        void notificar({
          titulo: t.titulo,
          texto: t.estado === "terminada" ? (tipoDeAviso(t) === "exito" ? "La tarea ha terminado correctamente." : "La tarea ha terminado, pero hay cosas que revisar.") : t.estado === "error" ? `La tarea ha fallado: ${t.error ?? "error desconocido"}` : t.texto || "La tarea se ha cancelado.",
          detalles: resumenResultado(t.resultado),
          tipo: tipoDeAviso(t),
        });
        void descartarTareaServidor(t.id);
      }),
    [notificar],
  );

  if (tareas.length === 0) return null;
  const activas = tareas.filter(activa);
  const principal = activas.find((t) => t.estado === "en_marcha") ?? activas[0] ?? tareas[0];
  const p = porcentaje(principal);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={activas.length > 0 ? `Tareas en segundo plano: ${principal.titulo}. ${principal.texto}. Pulsa para ver el detalle.` : "Tareas terminadas: pulsa para ver el resultado."}
        style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "150px", maxWidth: "230px", padding: "5px 10px", border: `1px solid ${activas.length > 0 ? "var(--primary)" : "var(--border-light)"}`, borderRadius: "var(--radius-sm)", background: "var(--bg-card)", color: "var(--text-primary)", cursor: "pointer", fontSize: "0.74rem", textAlign: "left" }}
      >
        <span style={{ display: "flex", justifyContent: "space-between", gap: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {activas.length > 0 ? "⏳" : principal.estado === "error" ? "⚠️" : "✅"} {activas.length > 1 ? `${activas.length} tareas` : principal.titulo}
          </span>
          {activas.length > 0 && <b>{p === null ? "…" : `${p} %`}</b>}
        </span>
        <Barra t={principal} />
      </button>
      <style>{`@keyframes barra-ida-vuelta { 0% { margin-left: -40%; } 100% { margin-left: 100%; } } .barra-indeterminada { animation: barra-ida-vuelta 1.4s ease-in-out infinite; }`}</style>
      {abierto && (
        <Modal
          titulo="⏳ Tareas en segundo plano"
          ancho="640px"
          pie={
            <button type="button" className="btn btn-primary" onClick={() => setAbierto(false)}>
              Cerrar
            </button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "calc(60 * var(--uvh))", overflowY: "auto" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Puedes seguir usando la aplicación mientras se hacen: aquí ves cómo van. Se ejecutan de una en una, por orden.</div>
            {tareas.map((t) => (
              <div key={t.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                  <b>{t.titulo}</b>
                  <span style={{ color: COLOR[t.estado], fontSize: "0.8rem", fontWeight: 700 }}>{ETIQUETA[t.estado]}</span>
                </div>
                <Barra t={t} alto={6} />
                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{t.error ?? t.texto}</div>
                {!activa(t) && resumenResultado(t.resultado).length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.82rem" }}>
                    {resumenResultado(t.resultado).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  {activa(t) && t.cancelable && (
                    <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px" }} onClick={() => void cancelarTareaServidor(t.id)} title="Para la tarea en cuanto termine su paso actual (lo ya hecho se queda hecho)">
                      Cancelar
                    </button>
                  )}
                  {!activa(t) && (
                    <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px" }} onClick={() => void descartarTareaServidor(t.id)} title="Quita esta tarea de la lista">
                      Quitar de la lista
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
