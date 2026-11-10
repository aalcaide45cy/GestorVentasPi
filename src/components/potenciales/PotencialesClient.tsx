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

type CampoLista =
  "cliente" | "contacto" | "presupuesto" | "fecha" | "n" | "estado";
const COLUMNAS_LISTA: Record<CampoLista, { texto: string; ayuda: string }> = {
  cliente: {
    texto: "Cliente",
    ayuda: "Nombre de quien pidió el presupuesto. Clic para ordenar",
  },
  contacto: {
    texto: "Contacto",
    ayuda: "Correo y teléfono que traía el presupuesto. Clic para ordenar",
  },
  presupuesto: {
    texto: "Último presupuesto",
    ayuda: "Marca y modelo de su último presupuesto. Clic para ordenar",
  },
  fecha: {
    texto: "Fecha",
    ayuda: "Fecha de su último presupuesto. Clic para ordenar",
  },
  n: {
    texto: "Nº",
    ayuda: "Cuántos presupuestos tiene cargados. Clic para ordenar",
  },
  estado: {
    texto: "Estado",
    ayuda:
      "Activo (se le puede escribir), posible compra, ya compró o de baja. Clic para ordenar",
  },
};
const textoDe = (p: PotencialDto, c: CampoLista): string =>
  c === "cliente"
    ? p.nombre
    : c === "contacto"
      ? `${p.email} ${p.telefono}`
      : c === "presupuesto"
        ? p.ultimo
          ? [p.ultimo.marca, p.ultimo.modelo].filter(Boolean).join(" ") ||
            p.ultimo.modelo_texto
          : ""
        : c === "fecha"
          ? fecha(p.ultimo?.fecha ?? null)
          : c === "n"
            ? String(p.n_presupuestos)
            : ETIQUETA_ESTADO[p.estado];
