"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import type { MarcaDto, ModeloDto, TipoVentaDto, VendedorDto } from "@/lib/dto";
import { mensajeDeError } from "./expedientes/comun";

export interface MarcaConModelos extends MarcaDto {
  modelos: ModeloDto[];
}

interface Props {
  marcas: MarcaConModelos[];
  tiposVenta: TipoVentaDto[];
  vendedores: VendedorDto[];
  currentUserId: number;
}

const estiloTarjetaMarca = {
  width: "350px",
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: "350px",
  maxWidth: "100%",
  padding: "20px",
  background: "rgba(255, 255, 255, 0.01)",
  border: "1px solid var(--border-light)",
  borderRadius: "var(--radius-md)",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
} as const;

const estiloTituloMarca = {
  fontSize: "1.1rem",
  fontWeight: 700,
  color: "var(--primary)",
  borderBottom: "1px solid var(--border-light)",
  paddingBottom: "10px",
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: "8px",
} as const;

/** Acceso rápido: un clic crea un expediente con ese modelo y tipo de venta. */
export default function QuickExpedienteCreator({ marcas, tiposVenta, vendedores, currentUserId }: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [cargandoModelo, setCargandoModelo] = useState<number | "VO" | null>(null);
  const [cargandoTipo, setCargandoTipo] = useState<number | null>(null);

  const [vendedorId, setVendedorId] = useState<number>(currentUserId);
  const [desplegado, setDesplegado] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (!desplegado) return;
    const alPulsarFuera = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".vendor-dropdown-container")) setDesplegado(false);
    };
    document.addEventListener("click", alPulsarFuera);
    return () => document.removeEventListener("click", alPulsarFuera);
  }, [desplegado]);

  const crear = async (
    idModelo: number | null,
    nombreModelo: string,
    tipo: TipoVentaDto,
    estadoNombre?: string,
  ) => {
    setCargandoModelo(idModelo ?? "VO");
    setCargandoTipo(tipo.id_tipo_de_venta);
    try {
      const res = await fetch("/api/expedientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expediente: {
            id_modelo: idModelo,
            id_tipo_de_venta: tipo.id_tipo_de_venta,
            estado_nombre: estadoNombre,
            id_usuario: vendedorId,
          },
        }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al crear el expediente rápido"));
      mostrar(`¡Expediente rápido creado con éxito para ${nombreModelo} (${tipo.nombre_tipo_venta})!`);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Ocurrió un error inesperado al crear el expediente.", "error");
    } finally {
      setCargandoModelo(null);
      setCargandoTipo(null);
    }
  };

  const marcasConModelos = marcas.filter((m) => m.modelos.length > 0);
  const vendedoresFiltrados = vendedores.filter((v) => v.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  const botonesTipo = (idModelo: number | null, nombreModelo: string, estadoNombre?: string) => (
    <div style={{ display: "flex", gap: "8px", width: "100%" }}>
      {tiposVenta.map((tv) => {
        const esteCargando = cargandoModelo === (idModelo ?? "VO") && cargandoTipo === tv.id_tipo_de_venta;
        return (
          <button
            key={tv.id_tipo_de_venta}
            type="button"
            onClick={() => crear(idModelo, nombreModelo, tv, estadoNombre)}
            disabled={cargandoModelo !== null}
            style={{
              fontSize: "0.75rem",
              padding: "8px 4px",
              flex: "1 1 0px",
              minWidth: "0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              background: esteCargando ? "rgba(255, 255, 255, 0.2)" : tv.color || "#3b82f6",
              color: "#ffffff",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "4px",
              cursor: cargandoModelo !== null ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              opacity: cargandoModelo !== null && !esteCargando ? 0.5 : 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={`Crear rápido ${nombreModelo} - ${tv.nombre_tipo_venta}`}
            className="glass-panel-interactive"
          >
            {esteCargando && (
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTop: "2px solid var(--text-primary)",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin 0.8s linear infinite",
                }}
              />
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{tv.nombre_tipo_venta}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="glass-panel" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h3 style={{ fontSize: "1.2rem", marginBottom: "4px" }}>Acceso Rápido a Modelos</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>
            Crea expedientes de venta de forma instantánea pulsando en el método de pago bajo cada modelo.
          </p>
        </div>

        {/* Selector de comercial con buscador */}
        <div className="vendor-dropdown-container" style={{ display: "flex", alignItems: "center", gap: "8px", position: "relative" }}>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setDesplegado(!desplegado)}
              type="button"
              className="glass-panel-interactive"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-primary)",
                fontSize: "0.85rem",
                cursor: "pointer",
                minWidth: "220px",
                justifyContent: "space-between",
                textAlign: "left",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                👤 {vendedores.find((v) => v.id_usuario === vendedorId)?.nombre || "Seleccionar comercial"}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: desplegado ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {desplegado && (
              <div
                className="glass-panel"
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  zIndex: 2000,
                  width: "280px",
                  maxHeight: "300px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-lg)",
                  padding: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <input
                  type="text"
                  placeholder="Buscar comercial..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border-light)",
                    borderRadius: "4px",
                    color: "var(--text-primary)",
                    fontSize: "0.8rem",
                    outline: "none",
                  }}
                  autoFocus
                />
                <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px", maxHeight: "200px" }}>
                  {vendedoresFiltrados.map((v) => (
                    <button
                      key={v.id_usuario}
                      type="button"
                      onClick={() => {
                        setVendedorId(v.id_usuario);
                        setDesplegado(false);
                        setBusqueda("");
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 12px",
                        background: v.id_usuario === vendedorId ? "rgba(59, 130, 246, 0.15)" : "transparent",
                        border: "none",
                        borderRadius: "4px",
                        color: v.id_usuario === vendedorId ? "var(--primary)" : "var(--text-primary)",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        fontWeight: v.id_usuario === vendedorId ? 600 : 400,
                      }}
                    >
                      {v.nombre}
                    </button>
                  ))}
                  {vendedoresFiltrados.length === 0 && (
                    <div style={{ padding: "8px", fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>
                      No se encontraron resultados
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setVendedorId(currentUserId);
              setBusqueda("");
            }}
            className="glass-panel-interactive"
            title="Restaurar a mi usuario"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", justifyContent: "center", width: "100%" }}>
        {marcasConModelos.map((marca) => (
          <div key={marca.id_marca} style={estiloTarjetaMarca}>
            <h4 style={estiloTituloMarca}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              {marca.nombre}
            </h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", width: "100%" }}>
              {marca.modelos.map((modelo) => (
                <div
                  key={modelo.id_modelo}
                  className="glass-panel-interactive"
                  style={{
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border-light)",
                    flex: "1 1 200px",
                    minWidth: "160px",
                    maxWidth: "100%",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)" }}>{modelo.nombre_modelo}</div>
                  {botonesTipo(modelo.id_modelo, modelo.nombre_modelo)}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Tarjeta VO */}
        <div style={estiloTarjetaMarca}>
          <h4 style={estiloTituloMarca}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            VO
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
              Crea un expediente rápido para un vehículo usado (sin marca/modelo preasignados).
            </div>
            <div
              className="glass-panel-interactive"
              style={{
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border-light)",
                width: "100%",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)" }}>Vehículo Usado (VO)</div>
              {botonesTipo(null, "Vehículo Usado (VO)", "usado")}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
