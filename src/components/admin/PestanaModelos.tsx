"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import type { ModeloDto } from "@/lib/dto";
import type { MarcaConModelos } from "./PestanaMarcas";
import { Cabecera, comparar, estiloBotonPeligro, estiloCheck, estiloEtiquetaCheck, estiloPanel, useOrden, usePeticion } from "./utilidades";

interface Props {
  marcas: MarcaConModelos[];
  setMarcas: (fn: (prev: MarcaConModelos[]) => MarcaConModelos[]) => void;
}

interface FilaModelo {
  modelo: ModeloDto;
  idMarca: number;
  nombreMarca: string;
  sistemaComisiones: boolean;
}

/** Pestaña «Modelos»: marcas con sistema de comisiones primero y el resto agrupado. */
export default function PestanaModelos({ marcas, setMarcas }: Props) {
  const router = useRouter();
  const { cargando, llamar, ejecutar } = usePeticion();
  const orden = useOrden("orden_acceso_rapido");
  const [marcaNueva, setMarcaNueva] = useState<number | "">("");
  const [nombre, setNombre] = useState("");
  const [accesoRapido, setAccesoRapido] = useState(false);
  const [ordenNuevo, setOrdenNuevo] = useState(0);
  const [filtro, setFiltro] = useState("");
  const [ordenesTemporales, setOrdenesTemporales] = useState<Record<number, number>>({});
  const [editando, setEditando] = useState<number | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState("");

  const filas: FilaModelo[] = marcas.flatMap((m) =>
    m.modelos.map((modelo) => ({ modelo, idMarca: m.id_marca, nombreMarca: m.nombre, sistemaComisiones: m.sistema_comisiones })),
  );
  const q = filtro.toLowerCase();
  const filtradas = filas.filter((f) => !q || f.modelo.nombre_modelo.toLowerCase().includes(q) || f.nombreMarca.toLowerCase().includes(q));

  const ordenadas = [...filtradas].sort((a, b) => {
    const porMarca = a.nombreMarca.localeCompare(b.nombreMarca, "es");
    const porNombre = a.modelo.nombre_modelo.localeCompare(b.modelo.nombre_modelo, "es");
    let r: number;
    switch (orden.campo) {
      case "nombre":
        r = comparar(a.modelo.nombre_modelo, b.modelo.nombre_modelo, true);
        break;
      case "acceso_rapido":
        r = Number(!!a.modelo.acceso_rapido) - Number(!!b.modelo.acceso_rapido);
        break;
      case "orden_acceso_rapido":
        r = (a.modelo.orden_acceso_rapido ?? 0) - (b.modelo.orden_acceso_rapido ?? 0);
        break;
      default:
        r = porMarca || porNombre;
    }
    return orden.asc ? r : -r;
  });

  const crear = async (ev: FormEvent) => {
    ev.preventDefault();
    if (marcaNueva === "") return;
    const ok = await ejecutar(async () => {
      const n = await llamar<ModeloDto>(
        "/api/admin/catalogos",
        "POST",
        { tipo: "modelo", marca_id: marcaNueva, nombre_modelo: nombre, acceso_rapido: accesoRapido, orden_acceso_rapido: accesoRapido ? ordenNuevo : 0 },
        "Error al crear el modelo",
      );
      setMarcas((prev) => prev.map((m) => (m.id_marca === marcaNueva ? { ...m, modelos: [...m.modelos, n] } : m)));
    }, "Modelo creado con éxito");
    if (ok) {
      setNombre("");
      setAccesoRapido(false);
      setOrdenNuevo(0);
    }
  };

  const actualizar = (f: FilaModelo, cambios: { nombre_modelo?: string; acceso_rapido?: boolean; orden_acceso_rapido?: number }, exito: string) =>
    ejecutar(async () => {
      const m = f.modelo;
      const nuevo = {
        nombre_modelo: cambios.nombre_modelo ?? m.nombre_modelo,
        acceso_rapido: cambios.acceso_rapido ?? !!m.acceso_rapido,
        orden_acceso_rapido: cambios.orden_acceso_rapido ?? m.orden_acceso_rapido ?? 0,
      };
      await llamar("/api/admin/catalogos", "PUT", { tipo: "modelo", id: m.id_modelo, ...nuevo }, "Error al actualizar el modelo");
      setMarcas((prev) =>
        prev.map((x) => (x.id_marca === f.idMarca ? { ...x, modelos: x.modelos.map((y) => (y.id_modelo === m.id_modelo ? { ...y, ...nuevo } : y)) } : x)),
      );
    }, exito);

  const guardarNombre = async (ev: FormEvent, f: FilaModelo) => {
    ev.preventDefault();
    if (await actualizar(f, { nombre_modelo: nombreEdicion }, "Modelo actualizado correctamente")) setEditando(null);
  };

  const guardarOrdenes = async (lista: FilaModelo[]) => {
    const cambios = lista.filter((f) => ordenesTemporales[f.modelo.id_modelo] !== undefined && ordenesTemporales[f.modelo.id_modelo] !== f.modelo.orden_acceso_rapido);
    const ok = await ejecutar(async () => {
      for (const f of cambios) {
        const nuevo = ordenesTemporales[f.modelo.id_modelo];
        await llamar("/api/admin/catalogos", "PUT", { tipo: "modelo", id: f.modelo.id_modelo, nombre_modelo: f.modelo.nombre_modelo, acceso_rapido: !!f.modelo.acceso_rapido, orden_acceso_rapido: nuevo }, "Error al guardar el orden");
      }
      setMarcas((prev) =>
        prev.map((x) => ({
          ...x,
          modelos: x.modelos.map((y) => (ordenesTemporales[y.id_modelo] !== undefined ? { ...y, orden_acceso_rapido: ordenesTemporales[y.id_modelo] } : y)),
        })),
      );
    }, "Orden de modelos guardado correctamente");
    if (ok) setOrdenesTemporales({});
  };

  // Eliminar un modelo que usan expedientes: se pregunta a qué modelo pasan (uno que ya existe, uno nuevo o ninguno)
  const [reasignando, setReasignando] = useState<{ fila: FilaModelo; usos: number } | null>(null);
  const [destino, setDestino] = useState<string>("");
  const [nombreNuevoDestino, setNombreNuevoDestino] = useState("");

  const quitarDeLista = (f: FilaModelo) => setMarcas((prev) => prev.map((x) => (x.id_marca === f.idMarca ? { ...x, modelos: x.modelos.filter((y) => y.id_modelo !== f.modelo.id_modelo) } : x)));

  const eliminar = async (f: FilaModelo) => {
    let usos = 0;
    try {
      const res = await fetch(`/api/admin/catalogos?usos_modelo=${f.modelo.id_modelo}`, { method: "PATCH" });
      if (res.ok) usos = ((await res.json()) as { data: { expedientes: number } }).data.expedientes;
    } catch {
      /* sin el dato se pregunta igual por si el servidor lo exige */
    }
    if (usos > 0) {
      // Por defecto, otro modelo de la misma marca (el que más se le parece por nombre, p. ej. Sandero para Sandero Stepway)
      const mismos = marcas.find((m) => m.id_marca === f.idMarca)?.modelos.filter((y) => y.id_modelo !== f.modelo.id_modelo) ?? [];
      const base = f.modelo.nombre_modelo.toLowerCase();
      const parecido = [...mismos].sort((a, b) => b.nombre_modelo.length - a.nombre_modelo.length).find((y) => base.startsWith(y.nombre_modelo.toLowerCase()));
      setDestino(parecido ? String(parecido.id_modelo) : mismos[0] ? String(mismos[0].id_modelo) : "nuevo");
      setNombreNuevoDestino("");
      setReasignando({ fila: f, usos });
      return;
    }
    if (!confirm("¿Seguro que deseas eliminar este modelo? Se borrará del catálogo.")) return;
    void ejecutar(async () => {
      await llamar("/api/admin/catalogos", "DELETE", { tipo: "modelo", id: f.modelo.id_modelo }, "Error al eliminar modelo");
      quitarDeLista(f);
    }, "Modelo eliminado");
  };

  const confirmarReasignacion = async () => {
    if (!reasignando) return;
    const { fila, usos } = reasignando;
    const cuerpo: Record<string, unknown> = { tipo: "modelo", id: fila.modelo.id_modelo };
    if (destino === "nuevo") cuerpo.crear_modelo = { marca_id: fila.idMarca, nombre: nombreNuevoDestino };
    else if (destino === "ninguno") cuerpo.sin_modelo = true;
    else cuerpo.reasignar_a = Number(destino);
    const ok = await ejecutar(async () => {
      await llamar("/api/admin/catalogos", "DELETE", cuerpo, "Error al eliminar modelo");
      quitarDeLista(fila);
    }, `Modelo eliminado: ${usos} expediente${usos === 1 ? "" : "s"} cambiado${usos === 1 ? "" : "s"} de modelo`);
    if (ok) {
      setReasignando(null);
      // El modelo nuevo aparece al recargar la lista
      if (destino === "nuevo") router.refresh();
    }
  };

  const tabla = (lista: FilaModelo[], vacio: string) => (
    <div className="table-container">
      <table className="table-premium">
        <thead>
          <tr>
            <Cabecera etiqueta="Marca" campo="marca" orden={orden} />
            <Cabecera etiqueta="Nombre Modelo" campo="nombre" orden={orden} />
            <Cabecera etiqueta="Acceso Rápido" campo="acceso_rapido" orden={orden} />
            <Cabecera etiqueta="Orden Dashboard" campo="orden_acceso_rapido" orden={orden} />
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((f) => {
            const m = f.modelo;
            return (
              <tr key={m.id_modelo}>
                <td>
                  <span style={{ fontSize: "0.85rem", color: "var(--primary)", fontWeight: "bold", textTransform: "uppercase" }}>{f.nombreMarca}</span>
                </td>
                <td>
                  {editando === m.id_modelo ? (
                    <form onSubmit={(ev) => void guardarNombre(ev, f)} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input type="text" className="form-input" value={nombreEdicion} onChange={(e) => setNombreEdicion(e.target.value)} style={{ padding: "4px 8px", fontSize: "0.85rem" }} required autoFocus />
                      <button type="submit" className="btn btn-primary" style={{ padding: "4px 8px" }} disabled={cargando}>✓</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)} style={{ padding: "4px 8px" }}>✗</button>
                    </form>
                  ) : (
                    <span style={{ fontSize: "0.95rem", fontWeight: 500 }}>{m.nombre_modelo}</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className={`badge ${m.acceso_rapido ? "badge-tienda" : "badge-admin"}`}
                    onClick={() => void actualizar(f, { acceso_rapido: !m.acceso_rapido }, "Acceso rápido del modelo actualizado")}
                    disabled={cargando}
                    style={{ border: "none", cursor: "pointer", fontSize: "0.75rem" }}
                    title="Alternar Acceso Rápido"
                  >
                    {m.acceso_rapido ? "⭐ Sí" : "✖ No"}
                  </button>
                </td>
                <td>
                  {m.acceso_rapido ? (
                    <input
                      type="number"
                      className="form-input"
                      value={ordenesTemporales[m.id_modelo] ?? m.orden_acceso_rapido ?? 0}
                      onChange={(e) => setOrdenesTemporales({ ...ordenesTemporales, [m.id_modelo]: Number(e.target.value) })}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      style={{ width: "70px", padding: "4px 8px", fontSize: "0.85rem", textAlign: "center" }}
                      disabled={cargando}
                    />
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>—</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditando(m.id_modelo);
                        setNombreEdicion(m.nombre_modelo);
                      }}
                      style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                    >
                      ✏️ Editar
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => void eliminar(f)} style={estiloBotonPeligro}>
                      🗑️ Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {lista.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: "15px" }}>
                {vacio}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const hayCambiosDeOrden = (lista: FilaModelo[]) =>
    lista.some((f) => ordenesTemporales[f.modelo.id_modelo] !== undefined && ordenesTemporales[f.modelo.id_modelo] !== f.modelo.orden_acceso_rapido);

  const cabeceraBloque = (titulo: React.ReactNode, lista: FilaModelo[]) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h4 style={{ fontSize: "1.05rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}>{titulo}</h4>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {hayCambiosDeOrden(lista) && (
          <button type="button" className="btn btn-primary" onClick={() => void guardarOrdenes(lista)} style={{ padding: "4px 10px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }} disabled={cargando}>
            💾 Guardar Orden
          </button>
        )}
        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>{lista.length} modelo(s)</span>
      </div>
    </div>
  );

  const restoDeMarcas = ordenadas.filter((f) => !f.sistemaComisiones);

  return (
    <div className="glass-panel" style={estiloPanel}>
      <h3 style={{ fontSize: "1.15rem" }}>Gestión de Modelos</h3>

      <form onSubmit={crear} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <select
          className="form-select"
          value={marcaNueva}
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : "";
            setMarcaNueva(v);
            const marca = marcas.find((m) => m.id_marca === v);
            const n = marca?.nombre.toLowerCase().trim();
            setAccesoRapido(n === "renault" || n === "dacia");
          }}
          required
          style={{ flex: 1, minWidth: "160px" }}
        >
          <option value="">Selecciona Marca</option>
          {marcas.filter((m) => m.activo).map((m) => (
            <option key={m.id_marca} value={m.id_marca}>{m.nombre}</option>
          ))}
        </select>
        <input type="text" className="form-input" placeholder="Nombre de modelo... (Ej. Qashqai)" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={cargando || !marcaNueva} required style={{ flex: 2, minWidth: "200px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input type="checkbox" id="chkModeloAccesoRapido" checked={accesoRapido} onChange={(e) => setAccesoRapido(e.target.checked)} style={estiloCheck} />
          <label htmlFor="chkModeloAccesoRapido" style={estiloEtiquetaCheck}>Acceso Rápido</label>
        </div>
        {accesoRapido && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 500 }}>Orden:</span>
            <input type="number" className="form-input" value={ordenNuevo} onChange={(e) => setOrdenNuevo(Number(e.target.value))} disabled={cargando} style={{ width: "80px", padding: "8px", textAlign: "center" }} min={0} />
          </div>
        )}
        <button type="submit" className="btn btn-primary" disabled={cargando || !marcaNueva}>
          + Crear Modelo
        </button>
      </form>

      <div style={{ display: "flex", gap: "10px", alignItems: "center", background: "rgba(255, 255, 255, 0.03)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-secondary)" }}>🔎 Filtrar modelos:</span>
        <input type="text" className="form-input" placeholder="Buscar por modelo o marca..." value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ maxWidth: "300px", padding: "6px 12px" }} />
        {filtro && (
          <button type="button" className="btn btn-secondary" onClick={() => setFiltro("")} style={{ padding: "4px 10px", fontSize: "0.8rem" }}>
            Limpiar
          </button>
        )}
      </div>

      {marcas
        .filter((m) => m.sistema_comisiones)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        .map((marca) => {
          const lista = ordenadas.filter((f) => f.idMarca === marca.id_marca);
          return (
            <div key={marca.id_marca} className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "15px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
              {cabeceraBloque(
                <>
                  <span style={{ color: "var(--primary)" }}>📦 Modelos de {marca.nombre}</span>
                  <span style={{ fontSize: "0.75rem", background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", padding: "2px 8px", borderRadius: "4px", fontWeight: 600 }}>Comisiones Activo</span>
                </>,
                lista,
              )}
              {tabla(lista, "No hay modelos registrados para esta marca.")}
            </div>
          );
        })}

      <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "15px" }}>
        {cabeceraBloque("💼 Resto de Marcas", restoDeMarcas)}
        {tabla(restoDeMarcas, "No hay modelos para el resto de marcas.")}
      </div>

      {reasignando && (
        <Modal
          titulo={`Eliminar «${reasignando.fila.modelo.nombre_modelo}»`}
          ancho="520px"
          peligro
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setReasignando(null)} disabled={cargando}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void confirmarReasignacion()} disabled={cargando || (destino === "nuevo" && !nombreNuevoDestino.trim())}>
                {cargando ? "Cambiando…" : "Cambiar y eliminar"}
              </button>
            </>
          }
        >
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            Hay <b>{reasignando.usos}</b> expediente{reasignando.usos === 1 ? "" : "s"} con este modelo. Elige a qué modelo {reasignando.usos === 1 ? "pasa" : "pasan"} antes de eliminarlo:
          </p>
          <div className="form-group">
            <select className="form-input" value={destino} onChange={(e) => setDestino(e.target.value)}>
              {marcas.map((m) => {
                const otros = m.modelos.filter((y) => y.id_modelo !== reasignando.fila.modelo.id_modelo);
                return otros.length === 0 ? null : (
                  <optgroup key={m.id_marca} label={m.nombre}>
                    {otros.map((y) => (
                      <option key={y.id_modelo} value={y.id_modelo}>
                        {m.nombre} {y.nombre_modelo}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
              <option value="nuevo">➕ Un modelo nuevo de {reasignando.fila.nombreMarca}…</option>
              <option value="ninguno">Dejarlos sin modelo</option>
            </select>
          </div>
          {destino === "nuevo" && (
            <div className="form-group">
              <label className="form-label">Nombre del modelo nuevo</label>
              <input className="form-input" value={nombreNuevoDestino} onChange={(e) => setNombreNuevoDestino(e.target.value)} placeholder="Por ejemplo: Sandero" autoFocus />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
