"use client";

import { useState } from "react";
import type { EstadoVehiculoDto, TiendaDto, TipoVentaDto } from "@/lib/dto";
import PestanaBbdd from "./admin/PestanaBbdd";
import PestanaEstados from "./admin/PestanaEstados";
import PestanaExpedientes from "./admin/PestanaExpedientes";
import PestanaMarcas, { type MarcaConModelos } from "./admin/PestanaMarcas";
import PestanaModelos from "./admin/PestanaModelos";
import PestanaPagos from "./admin/PestanaPagos";
import PestanaTiendas from "./admin/PestanaTiendas";

interface Props {
  marcasIniciales: MarcaConModelos[];
  tiposVentaIniciales: TipoVentaDto[];
  estadosIniciales: EstadoVehiculoDto[];
  tiendasIniciales: TiendaDto[];
  tiendaPredeterminadaIdInicial: number | null;
  mostrarBotonesCsv: boolean;
}

type Pestana = "marcas" | "modelos" | "tiendas" | "pagos" | "estados" | "expedientes" | "bbdd";

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "marcas", etiqueta: "🏷️ Marcas" },
  { clave: "modelos", etiqueta: "🚙 Modelos" },
  { clave: "tiendas", etiqueta: "🏢 Tiendas" },
  { clave: "pagos", etiqueta: "💰 Pagos" },
  { clave: "estados", etiqueta: "🚗 Estados" },
  { clave: "expedientes", etiqueta: "📋 Expedientes" },
  { clave: "bbdd", etiqueta: "🗄️ BBDD" },
];

/** Catálogos y ajustes del sistema, en pestañas (solo administrador). */
export default function AdminCatalogosForm({
  marcasIniciales,
  tiposVentaIniciales,
  estadosIniciales,
  tiendasIniciales,
  tiendaPredeterminadaIdInicial,
  mostrarBotonesCsv,
}: Props) {
  const [pestana, setPestana] = useState<Pestana>("marcas");
  const [marcas, setMarcas] = useState(marcasIniciales);
  const [tipos, setTipos] = useState(tiposVentaIniciales);
  const [estados, setEstados] = useState(estadosIniciales);
  const [tiendas, setTiendas] = useState(tiendasIniciales);
  const [predeterminadaId, setPredeterminadaId] = useState(tiendaPredeterminadaIdInicial);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: "10px", borderBottom: "1px solid var(--border-light)", paddingBottom: "12px", flexWrap: "wrap" }}>
        {PESTANAS.map((p) => (
          <button key={p.clave} type="button" className={`btn ${pestana === p.clave ? "btn-primary" : "btn-secondary"}`} onClick={() => setPestana(p.clave)} style={{ padding: "10px 20px", fontSize: "0.9rem" }}>
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestana === "marcas" && <PestanaMarcas marcas={marcas} setMarcas={setMarcas} />}
      {pestana === "modelos" && <PestanaModelos marcas={marcas} setMarcas={setMarcas} />}
      {pestana === "tiendas" && <PestanaTiendas tiendas={tiendas} setTiendas={setTiendas} predeterminadaId={predeterminadaId} setPredeterminadaId={setPredeterminadaId} />}
      {pestana === "pagos" && <PestanaPagos tipos={tipos} setTipos={setTipos} />}
      {pestana === "estados" && <PestanaEstados estados={estados} setEstados={setEstados} />}
      {pestana === "expedientes" && <PestanaExpedientes />}
      {pestana === "bbdd" && <PestanaBbdd mostrarBotonesCsvInicial={mostrarBotonesCsv} />}
    </div>
  );
}
