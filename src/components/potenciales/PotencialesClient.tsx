"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { usePreferencia } from "@/lib/preferencias";
import type {
  EstadoPotencial,
  PotencialDto,
} from "@/lib/servicios/potenciales";
import PanelCola from "@/components/correo/PanelCola";
import CargarPresupuestos from "./CargarPresupuestos";
import ModalLote from "./ModalLote";
import FichaPotencial, {
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
} from "./FichaPotencial";

type Resumen = Record<EstadoPotencial | "total", number>;
const fecha = (f: string | null) =>
  f ? f.split("-").reverse().join("/") : "—";

/** «Clientes potenciales»: quien ha pedido un presupuesto. Se cargan los presupuestos, se cotejan con los expedientes y se les escribe a quien no ha comprado. */
export default function PotencialesClient() {
  const { mostrar } = useToast();
  const [guardada, fijar] = usePreferencia("exp-potenciales-pestana");
  const pestana =
    guardada === "cargar"
      ? "cargar"
      : guardada === "envios"
        ? "envios"
        : "clientes";
  const [lista, setLista] = useState<PotencialDto[] | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [estado, setEstado] = useState<EstadoPotencial | "">("");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<PotencialDto | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [lote, setLote] = useState<{ ids: number[]; todos: boolean } | null>(
    null,
  );

  const cargar = useCallback(() => {
    const p = new URLSearchParams();
    if (estado) p.set("estado", estado);
    if (q.trim()) p.set("q", q.trim());
    llamar<{ lista: PotencialDto[]; resumen: Resumen }>(`/api/potenciales?${p}`)
      .then((r) => {
        setLista(r.data.lista);
        setResumen(r.data.resumen);
      })
      .catch((e: unknown) => mostrar(textoError(e), "error"));
  }, [estado, q, mostrar]);
  useEffect(() => {
    const t = setTimeout(cargar, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [cargar, q]);

  const cotejar = async () => {
    setOcupado(true);
    try {
      const r = await llamar<{
        revisados: number;
        compraron: number;
        posibles: number;
        cambiados: number;
      }>("/api/potenciales/cotejar", { method: "POST", cuerpo: {} });
      mostrar(
        `Cotejados ${r.data.revisados}: ${r.data.compraron} ya compraron, ${r.data.posibles} posibles, ${r.data.cambiados} han cambiado.`,
      );
      cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  const chip = (
    clave: EstadoPotencial | "",
    texto: string,
    n: number | undefined,
  ) => (
    <button
      key={clave}
      type="button"
      className={estado === clave ? "btn btn-primary" : "btn btn-secondary"}
      onClick={() => setEstado(clave)}
      style={{ padding: "3px 12px", fontSize: "0.82rem" }}
    >
      {texto} {n !== undefined ? `(${n})` : ""}
    </button>
  );
  const pest = (id: "clientes" | "cargar" | "envios", texto: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={pestana === id}
      onClick={() => fijar(id)}
      style={{
        padding: "8px 18px",
        border: "none",
        borderBottom: `3px solid ${pestana === id ? "var(--primary)" : "transparent"}`,
        background: "transparent",
        color: pestana === id ? "var(--primary)" : "var(--text-secondary)",
        fontWeight: 700,
        fontSize: "0.95rem",
        cursor: "pointer",
      }}
    >
      {texto}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div>
        <h2 style={{ margin: 0, fontSize: "1.5rem" }}>
          🎯 Clientes potenciales
        </h2>
        <p
          style={{
            margin: "4px 0 0",
            color: "var(--text-secondary)",
            fontSize: "0.9rem",
          }}
        >
          Quien ha pedido un presupuesto. Se cotejan con los expedientes para
          saber quién ya ha comprado, y a los demás se les puede escribir.
        </p>
      </div>
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: "4px",
          borderBottom: "1px solid var(--border-light)",
        }}
      >
        {pest("clientes", "👥 Clientes")}
        {pest("cargar", "📥 Cargar presupuestos")}
        {pest("envios", "✉️ Envíos")}
      </div>
      {pestana === "cargar" && <CargarPresupuestos alTerminar={cargar} />}
      {pestana === "envios" && (
        <>
          <p
            style={{
              margin: 0,
              fontSize: "0.88rem",
              color: "var(--text-secondary)",
            }}
          >
            Los correos a clientes potenciales: los que esperan tu revisión, los
            programados (salen solos, uno tras otro) y los ya enviados. Puedes
            pausarlos o cancelarlos.
          </p>
          <PanelCola modo="ficha" soloPotenciales />
        </>
      )}
      {pestana === "clientes" && (
        <>
          <div
            style={{
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {chip("", "Todos", resumen?.total)}
            {chip("activo", "Activos", resumen?.activo)}
            {chip("posible", "Posibles compras", resumen?.posible)}
            {chip("compro", "Ya compraron", resumen?.compro)}
            {chip("baja", "De baja", resumen?.baja)}
            <input
              className="form-input"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="🔎 Buscar por nombre, correo o teléfono…"
              style={{
                flex: 1,
                minWidth: "200px",
                maxWidth: "340px",
                padding: "4px 10px",
              }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={ocupado}
              onClick={() => void cotejar()}
              title="Vuelve a comprobar, solo leyendo, si tienen expediente"
              style={{ padding: "4px 12px", fontSize: "0.82rem" }}
            >
              🔄 Cotejar con los expedientes
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={marcados.size === 0}
              onClick={() => setLote({ ids: [...marcados], todos: false })}
              style={{ padding: "4px 12px", fontSize: "0.82rem" }}
            >
              ✉️ Escribir a los marcados ({marcados.size})
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!resumen?.activo}
              onClick={() => setLote({ ids: [], todos: true })}
              title="Se deja fuera a quien ya compró, se ha dado de baja o no tiene correo"
              style={{ padding: "4px 12px", fontSize: "0.82rem" }}
            >
              ✉️ Escribir a todos los activos
            </button>
          </div>
          {lista && lista.length === 0 && (
            <p style={{ color: "var(--text-muted)" }}>
              {resumen?.total
                ? "No hay nadie con ese filtro."
                : "Todavía no hay clientes potenciales. Carga presupuestos en la otra pestaña."}
            </p>
          )}
          {lista && lista.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table
                className="table-premium table-compact"
                style={{ width: "100%" }}
              >
                <thead>
                  <tr>
                    <th style={{ width: "28px" }}>
                      <input
                        type="checkbox"
                        aria-label="Marcar todos los activos de la lista"
                        checked={
                          lista.filter((p) => p.estado === "activo").length >
                            0 &&
                          lista
                            .filter((p) => p.estado === "activo")
                            .every((p) => marcados.has(p.id))
                        }
                        onChange={(e) =>
                          setMarcados(
                            e.target.checked
                              ? new Set(
                                  lista
                                    .filter((p) => p.estado === "activo")
                                    .map((p) => p.id),
                                )
                              : new Set(),
                          )
                        }
                      />
                    </th>
                    <th>Cliente</th>
                    <th>Contacto</th>
                    <th>Último presupuesto</th>
                    <th>Fecha</th>
                    <th style={{ textAlign: "center" }}>Nº</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setAbierto(p)}
                      style={{
                        cursor: "pointer",
                        opacity:
                          p.estado === "baja" || p.estado === "compro"
                            ? 0.65
                            : 1,
                      }}
                    >
                      <td onClick={(ev) => ev.stopPropagation()}>
                        {p.estado === "activo" && (
                          <input
                            type="checkbox"
                            aria-label={`Marcar a ${p.nombre}`}
                            checked={marcados.has(p.id)}
                            onChange={() =>
                              setMarcados((m) => {
                                const n = new Set(m);
                                if (n.has(p.id)) n.delete(p.id);
                                else n.add(p.id);
                                return n;
                              })
                            }
                          />
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                      <td style={{ fontSize: "0.8rem" }}>
                        {p.email || (
                          <span style={{ color: "var(--warning)" }}>
                            sin correo
                          </span>
                        )}
                        {p.telefono ? ` · ${p.telefono}` : ""}
                      </td>
                      <td>
                        {p.ultimo
                          ? [p.ultimo.marca, p.ultimo.modelo]
                              .filter(Boolean)
                              .join(" ") || p.ultimo.modelo_texto
                          : "—"}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {fecha(p.ultimo?.fecha ?? null)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {p.n_presupuestos}
                      </td>
                      <td>
                        <span
                          style={{
                            color: COLOR_ESTADO[p.estado],
                            fontWeight: 700,
                            fontSize: "0.8rem",
                          }}
                        >
                          {ETIQUETA_ESTADO[p.estado]}
                        </span>
                        {p.id_expediente &&
                          ` · #EXP-${String(p.id_expediente).padStart(4, "0")}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {lote && (
        <ModalLote
          ids={lote.ids}
          todos={lote.todos}
          alCerrar={() => setLote(null)}
          alHecho={() => {
            setLote(null);
            setMarcados(new Set());
            fijar("envios");
          }}
        />
      )}
      {abierto && (
        <FichaPotencial
          key={abierto.id}
          potencial={abierto}
          alCerrar={() => setAbierto(null)}
          alCambiar={cargar}
        />
      )}
    </div>
  );
}
