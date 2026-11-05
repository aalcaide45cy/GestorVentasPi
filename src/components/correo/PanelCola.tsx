"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { refrescarCorreosEnviados } from "@/lib/correo-enviados";
import type { CorreoDto, EstadoCorreo } from "@/lib/correo";
import ModalCorreo from "./ModalCorreo";

const ESTILO_ESTADO: Record<EstadoCorreo, { texto: string; color: string }> = {
  borrador: { texto: "✋ Por revisar", color: "var(--warning)" },
  programado: { texto: "⏳ Se enviará solo", color: "var(--primary)" },
  enviando: { texto: "📤 Enviando…", color: "var(--primary)" },
  enviado: { texto: "✅ Enviado", color: "var(--success)" },
  error: { texto: "❌ Con error", color: "var(--danger)" },
  cancelado: { texto: "🚫 Cancelado", color: "var(--text-muted)" },
};
const ETIQUETA_CAMPO: Record<string, string> = {
  fecha_expediente: "F. Exp.",
  fecha_afectacion: "F. Afectación",
  fecha_rci: "F. RCI",
  fecha_matriculacion: "F. Matriculación",
  fecha_facturacion: "F. Facturación",
  fecha_entrega: "F. Entrega",
};
const cuando = (iso: string): string =>
  new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** La cola de correos por enviar (modo «cola») o el histórico de lo enviado, cancelado o fallido (modo «historico»). */
