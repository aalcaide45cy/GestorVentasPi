"use client";

import { useState, type FormEvent } from "react";
import type { MarcaDto, ModeloDto } from "@/lib/dto";
import { EtiquetaMarca, PuntoMarca } from "@/components/etiquetas";
import SelectorColor from "@/components/SelectorColor";
import { Cabecera, comparar, estiloBotonPeligro, estiloCheck, estiloEtiquetaCheck, estiloPanel, useOrden, usePeticion } from "./utilidades";

export type MarcaConModelos = MarcaDto & { modelos: ModeloDto[] };

interface Props {
  marcas: MarcaConModelos[];
  setMarcas: (fn: (prev: MarcaConModelos[]) => MarcaConModelos[]) => void;
}

/** Pestaña «Marcas». */
export default function PestanaMarcas({ marcas, setMarcas }: Props) {
  const { cargando, llamar, ejecutar, confirmar, notificar } = usePeticion();
  const orden = useOrden("id");
  const [nombre, setNombre] = useState("");
  const [accesoRapido, setAccesoRapido] = useState(false);
  const [sistemaComisiones, setSistemaComisiones] = useState(false);
  /** Color de la marca nueva (vacío = sin color: texto normal, sin cápsula). */
  const [color, setColor] = useState("");
  /** Punto de la marca nueva: símbolo (vacío = un punto «●») y color (vacío = sin punto). */
  const [punto, setPunto] = useState("");
  const [puntoColor, setPuntoColor] = useState("");
  /** Símbolos que se están escribiendo en la tabla (se guardan al salir del campo). */
  const [puntosEscritos, setPuntosEscritos] = useState<Record<number, string>>({});
  const [editando, setEditando] = useState<number | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState("");

  const valor = (m: MarcaConModelos): string | number => {
    switch (orden.campo) {
      case "nombre":
        return m.nombre;
      case "activo":
        return m.activo ? 1 : 0;
      case "acceso_rapido":
        return m.acceso_rapido ? 1 : 0;
      case "sistema_comisiones":
        return m.sistema_comisiones ? 1 : 0;
      case "color":
        return m.color ?? "";
      case "punto":
        return m.punto_color ?? "~";
      case "modelos":
        return m.modelos.length;
      default:
        return m.id_marca;
    }
  };
  const ordenadas = [...marcas].sort((a, b) => comparar(valor(a), valor(b), orden.asc));

  const crear = async (ev: FormEvent) => {
    ev.preventDefault();
    const ok = await ejecutar(async () => {
      const n = await llamar<MarcaDto>(
        "/api/admin/catalogos",
        "POST",
        { tipo: "marca", nombre, acceso_rapido: accesoRapido, sistema_comisiones: sistemaComisiones, color: color || null, punto: punto.trim() || null, punto_color: puntoColor || null },
        "Error al crear la marca",
      );
      setMarcas((prev) => [...prev, { ...n, modelos: [] }]);
    }, "Marca creada con éxito");
    if (ok) {
      setNombre("");
      setAccesoRapido(false);
      setSistemaComisiones(false);
      setColor("");
      setPunto("");
      setPuntoColor("");
    }
  };

  /** Cambia (o quita) el color de la marca al momento; los demás datos no se tocan. */
  const cambiarColor = (m: MarcaConModelos, nuevo: string | null) =>
    ejecutar(async () => {
      await llamar("/api/admin/catalogos", "PUT", { tipo: "marca", id: m.id_marca, nombre: m.nombre, acceso_rapido: !!m.acceso_rapido, sistema_comisiones: !!m.sistema_comisiones, color: nuevo }, "Error al guardar el color");
      setMarcas((prev) => prev.map((x) => (x.id_marca === m.id_marca ? { ...x, color: nuevo } : x)));
    }, nuevo ? `Color de «${m.nombre}» actualizado` : `«${m.nombre}» ya no tiene color`);

  /** Cambia el símbolo y/o el color del punto de la marca al momento; los demás datos no se tocan. */
  const cambiarPunto = (m: MarcaConModelos, cambios: { punto?: string | null; punto_color?: string | null }) =>
    ejecutar(async () => {
      await llamar("/api/admin/catalogos", "PUT", { tipo: "marca", id: m.id_marca, nombre: m.nombre, acceso_rapido: !!m.acceso_rapido, sistema_comisiones: !!m.sistema_comisiones, ...cambios }, "Error al guardar el punto");
      setMarcas((prev) => prev.map((x) => (x.id_marca === m.id_marca ? { ...x, ...(cambios.punto !== undefined ? { punto: cambios.punto } : {}), ...(cambios.punto_color !== undefined ? { punto_color: cambios.punto_color } : {}) } : x)));
    }, `Punto de «${m.nombre}» actualizado`);

  /** Guarda el símbolo escrito en la tabla al salir del campo, si ha cambiado. */
  const guardarPuntoEscrito = (m: MarcaConModelos) => {
    const escrito = puntosEscritos[m.id_marca];
    if (escrito === undefined) return;
    setPuntosEscritos((p) => Object.fromEntries(Object.entries(p).filter(([k]) => Number(k) !== m.id_marca)));
    if ((escrito.trim() || null) !== (m.punto ?? null)) void cambiarPunto(m, { punto: escrito.trim() || null });
  };

  const guardarNombre = async (ev: FormEvent) => {
    ev.preventDefault();
    if (editando === null) return;
    const actual = marcas.find((m) => m.id_marca === editando);
    const ok = await ejecutar(async () => {
      await llamar("/api/admin/catalogos", "PUT", { tipo: "marca", id: editando, nombre: nombreEdicion, acceso_rapido: !!actual?.acceso_rapido, sistema_comisiones: !!actual?.sistema_comisiones }, "Error al actualizar la marca");
      setMarcas((prev) => prev.map((m) => (m.id_marca === editando ? { ...m, nombre: nombreEdicion } : m)));
    }, "Marca actualizada correctamente");
    if (ok) setEditando(null);
  };

  const alternar = (m: MarcaConModelos, campo: "acceso_rapido" | "sistema_comisiones") =>
    ejecutar(async () => {
      const nuevo = !m[campo];
      await llamar(
        "/api/admin/catalogos",
        "PUT",
        { tipo: "marca", id: m.id_marca, nombre: m.nombre, acceso_rapido: campo === "acceso_rapido" ? nuevo : !!m.acceso_rapido, sistema_comisiones: campo === "sistema_comisiones" ? nuevo : !!m.sistema_comisiones },
        "Error al actualizar la marca",
      );
      setMarcas((prev) => prev.map((x) => (x.id_marca === m.id_marca ? { ...x, [campo]: nuevo } : x)));
    }, campo === "acceso_rapido" ? "Acceso rápido de la marca actualizado" : "Sistema de comisiones de la marca actualizado");

  const alternarActiva = (m: MarcaConModelos) =>
    ejecutar(async () => {
      const nuevo = !m.activo;
      await llamar("/api/admin/catalogos", "DELETE", { tipo: "marca", id: m.id_marca, toggleActivo: true, activo: nuevo }, "Error al cambiar estado de la marca");
      setMarcas((prev) => prev.map((x) => (x.id_marca === m.id_marca ? { ...x, activo: nuevo } : x)));
    }, m.activo ? "Marca desactivada" : "Marca activada");

  const eliminar = async (m: MarcaConModelos) => {
    // Primero se mira si hay expedientes con esa marca: en ese caso no se borra y se dice cuáles son los modelos afectados
    try {
      const res = await fetch(`/api/admin/catalogos?usos_marca=${m.id_marca}`, { method: "PATCH" });
      if (res.ok) {
        const usos = ((await res.json()) as { data: { expedientes: number; modelos: { nombre: string; usos: number }[] } }).data;
        if (usos.expedientes > 0) {
          await notificar({ titulo: `No se puede eliminar «${m.nombre}» todavía`, texto: `Tiene ${usos.expedientes} expediente${usos.expedientes === 1 ? "" : "s"}.`, detalles: [...usos.modelos.map((x) => `${x.nombre}: ${x.usos} expediente${x.usos === 1 ? "" : "s"}`), "Elimina antes esos modelos (en la pestaña Modelos): al eliminar cada uno te pregunto a qué modelo pasan sus expedientes.", "Después podrás eliminar la marca."], tipo: "aviso" });
          return;
        }
      }
    } catch {
      /* sin el dato, el servidor lo comprueba igualmente */
    }
    if (!(await confirmar({ texto: `¿Eliminar la marca «${m.nombre}»? Se eliminarán también todos sus modelos (no hay expedientes que los usen).`, peligro: true }))) return;
    void ejecutar(async () => {
      await llamar("/api/admin/catalogos", "DELETE", { tipo: "marca", id: m.id_marca }, "Error al eliminar la marca");
      setMarcas((prev) => prev.filter((x) => x.id_marca !== m.id_marca));
    }, "Marca eliminada con éxito");
  };

  return (
    <div className="glass-panel" style={estiloPanel}>
      <h3 style={{ fontSize: "1.15rem" }}>Gestión de Marcas</h3>

      <form onSubmit={crear} style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" className="form-input" placeholder="Nombre de nueva marca... (Ej. Nissan)" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={cargando} required style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Borde de la cápsula:</label>
          <SelectorColor valor={color || null} alCambiar={(v) => setColor(v ?? "")} titulo="Borde de la cápsula de la marca" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Punto:</label>
          <input type="text" className="form-input" maxLength={8} placeholder="●" value={punto} onChange={(e) => setPunto(e.target.value)} style={{ width: "64px", textAlign: "center" }} title="El símbolo de la columna del punto: un punto, una coma, un emoticono… Vacío = un punto" />
          <SelectorColor valor={puntoColor || null} alCambiar={(v) => setPuntoColor(v ?? "")} titulo="Color del punto de la marca" permitirVacio={false} />
          {puntoColor || punto ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "4px 8px", fontSize: "0.75rem" }}
              onClick={() => {
                setPunto("");
                setPuntoColor("");
              }}
            >
              Sin punto
            </button>
          ) : (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>sin punto</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input type="checkbox" id="chkMarcaAccesoRapido" checked={accesoRapido} onChange={(e) => setAccesoRapido(e.target.checked)} style={estiloCheck} />
          <label htmlFor="chkMarcaAccesoRapido" style={estiloEtiquetaCheck}>Acceso Rápido</label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input type="checkbox" id="chkMarcaSistemaComisiones" checked={sistemaComisiones} onChange={(e) => setSistemaComisiones(e.target.checked)} style={estiloCheck} />
          <label htmlFor="chkMarcaSistemaComisiones" style={estiloEtiquetaCheck}>Sist. Comisiones</label>
        </div>
        <button type="submit" className="btn btn-primary" style={{ padding: "12px 20px" }} disabled={cargando}>
          + Crear Marca
        </button>
      </form>

      <div className="table-container">
        <table className="table-premium">
          <thead>
            <tr>
              <Cabecera etiqueta="Nombre Marca" campo="nombre" orden={orden} />
              <Cabecera etiqueta="Borde de la cápsula" campo="color" orden={orden} />
              <Cabecera etiqueta="Punto" campo="punto" orden={orden} />
              <Cabecera etiqueta="Estado" campo="activo" orden={orden} />
              <Cabecera etiqueta="Acceso Rápido" campo="acceso_rapido" orden={orden} />
              <Cabecera etiqueta="Sist. Comisiones" campo="sistema_comisiones" orden={orden} />
              <Cabecera etiqueta="Modelos Asoc." campo="modelos" orden={orden} />
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((m) => (
              <tr key={m.id_marca}>
                <td>
                  {editando === m.id_marca ? (
                    <form onSubmit={guardarNombre} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input type="text" className="form-input" value={nombreEdicion} onChange={(e) => setNombreEdicion(e.target.value)} style={{ padding: "6px 10px", fontSize: "0.85rem" }} required autoFocus />
                      <button type="submit" className="btn btn-primary" style={{ padding: "6px 10px" }} disabled={cargando}>✓</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)} style={{ padding: "6px 10px" }}>✗</button>
                    </form>
                  ) : (
                    <span style={{ fontWeight: 600, color: m.activo ? "var(--text-primary)" : "var(--text-muted)" }}>{m.nombre}</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                    <SelectorColor valor={m.color} alCambiar={(v) => void cambiarColor(m, v)} disabled={cargando} titulo={`Borde de la cápsula de ${m.nombre}`} />
                    {m.color && <EtiquetaMarca texto={m.nombre} color={m.color} />}
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                    <input type="text" className="form-input" maxLength={8} placeholder="●" value={puntosEscritos[m.id_marca] ?? m.punto ?? ""} onChange={(e) => setPuntosEscritos((p) => ({ ...p, [m.id_marca]: e.target.value }))} onBlur={() => guardarPuntoEscrito(m)} disabled={cargando} style={{ width: "60px", textAlign: "center", padding: "4px" }} title="Símbolo del punto: un punto, una coma, un emoticono… Vacío = un punto" />
                    <SelectorColor valor={m.punto_color} alCambiar={(v) => void cambiarPunto(m, { punto_color: v })} disabled={cargando} titulo={`Color del punto de ${m.nombre}`} textoVacio={<span style={{ color: "var(--text-muted)" }}>sin color</span>} />
                    {m.punto_color || m.punto ? (
                      <>
                        <PuntoMarca punto={m.punto} color={m.punto_color} />
                        <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.72rem" }} onClick={() => void cambiarPunto(m, { punto: null, punto_color: null })} disabled={cargando} title="Quitar el punto de esta marca">
                          Quitar
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>sin punto</span>
                    )}
                  </div>
                </td>
                <td>
                  <span className={`badge ${m.activo ? "badge-tienda" : "badge-admin"}`} style={{ fontSize: "0.75rem" }}>
                    {m.activo ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td>
                  <button type="button" className={`badge ${m.acceso_rapido ? "badge-tienda" : "badge-admin"}`} onClick={() => void alternar(m, "acceso_rapido")} disabled={cargando} style={{ border: "none", cursor: "pointer", fontSize: "0.75rem" }} title="Alternar Acceso Rápido">
                    {m.acceso_rapido ? "⭐ Sí" : "✖ No"}
                  </button>
                </td>
                <td>
                  <button type="button" className={`badge ${m.sistema_comisiones ? "badge-tienda" : "badge-admin"}`} onClick={() => void alternar(m, "sistema_comisiones")} disabled={cargando} style={{ border: "none", cursor: "pointer", fontSize: "0.75rem" }} title="Alternar en Sistema de Comisiones">
                    {m.sistema_comisiones ? "✓ Activo" : "✖ Inactivo"}
                  </button>
                </td>
                <td>{m.modelos.length} modelo(s)</td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditando(m.id_marca);
                        setNombreEdicion(m.nombre);
                      }}
                      style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                    >
                      ✏️ Editar
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => void alternarActiva(m)} style={{ padding: "6px 10px", fontSize: "0.8rem", color: m.activo ? "var(--warning)" : "var(--success)" }}>
                      {m.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => eliminar(m)} style={estiloBotonPeligro}>
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
