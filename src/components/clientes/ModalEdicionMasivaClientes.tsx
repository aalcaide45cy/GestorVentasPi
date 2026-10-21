"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import type { TiendaDto } from "@/lib/dto";

export interface CambiosMasivosClientes {
  tienda_id?: number | null;
  domicilio?: string;
  poblacion?: string;
  codigo_postal?: string;
  comentarios?: string;
  comentarios_modo?: "reemplazar" | "anadir";
}

interface Props {
  seleccionados: number;
  tiendas: TiendaDto[];
  ocupado: boolean;
  alGuardar: (cambios: CambiosMasivosClientes) => void;
  alCancelar: () => void;
  alAvisar: (mensaje: string) => void;
}

/** «Editar Clientes en Masa»: solo se modifican los campos rellenados (la tienda tiene su propia opción para dejarla sin tienda). */
export default function ModalEdicionMasivaClientes({ seleccionados, tiendas, ocupado, alGuardar, alCancelar, alAvisar }: Props) {
  // "" = no modificar, "ninguna" = quitar la tienda, otro valor = id de la tienda
  const [tienda, setTienda] = useState("");
  const [poblacion, setPoblacion] = useState("");
  const [codigoPostal, setCodigoPostal] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [modo, setModo] = useState<"reemplazar" | "anadir">("anadir");

  const guardar = () => {
    const cambios: CambiosMasivosClientes = {};
    if (tienda === "ninguna") cambios.tienda_id = null;
    else if (tienda) cambios.tienda_id = Number(tienda);
    if (poblacion.trim()) cambios.poblacion = poblacion.trim();
    if (codigoPostal.trim()) cambios.codigo_postal = codigoPostal.trim();
    if (domicilio.trim()) cambios.domicilio = domicilio.trim();
    if (comentarios.trim()) {
      cambios.comentarios = comentarios.trim();
      cambios.comentarios_modo = modo;
    }
    if (Object.keys(cambios).length === 0) {
      alAvisar("Rellena al menos un campo para modificar.");
      return;
    }
    alGuardar(cambios);
  };

  const grupo = (etiqueta: string, control: React.ReactNode) => (
    <div className="form-group" style={{ flex: 1, minWidth: "220px", marginBottom: 0 }}>
      <label className="form-label">{etiqueta}</label>
      {control}
    </div>
  );

  return (
    <Modal
      titulo={
        <div>
          <div>Editar Clientes en Masa ({seleccionados} seleccionados)</div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "4px", fontWeight: 400 }}>
            Rellena únicamente los campos que quieras modificar. Los campos vacíos no se alterarán.
          </p>
        </div>
      }
      ancho="800px"
      tamanoTitulo="1.25rem"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCancelar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn"
            onClick={guardar}
            disabled={ocupado}
            style={{ backgroundColor: "#2e7d32", color: "white", border: "none", borderRadius: "var(--radius-sm)", padding: "8px 16px", cursor: "pointer", fontWeight: 600 }}
          >
            {ocupado ? "Guardando..." : "Guardar Cambios"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {grupo(
          "Tienda",
          <select className="form-select" value={tienda} onChange={(e) => setTienda(e.target.value)}>
            <option value="">(No modificar)</option>
            <option value="ninguna">Quitar la tienda (sin tienda)</option>
            {tiendas.map((t) => (
              <option key={t.id_tienda} value={t.id_tienda}>
                {t.nombre}
              </option>
            ))}
          </select>,
        )}
        {grupo("Población", <input className="form-input" value={poblacion} onChange={(e) => setPoblacion(e.target.value)} placeholder="(No modificar)" maxLength={120} />)}
        {grupo("Código postal", <input className="form-input" value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} placeholder="(No modificar)" maxLength={10} />)}
      </div>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "16px" }}>
        {grupo("Domicilio", <input className="form-input" value={domicilio} onChange={(e) => setDomicilio(e.target.value)} placeholder="(No modificar)" maxLength={255} />)}
      </div>
      <div style={{ marginTop: "16px" }}>
        {grupo(
          "Comentarios",
          <>
            <textarea className="form-input" value={comentarios} onChange={(e) => setComentarios(e.target.value)} placeholder="(No modificar)" rows={3} maxLength={5000} style={{ width: "100%" }} />
            <div style={{ display: "flex", gap: "16px", marginTop: "6px", fontSize: "0.85rem", flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", gap: "6px", alignItems: "center", cursor: "pointer" }}>
                <input type="radio" name="modo-comentarios" checked={modo === "anadir"} onChange={() => setModo("anadir")} />
                Añadir al final de lo que ya tiene cada cliente
              </label>
              <label style={{ display: "inline-flex", gap: "6px", alignItems: "center", cursor: "pointer" }}>
                <input type="radio" name="modo-comentarios" checked={modo === "reemplazar"} onChange={() => setModo("reemplazar")} />
                Sustituir lo que tenga
              </label>
            </div>
          </>,
        )}
      </div>
    </Modal>
  );
}