export default function PanelCola({
  modo,
  idExpediente,
  idCliente,
}: {
  modo: "cola" | "historico" | "ficha";
  idExpediente?: number;
  idCliente?: number;
}) {
  const { mostrar, confirmar } = useToast();
  const [lista, setLista] = useState<CorreoDto[] | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [editando, setEditando] = useState<CorreoDto | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [busca, setBusca] = useState("");
  const estados =
    modo === "cola"
      ? "borrador,programado,enviando,error"
      : "enviado,cancelado,error";

  const cargar = useCallback(() => {
    const q = new URLSearchParams({ estados });
    if (idExpediente) q.set("id_expediente", String(idExpediente));
    if (idCliente) q.set("id_cliente", String(idCliente));
    llamar<CorreoDto[]>(`/api/correo/cola?${q}`)
      .then((r) => setLista(r.data))
      .catch((e: unknown) => mostrar(textoError(e), "error"));
  }, [estados, idExpediente, idCliente, mostrar]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // La cola se refresca sola mientras hay correos por enviar
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [cargar]);

  const accion = async (
    ids: number[],
    a: "enviar" | "programar" | "pausar" | "cancelar" | "borrar" | "cliente",
  ) => {
    if (ids.length === 0) return;
    if (
      a === "enviar" &&
      ids.length > 1 &&
      !(await confirmar({
        titulo: "Enviar ahora",
        texto: `¿Enviar ${ids.length} correos ahora mismo, todos seguidos? Para que salgan de uno en uno con pausa, usa «Programar».`,
        aceptar: "Enviar",
      }))
    )
      return;
    if (
      a === "borrar" &&
      !(await confirmar({
        titulo: "Quitar del histórico",
        texto: `¿Quitar ${ids.length} correo(s)? No se puede deshacer. Si salieron del botón ✉️ de una fecha, el sobre de ese expediente vuelve a su color y se podrá enviar otra vez.`,
        aceptar: "Quitar",
        peligro: true,
      }))
    )
      return;
    setOcupado(true);
    try {
      const r = await llamar<{ hechos: number; fallos?: string[] }>(
        "/api/correo/cola",
        { method: "PATCH", cuerpo: { ids, accion: a } },
      );
      if (r.data.fallos?.length) mostrar(r.data.fallos[0], "error", 8000);
      else
        mostrar(
          a === "enviar"
            ? "Enviado"
            : a === "programar"
              ? `${r.data.hechos} correo(s) programados: saldrán uno tras otro`
              : "Hecho",
        );
      setMarcados(new Set());
      if (a === "borrar") refrescarCorreosEnviados();
    } catch (e) {
      mostrar(textoError(e), "error", 8000);
    } finally {
      setOcupado(false);
      cargar();
    }
  };

  const visibles = (lista ?? []).filter(
    (c) =>
      !busca.trim() ||
      `${c.asunto} ${c.para} ${c.cliente ?? ""} ${c.cuenta ?? ""}`
        .toLowerCase()
        .includes(busca.trim().toLowerCase()),
  );
  const alternar = (id: number) =>
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const ids = [...marcados];
  const btn = { padding: "3px 10px", fontSize: "0.8rem" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {modo === "cola" && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setNuevo(true)}
            style={btn}
          >
            ＋ Nuevo correo
          </button>
        )}
        <input
          className="form-input"
          type="search"
          placeholder="🔎 Buscar…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ maxWidth: "260px", padding: "4px 10px" }}
        />
        {modo === "cola" && ids.length > 0 && (
          <>
            <span style={{ fontSize: "0.85rem" }}>{ids.length} marcados:</span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={ocupado}
              onClick={() => void accion(ids, "enviar")}
              style={btn}
              title="Los envía ahora mismo"
            >
              📤 Enviar ahora
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={ocupado}
              onClick={() => void accion(ids, "programar")}
              style={btn}
              title="Los envía el servidor uno tras otro con la pausa de los ajustes"
            >
              ⏳ Programar
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={ocupado}
              onClick={() => void accion(ids, "pausar")}
              style={btn}
            >
              ✋ Volver a revisar
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={ocupado}
              onClick={() => void accion(ids, "cancelar")}
              style={btn}
            >
              🚫 Cancelar
            </button>
          </>
        )}
        {modo === "historico" && ids.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={ocupado}
            onClick={() => void accion(ids, "borrar")}
            style={btn}
          >
            🗑️ Quitar los marcados
          </button>
        )}
      </div>
      {lista && visibles.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          {modo === "cola"
            ? "No hay correos esperando."
            : "Todavía no hay histórico."}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {visibles.map((c) => {
          const e = ESTILO_ESTADO[c.estado];
          return (
            <div
              key={c.id}
              className="glass-panel"
              style={{
                padding: "8px 12px",
                display: "flex",
                gap: "10px",
                alignItems: "center",
                flexWrap: "wrap",
                borderLeft: `4px solid ${e.color}`,
              }}
            >
              <input
                type="checkbox"
                aria-label="Marcar"
                checked={marcados.has(c.id)}
                onChange={() => alternar(c.id)}
              />
              <div
                style={{ flex: 1, minWidth: "240px", cursor: "pointer" }}
                onClick={() => setEditando(c)}
              >
                <div style={{ fontWeight: 600 }}>
                  {c.asunto || "(sin asunto)"}
                </div>
                <div
                  style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}
                >
                  Para:{" "}
                  {c.para || (
                    <em style={{ color: "var(--warning)" }}>
                      sin destinatario
                    </em>
                  )}
                  {c.cc ? ` · CC: ${c.cc}` : ""}
                  {c.cco ? ` · CCO: ${c.cco}` : ""}
                  {c.adjuntos.length > 0 ? ` · 📎 ${c.adjuntos.length}` : ""}
                  {c.cliente ? ` · ${c.cliente}` : ""}
                  {c.id_expediente
                    ? ` · #EXP-${String(c.id_expediente).padStart(4, "0")}`
                    : ""}
                  {c.cuenta ? ` · desde ${c.cuenta}` : ""}
                  {c.regla
                    ? ` · regla «${c.regla}»`
                    : c.origen === "boton"
                      ? ` · botón del sobre${c.campo ? ` de ${ETIQUETA_CAMPO[c.campo] ?? c.campo}` : ""}`
                      : ""}
                </div>
                {c.error && (
                  <div style={{ fontSize: "0.8rem", color: "var(--danger)" }}>
                    ⚠️ {c.error}
                    {c.error.includes("no enviar correos") &&
                      modo !== "historico" && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={ocupado}
                          style={{
                            marginLeft: "8px",
                            padding: "1px 8px",
                            fontSize: "0.75rem",
                          }}
                          title="Pone la dirección del cliente aunque esté marcado como «no enviar correos»"
                          onClick={async () => {
                            if (
                              !(await confirmar({
                                titulo: "Enviar al cliente igualmente",
                                texto:
                                  "El cliente está marcado como «no enviar correos». ¿Pongo su dirección en este correo? Después lo revisas y lo envías.",
                                aceptar: "Poner su dirección",
                              }))
                            )
                              return;
                            await accion([c.id], "cliente");
                          }}
                        >
                          ✉️ Enviar al cliente igualmente
                        </button>
                      )}
                  </div>
                )}
              </div>
              <span
                style={{
                  fontSize: "0.8rem",
                  color: e.color,
                  whiteSpace: "nowrap",
                }}
              >
                {e.texto}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {cuando(c.enviado_en ?? c.creado_en)}
              </span>
              {(modo === "cola" || modo === "ficha") &&
                ["borrador", "programado", "error"].includes(c.estado) && (
                  <span style={{ display: "flex", gap: "4px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={btn}
                      onClick={() => setEditando(c)}
                    >
                      ✏️ Revisar
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={btn}
                      disabled={ocupado || c.estado === "enviando"}
                      onClick={() => void accion([c.id], "enviar")}
                    >
                      {c.estado === "error" ? "↻ Reintentar" : "📤 Enviar"}
                    </button>
                  </span>
                )}
              {modo === "ficha" &&
                ["enviado", "cancelado", "error"].includes(c.estado) && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={btn}
                    disabled={ocupado}
                    title="Quita este informe del expediente. Si fue el envío del sobre de una fecha, el sobre vuelve a su color y podrás repetirlo."
                    onClick={() => void accion([c.id], "borrar")}
                  >
                    🗑️ Quitar informe
                  </button>
                )}
              {modo === "historico" && c.estado === "error" && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={btn}
                  disabled={ocupado}
                  onClick={() => void accion([c.id], "enviar")}
                >
                  ↻ Reintentar
                </button>
              )}
            </div>
          );
        })}
      </div>
      {(nuevo || editando) && (
        <ModalCorreo
          correo={editando}
          alCerrar={() => {
            setNuevo(false);
            setEditando(null);
          }}
          alGuardar={() => {
            setNuevo(false);
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
