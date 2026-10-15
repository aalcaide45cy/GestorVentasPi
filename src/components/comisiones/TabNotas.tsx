"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { euros, nombreMes } from "@/lib/formato";
import { llamar, textoError } from "./api";
import { BotonMini, InputCentesimas, Seccion } from "./campos";
import { useCarga } from "./useCarga";
import type { PropsPestana } from "./tipos";

interface Pendiente {
  id: number;
  concepto: string;
  importe: number;
  fecha: string | null;
  mesNominaPrevisto: string | null;
  cobrado: boolean;
  fechaCobro: string | null;
  notas: string | null;
  atrasado: boolean;
}

/** Notas y Comisiones Pendientes + «pendiente de cobro» (lo que me deben). */
export default function TabNotas({ plan, setPlan, cat }: PropsPestana) {
  const { mostrar } = useToast();
  const [usuario, setUsuario] = useState<number | "">("");
  const [filtro, setFiltro] = useState<"todos" | "pendientes" | "cobrados">("todos");
  const [nuevo, setNuevo] = useState({ concepto: "", importe: 0, mesNominaPrevisto: "" });

  const q = usuario === "" ? "" : `?usuario=${usuario}`;
  const { datos: lista, recargar: cargar } = useCarga<Pendiente[]>(`/api/comisiones/pendientes${q}`, []);

  const crear = async () => {
    if (!nuevo.concepto.trim()) return mostrar("Falta el concepto", "error");
    try {
      await llamar(`/api/comisiones/pendientes${q}`, { method: "POST", cuerpo: { concepto: nuevo.concepto, importe: nuevo.importe, mesNominaPrevisto: nuevo.mesNominaPrevisto || null, fecha: null } });
      setNuevo({ concepto: "", importe: 0, mesNominaPrevisto: "" });
      cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const marcar = async (p: Pendiente, cobrado: boolean) => {
    try {
      await llamar(`/api/comisiones/pendientes?id=${p.id}${q ? `&${q.slice(1)}` : ""}`, {
        method: "PUT",
        cuerpo: { concepto: p.concepto, importe: p.importe, fecha: p.fecha, mesNominaPrevisto: p.mesNominaPrevisto, cobrado, fechaCobro: cobrado ? new Date().toISOString().slice(0, 10) : null, notas: p.notas },
      });
      cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const borrar = async (p: Pendiente) => {
    try {
      await llamar(`/api/comisiones/pendientes?id=${p.id}${q ? `&${q.slice(1)}` : ""}`, { method: "DELETE" });
      cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const visibles = lista.filter((p) => (filtro === "todos" ? true : filtro === "cobrados" ? p.cobrado : !p.cobrado));
  const totalPend = lista.filter((p) => !p.cobrado).reduce((s, p) => s + p.importe, 0);
  const totalCobr = lista.filter((p) => p.cobrado).reduce((s, p) => s + p.importe, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Seccion titulo="📝 Notas del plan">
        <textarea className="form-input" rows={4} value={plan.notas ?? ""} onChange={(e) => setPlan((p) => ({ ...p, notas: e.target.value || null }))} />
      </Seccion>

      <Seccion
        titulo="Comisiones pendientes del plan"
        ayuda="Importes de meses anteriores que la empresa debe. Se muestran aparte del total y se suman a la previsión de nómina."
        acciones={<BotonMini onClick={() => setPlan((p) => ({ ...p, pendientes: [...p.pendientes, { concepto: "", importe: 0, mesOrigen: null }] }))}>+ Añadir</BotonMini>}
      >
        {plan.pendientes.map((x, i) => (
          <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <input className="form-input" style={{ flex: "1 1 240px" }} placeholder="Concepto" value={x.concepto} onChange={(e) => setPlan((p) => ({ ...p, pendientes: p.pendientes.map((y, j) => (j === i ? { ...y, concepto: e.target.value } : y)) }))} />
            <InputCentesimas valor={x.importe} sufijo="€" onChange={(v) => setPlan((p) => ({ ...p, pendientes: p.pendientes.map((y, j) => (j === i ? { ...y, importe: v ?? 0 } : y)) }))} />
            <input className="form-input" type="month" style={{ width: "auto" }} value={x.mesOrigen ?? ""} onChange={(e) => setPlan((p) => ({ ...p, pendientes: p.pendientes.map((y, j) => (j === i ? { ...y, mesOrigen: e.target.value || null } : y)) }))} />
            <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, pendientes: p.pendientes.filter((_, j) => j !== i) }))}>
              Quitar
            </BotonMini>
          </div>
        ))}
      </Seccion>

      <Seccion
        titulo="Pendiente de cobro (lo que me deben)"
        ayuda="Lo que rellenas a mano: lo no cobrado entra en la previsión de nómina; si pasó el mes previsto sin cobrarse se marca como atrasado. Estos datos se guardan al instante."
        acciones={
          <select className="form-input" style={{ width: "auto" }} value={usuario} onChange={(e) => setUsuario(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Mis pendientes</option>
            {cat.vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        }
      >
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <input className="form-input" style={{ flex: "1 1 240px" }} placeholder="Concepto" value={nuevo.concepto} onChange={(e) => setNuevo({ ...nuevo, concepto: e.target.value })} />
          <InputCentesimas valor={nuevo.importe} sufijo="€" onChange={(v) => setNuevo({ ...nuevo, importe: v ?? 0 })} />
          <input className="form-input" type="month" style={{ width: "auto" }} title="Mes de nómina previsto" value={nuevo.mesNominaPrevisto} onChange={(e) => setNuevo({ ...nuevo, mesNominaPrevisto: e.target.value })} />
          <button type="button" className="btn btn-primary" onClick={crear}>
            Añadir
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {(["todos", "pendientes", "cobrados"] as const).map((f) => (
            <BotonMini key={f} onClick={() => setFiltro(f)}>
              {f === filtro ? `● ${f}` : f}
            </BotonMini>
          ))}
          <span style={{ marginLeft: "auto" }}>
            Pendiente: <b>{euros(totalPend)}</b> · Cobrado: <b>{euros(totalCobr)}</b>
          </span>
        </div>
        <div className="table-container">
          <table className="table-premium">
            <thead>
              <tr>
                <th>Concepto</th>
                <th style={{ textAlign: "right" }}>Importe</th>
                <th>Nómina prevista</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id}>
                  <td>{p.concepto}</td>
                  <td style={{ textAlign: "right" }}>{euros(p.importe)}</td>
                  <td>{nombreMes(p.mesNominaPrevisto)}</td>
                  <td style={{ color: p.cobrado ? "var(--success)" : p.atrasado ? "var(--danger)" : undefined }}>{p.cobrado ? `Cobrado ${p.fechaCobro ?? ""}` : p.atrasado ? "Atrasado" : "Pendiente"}</td>
                  <td style={{ display: "flex", gap: "6px" }}>
                    <BotonMini onClick={() => marcar(p, !p.cobrado)}>{p.cobrado ? "Desmarcar" : "Marcar cobrado"}</BotonMini>
                    <BotonMini peligro onClick={() => borrar(p)}>
                      Borrar
                    </BotonMini>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  );
}
