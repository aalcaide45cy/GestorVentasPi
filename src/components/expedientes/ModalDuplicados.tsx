"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import CasillaAnulados, { CasillaDeshabilitados, useMostrarAnulados, useMostrarDeshabilitados } from "@/components/CasillaAnulados";
import { useToast } from "@/components/Toast";
import { useCarga } from "@/components/comisiones/useCarga";
import { mensajeDeError } from "@/components/expedientes/comun";
import { avisarCambioDeDatos } from "@/lib/datos-version";
import { formatDate } from "@/lib/date-utils";
import type { FilaDuplicado, MotivoDuplicado, ResultadoDuplicados } from "@/lib/servicios/duplicados";

interface Fila extends FilaDuplicado {
  grupo: number;
  motivo: MotivoDuplicado;
  clave: string;
  /** Texto para ordenar y buscar. */
  motivoTexto: string;
}

const MOTIVOS: Record<MotivoDuplicado, string> = {
  bastidor: "Mismo bastidor",
  matricula: "Misma matrícula",
  pedido: "Mismo cliente, modelo y fecha de pedido",
  cliente_modelo: "Mismo cliente y modelo (otra fecha)",
};
const GRAVEDAD: Record<MotivoDuplicado, { color: string; texto: string }> = {
  bastidor: { color: "var(--danger)", texto: "Seguro que es un descuido: un bastidor es único" },
  matricula: { color: "var(--danger)", texto: "Seguro que es un descuido: una matrícula es única" },
  pedido: { color: "var(--warning)", texto: "Probable duplicado: el mismo pedido dos veces" },
  cliente_modelo: { color: "var(--text-muted)", texto: "A revisar: puede ser una segunda compra del mismo modelo" },
};

/**
 * «Detectar duplicados»: busca en todos los expedientes los que comparten bastidor, matrícula, o cliente y modelo, y los enseña agrupados en una tabla
 * (ordenable, con buscador y columnas a elegir) para abrirlos y decidir cuál sobra. Buscar no cambia nada; lo que se marca y se manda a la
 * papelera se puede recuperar desde Herramientas › Papelera.
 */
