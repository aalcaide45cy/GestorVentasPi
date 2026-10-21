"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { useCarga } from "@/components/comisiones/useCarga";
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
 * (ordenable, con buscador y columnas a elegir) para abrirlos y decidir cuál sobra. Solo lee: no borra ni cambia nada.
 */
export default function ModalDuplicados({ alCerrar }: { alCerrar: () => void }) {
  const { datos, recargar } = useCarga<ResultadoDuplicados | null>("/api/expedientes/duplicados", null);
  const [motivo, setMotivo] = useState<"todos" | MotivoDuplicado>("todos");

  const filas = useMemo<Fila[]>(
    () => (datos?.grupos ?? []).flatMap((g) => g.filas.map((f) => ({ ...f, grupo: g.grupo, motivo: g.motivo, clave: g.clave, motivoTexto: MOTIVOS[g.motivo] }))),
    [datos],
  );
  const visibles = useMemo(() => (motivo === "todos" ? filas : filas.filter((f) => f.motivo === motivo)), [filas, motivo]);
  const cuenta = (m: MotivoDuplicado) => (datos?.grupos ?? []).filter((g) => g.motivo === m).length;

  const columnas = useMemo<ColumnaTabla<Fila>[]>(
    () => [
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
    [],
  );

  const n = visibles.length;
  return (
    <Modal
      titulo={`🔎 Duplicados de expedientes${datos ? ` · ${datos.grupos.length} ${datos.grupos.length === 1 ? "grupo" : "grupos"} · ${datos.expedientes} ${datos.expedientes === 1 ? "expediente" : "expedientes"}` : ""}`}
      ancho="1400px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={recargar} title="Vuelve a buscar con los datos de ahora">
            🔄 Volver a buscar
          </button>
          <button type="button" className="btn btn-primary" onClick={alCerrar}>
            Cerrar
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
        <div style={{ color: "var(--text-secondary)" }}>
          Busca entre {datos ? datos.revisados : "todos los"} expedientes los que comparten bastidor, matrícula, o cliente y modelo. Cada grupo reúne los que se parecen: ábrelos (#EXP, en otra pestaña) y decide cuál sobra. Aquí no se borra nada. Las copias hechas a propósito con «Duplicar» no se cuentan.
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
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
        {datos === null ? (
          <div style={{ color: "var(--text-muted)" }}>Buscando…</div>
        ) : datos.grupos.length === 0 ? (
          <div style={{ color: "var(--success)", fontWeight: 600 }}>✅ No hay expedientes duplicados entre los {datos.revisados} revisados.</div>
        ) : (
          <TablaDatos<Fila> id="duplicados-expedientes" columnas={columnas} filas={visibles} clave={(f) => `${f.grupo}-${f.id}`} placeholder={`Buscar entre ${n} filas por cliente, matrícula, bastidor…`} ordenInicial={{ clave: "grupo", asc: true }} alto="min(55vh, 600px)" bloque={200} compacta />
        )}
      </div>
    </Modal>
  );
}
