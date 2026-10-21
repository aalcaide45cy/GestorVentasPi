"use client";

import { useEffect, useMemo, useState } from "react";
import Modal, { ModalConfirmar } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { BotonesDatosSeccion } from "@/components/datos/DatosSeccion";
import { GrupoDatos, OpcionDatos } from "@/components/datos/OpcionesDatos";
import { COMPONENTES_AMBITO, INFO_COMPONENTE, TITULO_AMBITO, aplicar, contarComponente, extraer, type Ambito, type CatalogoNombres, type Componente, type ModoAplicar } from "@/lib/plantillas-plan/fragmentos";
import type { PlantillaPlanDto } from "@/lib/servicios/plantillas-plan";
import { llamar, textoError } from "./api";
import type { CatalogosComisiones, Plan } from "./tipos";

/**
 * Plantillas de partes de un plan: una por pestaña (Resumen, Objetivo, Usados, Reglas, Bonus, Penalizaciones, Notas) y del plan
 * completo. Se aplican con una ventana que enseña qué se pone, qué ya estaba y qué no se puede poner en este catálogo.
 * Nada se guarda hasta que se pulsa «Guardar cambios» en el plan.
 */

const botonChico = { padding: "6px 12px", fontSize: "0.82rem" } as const;
const plural = (n: number, uno: string, varios: string): string => `${n.toLocaleString("es-ES")} ${n === 1 ? uno : varios}`;

interface PropsBase {
  ambito: Ambito;
  plan: Plan;
  setPlan: (cambio: (p: Plan) => Plan) => void;
  cat: CatalogosComisiones;
}

const catalogoDe = (cat: CatalogosComisiones): CatalogoNombres => ({ marcas: cat.marcas, modelos: cat.modelos, vendedores: cat.vendedores.map((v) => ({ id: v.id, nombre: v.nombre })) });

/**
 * Un solo botón «Plantillas» para todo el plan: abre una ventana que explica las opciones, primero para la pestaña que se está
 * viendo (si tiene plantillas propias) y después para el plan completo.
 */
export default function PlantillasPlan({ ambitoPestana, nombrePestana, ...props }: Omit<PropsBase, "ambito"> & { ambitoPestana?: Ambito; nombrePestana: string }) {
  const [menu, setMenu] = useState(false);
  const [abierta, setAbierta] = useState<{ ambito: Ambito; accion: "aplicar" | "guardar" | "gestionar" } | null>(null);
  const elegir = (ambito: Ambito, accion: "aplicar" | "guardar" | "gestionar") => {
    setMenu(false);
    setAbierta({ ambito, accion });
  };
  const opciones = (ambito: Ambito, que: string) => (
    <>
      <OpcionDatos icono="📋" titulo="Aplicar una plantilla" texto={`Pon en este plan ${que} de una plantilla ya guardada. Antes de cambiar nada verás qué se pone y qué no.`} ayuda="No se guarda nada en el plan hasta que pulses «Guardar cambios»." alPulsar={() => elegir(ambito, "aplicar")} />
      <OpcionDatos icono="💾" titulo="Guardar como plantilla" texto={`Guarda ${que} tal como lo ves ahora para reutilizarlo en otros planes (por ejemplo, el del mes que viene).`} ayuda="Marcas, modelos y vendedores se guardan por nombre." alPulsar={() => elegir(ambito, "guardar")} />
      <OpcionDatos icono="⚙️" titulo="Gestionar las plantillas" texto="Renombra, duplica, borra, exporta o importa las plantillas que ya tienes guardadas." ayuda="Borrar una plantilla no cambia los planes donde ya la aplicaste." alPulsar={() => elegir(ambito, "gestionar")} />
    </>
  );
  return (
    <>
      <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setMenu(true)} title="Guarda partes de este plan como plantillas y reutilízalas en otros planes, o pon en este plan una plantilla ya guardada">
        📚 Plantillas…
      </button>
      {menu && (
        <Modal
          titulo="📚 Plantillas del plan"
          ancho="860px"
          pie={
            <button type="button" className="btn btn-secondary" onClick={() => setMenu(false)}>
              Cerrar
            </button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "18px", fontSize: "0.9rem" }}>
            <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Una plantilla es una copia de parte de un plan (tarifas, objetivos, reglas…) para no escribirla de nuevo cada mes. <b>Nada cambia en el plan hasta que pulses «Guardar cambios»</b>.
            </div>
            {ambitoPestana ? (
              <GrupoDatos titulo={`📄 Solo la pestaña «${nombrePestana}»`} ayuda="Para repetir únicamente esta parte del plan.">
                {opciones(ambitoPestana, "esta pestaña")}
              </GrupoDatos>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>La pestaña «{nombrePestana}» no tiene plantillas propias aquí. Las de tarifas de los modelos VN están en la pestaña «VN».</div>
            )}
            <GrupoDatos titulo="🗂️ El plan completo" ayuda="Todas las pestañas a la vez. El nombre, las fechas y el estado del plan no se tocan nunca.">
              {opciones("global", "todo el plan")}
            </GrupoDatos>
          </div>
        </Modal>
      )}
      {abierta?.accion === "aplicar" && <ModalAplicar ambito={abierta.ambito} {...props} alCerrar={() => setAbierta(null)} />}
      {abierta?.accion === "guardar" && <ModalGuardar ambito={abierta.ambito} {...props} alCerrar={() => setAbierta(null)} />}
      {abierta?.accion === "gestionar" && <ModalGestionar ambito={abierta.ambito} alCerrar={() => setAbierta(null)} />}
    </>
  );
}