export default function ModalDuplicados({ alCerrar }: { alCerrar: () => void }) {
  const { mostrar, confirmar } = useToast();
  // Los anulados en el listado de la intranet no se miran salvo que se active la casilla (un pedido anulado y rehecho no es un descuido)
  const [mostrarAnulados, fijarMostrarAnulados] = useMostrarAnulados("duplicados");
  const [mostrarDeshabilitados, fijarMostrarDeshabilitados] = useMostrarDeshabilitados("duplicados");
  const parametros = [mostrarAnulados ? "anulados=1" : "", mostrarDeshabilitados ? "deshabilitados=1" : ""].filter(Boolean).join("&");
  const { datos, recargar } = useCarga<ResultadoDuplicados | null>(`/api/expedientes/duplicados${parametros ? `?${parametros}` : ""}`, null);
  const [motivo, setMotivo] = useState<"todos" | MotivoDuplicado>("todos");
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const alternar = (id: number) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  /** Marca, en los grupos seguros (bastidor, matrícula, mismo pedido), todos menos el expediente más antiguo de cada uno. */
  const marcarSobrantes = () => {
    const ids = new Set<number>();
    for (const g of datos?.grupos ?? []) if (g.motivo !== "cliente_modelo") g.filas.slice(1).forEach((f) => ids.add(f.id));
    setMarcados(ids);
  };

  const aLaPapelera = async () => {
    const ids = [...marcados];
    if (ids.length === 0) return;
    if (!(await confirmar({ texto: `Se van a mandar ${ids.length} expediente${ids.length === 1 ? "" : "s"} a la papelera.

No se pierden: se pueden recuperar desde Herramientas › Papelera. Mientras estén allí no cuentan en las comisiones. ¿Continuar?`, peligro: true }))) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/expedientes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
      if (!res.ok) throw new Error(await mensajeDeError(res, "No se han podido mandar a la papelera."));
      mostrar(`${ids.length} expediente${ids.length === 1 ? "" : "s"} en la papelera (recuperables desde Herramientas › Papelera).`, "exito");
      setMarcados(new Set());
      avisarCambioDeDatos();
      recargar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se han podido mandar a la papelera.", "error");
    } finally {
      setEnviando(false);
    }
  };

  const filas = useMemo<Fila[]>(
    () => (datos?.grupos ?? []).flatMap((g) => g.filas.map((f) => ({ ...f, grupo: g.grupo, motivo: g.motivo, clave: g.clave, motivoTexto: MOTIVOS[g.motivo] }))),
    [datos],
  );
  const visibles = useMemo(() => (motivo === "todos" ? filas : filas.filter((f) => f.motivo === motivo)), [filas, motivo]);
  const cuenta = (m: MotivoDuplicado) => (datos?.grupos ?? []).filter((g) => g.motivo === m).length;

  const columnas = useMemo<ColumnaTabla<Fila>[]>(
    () => [
      { clave: "marca", etiqueta: "Papelera", valor: (f) => (marcados.has(f.id) ? 1 : 0), celda: (f) => <input type="checkbox" checked={marcados.has(f.id)} onChange={() => alternar(f.id)} aria-label={`Marcar el expediente ${f.id} para la papelera`} />, ancho: 70, ayuda: "Marca los expedientes que sobran para mandarlos a la papelera" },
      { clave: "grupo", etiqueta: "Grupo", valor: (f) => f.grupo, celda: (f) => <b style={{ color: GRAVEDAD[f.motivo].color }}>#{f.grupo}</b>, ancho: 60, ayuda: "Los expedientes con el mismo número de grupo se parecen entre sí" },
      { clave: "motivo", etiqueta: "Motivo", valor: (f) => f.motivoTexto, celda: (f) => <span title={GRAVEDAD[f.motivo].texto} style={{ color: GRAVEDAD[f.motivo].color, fontWeight: 600 }}>{f.motivoTexto}</span> },
      { clave: "comun", etiqueta: "Lo que comparten", valor: (f) => f.clave },
      { clave: "id", etiqueta: "Expediente", valor: (f) => f.id, celda: (f) => <Link href={`/dashboard/expedientes/editar/${f.id}`} target="_blank" style={{ fontWeight: 700 }}>#EXP-{String(f.id).padStart(4, "0")}</Link> },
      { clave: "cliente", etiqueta: "Cliente", valor: (f) => f.cliente ?? "" },
      { clave: "dni", etiqueta: "DNI", valor: (f) => f.dni ?? "", oculta: true },
      { clave: "vehiculo", etiqueta: "Vehículo", valor: (f) => [f.marca, f.modelo].filter(Boolean).join(" ") },
      { clave: "matricula", etiqueta: "Matrícula", valor: (f) => f.matricula ?? "" },
      { clave: "vin", etiqueta: "Bastidor", valor: (f) => f.vin ?? "" },
      { clave: "fecha", etiqueta: "Fecha pedido", valor: (f) => f.fechaPedido ?? "", celda: (f) => (f.fechaPedido ? formatDate(f.fechaPedido) : "—") },
      { clave: "pago", etiqueta: "Pago", valor: (f) => f.pago ?? "" },
      { clave: "estado", etiqueta: "Estado", valor: (f) => f.estado ?? "" },
      { clave: "vendedor", etiqueta: "Vendedor", valor: (f) => f.vendedor ?? "" },
      { clave: "copia", etiqueta: "Copia", valor: (f) => (f.copiaDe ? `Copia de #${f.copiaDe}` : ""), oculta: true },
    ],
    [marcados],
  );

  const n = visibles.length;
  return (
    <Modal
      titulo={`🔎 Duplicados de expedientes${datos ? ` · ${datos.grupos.length} ${datos.grupos.length === 1 ? "grupo" : "grupos"} · ${datos.expedientes} ${datos.expedientes === 1 ? "expediente" : "expedientes"}` : ""}`}
      ancho="1400px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={recargar} disabled={enviando} title="Vuelve a buscar con los datos de ahora">
            🔄 Volver a buscar
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void aLaPapelera()} disabled={enviando || marcados.size === 0} title="Los marcados se pueden recuperar desde Herramientas › Papelera">
            {enviando ? "Enviando…" : `🗑️ Mandar a la papelera (${marcados.size})`}
          </button>
          <button type="button" className="btn btn-primary" onClick={alCerrar}>
            Cerrar
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
        <div style={{ color: "var(--text-secondary)" }}>
          Busca entre {datos ? datos.revisados : "todos los"} expedientes los que comparten bastidor, matrícula, o cliente y modelo. Cada grupo reúne los que se parecen: ábrelos (#EXP, en otra pestaña) y decide cuál sobra. Marca los que sobran y mándalos a la papelera (se pueden recuperar desde Herramientas › Papelera). Las copias hechas a propósito con «Duplicar» no se cuentan.
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <CasillaAnulados activa={mostrarAnulados} alCambiar={fijarMostrarAnulados} anulados={0} siempre />
          <CasillaDeshabilitados activa={mostrarDeshabilitados} alCambiar={fijarMostrarDeshabilitados} deshabilitados={0} siempre />
          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)" }}>VER</span>
          <button type="button" className={motivo === "todos" ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setMotivo("todos")}>
            Todos ({datos?.grupos.length ?? 0})
          </button>
          {(Object.keys(MOTIVOS) as MotivoDuplicado[]).map((m) => (
            <button key={m} type="button" className={motivo === m ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setMotivo(m)}>
              {MOTIVOS[m]} ({cuenta(m)})
            </button>
          ))}
        </div>
        {datos !== null && datos.grupos.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={marcarSobrantes} title="En los grupos de bastidor, matrícula y mismo pedido deja sin marcar el expediente más antiguo y marca los demás">
              ✅ Marcar los sobrantes seguros
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setMarcados(new Set())} disabled={marcados.size === 0}>
              Quitar marcas
            </button>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{marcados.size} marcado{marcados.size === 1 ? "" : "s"}. Revisa la lista antes de mandarlos a la papelera.</span>
          </div>
        )}
        {datos === null ? (
          <div style={{ color: "var(--text-muted)" }}>Buscando…</div>
        ) : datos.grupos.length === 0 ? (
          <div style={{ color: "var(--success)", fontWeight: 600 }}>✅ No hay expedientes duplicados entre los {datos.revisados} revisados.</div>
        ) : (
          <TablaDatos<Fila> id="duplicados-expedientes" columnas={columnas} filas={visibles} clave={(f) => `${f.grupo}-${f.id}`} placeholder={`Buscar entre ${n} filas por cliente, matrícula, bastidor…`} ordenInicial={{ clave: "grupo", asc: true }} alto="min(calc(55 * var(--uvh)), 600px)" bloque={200} compacta />
        )}
      </div>
    </Modal>
  );
}