const valorDe = (p: PotencialDto, c: CampoLista): string | number =>
  c === "n"
    ? p.n_presupuestos
    : c === "fecha"
      ? (p.ultimo?.fecha ?? "")
      : textoDe(p, c);

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
  // Orden, filtros por columna y columnas visibles de la lista (se aplican a lo que ya está cargado)
  const [orden, setOrden] = useState<{ campo: CampoLista; asc: boolean }>({
    campo: "cliente",
    asc: true,
  });
  const [filtros, setFiltros] = useState<Record<CampoLista, string>>({
    cliente: "",
    contacto: "",
    presupuesto: "",
    fecha: "",
    n: "",
    estado: "",
  });
  const [colsGuardadas, fijarCols] = usePreferencia("exp-potenciales-columnas");
  const ocultas = new Set(
    (colsGuardadas ?? "").split(",").filter((c) => c in COLUMNAS_LISTA),
  );
  const mostrarCol = (c: CampoLista) => c === "cliente" || !ocultas.has(c);
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

  const vista = (lista ?? [])
    .filter((p) =>
      (Object.keys(filtros) as CampoLista[]).every((c) => {
        const f = filtros[c].trim().toLowerCase();
        if (!f) return true;
        if (c === "estado") return p.estado === f;
        return textoDe(p, c).toLowerCase().includes(f);
      }),
    )
    .sort((a, b) => {
      const x = valorDe(a, orden.campo);
      const y = valorDe(b, orden.campo);
      const r =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "es", { sensitivity: "base" });
      return orden.asc ? r : -r;
    });
  const hayFiltros = Object.values(filtros).some((f) => f.trim() !== "");
  const ordenarPor = (c: CampoLista) =>
    setOrden((o) => ({ campo: c, asc: o.campo === c ? !o.asc : true }));
  const flecha = (c: CampoLista) =>
    orden.campo === c ? (orden.asc ? "▲" : "▼") : "↕";

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
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>
          Clientes potenciales
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>
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
              placeholder="🔎 Nombre, correo o teléfono…"
              title="Busca por nombre, correo o teléfono"
              style={{
                flex: 1,
                minWidth: "240px",
                maxWidth: "340px",
                padding: "4px 10px",
              }}
            />
            <details style={{ position: "relative" }}>
              <summary
                className="btn btn-secondary"
                title="Elige qué columnas se ven en la lista"
                style={{
                  padding: "4px 12px",
                  fontSize: "0.82rem",
                  listStyle: "none",
                  cursor: "pointer",
                }}
              >
                ⚙️ Columnas
              </summary>
              <div
                className="glass-panel"
                style={{
                  position: "absolute",
                  zIndex: 20,
                  top: "110%",
                  right: 0,
                  padding: "8px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  minWidth: "190px",
                  background: "var(--bg-card)",
                }}
              >
                {(Object.keys(COLUMNAS_LISTA) as CampoLista[]).map((c) => (
                  <label
                    key={c}
                    style={{ display: "flex", gap: "6px", fontSize: "0.85rem" }}
                  >
                    <input
                      type="checkbox"
                      checked={mostrarCol(c)}
                      disabled={c === "cliente"}
                      onChange={(e) => {
                        const n = new Set(ocultas);
                        if (e.target.checked) n.delete(c);
                        else n.add(c);
                        fijarCols([...n].join(","));
                      }}
                    />
                    {COLUMNAS_LISTA[c].texto}
                  </label>
                ))}
              </div>
            </details>
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
            <div className="table-container">
              <table
                className="table-premium table-compact"
                style={{ width: "100%" }}
              >
                <thead>
                  <tr>
                    <th
                      style={{ width: "28px" }}
                      title="Marca a todos los activos de la lista"
                    >
                      <input
                        type="checkbox"
                        aria-label="Marcar todos los activos de la lista"
                        checked={
                          vista.filter((p) => p.estado === "activo").length >
                            0 &&
                          vista
                            .filter((p) => p.estado === "activo")
                            .every((p) => marcados.has(p.id))
                        }
                        onChange={(e) =>
                          setMarcados(
                            e.target.checked
                              ? new Set(
                                  vista
                                    .filter((p) => p.estado === "activo")
                                    .map((p) => p.id),
                                )
                              : new Set(),
                          )
                        }
                      />
                    </th>
                    {(Object.keys(COLUMNAS_LISTA) as CampoLista[])
                      .filter(mostrarCol)
                      .map((c) => (
                        <th
                          key={c}
                          title={COLUMNAS_LISTA[c].ayuda}
                          onClick={() => ordenarPor(c)}
                          style={{
                            cursor: "pointer",
                            userSelect: "none",
                            whiteSpace: "nowrap",
                            textAlign: c === "n" ? "center" : undefined,
                          }}
                        >
                          {COLUMNAS_LISTA[c].texto} {flecha(c)}
                        </th>
                      ))}
                  </tr>
                  <tr style={{ background: "rgba(255, 255, 255, 0.01)" }}>
                    <td>
                      {hayFiltros && (
                        <button
                          type="button"
                          title="Limpiar los filtros de las columnas"
                          onClick={() =>
                            setFiltros({
                              cliente: "",
                              contacto: "",
                              presupuesto: "",
                              fecha: "",
                              n: "",
                              estado: "",
                            })
                          }
                          style={{
                            border: "none",
                            background: "none",
                            cursor: "pointer",
                            color: "var(--danger)",
                          }}
                        >
                          ✖
                        </button>
                      )}
                    </td>
                    {(Object.keys(COLUMNAS_LISTA) as CampoLista[])
                      .filter(mostrarCol)
                      .map((c) => (
                        <td key={c}>
                          {c === "estado" ? (
                            <select
                              className="form-select"
                              aria-label="Filtrar por estado"
                              value={filtros.estado}
                              onChange={(e) =>
                                setFiltros({
                                  ...filtros,
                                  estado: e.target.value,
                                })
                              }
                              style={{ padding: "4px 8px", fontSize: "0.8rem" }}
                            >
                              <option value="">Todos</option>
                              <option value="activo">Activo</option>
                              <option value="posible">Posible compra</option>
                              <option value="compro">Ya compró</option>
                              <option value="baja">De baja</option>
                            </select>
                          ) : (
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Filtrar..."
                              aria-label={`Filtrar por ${COLUMNAS_LISTA[c].texto}`}
                              value={filtros[c]}
                              onChange={(e) =>
                                setFiltros({ ...filtros, [c]: e.target.value })
                              }
                              style={{
                                padding: "4px 8px",
                                fontSize: "0.8rem",
                                minWidth: c === "n" ? "40px" : "80px",
                              }}
                            />
                          )}
                        </td>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {vista.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          textAlign: "center",
                          color: "var(--text-muted)",
                        }}
                      >
                        No hay nadie con esos filtros.
                      </td>
                    </tr>
                  )}
                  {vista.map((p) => (
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
                      {mostrarCol("contacto") && (
                        <td style={{ fontSize: "0.8rem" }}>
                          {p.email || (
                            <span style={{ color: "var(--warning)" }}>
                              sin correo
                            </span>
                          )}
                          {p.telefono ? ` · ${p.telefono}` : ""}
                        </td>
                      )}
                      {mostrarCol("presupuesto") && (
                        <td>{textoDe(p, "presupuesto") || "—"}</td>
                      )}
                      {mostrarCol("fecha") && (
                        <td style={{ whiteSpace: "nowrap" }}>
                          {fecha(p.ultimo?.fecha ?? null)}
                        </td>
                      )}
                      {mostrarCol("n") && (
                        <td style={{ textAlign: "center" }}>
                          {p.n_presupuestos}
                        </td>
                      )}
                      {mostrarCol("estado") && (
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
                      )}
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
