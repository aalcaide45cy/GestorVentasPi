"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { EstadoVehiculoDto } from "@/lib/dto";
import { Cabecera, comparar, estiloBotonPeligro, estiloCheck, estiloPanel, useOrden, usePeticion } from "./utilidades";

interface Props {
  estados: EstadoVehiculoDto[];
  setEstados: (fn: (prev: EstadoVehiculoDto[]) => EstadoVehiculoDto[]) => void;
}

const NUEVO_SUBTIPO = "__nuevo__";

/**
 * Subtipo de un estado usado: agrupa estados que comparten tarifa en la pestaña «Usados / VO» del plan (por ejemplo KM0, DEMO o
 * BUYBACK). Se elige de la lista de los que ya existen o se escribe uno nuevo.
 */
function SelectorSubtipo({ valor, alCambiar, opciones, pequeno }: { valor: string; alCambiar: (v: string) => void; opciones: string[]; pequeno?: boolean }) {
  const [escribiendo, setEscribiendo] = useState(false);
  const estilo = { padding: "4px 8px", fontSize: pequeno ? "0.8rem" : "0.9rem" } as const;
  if (escribiendo) {
    return (
      <span style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
        <input className="form-input" autoFocus value={valor} onChange={(e) => alCambiar(e.target.value.toUpperCase())} placeholder="NUEVO SUBTIPO" style={{ ...estilo, width: "130px" }} title="Nombre del subtipo nuevo (se usará para sus tarifas en el plan)" />
        <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.72rem" }} onClick={() => setEscribiendo(false)} title="Volver a la lista de subtipos">
          ✕
        </button>
      </span>
    );
  }
  const lista = valor && !opciones.includes(valor) ? [...opciones, valor] : opciones;
  return (
    <select className="form-input" value={valor} onChange={(e) => (e.target.value === NUEVO_SUBTIPO ? (alCambiar(""), setEscribiendo(true)) : alCambiar(e.target.value))} style={estilo} title="Subtipo de usado: estados con el mismo subtipo comparten tarifa en la pestaña «Usados / VO» del plan">
      {lista.map((x) => (
        <option key={x} value={x}>
          {x}
        </option>
      ))}
      <option value={NUEVO_SUBTIPO}>➕ Crear subtipo nuevo…</option>
    </select>
  );
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
  const [color, setColor] = useState("");
  const [clase, setClase] = useState<"VN" | "VO">("VN");
  const [subtipo, setSubtipo] = useState("USADO");
  const [claseEdicion, setClaseEdicion] = useState<"VN" | "VO">("VN");
  const [subtipoEdicion, setSubtipoEdicion] = useState("USADO");
  const [colorEdicion, setColorEdicion] = useState("");

  // Subtipos que ya existen (los de los estados creados y los habituales): se eligen en una lista, o se crea uno nuevo
  const [lista, setLista] = useState<{ nombre: string; estados: number; tarifas: number }[]>([]);
  const [nuevoSubtipo, setNuevoSubtipo] = useState("");
  const [renombrando, setRenombrando] = useState<{ de: string; a: string } | null>(null);
  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const r = await fetch("/api/admin/subtipos-vo");
        if (r.ok && vigente) setLista(((await r.json()) as { data: { nombre: string; estados: number; tarifas: number }[] }).data);
      } catch {
        /* se usan los de los estados */
      }
    })();
    return () => {
      vigente = false;
    };
  }, [estados]);
  const subtipos = [...new Set([...lista.map((s) => s.nombre), ...estados.map((e) => e.subtipo_vo).filter((x): x is string => !!x)])];
  const gestionar = async (metodo: "POST" | "PUT" | "DELETE", cuerpo: object, exito: string) => {
    const ok = await ejecutar(async () => {
      setLista(await llamar<typeof lista>("/api/admin/subtipos-vo", metodo, cuerpo, "No se ha podido guardar el subtipo"));
    }, exito);
    if (ok && metodo === "PUT") window.location.reload();
    return ok;
  };
  const valor = (e: EstadoVehiculoDto): string | number => (orden.campo === "nombre" ? e.nombre_estado_vehiculo : e.id_estado_vehiculo);
  const ordenados = [...estados].sort((a, b) => comparar(valor(a), valor(b), orden.asc));

  /** Tras guardar uno como predeterminado, el resto deja de serlo. */
  const aplicar = (n: EstadoVehiculoDto) =>
    setEstados((prev) => prev.map((e) => (e.id_estado_vehiculo === n.id_estado_vehiculo ? n : n.predeterminado ? { ...e, predeterminado: false } : e)));

  const crear = async (ev: FormEvent) => {
    ev.preventDefault();
    const ok = await ejecutar(async () => {
      const n = await llamar<EstadoVehiculoDto>("/api/admin/catalogos", "POST", { tipo: "estado_vehiculo", nombre_estado_vehiculo: nombre, predeterminado, color: color || null, clase, subtipo_vo: clase === "VO" ? subtipo.trim().toUpperCase() || "USADO" : null }, "Error al crear el estado");
      setEstados((prev) => [...(n.predeterminado ? prev.map((e) => ({ ...e, predeterminado: false })) : prev), n]);
    }, "Estado de vehículo creado con éxito");
    if (ok) {
      setNombre("");
      setPredeterminado(false);
      setColor("");
    }
  };

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (editando === null) return;
    const ok = await ejecutar(async () => {
      const n = await llamar<EstadoVehiculoDto>(
        "/api/admin/catalogos",
        "PUT",
        { tipo: "estado_vehiculo", id: editando, nombre_estado_vehiculo: nombreEdicion, predeterminado: predeterminadoEdicion, color: colorEdicion || null, clase: claseEdicion, subtipo_vo: claseEdicion === "VO" ? subtipoEdicion.trim().toUpperCase() || "USADO" : null },
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
        { tipo: "estado_vehiculo", id: e.id_estado_vehiculo, nombre_estado_vehiculo: e.nombre_estado_vehiculo, predeterminado: !e.predeterminado, clase: e.clase === "VO" ? "VO" : "VN", subtipo_vo: e.subtipo_vo },
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
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: 600 }} title="Nuevo (VN) o Usado (VO). Usado, KM0, Demo y Buyback son coches usados: el sistema usa esto para distinguir nuevos de usados en comisiones y puntos">
          Tipo
          <select className="form-input" value={clase} onChange={(e) => setClase(e.target.value as "VN" | "VO")} style={{ padding: "4px 8px" }}>
            <option value="VN">Nuevo (VN)</option>
            <option value="VO">Usado (VO)</option>
          </select>
        </label>
        {clase === "VO" && (
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: 600 }} title="Subtipo para las tarifas de usados del plan (USADO, KM0, DEMO, BUYBACK…)">
            Subtipo
            <SelectorSubtipo valor={subtipo} alCambiar={setSubtipo} opciones={subtipos} />
          </label>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: 600 }} title="Color de la etiqueta de este estado en las listas. Si no eliges ninguno se usa el de siempre">
          Color
          <input type="color" value={color || "#3b82f6"} onChange={(e) => setColor(e.target.value)} style={{ width: "36px", height: "28px", padding: 0, border: "none", background: "none", cursor: "pointer" }} />
          {color && (
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.72rem" }} onClick={() => setColor("")} title="Quitar el color elegido">
              ✕
            </button>
          )}
        </label>
        <button type="submit" className="btn btn-primary" disabled={cargando}>
          + Crear Estado
        </button>
      </form>

      <div className="table-container">
        <table className="table-premium">
          <thead>
            <tr>
              <Cabecera etiqueta="Nombre Estado" campo="nombre" orden={orden} />
              <th>Tipo</th>
              <th>Color</th>
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
                  {editando === e.id_estado_vehiculo ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <select className="form-input" value={claseEdicion} onChange={(ev) => setClaseEdicion(ev.target.value as "VN" | "VO")} style={{ padding: "4px 8px", fontSize: "0.8rem" }}>
                        <option value="VN">Nuevo (VN)</option>
                        <option value="VO">Usado (VO)</option>
                      </select>
                      {claseEdicion === "VO" && <SelectorSubtipo valor={subtipoEdicion} alCambiar={setSubtipoEdicion} opciones={subtipos} pequeno />}
                    </span>
                  ) : (
                    <span style={{ fontWeight: 700, color: e.clase === "VO" ? "var(--warning)" : "var(--success)" }}>{e.clase === "VO" ? `Usado${e.subtipo_vo ? ` · ${e.subtipo_vo}` : ""}` : "Nuevo"}</span>
                  )}
                </td>
                <td>
                  {editando === e.id_estado_vehiculo ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <input type="color" value={colorEdicion || "#3b82f6"} onChange={(ev) => setColorEdicion(ev.target.value)} style={{ width: "36px", height: "28px", padding: 0, border: "none", background: "none", cursor: "pointer" }} title="Color de la etiqueta de este estado" />
                      {colorEdicion && (
                        <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.72rem" }} onClick={() => setColorEdicion("")} title="Quitar el color y usar el de siempre">
                          ✕
                        </button>
                      )}
                    </span>
                  ) : e.color ? (
                    <span className="badge" style={{ background: e.color, color: "#fff", padding: "3px 10px", fontSize: "0.72rem" }}>
                      {e.nombre_estado_vehiculo}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>por defecto</span>
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
                        setColorEdicion(e.color ?? "");
                        setClaseEdicion(e.clase === "VO" ? "VO" : "VN");
                        setSubtipoEdicion(e.subtipo_vo ?? "USADO");
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

      <div style={{ ...estiloPanel, display: "flex", flexDirection: "column", gap: "12px" }}>
        <h3 style={{ fontSize: "1.05rem" }}>Subtipos de usados</h3>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Un subtipo agrupa estados de coche usado que cobran con la misma tarifa en el plan (por ejemplo KM0, DEMO o BUYBACK). Aquí los creas, les cambias el nombre (se cambia también en los estados y en las tarifas de los planes) o los borras si no se usan.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {lista.map((s) => (
            <span key={s.nombre} style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "4px 10px", fontSize: "0.85rem" }}>
              {renombrando?.de === s.nombre ? (
                <>
                  <input className="form-input" autoFocus value={renombrando.a} onChange={(e) => setRenombrando({ de: s.nombre, a: e.target.value.toUpperCase() })} style={{ width: "120px", padding: "2px 6px" }} />
                  <button type="button" className="btn btn-primary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} disabled={cargando || !renombrando.a.trim()} onClick={() => void gestionar("PUT", { de: s.nombre, a: renombrando.a }, "Subtipo renombrado")}>
                    Guardar
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => setRenombrando(null)}>
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <b>{s.nombre}</b>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }} title="Estados del vehículo y tarifas de planes que lo usan">
                    {s.estados} estado(s) · {s.tarifas} tarifa(s)
                  </span>
                  <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => setRenombrando({ de: s.nombre, a: s.nombre })} title="Cambiar el nombre">
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ ...estiloBotonPeligro, padding: "2px 8px", fontSize: "0.75rem" }}
                    disabled={cargando || s.estados > 0 || s.tarifas > 0}
                    onClick={() => void gestionar("DELETE", { nombre: s.nombre }, "Subtipo eliminado")}
                    title={s.estados > 0 || s.tarifas > 0 ? "No se puede borrar mientras lo use un estado o una tarifa" : "Borrar el subtipo"}
                  >
                    🗑️
                  </button>
                </>
              )}
            </span>
          ))}
        </div>
        <form
          style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}
          onSubmit={async (ev) => {
            ev.preventDefault();
            if (await gestionar("POST", { nombre: nuevoSubtipo }, "Subtipo creado")) setNuevoSubtipo("");
          }}
        >
          <input className="form-input" placeholder="Nuevo subtipo (ej. RENTING)" value={nuevoSubtipo} onChange={(e) => setNuevoSubtipo(e.target.value.toUpperCase())} style={{ minWidth: "220px" }} maxLength={30} />
          <button type="submit" className="btn btn-primary" disabled={cargando || !nuevoSubtipo.trim()}>
            + Añadir subtipo
          </button>
        </form>
      </div>
    </div>
  );
}
