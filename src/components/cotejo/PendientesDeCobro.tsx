"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { columnasVehiculo } from "@/components/etiquetas";
import { esAnulado } from "@/lib/anulados";
import { resumenCobros, type Pendiente, type SituacionPendiente } from "@/lib/cotejo-pagos";
import { formatDate } from "@/lib/date-utils";
import { nombreMes } from "@/lib/formato";
import { usePreferencia } from "@/lib/preferencias";
import type { DatosCotejo } from "@/lib/servicios/cotejo";

interface Props {
  vendedores: { id: number; nombre: string }[];
  idUsuarioActual: number;
  esAdministrador: boolean;
}

const SITUACION: Record<SituacionPendiente, { icono: string; texto: string; color: string; ayuda: string }> = {
  reclamar: { icono: "🔴", texto: "Reclamar", color: "#ef4444", ayuda: "La rejilla de su mes ya está guardada y este coche no sale: hay que reclamarlo a la empresa" },
  revisar: { icono: "🟡", texto: "Revisar lectura", color: "#eab308", ayuda: "La hoja trae una matrícula muy parecida: puede ser este coche mal leído" },
  sin_matricula: { icono: "🟠", texto: "Sin matrícula", color: "#f97316", ayuda: "Sin matrícula no se puede buscar en la hoja" },
  sin_fecha: { icono: "🟠", texto: "Sin fecha", color: "#f97316", ayuda: "Sin fecha de facturación ni de matriculación no se sabe en qué rejilla debe venir" },
  esperando_hoja: { icono: "⚪", texto: "Esperando la hoja", color: "#94a3b8", ayuda: "Todavía no has subido la rejilla del mes en que debe venir" },
};

type Filtro = "todos" | SituacionPendiente;

/**
 * Lo más importante del cotejo: qué coches siguen sin cobrar. Un coche está cobrado cuando su matrícula sale en alguna rejilla guardada; el resto
 * son pendientes, con un contador, y se pueden marcar «No se cobra» (los que nunca van a venir) o «Ya cobrado» a mano.
 */
