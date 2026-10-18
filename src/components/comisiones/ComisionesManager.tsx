"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { BotonesDatosSeccion, descargarSeccion } from "@/components/datos/DatosSeccion";
import { useToast } from "@/components/Toast";
import { euros, etiquetaTramo, nombreMes, puntos } from "@/lib/formato";
import type { LiquidacionResumen, PrevisionMes } from "@/lib/servicios/comisiones-gestion";
import type { ResumenPlan } from "@/lib/servicios/planes";
import { llamar, textoError } from "./api";
import PlanEditor from "./PlanEditor";
import { BotonMini, Seccion } from "./campos";
import type { CatalogosComisiones, Plan } from "./tipos";
import { useCarga } from "./useCarga";

interface Props {
  cat: CatalogosComisiones;
  esAdmin: boolean;
  idUsuario: number;
}

const AVISO_COTEJO = (
  <div style={{ padding: "12px 16px", borderLeft: "3px solid var(--primary)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem" }}>
    🔎 La validación con la hoja de la empresa y el control de cobros ahora están junto al resto del cotejo en <Link href="/dashboard/cotejo-pagos" style={{ color: "var(--primary)", fontWeight: 700 }}>Cotejo de pagos</Link>.
  </div>
);

/** «Planes de Comisionamiento»: lista de planes + cotejo, y el editor de un plan. Los no administradores ven solo lo suyo. */
export default function ComisionesManager({ cat, esAdmin }: Props) {
  const { mostrar } = useToast();
  const [editando, setEditando] = useState<{ plan: Plan | null; solapados: string[] } | null>(null);
  const [aBorrar, setABorrar] = useState<ResumenPlan | null>(null);
  const [pestanaInicial, setPestanaInicial] = useState<string | undefined>(undefined);

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

  // Enlace desde el desglose de un expediente: ?plan=ID&tab=usados abre ese plan en esa pestaña
  useEffect(() => {
    if (!esAdmin) return;
    const q = new URLSearchParams(window.location.search);
    // ?plan=nuevo: el plan nuevo que se estaba escribiendo al recargar la página (el borrador lo trae el editor)
    if (q.get("plan") === "nuevo") {
      void Promise.resolve().then(() => {
        setPestanaInicial(q.get("tab") ?? undefined);
        setEditando({ plan: null, solapados: [] });
      });
      return;
    }
    const id = Number(q.get("plan"));
    if (!Number.isInteger(id) || id <= 0) return;
    void (async () => {
      try {
        const { data } = await llamar<Plan>(`/api/comisiones/planes?id=${id}`);
        setPestanaInicial(q.get("tab") ?? undefined);
        setEditando({ plan: data, solapados: [] });
      } catch (e) {
        mostrar(textoError(e), "error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdmin]);

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
      await llamar(`/api/comisiones/planes?id=${aBorrar.idPlan}${aBorrar.liquidaciones > 0 ? "&forzar=1" : ""}`, { method: "DELETE" });
      mostrar("Plan eliminado", "exito");
      setABorrar(null);
      cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
      setABorrar(null);
    }
  };

  const columnasMias: ColumnaTabla<LiquidacionResumen>[] = [
    { clave: "mes", etiqueta: "Mes", valor: (l) => l.mes, celda: (l) => nombreMes(l.mes) },
    { clave: "estado", etiqueta: "Estado", valor: (l) => l.estado },
    { clave: "puntos", etiqueta: "Puntos / Objetivo", valor: (l) => l.puntosMes, celda: (l) => `${puntos(l.puntosMes)} / ${puntos(l.objetivoX)}`, alinear: "right" },
    { clave: "tramo", etiqueta: "Tramo", valor: (l) => l.tramo, celda: (l) => etiquetaTramo(l.tramo) },
    { clave: "neto", etiqueta: "Neto", valor: (l) => l.neto, celda: (l) => <b>{euros(l.neto)}</b>, alinear: "right" },
    { clave: "mesPago", etiqueta: "Se cobra en", valor: (l) => l.mesPago, celda: (l) => nombreMes(l.mesPago) },
  ];
  const columnasPlanes: ColumnaTabla<ResumenPlan>[] = [
    {
      clave: "plan",
      etiqueta: "Plan",
      valor: (p) => p.nombre,
      celda: (p) => (
        <>
          {p.nombre}
          {p.solapadoCon.length > 0 && <div style={{ color: "var(--warning)", fontSize: "0.8rem" }}>⚠️ Plan ya existente: se solapa con «{p.solapadoCon.map((x) => x.nombre).join("», «")}»</div>}
        </>
      ),
    },
    { clave: "periodo", etiqueta: "Periodo", valor: (p) => p.fechaInicio, celda: (p) => `${p.fechaInicio.split("-").reverse().join("/")} – ${p.fechaFin.split("-").reverse().join("/")}` },
    { clave: "estado", etiqueta: "Estado", valor: (p) => p.estado },
    { clave: "vendedores", etiqueta: "Vendedores", valor: (p) => p.vendedores, alinear: "right" },
    { clave: "liquidaciones", etiqueta: "Liquidaciones", valor: (p) => p.liquidaciones, alinear: "right" },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      valor: () => "",
      celda: (p) => (
        <span style={{ display: "inline-flex", gap: "6px", flexWrap: "wrap" }}>
          <BotonMini onClick={() => void abrir(p)}>Abrir</BotonMini>
          <BotonMini titulo="Crea un plan nuevo con una copia de todos los valores de este (tarifas, puntos, objetivos, reglas…); después cada plan es independiente" onClick={() => void duplicar(p)}>
            Duplicar
          </BotonMini>
          <BotonMini titulo="Descarga solo este plan como archivo .json (se puede importar en otra instalación o en esta con «Importar»)." onClick={() => void exportarUno(p)}>
            Exportar SOLO este plan
          </BotonMini>
          <BotonMini peligro onClick={() => setABorrar(p)}>
            Eliminar
          </BotonMini>
        </span>
      ),
    },
  ];

  if (editando) {
    return (
      <PlanEditor
        inicial={editando.plan}
        cat={cat}
        solapados={editando.solapados}
        pestanaInicial={pestanaInicial}
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
          <TablaDatos<LiquidacionResumen>
            id="mis-liquidaciones"
            columnas={columnasMias}
            filas={mias}
            clave={(l) => l.idLiquidation}
            placeholder="Buscar por mes o estado…"
            vacio="Todavía no hay liquidaciones calculadas."
            pie={(fs) => ({ mes: `${fs.length} liquidación${fs.length === 1 ? "" : "es"}`, neto: euros(fs.reduce((t, l) => t + l.neto, 0)) })}
          />
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
        {AVISO_COTEJO}
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
        <TablaDatos<ResumenPlan>
          id="planes-comisiones"
          columnas={columnasPlanes}
          filas={planes}
          clave={(p) => p.idPlan}
          placeholder="Buscar por plan, periodo, estado…"
          vacio="Aún no hay planes. Crea el primero con «Nuevo plan»."
          pie={(fs) => ({ plan: `${fs.length} plan${fs.length === 1 ? "" : "es"}`, liquidaciones: fs.reduce((t, p) => t + p.liquidaciones, 0) })}
        />
      </Seccion>

      {AVISO_COTEJO}

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
            ¿Eliminar el plan «{aBorrar.nombre}»? Esta acción no se puede deshacer.
          </p>
          {aBorrar.liquidaciones > 0 && (
            <p style={{ color: "var(--warning)" }}>
              Tiene {aBorrar.liquidaciones} liquidación(es) calculada(s): se borrarán con el plan. No pasa nada grave, se pueden volver a generar con otro plan (por ejemplo, una copia de este). Si solo quieres otro plan parecido, usa «Duplicar» en vez de eliminar.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