function usePlantillas(ambito: Ambito, version: number) {
  const { mostrar } = useToast();
  const [lista, setLista] = useState<PlantillaPlanDto[] | null>(null);
  useEffect(() => {
    let vivo = true;
    llamar<PlantillaPlanDto[]>(`/api/comisiones/plantillas-plan?ambito=${ambito}`)
      .then((r) => {
        if (vivo) setLista(r.data);
      })
      .catch((e: unknown) => {
        if (vivo) {
          setLista([]);
          mostrar(textoError(e), "error");
        }
      });
    return () => {
      vivo = false;
    };
  }, [ambito, version, mostrar]);
  return lista;
}

const ES_UNICO: Componente[] = ["resumen", "penalizacion", "notas", "opcionesUsados"];

/* ------------------------------------------------------------------ */

function ModalAplicar({ ambito, plan, setPlan, cat, alCerrar }: PropsBase & { alCerrar: () => void }) {
  const { mostrar } = useToast();
  const lista = usePlantillas(ambito, 0);
  const [elegida, setElegida] = useState<PlantillaPlanDto | null>(null);
  const [marcados, setMarcados] = useState<Set<Componente>>(new Set());
  const [modos, setModos] = useState<Partial<Record<Componente, ModoAplicar>>>({});
  const catalogo = useMemo(() => catalogoDe(cat), [cat]);

  const elegir = (p: PlantillaPlanDto) => {
    setElegida(p);
    setMarcados(new Set(p.contenido.map((c) => c.componente)));
    setModos({});
  };

  const comps = useMemo(() => (elegida ? elegida.contenido.map((c) => c.componente).filter((c) => marcados.has(c)) : []), [elegida, marcados]);
  const simulacion = useMemo(() => (elegida ? aplicar(plan, elegida.datos, catalogo, comps, modos) : null), [elegida, plan, catalogo, comps, modos]);
  const resultado = (c: Componente) => simulacion?.resultados.find((r) => r.componente === c);
  const hayCambios = (simulacion?.resultados ?? []).some((r) => r.aplicados > 0);

  const confirmar = () => {
    if (!elegida || !simulacion) return;
    const res = aplicar(plan, elegida.datos, catalogo, comps, modos);
    setPlan((p) => {
      const r = aplicar(p, elegida.datos, catalogo, comps, modos).plan;
      // Solo se copian las partes elegidas: el nombre, las fechas y el estado del plan no se tocan nunca
      return { ...p, ...Object.fromEntries(Object.keys(r).filter((k) => !["idPlan", "nombre", "fechaInicio", "fechaFin", "estado", "pendientes"].includes(k)).map((k) => [k, (r as Record<string, unknown>)[k]])) } as Plan;
    });
    const omitidos = res.resultados.reduce((t, r) => t + r.sinReferencia.length, 0);
    mostrar(`✅ Plantilla «${elegida.nombre}» aplicada.${omitidos > 0 ? ` ${plural(omitidos, "elemento se ha omitido", "elementos se han omitido")} porque su marca, modelo o vendedor no existe aquí.` : ""} Revisa y pulsa «Guardar cambios» para conservarla.`);
    alCerrar();
  };

  return (
    <Modal
      titulo={elegida ? `📋 Aplicar «${elegida.nombre}»` : `📋 Aplicar una plantilla ${ambito === "global" ? "del plan completo" : `de «${TITULO_AMBITO[ambito]}»`}`}
      ancho="760px"
      pie={
        <>
          {elegida && (
            <button type="button" className="btn btn-secondary" style={{ marginRight: "auto" }} onClick={() => setElegida(null)}>
              ← Elegir otra
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={alCerrar}>
            Cancelar
          </button>
          {elegida && (
            <button type="button" className="btn btn-primary" disabled={!hayCambios} onClick={confirmar} title="Pone en el plan lo marcado. No se guarda el plan hasta que pulses «Guardar cambios».">
              Aplicar al plan
            </button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem" }}>
        {!elegida && (
          <>
            <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Elige una plantilla. En el siguiente paso verás qué partes trae, qué se pone en el plan y qué <b>no se puede poner</b> en este catálogo (marcas, modelos o vendedores que no existan). <b>No se guarda nada</b> hasta que pulses «Guardar cambios».
              {ambito === "global" && " El nombre, las fechas y el estado del plan no se tocan nunca."}
            </div>
            {lista === null && <div style={{ color: "var(--text-muted)" }}>Cargando…</div>}
            {lista?.length === 0 && <div style={{ color: "var(--text-muted)" }}>Todavía no hay plantillas aquí. Crea la primera con «Guardar como plantilla».</div>}
            {lista?.map((p) => (
              <div key={p.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "220px" }}>
                  <div style={{ fontWeight: 700 }}>{p.nombre}</div>
                  {p.descripcion && <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{p.descripcion}</div>}
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{p.contenido.map((c) => `${INFO_COMPONENTE[c.componente].titulo}${ES_UNICO.includes(c.componente) ? "" : ` (${c.elementos})`}`).join(" · ")}</div>
                </div>
                <button type="button" className="btn btn-primary" style={botonChico} onClick={() => elegir(p)}>
                  Elegir
                </button>
              </div>
            ))}
          </>
        )}

        {elegida && simulacion && (
          <>
            <div style={{ color: "var(--text-secondary)" }}>Marca qué partes quieres poner en el plan. En las listas puedes <b>reemplazar</b> lo que hay o solo <b>añadir lo que falta</b>.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {elegida.contenido.map((c) => {
                const r = resultado(c.componente);
                const activo = marcados.has(c.componente);
                const unico = ES_UNICO.includes(c.componente);
                return (
                  <div key={c.componente} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", opacity: activo ? 1 : 0.6 }}>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                      <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer", flex: 1, minWidth: "220px" }} title={INFO_COMPONENTE[c.componente].ayuda}>
                        <input
                          type="checkbox"
                          checked={activo}
                          onChange={(e) =>
                            setMarcados((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.add(c.componente);
                              else n.delete(c.componente);
                              return n;
                            })
                          }
                          style={{ accentColor: "var(--primary)" }}
                        />
                        <span>
                          <b>{INFO_COMPONENTE[c.componente].titulo}</b>
                          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {unico ? "Se sustituye el valor del plan." : `La plantilla trae ${plural(c.elementos, "elemento", "elementos")}; el plan tiene ahora ${contarComponente(extraer(plan, catalogo, [c.componente]), c.componente)}.`}
                          </span>
                        </span>
                      </label>
                      {!unico && activo && (
                        <select className="form-input" style={{ width: "auto", padding: "4px 8px", fontSize: "0.82rem" }} value={modos[c.componente] ?? "reemplazar"} onChange={(e) => setModos((m) => ({ ...m, [c.componente]: e.target.value as ModoAplicar }))} title="Reemplazar sustituye lo que hay en esta parte; Añadir lo que falta deja lo que ya tienes y solo suma lo nuevo.">
                          <option value="reemplazar">Reemplazar lo que hay</option>
                          <option value="completar">Añadir lo que falta</option>
                        </select>
                      )}
                    </div>
                    {activo && r && (
                      <div style={{ fontSize: "0.78rem", marginTop: "4px", color: "var(--text-secondary)" }}>
                        → {plural(r.aplicados, "se pone", "se ponen")}
                        {r.yaEstaban > 0 ? ` · ${plural(r.yaEstaban, "ya estaba", "ya estaban")}` : ""}
                        {r.sinReferencia.length > 0 && (
                          <span style={{ color: "var(--warning)" }} title={r.sinReferencia.join(", ")}>
                            {" "}
                            · ⚠️ {plural(r.sinReferencia.length, "se omite", "se omiten")} (no existe en tu catálogo: {r.sinReferencia.slice(0, 3).join(", ")}
                            {r.sinReferencia.length > 3 ? "…" : ""})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Lo que el plan tiene y no está en la plantilla no se toca (salvo al reemplazar una parte entera).</div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function ModalGuardar({ ambito, plan, cat, alCerrar }: PropsBase & { alCerrar: () => void }) {
  const { mostrar } = useToast();
  const lista = usePlantillas(ambito, 0);
  const catalogo = useMemo(() => catalogoDe(cat), [cat]);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [sustituir, setSustituir] = useState<number | "">("");
  const [trabajando, setTrabajando] = useState(false);

  const contenido = useMemo(() => {
    const todo = extraer(plan, catalogo, COMPONENTES_AMBITO[ambito]);
    return COMPONENTES_AMBITO[ambito].map((c) => ({ componente: c, elementos: contarComponente(todo, c), conTexto: c === "notas" ? !!plan.notas : true })).filter((c) => (ES_UNICO.includes(c.componente) ? c.conTexto : c.elementos > 0));
  }, [plan, catalogo, ambito]);
  const [marcados, setMarcados] = useState<Set<Componente>>(() => new Set(contenido.map((c) => c.componente)));

  const guardar = async () => {
    setTrabajando(true);
    try {
      const datos = extraer(plan, catalogo, [...marcados]);
      const cuerpo = { ambito, nombre: nombre.trim(), descripcion: descripcion.trim() || null, datos };
      if (sustituir !== "") await llamar(`/api/comisiones/plantillas-plan?id=${sustituir}`, { method: "PUT", cuerpo });
      else await llamar("/api/comisiones/plantillas-plan", { method: "POST", cuerpo });
      mostrar(`✅ Plantilla «${cuerpo.nombre}» guardada. La encontrarás en «Aplicar» para cualquier plan.`);
      alCerrar();
    } catch (e) {
      mostrar(`No se ha guardado la plantilla. ${textoError(e)}`, "error");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <Modal
      titulo={`💾 Guardar como plantilla (${TITULO_AMBITO[ambito]})`}
      ancho="640px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={trabajando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={trabajando || !nombre.trim() || marcados.size === 0} onClick={() => void guardar()}>
            {trabajando ? "Guardando…" : sustituir !== "" ? "Sí, sustituir la plantilla" : "Guardar plantilla"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem" }}>
        <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Se guarda lo que ves ahora en el plan (aunque aún no lo hayas guardado). Marcas, modelos y vendedores se guardan <b>por nombre</b>, así la plantilla sirve en otros planes y otras instalaciones.
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Nombre de la plantilla</label>
          <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoFocus />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Descripción (opcional)</label>
          <input className="form-input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500} />
        </div>
        {lista && lista.length > 0 && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">¿Nueva o sustituir una existente?</label>
            <select
              className="form-input"
              value={sustituir}
              onChange={(e) => {
                const v = e.target.value === "" ? "" : Number(e.target.value);
                setSustituir(v);
                const p = lista.find((x) => x.id === v);
                if (p) {
                  setNombre(p.nombre);
                  setDescripcion(p.descripcion ?? "");
                }
              }}
            >
              <option value="">Crear una plantilla nueva</option>
              {lista.map((p) => (
                <option key={p.id} value={p.id}>
                  Sustituir «{p.nombre}»
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <div style={{ fontWeight: 600, marginBottom: "6px" }}>¿Qué partes guardar?</div>
          {contenido.length === 0 && <div style={{ color: "var(--text-muted)" }}>Este plan todavía no tiene nada que guardar en esta sección.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {contenido.map((c) => (
              <label key={c.componente} style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" }} title={INFO_COMPONENTE[c.componente].ayuda}>
                <input
                  type="checkbox"
                  checked={marcados.has(c.componente)}
                  onChange={(e) =>
                    setMarcados((prev) => {
                      const n = new Set(prev);
                      if (e.target.checked) n.add(c.componente);
                      else n.delete(c.componente);
                      return n;
                    })
                  }
                  style={{ accentColor: "var(--primary)" }}
                />
                {INFO_COMPONENTE[c.componente].titulo}
                {!ES_UNICO.includes(c.componente) && <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>({c.elementos})</span>}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function ModalGestionar({ ambito, alCerrar }: { ambito: Ambito; alCerrar: () => void }) {
  const { mostrar } = useToast();
  const [version, setVersion] = useState(0);
  const lista = usePlantillas(ambito, version);
  const [editando, setEditando] = useState<PlantillaPlanDto | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [aBorrar, setABorrar] = useState<PlantillaPlanDto | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const recargar = () => setVersion((v) => v + 1);

  const accion = async (f: () => Promise<void>, ok: string) => {
    setOcupado(true);
    try {
      await f();
      mostrar(ok);
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <Modal
        titulo={`⚙️ Plantillas de ${ambito === "global" ? "plan completo" : TITULO_AMBITO[ambito]}`}
        ancho="780px"
        pie={
          <button type="button" className="btn btn-secondary" onClick={alCerrar}>
            Cerrar
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ color: "var(--text-secondary)", maxWidth: "420px", lineHeight: 1.5 }}>Para cambiar lo que guarda una plantilla, aplícala a un plan, modifícalo y vuelve a guardar eligiendo «Sustituir».</div>
            <BotonesDatosSeccion seccion="plantillas_plan" alCambiar={recargar} />
          </div>
          {lista === null && <div style={{ color: "var(--text-muted)" }}>Cargando…</div>}
          {lista?.length === 0 && <div style={{ color: "var(--text-muted)" }}>Todavía no hay plantillas en esta sección.</div>}
          {lista?.map((p) => (
            <div key={p.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "220px" }}>
                {editando?.id === p.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
                    <input className="form-input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500} placeholder="Descripción (opcional)" />
                  </div>
                ) : (
                  <>
                    <div style={{ fontWeight: 700 }}>{p.nombre}</div>
                    {p.descripcion && <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{p.descripcion}</div>}
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {p.contenido.map((c) => `${INFO_COMPONENTE[c.componente].titulo}${ES_UNICO.includes(c.componente) ? "" : ` (${c.elementos})`}`).join(" · ")} · actualizada {new Date(p.actualizadaEn).toLocaleDateString("es-ES")}
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {editando?.id === p.id ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={botonChico}
                      disabled={ocupado || !nombre.trim()}
                      onClick={() =>
                        void accion(async () => {
                          await llamar(`/api/comisiones/plantillas-plan?id=${p.id}`, { method: "PUT", cuerpo: { ambito: p.ambito, nombre: nombre.trim(), descripcion: descripcion.trim() || null, datos: p.datos } });
                          setEditando(null);
                        }, "✅ Plantilla actualizada.")
                      }
                    >
                      Guardar
                    </button>
                    <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={botonChico}
                      onClick={() => {
                        setEditando(p);
                        setNombre(p.nombre);
                        setDescripcion(p.descripcion ?? "");
                      }}
                      title="Cambia el nombre o la descripción."
                    >
                      ✏️ Renombrar
                    </button>
                    <button type="button" className="btn btn-secondary" style={botonChico} disabled={ocupado} onClick={() => void accion(async () => void (await llamar(`/api/comisiones/plantillas-plan/duplicar?id=${p.id}`, { method: "POST" })), "✅ Plantilla duplicada.")} title="Crea una copia de esta plantilla.">
                      📄 Duplicar
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ ...botonChico, color: "var(--danger)" }} onClick={() => setABorrar(p)} title="Borra esta plantilla. Los planes donde la aplicaste no cambian.">
                      🗑️ Borrar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Modal>
      {aBorrar && (
        <ModalConfirmar
          titulo="🗑️ Borrar plantilla"
          mensaje={
            <>
              Se borrará la plantilla <b>{aBorrar.nombre}</b>. Los planes donde ya la aplicaste no cambian.
            </>
          }
          textoConfirmar="Sí, borrar la plantilla"
          textoOcupado="Borrando…"
          ocupado={ocupado}
          alConfirmar={() =>
            void accion(async () => {
              await llamar(`/api/comisiones/plantillas-plan?id=${aBorrar.id}`, { method: "DELETE" });
              setABorrar(null);
            }, "Plantilla borrada.")
          }
          alCancelar={() => setABorrar(null)}
        />
      )}
    </>
  );
}
