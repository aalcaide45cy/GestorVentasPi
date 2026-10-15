"use client";

import { useState, type FormEvent } from "react";
import type { EstadoVehiculoDto } from "@/lib/dto";
import { Cabecera, comparar, estiloBotonPeligro, estiloCheck, estiloPanel, useOrden, usePeticion } from "./utilidades";

interface Props {
  estados: EstadoVehiculoDto[];
  setEstados: (fn: (prev: EstadoVehiculoDto[]) => EstadoVehiculoDto[]) => void;
}

/** Pestaña «Estados» del vehículo. Solo uno puede ser el predeterminado. */
export default function PestanaEstados({ estados, setEstados }: Props) {
  const { cargando, llamar, ejecutar } = usePeticion();
  const orden = useOrden("id");
  const [nombre, setNombre] = useState("");
  const [predeterminado, setPredeterminado] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState("");
  const [predeterminadoEdicion, setPredeterminadoEdicion] = useState(false);

  const valor = (e: EstadoVehiculoDto): string | number => (orden.campo === "nombre" ? e.nombre_estado_vehiculo : e.id_estado_vehiculo);
  const ordenados = [...estados].sort((a, b) => comparar(valor(a), valor(b), orden.asc));

  /** Tras guardar uno como predeterminado, el resto deja de serlo. */
  const aplicar = (n: EstadoVehiculoDto) =>
    setEstados((prev) => prev.map((e) => (e.id_estado_vehiculo === n.id_estado_vehiculo ? n : n.predeterminado ? { ...e, predeterminado: false } : e)));

  const crear = async (ev: FormEvent) => {
    ev.preventDefault();
    const ok = await ejecutar(async () => {
      const n = await llamar<EstadoVehiculoDto>("/api/admin/catalogos", "POST", { tipo: "estado_vehiculo", nombre_estado_vehiculo: nombre, predeterminado }, "Error al crear el estado");
      setEstados((prev) => [...(n.predeterminado ? prev.map((e) => ({ ...e, predeterminado: false })) : prev), n]);
    }, "Estado de vehículo creado con éxito");
    if (ok) {
      setNombre("");
      setPredeterminado(false);
    }
  };

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (editando === null) return;
    const ok = await ejecutar(async () => {
      const n = await llamar<EstadoVehiculoDto>(
        "/api/admin/catalogos",
        "PUT",
        { tipo: "estado_vehiculo", id: editando, nombre_estado_vehiculo: nombreEdicion, predeterminado: predeterminadoEdicion },
        "Error al actualizar el estado",
      );
      aplicar(n);
    }, "Estado de vehículo actualizado correctamente");
    if (ok) setEditando(null);
  };

  const alternarPredeterminado = (e: EstadoVehiculoDto) =>
    ejecutar(async () => {
      const n = await llamar<EstadoVehiculoDto>(
        "/api/admin/catalogos",
        "PUT",
        { tipo: "estado_vehiculo", id: e.id_estado_vehiculo, nombre_estado_vehiculo: e.nombre_estado_vehiculo, predeterminado: !e.predeterminado },
        "Error al actualizar el estado",
      );
      aplicar(n);
    }, e.predeterminado ? "Estado ya no es predeterminado" : "Estado establecido como predeterminado");

  const eliminar = (e: EstadoVehiculoDto) => {
    if (!confirm("¿Seguro que deseas eliminar este estado de vehículo?")) return;
    void ejecutar(async () => {
      await llamar("/api/admin/catalogos", "DELETE", { tipo: "estado_vehiculo", id: e.id_estado_vehiculo }, "Error al eliminar");
      setEstados((prev) => prev.filter((x) => x.id_estado_vehiculo !== e.id_estado_vehiculo));
    }, "Estado de vehículo eliminado");
  };

  return (
    <div className="glass-panel" style={estiloPanel}>
      <h3 style={{ fontSize: "1.15rem" }}>Estados del Vehículo</h3>

      <form onSubmit={crear} style={{ display: "flex", gap: "15px", alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" className="form-input" placeholder="Ej. Buyback" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={cargando} required style={{ flex: 1, minWidth: "200px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input type="checkbox" id="chkNuevoEstadoPredeterminado" checked={predeterminado} onChange={(e) => setPredeterminado(e.target.checked)} style={estiloCheck} />
          <label htmlFor="chkNuevoEstadoPredeterminado" style={{ fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }}>Predeterminado</label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={cargando}>
          + Crear Estado
        </button>
      </form>

      <div className="table-container">
        <table className="table-premium">
          <thead>
            <tr>
              <Cabecera etiqueta="Nombre Estado" campo="nombre" orden={orden} />
              <th>Predeterminado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((e) => (
              <tr key={e.id_estado_vehiculo}>
                <td>
                  {editando === e.id_estado_vehiculo ? (
                    <form onSubmit={guardar} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input type="text" className="form-input" value={nombreEdicion} onChange={(ev) => setNombreEdicion(ev.target.value)} style={{ padding: "4px 8px", fontSize: "0.85rem" }} required autoFocus />
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input type="checkbox" id="chkEditEstadoPredeterminado" checked={predeterminadoEdicion} onChange={(ev) => setPredeterminadoEdicion(ev.target.checked)} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                        <label htmlFor="chkEditEstadoPredeterminado" style={{ fontSize: "0.8rem", cursor: "pointer" }}>Predet.</label>
                      </div>
                      <button type="submit" className="btn btn-primary" style={{ padding: "4px 8px" }} disabled={cargando}>✓</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)} style={{ padding: "4px 8px" }}>✗</button>
                    </form>
                  ) : (
                    <span style={{ fontWeight: 600 }}>{e.nombre_estado_vehiculo}</span>
                  )}
                </td>
                <td>
                  <div onClick={() => void alternarPredeterminado(e)} style={{ cursor: "pointer", display: "inline-block" }}>
                    {e.predeterminado ? (
                      <span className="badge" style={{ background: "rgba(16, 185, 129, 0.2)", color: "var(--success)", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold" }}>
                        ★ Predeterminado
                      </span>
                    ) : (
                      <span className="badge" style={{ background: "rgba(255, 255, 255, 0.05)", color: "var(--text-muted)", border: "1px solid var(--border-light)", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem" }}>
                        Hacer Predeterminado
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditando(e.id_estado_vehiculo);
                        setNombreEdicion(e.nombre_estado_vehiculo);
                        setPredeterminadoEdicion(!!e.predeterminado);
                      }}
                      style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                    >
                      ✏️ Editar
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => eliminar(e)} style={{ ...estiloBotonPeligro, padding: "6px 12px" }}>
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
