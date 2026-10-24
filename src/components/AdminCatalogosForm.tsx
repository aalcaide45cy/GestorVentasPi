"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Seccion } from "@/lib/servicios/intercambio";
import type { EstadoVehiculoDto, TiendaDto, TipoVentaDto } from "@/lib/dto";
import { usePreferencia } from "@/lib/preferencias";
import { BotonesDatosSeccion } from "./datos/DatosSeccion";
import BotonAyuda from "./BotonAyuda";
import PanelPaletas from "./admin/PanelPaletas";
import PestanaIncidencias from "./admin/PestanaIncidencias";
import PestanaBbdd from "./admin/PestanaBbdd";
import PestanaDashboard from "./admin/PestanaDashboard";
import PestanaEstados from "./admin/PestanaEstados";
import PestanaExpedientes from "./admin/PestanaExpedientes";
import PestanaMarcas, { type MarcaConModelos } from "./admin/PestanaMarcas";
import PestanaModelos from "./admin/PestanaModelos";
import PestanaPagos from "./admin/PestanaPagos";
import PestanaTemas from "./admin/PestanaTemas";
import PestanaTiendas from "./admin/PestanaTiendas";

interface Props {
  marcasIniciales: MarcaConModelos[];
  tiposVentaIniciales: TipoVentaDto[];
  estadosIniciales: EstadoVehiculoDto[];
  tiendasIniciales: TiendaDto[];
  tiendaPredeterminadaIdInicial: number | null;
  mostrarBotonesCsv: boolean;
  /** Gestión de usuarios y roles (se pinta en la primera pestaña). */
  panelUsuarios: ReactNode;
}

type Pestana = "usuarios" | "incidencias" | "marcas" | "modelos" | "tiendas" | "pagos" | "estados" | "expedientes" | "dashboard" | "bbdd" | "temas";

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "usuarios", etiqueta: "👥 Usuarios" },
  { clave: "incidencias", etiqueta: "🩺 Incidencias" },
  { clave: "marcas", etiqueta: "🏷️ Marcas" },
  { clave: "modelos", etiqueta: "🚙 Modelos" },
  { clave: "tiendas", etiqueta: "🏢 Tiendas" },
  { clave: "pagos", etiqueta: "💰 Pagos" },
  { clave: "estados", etiqueta: "🚗 Estados" },
  { clave: "expedientes", etiqueta: "📋 Expedientes" },
  { clave: "dashboard", etiqueta: "🏠 Dashboard" },
  { clave: "bbdd", etiqueta: "🗄️ BBDD" },
  { clave: "temas", etiqueta: "🎨 Tema" },
];

const SECCION_DE_PESTANA: Partial<Record<Pestana, Seccion>> = { marcas: "marcas_modelos", modelos: "marcas_modelos", tiendas: "tiendas", pagos: "tipos_venta", estados: "estados" };

/** Catálogos y ajustes del sistema, en pestañas (solo administrador). */
export default function AdminCatalogosForm({
  marcasIniciales,
  tiposVentaIniciales,
  estadosIniciales,
  tiendasIniciales,
  tiendaPredeterminadaIdInicial,
  mostrarBotonesCsv,
  panelUsuarios,
}: Props) {
  // La pestaña abierta se recuerda: al recargar la página no vuelve a «Marcas»
  const [pestanaGuardada, setPestanaGuardada] = usePreferencia("config-pestana");
  const pestana: Pestana = PESTANAS.some((p) => p.clave === pestanaGuardada) ? (pestanaGuardada as Pestana) : "usuarios";
  const setPestana = (p: Pestana) => setPestanaGuardada(p);
  const router = useRouter();
  const [verPaletas, setVerPaletas] = useState(false);
  const [marcas, setMarcas] = useState(marcasIniciales);
  const [tipos, setTipos] = useState(tiposVentaIniciales);
  const [estados, setEstados] = useState(estadosIniciales);
  const [tiendas, setTiendas] = useState(tiendasIniciales);
  const [predeterminadaId, setPredeterminadaId] = useState(tiendaPredeterminadaIdInicial);
  // Si el servidor entrega datos nuevos (router.refresh, deshacer o rehacer), se reemplazan los locales
  const [previos, setPrevios] = useState({ marcasIniciales, tiposVentaIniciales, estadosIniciales, tiendasIniciales });
  if (previos.marcasIniciales !== marcasIniciales || previos.tiposVentaIniciales !== tiposVentaIniciales || previos.estadosIniciales !== estadosIniciales || previos.tiendasIniciales !== tiendasIniciales) {
    setPrevios({ marcasIniciales, tiposVentaIniciales, estadosIniciales, tiendasIniciales });
    setMarcas(marcasIniciales);
    setTipos(tiposVentaIniciales);
    setEstados(estadosIniciales);
    setTiendas(tiendasIniciales);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: "8px", borderBottom: "1px solid var(--border-light)", paddingBottom: "12px", flexWrap: "wrap" }}>
        {PESTANAS.map((p) => (
          <span key={p.clave} style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
            <button type="button" className={`btn ${pestana === p.clave ? "btn-primary" : "btn-secondary"}`} onClick={() => setPestana(p.clave)} style={{ padding: "9px 11px", fontSize: "0.88rem" }}>
              {p.etiqueta}
            </button>
            <BotonAyuda guia={`config.${p.clave}`} />
          </span>
        ))}
      </div>

      {SECCION_DE_PESTANA[pestana] && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "-12px" }}>
          {["marcas", "pagos", "estados"].includes(pestana) && (
            <button type="button" className="btn btn-secondary" onClick={() => setVerPaletas(true)} style={{ padding: "8px 14px", fontSize: "0.85rem", marginRight: "auto" }} title="Guarda, aplica, exporta e importa los colores de los pagos (botones de creación rápida), marcas y estados">
              🎨 Paletas de colores
            </button>
          )}
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Datos de esta pestaña:</span>
          <BotonesDatosSeccion key={pestana} seccion={SECCION_DE_PESTANA[pestana]} alCambiar={() => router.refresh()} />
        </div>
      )}

      {verPaletas && <PanelPaletas alCerrar={() => setVerPaletas(false)} />}
      {pestana === "usuarios" && panelUsuarios}
      {pestana === "incidencias" && <PestanaIncidencias />}
      {pestana === "marcas" && <PestanaMarcas marcas={marcas} setMarcas={setMarcas} />}
      {pestana === "modelos" && <PestanaModelos marcas={marcas} setMarcas={setMarcas} />}
      {pestana === "tiendas" && <PestanaTiendas tiendas={tiendas} setTiendas={setTiendas} predeterminadaId={predeterminadaId} setPredeterminadaId={setPredeterminadaId} />}
      {pestana === "pagos" && <PestanaPagos tipos={tipos} setTipos={setTipos} />}
      {pestana === "estados" && <PestanaEstados estados={estados} setEstados={setEstados} />}
      {pestana === "expedientes" && <PestanaExpedientes sugerencias={{ tiposVenta: tipos.map((t) => t.nombre_tipo_venta), estados: estados.map((e) => e.nombre_estado_vehiculo), marcas: marcas.map((m) => m.nombre) }} />}
      {pestana === "dashboard" && <PestanaDashboard />}
      {pestana === "temas" && <PestanaTemas />}
      {pestana === "bbdd" && <PestanaBbdd mostrarBotonesCsvInicial={mostrarBotonesCsv} />}
    </div>
  );
}
