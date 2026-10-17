"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { BotonesDatosSeccion, descargarSeccion } from "@/components/datos/DatosSeccion";
import { useToast } from "@/components/Toast";
import { euros, etiquetaTramo, nombreMes, puntos } from "@/lib/formato";
import type { LiquidacionResumen, PrevisionMes } from "@/lib/servicios/comisiones-gestion";
import type { ResumenPlan } from "@/lib/servicios/planes";
import { llamar, textoError } from "./api";
import CotejoCobros from "./CotejoCobros";
import PlanEditor from "./PlanEditor";
import ValidacionRejilla from "./ValidacionRejilla";
import { BotonMini, Seccion } from "./campos";
import type { CatalogosComisiones, Plan } from "./tipos";
import { useCarga } from "./useCarga";

interface Props {
  cat: CatalogosComisiones;
  esAdmin: boolean;
  idUsuario: number;
}

/** «Planes de Comisionamiento»: lista de planes + cotejo, y el editor de un plan. Los no administradores ven solo lo suyo. */
export default function ComisionesManager({ cat, esAdmin, idUsuario }: Props) {
  const { mostrar } = useToast();
  const [editando, setEditando] = useState<{ plan: Plan | null; solapados: string[] } | null>(null);
  const [aBorrar, setABorrar] = useState<ResumenPlan | null>(null);

  const { datos: planes, recargar: cargar } = useCarga<ResumenPlan[]>(esAdmin ? "/api/comisiones/planes" : null, []);
  const { datos: mias } = useCarga<LiquidacionResumen[]>(esAdmin ? null : "/api/comisiones/liquidaciones", []);
  const { datos: prevision } = useCarga<PrevisionMes[]>(esAdmin ? null : "/api/comisiones/prevision", []);

  const abrir = async (p: ResumenPlan) => {
    try {
      const { data } = await llamar<Plan>(`/api/comisiones/planes?id=${p.idPlan}`);
      setEditando({ plan: data, solapados: p.solapadoCon.map((s) => s.nombre) });
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  /** Abre una copia independiente del plan (sin guardar): mismos valores, como borrador, sin liquidaciones ni pendientes. */
  const duplicar = async (p: ResumenPlan) => {
    try {
      const { data } = await llamar<Plan>(`/api/comisiones/planes?id=${p.idPlan}`);
      const copia: Plan = { ...data, idPlan: 0, nombre: `Copia de ${data.nombre}`, estado: "borrador", pendientes: [], promociones: data.promociones.map((x) => ({ ...x, id: undefined })) };
      setEditando({ plan: copia, solapados: [] });
      mostrar("Copia del plan abierta: cambia el nombre y las fechas y pulsa «Guardar plan».", "exito");
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  /** Descarga un único plan como archivo .json. */
  const exportarUno = async (p: ResumenPlan) => {
    try {
      const r = await descargarSeccion({ seccion: "planes", plural: "planes de comisionamiento" }, [p.idPlan]);
      mostrar(`✅ Plan «${p.nombre}» exportado al archivo ${r.nombre}.`);
    } catch (e) {
      mostrar(`No se ha exportado nada. ${textoError(e)}`, "error");
    }
  };

  const borrar = async () => {
    if (!aBorrar) return;
    try {
      await llamar(`/api/comisiones/planes?id=${aBorrar.idPlan}`, { method: "DELETE" });
      mostrar("Plan eliminado", "exito");
      setABorrar(null);
      cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
      setABorrar(null);
    }
  };

  if (editando) {
    return (
      <PlanEditor
        inicial={editando.plan}
        cat={cat}
        solapados={editando.solapados}
        onGuardado={async (id) => {
          const resumen = (await llamar<ResumenPlan[]>("/api/comisiones/planes")).data.find((p) => p.idPlan === id);
          if (resumen) await abrir(resumen);
        }}
        onVolver={() => {
          setEditando(null);
          cargar();
        }}
      />
    );
  }

  if (!esAdmin) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <Seccion titulo="Mis liquidaciones" ayuda="Solo lectura. Lo generado en un mes se cobra en la nómina de fin del mes siguiente.">
          <div className="table-container">
            <table className="table-premium">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Puntos / Objetivo</th>
                  <th>Tramo</th>
                  <th style={{ textAlign: "right" }}>Neto</th>
                  <th>Se cobra en</th>
                </tr>
              </thead>
              <tbody>
                {mias.map((l) => (
                  <tr key={l.idLiquidation}>
                    <td>{nombreMes(l.mes)}</td>
                    <td>{l.estado}</td>
                    <td style={{ textAlign: "right" }}>
                      {puntos(l.puntosMes)} / {puntos(l.objetivoX)}
                    </td>
                    <td>{etiquetaTramo(l.tramo)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{euros(l.neto)}</td>
                    <td>{nombreMes(l.mesPago)}</td>
                  </tr>
                ))}
                {mias.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--text-muted)" }}>
                      Todavía no hay liquidaciones calculadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Seccion>
        {prevision.length > 0 && (
          <Seccion titulo="Previsión de nómina">
            {prevision.map((p) => (
              <div key={p.mesPago}>
                {nombreMes(p.mesPago)}: <b>{euros(p.total)}</b> (comisión {euros(p.neto)} + pendientes {euros(p.pendientesPlan + p.pendienteCobro)})
              </div>
            ))}
          </Seccion>
        )}
        <ValidacionRejilla cat={{ ...cat, vendedores: cat.vendedores.filter((v) => v.id === idUsuario) }} usuarioInicial={idUsuario} esAdmin={false} />
        <CotejoCobros cat={{ ...cat, vendedores: cat.vendedores.filter((v) => v.id === idUsuario) }} usuarioInicial={idUsuario} esAdmin={false} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <Seccion
        titulo="Planes de Comisionamiento"
        acciones={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <BotonesDatosSeccion seccion="planes" alCambiar={cargar} />
            <button type="button" className="btn btn-primary" onClick={() => setEditando({ plan: null, solapados: [] })}>
              + Nuevo plan
            </button>
          </div>
        }
      >
        <div className="table-container">
          <table className="table-premium">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Periodo</th>
                <th>Estado</th>
                <th>Vendedores</th>
                <th>Liquidaciones</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {planes.map((p) => (
                <tr key={p.idPlan}>
                  <td>
                    {p.nombre}
                    {p.solapadoCon.length > 0 && (
                      <div style={{ color: "var(--warning)", fontSize: "0.8rem" }}>⚠️ Plan ya existente: se solapa con «{p.solapadoCon.map((s) => s.nombre).join("», «")}»</div>
                    )}
                  </td>
                  <td>
                    {p.fechaInicio.split("-").reverse().join("/")} – {p.fechaFin.split("-").reverse().join("/")}
                  </td>
                  <td>{p.estado}</td>
                  <td>{p.vendedores}</td>
                  <td>{p.liquidaciones}</td>
                  <td style={{ display: "flex", gap: "6px", flexWrap: "wrap", minWidth: "200px" }}>
                    <BotonMini onClick={() => abrir(p)}>Abrir</BotonMini>
                    <BotonMini titulo="Crea un plan nuevo con una copia de todos los valores de este (tarifas, puntos, objetivos, reglas…); después cada plan es independiente" onClick={() => duplicar(p)}>
                      Duplicar
                    </BotonMini>
                    <BotonMini titulo="Descarga solo este plan como archivo .json (se puede importar en otra instalación o en esta con «Importar»)." onClick={() => void exportarUno(p)}>
                      Exportar
                    </BotonMini>
                    <BotonMini peligro onClick={() => setABorrar(p)}>
                      Eliminar
                    </BotonMini>
                  </td>
                </tr>
              ))}
              {planes.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: "var(--text-muted)" }}>
                    Aún no hay planes. Crea el primero con «Nuevo plan».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Seccion>

      <ValidacionRejilla cat={cat} usuarioInicial={cat.vendedores[0]?.id ?? idUsuario} esAdmin />

      <CotejoCobros cat={cat} usuarioInicial={cat.vendedores[0]?.id ?? idUsuario} esAdmin />

      {aBorrar && (
        <Modal
          titulo="⚠️ Eliminar plan"
          peligro
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setABorrar(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={borrar}>
                Eliminar
              </button>
            </>
          }
        >
          <p>
            ¿Eliminar el plan «{aBorrar.nombre}»? No se puede si tiene liquidaciones. Esta acción no se puede deshacer.
          </p>
        </Modal>
      )}
    </div>
  );
}
