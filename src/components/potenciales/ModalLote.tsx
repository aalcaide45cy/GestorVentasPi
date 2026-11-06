"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { CuentaDto, PlantillaDto } from "@/lib/correo";
import type { ResultadoLote } from "@/lib/servicios/potenciales-envios";

/** Escribir a un grupo de clientes potenciales: plantilla, cuenta, pausa entre correos y lo que se enviará, antes de dejarlo en la cola. */
export default function ModalLote({
  ids,
  todos,
  alCerrar,
  alHecho,
}: {
  ids: number[];
  todos: boolean;
  alCerrar: () => void;
  alHecho: () => void;
}) {
  const { mostrar } = useToast();
  const [plantillas, setPlantillas] = useState<PlantillaDto[]>([]);
  const [cuentas, setCuentas] = useState<CuentaDto[]>([]);
  const [idPlantilla, setIdPlantilla] = useState<number | null>(null);
  const [idCuenta, setIdCuenta] = useState<number | null>(null);
  const [espera, setEspera] = useState(20);
  const [esperaMax, setEsperaMax] = useState(30);
  const [lote, setLote] = useState(
    `Lote ${new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })}`,
  );
  const [pre, setPre] = useState<ResultadoLote | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    llamar<PlantillaDto[]>("/api/correo/plantillas")
      .then((r) => {
        setPlantillas(r.data);
        setIdPlantilla((x) => x ?? r.data[0]?.id ?? null);
      })
      .catch(() => undefined);
    llamar<CuentaDto[]>("/api/correo/cuentas")
      .then((r) => {
        setCuentas(r.data);
        setIdCuenta((x) => x ?? r.data.find((c) => c.activa)?.id ?? null);
      })
      .catch(() => undefined);
  }, []);

  const cuerpo = useCallback(
    (modo: "previsualizar" | "borradores" | "programar") => ({
      ids,
      todos,
      id_plantilla: idPlantilla,
      id_cuenta: idCuenta,
      espera,
      espera_max: Math.max(espera, esperaMax),
      lote,
      modo,
    }),
    [ids, todos, idPlantilla, idCuenta, espera, esperaMax, lote],
  );
  useEffect(() => {
    if (!idPlantilla || !idCuenta) return;
    let vivo = true;
    llamar<ResultadoLote>("/api/potenciales/lote", {
      method: "POST",
      cuerpo: cuerpo("previsualizar"),
    })
      .then((r) => vivo && setPre(r.data))
      .catch((e: unknown) => vivo && mostrar(textoError(e), "error"));
    return () => {
      vivo = false;
    };
  }, [idPlantilla, idCuenta, ids, todos, cuerpo, mostrar]);

  const lanzar = async (modo: "borradores" | "programar") => {
    setOcupado(true);
    try {
      const r = await llamar<ResultadoLote>("/api/potenciales/lote", {
        method: "POST",
        cuerpo: cuerpo(modo),
      });
      mostrar(
        modo === "programar"
          ? `${r.data.creados} correos programados: saldrán uno cada ${espera}–${Math.max(espera, esperaMax)} segundos.`
          : `${r.data.creados} correos en la cola para que los revises.`,
      );
      alHecho();
    } catch (e) {
      mostrar(textoError(e), "error", 8000);
    } finally {
      setOcupado(false);
    }
  };
  const ex = pre?.excluidos;
  const fuera = ex
    ? ex.compraron + ex.posibles + ex.baja + ex.sinCorreo + ex.yaEnviado
    : 0;
  return (
    <Modal
      titulo="✉️ Escribir a clientes potenciales"
      ancho="min(calc(96 * var(--uvw)), 760px)"
      pie={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={alCerrar}
            disabled={ocupado}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void lanzar("borradores")}
            disabled={ocupado || !pre?.incluidos}
            title="Los deja en la cola de Correo para que los revises y los envíes tú"
          >
            ✋ Dejar en la cola para revisar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void lanzar("programar")}
            disabled={ocupado || !pre?.incluidos}
            title="Salen solos, uno tras otro, con la pausa elegida"
          >
            ⏳ Programar el envío
          </button>
        </>
      }
    >
      {plantillas.length === 0 || cuentas.length === 0 ? (
        <p style={{ color: "var(--warning)" }}>
          Antes necesitas una cuenta de correo y una plantilla:{" "}
          <Link href="/dashboard/correo">ir a Correo</Link>. En la plantilla
          puedes usar campos como {"{nombre_pila}"}, {"{marca_presupuesto}"},{" "}
          {"{modelo_presupuesto}"} y {"{baja}"}.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                flex: 1,
                minWidth: "200px",
              }}
            >
              Plantilla
              <select
                className="form-input"
                value={idPlantilla ?? ""}
                onChange={(e) => setIdPlantilla(Number(e.target.value))}
              >
                {plantillas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                flex: 1,
                minWidth: "200px",
              }}
            >
              Desde la cuenta
              <select
                className="form-input"
                value={idCuenta ?? ""}
                onChange={(e) => setIdCuenta(Number(e.target.value))}
              >
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.email})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                flex: 1,
                minWidth: "160px",
              }}
            >
              Nombre del lote
              <input
                className="form-input"
                value={lote}
                maxLength={60}
                onChange={(e) => setLote(e.target.value)}
              />
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                width: "150px",
              }}
              title="Entre un correo y el siguiente pasa un tiempo al azar entre estos dos valores"
            >
              Pausa entre correos (s)
              <span
                style={{ display: "flex", gap: "4px", alignItems: "center" }}
              >
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  max={3600}
                  value={espera}
                  onChange={(e) =>
                    setEspera(Math.max(1, Number(e.target.value) || 1))
                  }
                  style={{ width: "64px" }}
                />
                –
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  max={3600}
                  value={esperaMax}
                  onChange={(e) =>
                    setEsperaMax(Math.max(1, Number(e.target.value) || 1))
                  }
                  style={{ width: "64px" }}
                />
              </span>
            </label>
          </div>
          {pre && (
            <div
              className="glass-panel"
              style={{
                padding: "10px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div>
                <strong style={{ color: "var(--success)" }}>
                  {pre.incluidos}
                </strong>{" "}
                personas recibirán un correo, uno a uno y sin copia oculta.
              </div>
              {fuera > 0 && ex && (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  Se quedan fuera {fuera}:{" "}
                  {[
                    ex.compraron && `${ex.compraron} ya compraron`,
                    ex.posibles && `${ex.posibles} posible compra`,
                    ex.baja && `${ex.baja} de baja`,
                    ex.sinCorreo && `${ex.sinCorreo} sin correo`,
                    ex.yaEnviado && `${ex.yaEnviado} que ya tienen este correo`,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  .
                </div>
              )}
              {pre.ejemplo && (
                <div
                  style={{
                    borderTop: "1px solid var(--border-light)",
                    paddingTop: "8px",
                  }}
                >
                  <div
                    style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}
                  >
                    Ejemplo, para {pre.ejemplo.para}
                  </div>
                  <div style={{ fontWeight: 700 }}>{pre.ejemplo.asunto}</div>
                  <div
                    className="notas-contenido"
                    style={{
                      fontSize: "0.88rem",
                      maxHeight: "200px",
                      overflowY: "auto",
                    }}
                    dangerouslySetInnerHTML={{ __html: pre.ejemplo.cuerpo }}
                  />
                </div>
              )}
            </div>
          )}
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Justo antes de enviar cada correo se vuelve a comprobar que esa
            persona no haya comprado ni se haya dado de baja; si es así, no se
            envía.
          </span>
        </>
      )}
    </Modal>
  );
}
