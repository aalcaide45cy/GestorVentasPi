"use client";

import CotejoCobros from "@/components/comisiones/CotejoCobros";
import ValidacionRejilla from "@/components/comisiones/ValidacionRejilla";
import type { CatalogosComisiones } from "@/components/comisiones/tipos";
import type { ExpedienteDto } from "@/lib/dto";
import { usePreferencia } from "@/lib/preferencias";
import CotejoPagos from "./CotejoPagos";
import MiMes from "./MiMes";
import MisRejillas from "./MisRejillas";

interface Props {
  expedientes: ExpedienteDto[];
  vendedores: string[];
  nombreActual: string;
  esAdministrador: boolean;
  /** Vendedores con su tipo (para la validación y el control de cobros). */
  catalogo: CatalogosComisiones;
  idUsuario: number;
}

const PESTANAS = [
  { id: "mes", icono: "📅", titulo: "Mi mes", ayuda: "Tu resumen del mes y la lista de coches para ir cotejándola a mano con la hoja de la empresa." },
  { id: "pago", icono: "🚗", titulo: "¿Me han pagado cada coche?", ayuda: "Subes la hoja de la empresa (PDF o foto) y la app lee las matrículas: te dice qué coches vendidos no te han pagado." },
  { id: "importes", icono: "✅", titulo: "¿Cuadran los importes?", ayuda: "Cruza la hoja de la empresa con tu liquidación de un mes, por matrícula e importe: faltan, sobran, distintos o duplicados." },
  { id: "rejillas", icono: "📁", titulo: "Mis rejillas", ayuda: "Todas las rejillas que has guardado, por mes: para verlas, buscar en ellas, ordenarlas y cambiarles el mes." },
  { id: "nomina", icono: "💶", titulo: "Mi nómina", ayuda: "Compara tu nómina con la liquidación, concepto a concepto: marca cada uno cuando lo veas cobrado." },
] as const;

type IdPestana = (typeof PESTANAS)[number]["id"];

/**
 * Todo el cotejo en un solo sitio, en cuatro apartados (antes estaba repartido entre esta pantalla y Comisiones):
 * el resumen del mes, qué coches te han pagado, si los importes cuadran y la comparación con la nómina.
 */
export default function CotejoHub({ expedientes, vendedores, nombreActual, esAdministrador, catalogo, idUsuario }: Props) {
  const [guardada, guardar] = usePreferencia("cotejo-pestana");
  const activa: IdPestana = PESTANAS.some((p) => p.id === guardada) ? (guardada as IdPestana) : "mes";
  const pestana = PESTANAS.find((p) => p.id === activa) ?? PESTANAS[0];
  const cat = esAdministrador ? catalogo : { ...catalogo, vendedores: catalogo.vendedores.filter((v) => v.id === idUsuario) };
  const inicial = cat.vendedores[0]?.id ?? idUsuario;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }} role="tablist">
        {PESTANAS.map((p) => {
          const seleccionada = p.id === activa;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={seleccionada}
              className={seleccionada ? "btn btn-primary" : "btn btn-secondary"}
              onClick={() => guardar(p.id)}
              title={p.ayuda}
            >
              {p.icono} {p.titulo}
            </button>
          );
        })}
      </div>
      <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.85rem" }}>{pestana.ayuda}</p>

      {activa === "mes" && <MiMes expedientes={expedientes} vendedores={vendedores} nombreActual={nombreActual} esAdministrador={esAdministrador} />}
      {activa === "pago" && <CotejoPagos />}
      {activa === "importes" && <ValidacionRejilla cat={cat} usuarioInicial={inicial} esAdmin={esAdministrador} />}
      {activa === "rejillas" && <MisRejillas esAdministrador={esAdministrador} />}
      {activa === "nomina" && <CotejoCobros cat={cat} usuarioInicial={inicial} esAdmin={esAdministrador} />}
    </div>
  );
}
