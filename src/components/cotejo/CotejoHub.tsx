"use client";

import BotonAyuda from "@/components/BotonAyuda";
import CotejoCobros from "@/components/comisiones/CotejoCobros";
import ValidacionRejilla from "@/components/comisiones/ValidacionRejilla";
import type { CatalogosComisiones } from "@/components/comisiones/tipos";
import type { ExpedienteDto } from "@/lib/dto";
import { usePreferencia } from "@/lib/preferencias";
import CotejoPagos from "./CotejoPagos";
import HistoricoRejillas from "./HistoricoRejillas";
import MisRejillas from "./MisRejillas";

interface Props {
  expedientes: ExpedienteDto[];
  vendedores: { id: number; nombre: string }[];
  esAdministrador: boolean;
  /** Vendedores con su tipo (para la validación y el control de cobros). */
  catalogo: CatalogosComisiones;
  idUsuario: number;
}

const PESTANAS = [
  { id: "mes", icono: "📅", titulo: "Mi mes", ayuda: "Elige un mes: ves sus coches, subes la rejilla de la empresa (PDF o foto) y la app te dice cuáles te han pagado, todo en la misma vista. También puedes marcarlos a mano con la hoja delante." },
  { id: "historico", icono: "📚", titulo: "Histórico", ayuda: "Todas las matrículas de tus expedientes frente a todas las leídas de las rejillas guardadas, con un color por fila: lo que coincide, lo que no figura en ninguna rejilla y lo que está en una rejilla sin expediente." },
  { id: "importes", icono: "✅", titulo: "¿Cuadran los importes?", ayuda: "Cruza la hoja de la empresa con tu liquidación de un mes, por matrícula e importe: faltan, sobran, distintos o duplicados." },
  { id: "rejillas", icono: "📁", titulo: "Mis rejillas", ayuda: "Todas las rejillas que has guardado, por mes: para verlas, buscar en ellas, ordenarlas y cambiarles el mes." },
  { id: "nomina", icono: "💶", titulo: "Mi nómina", ayuda: "Compara tu nómina con la liquidación, concepto a concepto: marca cada uno cuando lo veas cobrado." },
] as const;

type IdPestana = (typeof PESTANAS)[number]["id"];

/**
 * Todo el cotejo en un solo sitio, en cinco apartados (antes estaba repartido entre esta pantalla y Comisiones):
 * el mes (sus coches, la rejilla de la empresa y qué te han pagado), el histórico de matrículas, si los importes cuadran, las rejillas guardadas y la comparación con la nómina.
 */
export default function CotejoHub({ expedientes, vendedores, esAdministrador, catalogo, idUsuario }: Props) {
  const [guardada, guardar] = usePreferencia("cotejo-pestana");
  // «pago» era la pestaña de subir la rejilla, que ahora está dentro de «Mi mes»
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
            <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <button type="button" role="tab" aria-selected={seleccionada} className={seleccionada ? "btn btn-primary" : "btn btn-secondary"} onClick={() => guardar(p.id)} title={p.ayuda}>
                {p.icono} {p.titulo}
              </button>
              <BotonAyuda guia={`cotejo.${p.id}`} />
            </span>
          );
        })}
      </div>
      <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.85rem" }}>{pestana.ayuda}</p>

      {activa === "mes" && <CotejoPagos expedientes={expedientes} vendedores={vendedores} idUsuarioActual={idUsuario} esAdministrador={esAdministrador} />}
      {activa === "historico" && <HistoricoRejillas vendedores={vendedores} idUsuarioActual={idUsuario} esAdministrador={esAdministrador} />}
      {activa === "importes" && <ValidacionRejilla cat={cat} usuarioInicial={inicial} esAdmin={esAdministrador} />}
      {activa === "rejillas" && <MisRejillas esAdministrador={esAdministrador} />}
      {activa === "nomina" && <CotejoCobros cat={cat} usuarioInicial={inicial} esAdmin={esAdministrador} />}
    </div>
  );
}