export default function PendientesDeCobro({ vendedores, idUsuarioActual, esAdministrador }: Props) {
  const { mostrar, confirmar } = useToast();
  const [idElegido, setIdVendedor] = useState<number | null>(null);
  const [recordado, recordar] = usePreferencia("cotejo-vendedor-elegido");
  const idRecordado = esAdministrador && recordado && vendedores.some((v) => v.id === Number(recordado)) ? Number(recordado) : null;
  const idVendedor = idElegido ?? idRecordado ?? idUsuarioActual;
  const { datos, recargar } = useCarga<DatosCotejo>(`/api/cotejo?usuario=${idVendedor}`, { coches: [], pagos: [], rejillas: [] });
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [trabajando, setTrabajando] = useState(false);

  const r = useMemo(() => resumenCobros(datos.coches, datos.pagos, esAnulado), [datos]);
  const visibles = filtro === "todos" ? r.pendientes : r.pendientes.filter((p) => p.situacion === filtro);
  const cuenta = (s: SituacionPendiente) => r.pendientes.filter((p) => p.situacion === s).length;
  const total = r.cobrados + r.pendientes.length;

  const ejecutar = async (url: string, cuerpo: unknown, ok: string) => {
    setTrabajando(true);
    try {
      await llamar(url, { method: "POST", cuerpo });
      mostrar(ok);
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };
  const noSeCobra = async (id: number | null, matricula: string, valor: boolean) => {
    if (id === null) return;
    if (valor && !await confirmar({ texto: `¿Marco ${matricula || "este coche"} como «No se cobra»? Dejará de salir como pendiente de cobro (lo podrás recuperar abajo, en «No se cobra»).` })) return;
    await ejecutar("/api/expedientes/no-se-cobra", { idExpediente: id, noSeCobra: valor }, valor ? "Marcado como «No se cobra»." : "Vuelve a contar como pendiente de cobro.");
  };
  const estadoManual = async (p: Pendiente, estado: "pagado" | "reclamado") => {
    if (p.coche.id_expediente === null) return;
    const mes = p.mesEsperado ?? new Date().toISOString().slice(0, 7);
    await ejecutar("/api/expedientes/comisionado", { idExpediente: p.coche.id_expediente, mes, estado }, estado === "pagado" ? "Marcado como cobrado." : "Marcado como reclamado a la empresa.");
  };

  const fecha = (v: string | null | undefined) => formatDate(v ?? null) || "-";
  const columnas: ColumnaTabla<Pendiente>[] = [
    {
      clave: "situacion",
      etiqueta: "Situación",
      valor: (p) => SITUACION[p.situacion].texto,
      celda: (p) => (
        <div style={{ minWidth: "170px", whiteSpace: "normal" }} title={SITUACION[p.situacion].ayuda}>
          <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            {SITUACION[p.situacion].icono} {SITUACION[p.situacion].texto}
            {p.reclamado && <span style={{ marginLeft: "6px", fontSize: "0.72rem", color: "var(--primary)" }}>· ya reclamado</span>}
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.78rem", marginTop: "2px" }}>{p.motivo}</div>
        </div>
      ),
    },
    { clave: "cliente", etiqueta: "Cliente", valor: (p) => p.coche.cliente, celda: (p) => <b>{p.coche.cliente || "—"}</b> },
    { clave: "matricula", etiqueta: "Matrícula", valor: (p) => p.matricula, celda: (p) => (p.matricula ? <b>{p.matricula}</b> : <span style={{ color: "var(--warning)" }}>⚠️ falta</span>) },
    ...columnasVehiculo<Pendiente>((p) => ({ clase: p.coche.usado ? "VO" : "VN", marca: p.coche.marca, modelo: p.coche.modelo, estado: p.coche.estado || undefined, tipoPago: p.coche.tipo_pago || null })),
    { clave: "facturado", etiqueta: "Facturado", valor: (p) => p.coche.f_facturacion ?? p.coche.f_matriculacion ?? "", celda: (p) => fecha(p.coche.f_facturacion ?? p.coche.f_matriculacion), ayuda: "Fecha de facturación (si no la tiene, la de matriculación)" },
    { clave: "mes", etiqueta: "Debe venir en la rejilla de", valor: (p) => p.mesEsperado ?? "", celda: (p) => (p.mesEsperado ? nombreMes(p.mesEsperado) : "—"), ayuda: "Facturado en agosto, rejilla de septiembre" },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      valor: () => "",
      celda: (p) =>
        p.coche.id_expediente === null ? (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        ) : (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary" style={{ padding: "3px 8px", fontSize: "0.75rem" }} disabled={trabajando} onClick={() => void noSeCobra(p.coche.id_expediente, p.matricula, true)} title="Este coche no se cobra nunca: deja de salir como pendiente">
              🚫 No se cobra
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "3px 8px", fontSize: "0.75rem" }} disabled={trabajando} onClick={() => void estadoManual(p, "pagado")} title="Lo has visto cobrado aunque no salga en ninguna rejilla guardada">
              ✔ Ya cobrado
            </button>
            {!p.reclamado && p.situacion === "reclamar" && (
              <button type="button" className="btn btn-secondary" style={{ padding: "3px 8px", fontSize: "0.75rem" }} disabled={trabajando} onClick={() => void estadoManual(p, "reclamado")} title="Apunta que ya se lo has reclamado a la empresa (sigue pendiente hasta que cobre)">
                📣 Ya reclamado
              </button>
            )}
          </div>
        ),
    },
  ];

  const chips: { id: Filtro; texto: string; n: number; color: string }[] = [
    { id: "todos", texto: "Todos los pendientes", n: r.pendientes.length, color: "var(--primary)" },
    ...(["reclamar", "revisar", "sin_matricula", "sin_fecha", "esperando_hoja"] as const).map((s) => ({ id: s as Filtro, texto: SITUACION[s].texto, n: cuenta(s), color: SITUACION[s].color })).filter((c) => c.n > 0),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <section className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "8px 18px", borderLeft: `6px solid ${r.pendientes.length > 0 ? "#ef4444" : "#22c55e"}`, background: r.pendientes.length > 0 ? "rgba(239, 68, 68, 0.12)" : "rgba(34, 197, 94, 0.12)", borderRadius: "var(--radius-sm)" }}>
            <span style={{ fontSize: "2.2rem", fontWeight: 800, lineHeight: 1.1 }}>{r.pendientes.length}</span>
            <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{r.pendientes.length === 1 ? "coche sin cobrar" : "coches sin cobrar"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.9rem" }}>
            <span>
              ✅ <b>{r.cobrados}</b> cobrado{r.cobrados === 1 ? "" : "s"} de {total} que se cobran
            </span>
            {r.noSeCobra.length > 0 && <span style={{ color: "var(--text-secondary)" }}>🚫 {r.noSeCobra.length} marcado{r.noSeCobra.length === 1 ? "" : "s"} «No se cobra»</span>}
            {r.aunSinFacturar.length > 0 && <span style={{ color: "var(--text-secondary)" }}>🕒 {r.aunSinFacturar.length} todavía sin facturar (aún no cuentan)</span>}
          </div>
          {esAdministrador && vendedores.length > 1 && (
            <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.85rem", marginLeft: "auto" }}>
              Vendedor
              <select className="form-input" value={idVendedor} onChange={(e) => { setIdVendedor(Number(e.target.value)); recordar(e.target.value); }}>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          Un coche cuenta como <b>cobrado</b> en cuanto su matrícula sale en alguna rejilla guardada. Cada coche debe venir en la rejilla del mes <b>siguiente</b> al de su facturación (facturado en agosto, rejilla de septiembre). Si una matrícula sale en otro mes distinto, sigue siendo cobrada y solo se avisa en «Mi mes».
        </p>
        {r.pendientes.length === 0 && total > 0 && <div style={{ color: "var(--success)", fontWeight: 600 }}>✅ Todos los coches que se cobran están cobrados.</div>}
      </section>

      {r.pendientes.length > 0 && (
        <section className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {chips.map((c) => (
              <button key={c.id} type="button" aria-pressed={filtro === c.id} className={filtro === c.id ? "btn btn-primary" : "btn btn-secondary"} style={{ borderLeft: `4px solid ${c.color}`, padding: "4px 12px" }} onClick={() => setFiltro(c.id)}>
                {c.texto} <b>{c.n}</b>
              </button>
            ))}
          </div>
          <TablaDatos<Pendiente>
            id="cotejo-pendientes"
            columnas={columnas}
            filas={visibles}
            clave={(p) => `${p.coche.id_expediente ?? p.matricula}-${p.situacion}`}
            placeholder="Buscar por cliente, matrícula, marca, modelo, tipo de pago…"
            vacio="No hay nada en esta categoría."
            estiloFila={(p) => ({ boxShadow: `inset 4px 0 0 ${SITUACION[p.situacion].color}` })}
            textoExtra={(p) => p.motivo}
            pie={(fs) => ({ situacion: `${fs.length} coche${fs.length === 1 ? "" : "s"}` })}
          />
        </section>
      )}

      {r.noSeCobra.length > 0 && (
        <details className="glass-panel" style={{ padding: "12px 16px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>🚫 No se cobra ({r.noSeCobra.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
            {r.noSeCobra.map((c) => (
              <div key={c.id_expediente ?? c.matricula} style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", fontSize: "0.88rem" }}>
                <b style={{ minWidth: "90px" }}>{c.matricula || "(sin matrícula)"}</b>
                <span style={{ flex: "1 1 200px" }}>
                  {[c.cliente, [c.marca, c.modelo].filter(Boolean).join(" "), c.tipo_pago].filter(Boolean).join(" · ")}
                </span>
                <button type="button" className="btn btn-secondary" style={{ padding: "3px 8px", fontSize: "0.75rem" }} disabled={trabajando} onClick={() => void noSeCobra(c.id_expediente, c.matricula, false)}>
                  ↩ Volver a contarlo
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
