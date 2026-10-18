"use client";

import { useState, type FormEvent } from "react";
import type { TipoVentaDto } from "@/lib/dto";
import { Cabecera, comparar, estiloBotonPeligro, estiloPanel, useOrden, usePeticion } from "./utilidades";

interface Props {
  tipos: TipoVentaDto[];
  setTipos: (fn: (prev: TipoVentaDto[]) => TipoVentaDto[]) => void;
}

/** Pestaña «Pagos» (tipos de venta): nombre, color y orden en el panel. La categoría se deduce del nombre. */
export default function PestanaPagos({ tipos, setTipos }: Props) {
  const { cargando, llamar, ejecutar } = usePeticion();
  const orden = useOrden("id");
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [ordenNuevo, setOrdenNuevo] = useState(0);
  const [requiereNuevo, setRequiereNuevo] = useState(false);
  const [tasaNuevo, setTasaNuevo] = useState(true);
  const [ordenes, setOrdenes] = useState<Record<number, number>>({});
  const [editando, setEditando] = useState<number | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState("");
  const [colorEdicion, setColorEdicion] = useState("#3b82f6");

  const valor = (t: TipoVentaDto): string | number => (orden.campo === "nombre" ? t.nombre_tipo_venta : orden.campo === "orden" ? t.orden : t.id_tipo_de_venta);
  const ordenados = [...tipos].sort((a, b) => comparar(valor(a), valor(b), orden.asc));
  const hayCambiosDeOrden = tipos.some((t) => ordenes[t.id_tipo_de_venta] !== undefined && ordenes[t.id_tipo_de_venta] !== t.orden);

  const crear = async (ev: FormEvent) => {
    ev.preventDefault();
    const ok = await ejecutar(async () => {
      const n = await llamar<TipoVentaDto>("/api/admin/catalogos", "POST", { tipo: "tipo_venta", nombre_tipo_venta: nombre, color, orden: ordenNuevo, requiere_rci_al_matricular: requiereNuevo, cuenta_para_tasa: tasaNuevo }, "Error al crear el tipo de venta");
      setTipos((prev) => [...prev, n]);
    }, "Tipo de venta creado con éxito");
    if (ok) {
      setNombre("");
      setColor("#3b82f6");
      setOrdenNuevo(0);
      setRequiereNuevo(false);
      setTasaNuevo(true);
    }
  };

  const guardarEdicion = async (ev: FormEvent) => {
    ev.preventDefault();
    if (editando === null) return;
    const actual = tipos.find((t) => t.id_tipo_de_venta === editando);
    const ok = await ejecutar(async () => {
      const n = await llamar<TipoVentaDto>(
        "/api/admin/catalogos",
        "PUT",
        { tipo: "tipo_venta", id: editando, nombre_tipo_venta: nombreEdicion, color: colorEdicion, orden: actual?.orden ?? 0 },
        "Error al actualizar el tipo de venta",
      );
      setTipos((prev) => prev.map((t) => (t.id_tipo_de_venta === editando ? n : t)));
    }, "Tipo de venta actualizado correctamente");
    if (ok) setEditando(null);
  };

  /** Cambia «Requerido al matricular» al momento (los demás datos del tipo no se tocan). */
  const cambiarRequiere = async (t: TipoVentaDto, requiere: boolean) => {
    await ejecutar(async () => {
      const n = await llamar<TipoVentaDto>(
        "/api/admin/catalogos",
        "PUT",
        { tipo: "tipo_venta", id: t.id_tipo_de_venta, nombre_tipo_venta: t.nombre_tipo_venta, color: t.color ?? "#3b82f6", orden: t.orden, categoria: t.categoria, requiere_rci_al_matricular: requiere },
        "Error al guardar el ajuste",
      );
      setTipos((prev) => prev.map((x) => (x.id_tipo_de_venta === t.id_tipo_de_venta ? n : x)));
    }, requiere ? `«${t.nombre_tipo_venta}»: ahora exige fecha RCI para matricular` : `«${t.nombre_tipo_venta}»: ya no exige fecha RCI para matricular`);
  };

  /** Cambia «Cuenta para la tasa» al momento (los demás datos del tipo no se tocan). */
  const cambiarTasa = async (t: TipoVentaDto, cuenta: boolean) => {
    await ejecutar(async () => {
      const n = await llamar<TipoVentaDto>(
        "/api/admin/catalogos",
        "PUT",
        { tipo: "tipo_venta", id: t.id_tipo_de_venta, nombre_tipo_venta: t.nombre_tipo_venta, color: t.color ?? "#3b82f6", orden: t.orden, categoria: t.categoria, cuenta_para_tasa: cuenta },
        "Error al guardar el ajuste",
      );
      setTipos((prev) => prev.map((x) => (x.id_tipo_de_venta === t.id_tipo_de_venta ? n : x)));
    }, cuenta ? `«${t.nombre_tipo_venta}»: ahora suma a la tasa de intervención financiera` : `«${t.nombre_tipo_venta}»: ya no suma a la tasa de intervención financiera`);
  };

  const guardarOrdenes = async () => {
    const ok = await ejecutar(async () => {
      for (const t of tipos) {
        const nuevo = ordenes[t.id_tipo_de_venta];
        if (nuevo === undefined || nuevo === t.orden) continue;
        await llamar("/api/admin/catalogos", "PUT", { tipo: "tipo_venta", id: t.id_tipo_de_venta, nombre_tipo_venta: t.nombre_tipo_venta, color: t.color ?? "#3b82f6", orden: nuevo, categoria: t.categoria }, "Error al guardar el orden");
      }
      setTipos((prev) => prev.map((t) => (ordenes[t.id_tipo_de_venta] !== undefined ? { ...t, orden: ordenes[t.id_tipo_de_venta] } : t)));
    }, "Orden de los tipos de pago guardado correctamente");
    if (ok) setOrdenes({});
  };

  const eliminar = (t: TipoVentaDto) => {
    if (!confirm("¿Seguro que deseas eliminar este tipo de venta?")) return;
    void ejecutar(async () => {
      await llamar("/api/admin/catalogos", "DELETE", { tipo: "tipo_venta", id: t.id_tipo_de_venta }, "Error al eliminar");
      setTipos((prev) => prev.filter((x) => x.id_tipo_de_venta !== t.id_tipo_de_venta));
    }, "Tipo de venta eliminado");
  };

  return (
    <div className="glass-panel" style={estiloPanel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: "1.15rem", margin: 0 }}>Tipos de Venta (Pagos)</h3>
        {hayCambiosDeOrden && (
          <button type="button" className="btn btn-primary" onClick={() => void guardarOrdenes()} disabled={cargando} style={{ padding: "8px 16px", fontSize: "0.85rem" }}>
            💾 Guardar Cambios de Orden
          </button>
        )}
      </div>

      <form onSubmit={crear} style={{ display: "flex", gap: "15px", alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" className="form-input" placeholder="Ej. Financiación Preference" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={cargando} required style={{ flex: 1, minWidth: "200px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Color:</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: "36px", height: "36px", padding: 0, border: "1px solid var(--border-light)", borderRadius: "4px", cursor: "pointer" }} title="Elige el color para este tipo de pago" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Orden Dashboard:</label>
          <input type="number" className="form-input" value={ordenNuevo} onChange={(e) => setOrdenNuevo(Number(e.target.value))} style={{ width: "80px", padding: "6px" }} min={0} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input type="checkbox" id="chkRequiereRciNuevo" checked={requiereNuevo} onChange={(e) => setRequiereNuevo(e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
          <label htmlFor="chkRequiereRciNuevo" style={{ fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }} title="Si lo marcas, los expedientes con este pago no se podrán matricular sin fecha RCI">
            Requerido al matricular
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input type="checkbox" id="chkTasaNuevo" checked={tasaNuevo} onChange={(e) => setTasaNuevo(e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
          <label htmlFor="chkTasaNuevo" style={{ fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }} title="Si lo marcas, los expedientes con este pago suman a la tasa de intervención financiera del mes">
            Cuenta para la tasa
          </label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={cargando}>
          + Crear Tipo Pago
        </button>
      </form>

      <div className="table-container">
        <table className="table-premium">
          <thead>
            <tr>
              <Cabecera etiqueta="Nombre Tipo Venta" campo="nombre" orden={orden} />
              <th>Color Asignado</th>
              <th title="Si es Sí, un expediente con este tipo de pago no se puede matricular sin fecha RCI (fecha de contratación de la financiera), que se tiene en cuenta en las comisiones">Requerido al Matricular</th>
              <th title="Si es Sí, los expedientes con este tipo de pago suman a la tasa de intervención financiera (se cuentan en el mes de su fecha RCI)">Cuenta para la tasa</th>
              <Cabecera etiqueta="Orden Dashboard" campo="orden" orden={orden} ancho="180px" />
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((t) => (
              <tr key={t.id_tipo_de_venta}>
                <td>
                  {editando === t.id_tipo_de_venta ? (
                    <form onSubmit={guardarEdicion} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input type="text" className="form-input" value={nombreEdicion} onChange={(e) => setNombreEdicion(e.target.value)} style={{ padding: "4px 8px", fontSize: "0.85rem" }} required autoFocus />
                      <input type="color" value={colorEdicion} onChange={(e) => setColorEdicion(e.target.value)} style={{ width: "30px", height: "30px", padding: 0, border: "1px solid var(--border-light)", borderRadius: "4px", cursor: "pointer" }} />
                      <button type="submit" className="btn btn-primary" style={{ padding: "4px 8px" }} disabled={cargando}>✓</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)} style={{ padding: "4px 8px" }}>✗</button>
                    </form>
                  ) : (
                    <span style={{ fontWeight: 600 }}>{t.nombre_tipo_venta}</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ backgroundColor: t.color || "#3b82f6", display: "inline-block", width: "16px", height: "16px", borderRadius: "50%", border: "1px solid var(--border-light)" }}></span>
                    <span style={{ fontSize: "0.85rem", fontFamily: "monospace" }}>{t.color || "#3b82f6"}</span>
                  </div>
                </td>
                <td>
                  <select className="form-select" value={t.requiere_rci_al_matricular ? "si" : "no"} onChange={(e) => void cambiarRequiere(t, e.target.value === "si")} disabled={cargando} style={{ width: "90px", padding: "4px 8px", fontSize: "0.85rem", fontWeight: 700, color: t.requiere_rci_al_matricular ? "var(--warning)" : "var(--text-secondary)" }} title="¿Exige fecha RCI para poder matricular?">
                    <option value="si">Sí</option>
                    <option value="no">No</option>
                  </select>
                </td>
                <td>
                  <select className="form-select" value={t.cuenta_para_tasa ? "si" : "no"} onChange={(e) => void cambiarTasa(t, e.target.value === "si")} disabled={cargando} style={{ width: "90px", padding: "4px 8px", fontSize: "0.85rem", fontWeight: 700, color: t.cuenta_para_tasa ? "var(--success)" : "var(--text-secondary)" }} title="¿Suma a la tasa de intervención financiera?">
                    <option value="si">Sí</option>
                    <option value="no">No</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    className="form-input"
                    value={ordenes[t.id_tipo_de_venta] ?? t.orden ?? 0}
                    onChange={(e) => setOrdenes({ ...ordenes, [t.id_tipo_de_venta]: Number(e.target.value) })}
                    style={{ width: "80px", padding: "4px 8px", fontSize: "0.85rem" }}
                    min={0}
                    disabled={cargando}
                  />
                </td>
                <td>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditando(t.id_tipo_de_venta);
                        setNombreEdicion(t.nombre_tipo_venta);
                        setColorEdicion(t.color || "#3b82f6");
                      }}
                      style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                    >
                      ✏️ Editar
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => eliminar(t)} style={{ ...estiloBotonPeligro, padding: "6px 12px" }}>
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
