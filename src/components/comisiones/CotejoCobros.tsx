"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { codigoExpediente } from "@/lib/date-utils";
import { euros, mesActual } from "@/lib/formato";
import type { Cotejo, ConceptoCotejo } from "@/lib/servicios/comisiones-gestion";
import { llamar, textoError } from "./api";
import { Seccion } from "./campos";
import { useCarga } from "./useCarga";
import type { CatalogosComisiones } from "./tipos";

const COLUMNAS: { c: ConceptoCotejo; t: string }[] = [
  { c: "coche", t: "Coche" },
  { c: "usado", t: "Usado" },
  { c: "financiacion", t: "Financiación" },
  { c: "preference", t: "Preference" },
  { c: "bonus", t: "Bonus" },
  { c: "especiales", t: "Especiales" },
];

/** «🔍 Control y Verificación de Cobros de Comisiones». */
export default function CotejoCobros({ cat, usuarioInicial, esAdmin }: { cat: CatalogosComisiones; usuarioInicial: number; esAdmin: boolean }) {
  const { mostrar } = useToast();
  const [usuario, setUsuario] = useState(usuarioInicial);
  const [mes, setMes] = useState(mesActual());
  const [filtro, setFiltro] = useState<"todos" | "pendientes" | "cobrados">("todos");

  const { datos, recargar: cargar } = useCarga<Cotejo | null>(`/api/comisiones/verificar?usuario=${usuario}&mes=${mes}`, null);

  const marcar = async (idExpediente: number, concepto: ConceptoCotejo, cobrado: boolean) => {
    try {
      await llamar("/api/comisiones/verificar", { method: "POST", cuerpo: { idExpediente, concepto, cobrado } });
      cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const filas = (datos?.filas ?? []).filter((f) => (filtro === "todos" ? true : filtro === "cobrados" ? f.cobradoTotal === f.total : f.cobradoTotal < f.total));

  return (
    <Seccion titulo="🔍 Control y Verificación de Cobros de Comisiones" ayuda="Compara tu nómina con la liquidación: marca cada concepto cuando lo veas cobrado.">
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "end" }}>
        {esAdmin && (
          <div>
            <label className="form-label">Vendedor</label>
            <select className="form-input" value={usuario} onChange={(e) => setUsuario(Number(e.target.value))}>
              {cat.vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="form-label">Mes de la liquidación</label>
          <input className="form-input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {(["todos", "pendientes", "cobrados"] as const).map((f) => (
            <button key={f} type="button" className={`btn ${filtro === f ? "btn-primary" : "btn-secondary"}`} style={{ padding: "6px 12px" }} onClick={() => setFiltro(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      {datos && (
        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <span>Validado: <b>{euros(datos.validado)}</b></span>
          <span>Cobrado: <b>{euros(datos.cobrado)}</b></span>
          <span>Pendiente: <b style={{ color: datos.pendiente > 0 ? "var(--warning)" : undefined }}>{euros(datos.pendiente)}</b></span>
          <span>Ratio de validación: <b>{datos.ratio.toLocaleString("es-ES")} %</b></span>
        </div>
      )}
      <h4>📋 Expedientes a Verificar ({filas.length})</h4>
      <div className="table-container">
        <table className="table-premium">
          <thead>
            <tr>
              <th>Expediente</th>
              {COLUMNAS.map((c) => (
                <th key={c.c} style={{ textAlign: "right" }}>
                  {c.t}
                </th>
              ))}
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.idExpediente}>
                <td>
                  <Link href={`/dashboard/expedientes/editar/${f.idExpediente}`} style={{ color: "var(--primary)" }}>
                    {codigoExpediente(f.idExpediente)}
                  </Link>
                </td>
                {COLUMNAS.map((c) => (
                  <td key={c.c} style={{ textAlign: "right" }}>
                    {f.importes[c.c] !== 0 ? (
                      <label style={{ display: "inline-flex", gap: "6px", alignItems: "center", cursor: "pointer" }}>
                        <input type="checkbox" checked={f.cobrado[c.c]} onChange={(e) => marcar(f.idExpediente, c.c, e.target.checked)} />
                        {euros(f.importes[c.c])}
                      </label>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                ))}
                <td style={{ textAlign: "right", fontWeight: 700 }}>{euros(f.total)}</td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: "var(--text-muted)" }}>
                  No hay liquidación para ese mes o no hay expedientes que coincidan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Seccion>
  );
}
