"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal, { ModalConfirmar } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { BotonesDatosSeccion } from "@/components/datos/DatosSeccion";
import { euros } from "@/lib/formato";
import { renumerarOrden } from "@/lib/plantillas-tarifas/orden";
import type { DatosPlantillaTarifas } from "@/lib/plantillas-tarifas/generica";
import type { ResumenPlantilla } from "@/lib/servicios/plantillas-tarifas";
import { llamar, textoError } from "./api";
import { tramosDe, type CatalogosComisiones, type Plan } from "./tipos";

/**
 * Plantillas de «Tarifas de modelos VN por tramo»: aplicar una plantilla al plan (con modal para elegir qué se pone, qué se
 * sustituye y qué marcas o modelos hay que crear), guardar las tarifas actuales como plantilla y gestionar las guardadas.
 * Las plantillas guardan marcas y modelos por NOMBRE, así sirven para cualquier plan y cualquier concesionario.
 */

type Tarifa = Plan["tarifasVN"][number];
type PlantillaCompleta = ResumenPlantilla & { datos: DatosPlantillaTarifas };

const norm = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const botonChico = { padding: "6px 12px", fontSize: "0.82rem" } as const;
const plural = (n: number, uno: string, varios: string): string => `${n.toLocaleString("es-ES")} ${n === 1 ? uno : varios}`;

interface PropsBase {
  plan: Plan;
  setPlan: (cambio: (p: Plan) => Plan) => void;
  cat: CatalogosComisiones;
  /** Se llama cuando se crean marcas o modelos nuevos en el catálogo, con el catálogo ya actualizado. */
  alAmpliarCatalogo: (marcas: { id: number; nombre: string }[], modelos: { id: number; nombre: string; marcaId: number | null }[]) => void;
}

/** Los tres botones de plantillas (para la cabecera de la pestaña de tarifas y para el aviso «sin marcas»). */
export default function BarraPlantillas(props: PropsBase & { soloAplicar?: boolean }) {
  const [modal, setModal] = useState<"aplicar" | "guardar" | "gestionar" | null>(null);
  const hayTarifas = props.plan.tarifasVN.length > 0;
  return (
    <>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Plantillas de tarifas de los modelos VN:</span>
        <button type="button" className="btn btn-primary" style={botonChico} onClick={() => setModal("aplicar")} title="Elige una plantilla de tarifas (la genérica de Renault y Dacia o las tuyas) y ponla en este plan. Verás antes qué modelos se añaden o se sustituyen; no se guarda nada hasta que guardes el plan.">
          📋 Aplicar plantilla…
        </button>
        {!props.soloAplicar && (
          <>
            <button type="button" className="btn btn-secondary" style={botonChico} disabled={!hayTarifas} onClick={() => setModal("guardar")} title={hayTarifas ? "Guarda las tarifas que ves ahora (todas o solo algunas marcas y modelos) como plantilla para reutilizarlas en otros planes." : "Este plan todavía no tiene tarifas que guardar."}>
              💾 Guardar como plantilla…
            </button>
            <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setModal("gestionar")} title="Mira, renombra, duplica, borra, exporta o importa tus plantillas de tarifas.">
              ⚙️ Gestionar plantillas
            </button>
          </>
        )}
      </div>
      {modal === "aplicar" && <ModalAplicar {...props} alCerrar={() => setModal(null)} />}
      {modal === "guardar" && <ModalGuardar {...props} alCerrar={() => setModal(null)} />}
      {modal === "gestionar" && <ModalGestionar alCerrar={() => setModal(null)} />}
    </>
  );
}

function usePlantillas(version: number) {
  const { mostrar } = useToast();
  const [lista, setLista] = useState<ResumenPlantilla[] | null>(null);
  useEffect(() => {
    let vivo = true;
    llamar<ResumenPlantilla[]>("/api/comisiones/plantillas")
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
  }, [version, mostrar]);
  return lista;
}

/* ------------------------------------------------------------------ */
/* Aplicar                                                             */
/* ------------------------------------------------------------------ */

interface FilaModelo {
  clave: string;
  marca: string;
  modelo: string;
  orden: number;
  /** Tarifas de la plantilla para este modelo: [cumplida, no cumplida] (puede faltar alguna). */
  tarifas: { cumplida?: DatosPlantillaTarifas["tarifas"][number]; noCumplida?: DatosPlantillaTarifas["tarifas"][number] };
  idMarca: number | null;
  idModelo: number | null;
  estado: "nuevo" | "sustituye" | "igual" | "falta";
  /** Importe del tramo 0 (cumplida / no cumplida), para reconocer el modelo de un vistazo. */
  resumen: string;
}

type Preajuste = "completar" | "reemplazar" | "elegir";

function ModalAplicar({ plan, setPlan, cat, alAmpliarCatalogo, alCerrar }: PropsBase & { alCerrar: () => void }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const lista = usePlantillas(0);
  const [elegida, setElegida] = useState<PlantillaCompleta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [manual, setManual] = useState<Set<string>>(new Set());
  const [preajuste, setPreajuste] = useState<Preajuste>("completar");
  const [filtro, setFiltro] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const tramos = useMemo(() => tramosDe(plan).map(String), [plan]);

  const filas: FilaModelo[] = useMemo(() => {
    if (!elegida) return [];
    const salida = new Map<string, FilaModelo>();
    for (const t of elegida.datos.tarifas) {
      const clave = `${norm(t.marca)}|${norm(t.modelo)}`;
      let f = salida.get(clave);
      if (!f) {
        const marca = cat.marcas.find((m) => norm(m.nombre) === norm(t.marca));
        const modelo = marca ? cat.modelos.find((m) => m.marcaId === marca.id && norm(m.nombre) === norm(t.modelo)) : undefined;
        f = { clave, marca: t.marca, modelo: t.modelo, orden: t.orden, tarifas: {}, idMarca: marca?.id ?? null, idModelo: modelo?.id ?? null, estado: modelo ? "nuevo" : "falta", resumen: "" };
        salida.set(clave, f);
      }
      if (t.tasaCumplida) f.tarifas.cumplida = t;
      else f.tarifas.noCumplida = t;
    }
    for (const f of salida.values()) {
      const c = f.tarifas.cumplida?.importes["0"];
      const n = f.tarifas.noCumplida?.importes["0"];
      f.resumen = `${c !== undefined ? euros(c) : "—"} / ${n !== undefined ? euros(n) : "—"}`;
      if (f.idModelo === null) continue;
      const delPlan = (cumplida: boolean): Tarifa | undefined => plan.tarifasVN.find((x) => x.idModelo === f.idModelo && x.tasaCumplida === cumplida);
      if (!delPlan(true) && !delPlan(false)) {
        f.estado = "nuevo";
        continue;
      }
      const igual = (cumplida: boolean, t: DatosPlantillaTarifas["tarifas"][number] | undefined): boolean => {
        if (!t) return true; // la plantilla no toca esa fila
        const p = delPlan(cumplida);
        if (!p) return false;
        const importesPlantilla = Object.fromEntries(Object.entries(t.importes).filter(([k]) => tramos.includes(k)));
        const importesPlan = Object.fromEntries(Object.entries(p.importes).filter(([k]) => tramos.includes(k)));
        return JSON.stringify(Object.entries(importesPlantilla).sort()) === JSON.stringify(Object.entries(importesPlan).sort()) && p.activo === t.activo;
      };
      f.estado = igual(true, f.tarifas.cumplida) && igual(false, f.tarifas.noCumplida) ? "igual" : "sustituye";
    }
    return [...salida.values()].sort((a, b) => a.marca.localeCompare(b.marca, "es") || a.orden - b.orden || a.modelo.localeCompare(b.modelo, "es"));
  }, [elegida, cat, plan.tarifasVN, tramos]);

  const porMarca = useMemo(() => {
    const m = new Map<string, FilaModelo[]>();
    for (const f of filas) m.set(f.marca, [...(m.get(f.marca) ?? []), f]);
    return [...m.entries()];
  }, [filas]);

  const marcarSegun = useCallback((p: Preajuste, todas: FilaModelo[]): Set<string> => {
    if (p === "reemplazar") return new Set(todas.map((f) => f.clave));
    if (p === "completar") return new Set(todas.filter((f) => f.estado === "nuevo" || f.estado === "falta").map((f) => f.clave));
    return new Set();
  }, []);

  const elegirPlantilla = async (r: ResumenPlantilla) => {
    setCargando(true);
    try {
      const { data } = await llamar<PlantillaCompleta>(`/api/comisiones/plantillas?id=${r.id}`);
      setElegida(data);
      setPreajuste("completar");
      setFiltro("");
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setCargando(false);
    }
  };

  // Con «Completar» o «Reemplazar» la selección se calcula sola; en cuanto el usuario toca una casilla pasa a ser manual
  const marcados = useMemo(() => (preajuste === "elegir" ? manual : marcarSegun(preajuste, filas)), [preajuste, manual, filas, marcarSegun]);

  const alternar = (claves: string[], activo: boolean) => {
    const n = new Set(marcados);
    for (const c of claves) {
      if (activo) n.add(c);
      else n.delete(c);
    }
    setManual(n);
    setPreajuste("elegir");
  };

  const seleccion = filas.filter((f) => marcados.has(f.clave));
  const aCrearMarcas = new Set(seleccion.filter((f) => f.idMarca === null).map((f) => norm(f.marca)));
  const marcasSinModelo = new Set(seleccion.filter((f) => f.idMarca !== null && f.idModelo === null).map((f) => norm(f.marca)));
  const aCrearModelos = seleccion.filter((f) => f.idModelo === null).length;
  const nuevos = seleccion.filter((f) => f.estado === "nuevo" || f.estado === "falta").length;
  const sustituidos = seleccion.filter((f) => f.estado === "sustituye").length;
  const iguales = seleccion.filter((f) => f.estado === "igual").length;
  const sinCatalogo = cat.marcas.length === 0 || cat.modelos.length === 0;
  const tramosFuera = elegida ? new Set(elegida.datos.tarifas.flatMap((t) => Object.keys(t.importes)).filter((k) => !tramos.includes(k))).size : 0;
  const visibles = (fs: FilaModelo[]) => fs.filter((f) => !filtro.trim() || norm(`${f.marca} ${f.modelo}`).includes(norm(filtro)));

  const aplicar = async () => {
    if (!elegida || seleccion.length === 0) return;
    setTrabajando(true);
    try {
      let marcasCat = cat.marcas;
      let modelosCat = cat.modelos;
      const faltan = seleccion.filter((f) => f.idModelo === null);
      let creado = "";
      if (faltan.length > 0) {
        const agrupado = new Map<string, { nombre: string; sistemaComisiones: boolean; accesoRapido: boolean; modelos: string[] }>();
        for (const f of faltan) {
          const cfg = elegida.datos.marcas.find((m) => norm(m.nombre) === norm(f.marca));
          const g = agrupado.get(norm(f.marca)) ?? { nombre: f.marca, sistemaComisiones: true, accesoRapido: cfg?.accesoRapido ?? false, modelos: [] };
          g.modelos.push(f.modelo);
          agrupado.set(norm(f.marca), g);
        }
        const r = await llamar<unknown>("/api/comisiones/plantillas/catalogo", { method: "POST", cuerpo: { marcas: [...agrupado.values()] } });
        const resp = r.extra as { marcasCreadas: number; marcasActivadas: number; modelosCreados: number; marcas: { id: number; nombre: string }[]; modelos: { id: number; nombre: string; marcaId: number | null }[] };
        const idsMarcas = new Set(resp.marcas.filter((m) => agrupado.has(norm(m.nombre))).map((m) => m.id));
        marcasCat = [...cat.marcas, ...resp.marcas.filter((m) => idsMarcas.has(m.id) && !cat.marcas.some((x) => x.id === m.id))];
        modelosCat = [...cat.modelos, ...resp.modelos.filter((m) => m.marcaId !== null && idsMarcas.has(m.marcaId) && !cat.modelos.some((x) => x.id === m.id))];
        alAmpliarCatalogo(marcasCat, modelosCat);
        creado = ` Se han creado ${plural(resp.marcasCreadas, "marca", "marcas")} y ${plural(resp.modelosCreados, "modelo", "modelos")} en el catálogo${resp.marcasActivadas ? ` y se ha activado «Sist. Comisiones» en ${plural(resp.marcasActivadas, "marca", "marcas")}` : ""}.`;
        router.refresh();
      }
      const idDe = (f: FilaModelo): number | null => {
        const marca = marcasCat.find((m) => norm(m.nombre) === norm(f.marca));
        return marca ? (modelosCat.find((m) => m.marcaId === marca.id && norm(m.nombre) === norm(f.modelo))?.id ?? null) : null;
      };
      const nuevas: Tarifa[] = [];
      const reemplazadas = new Set<string>();
      for (const f of seleccion) {
        const id = idDe(f);
        if (id === null) continue;
        for (const [cumplida, t] of [[true, f.tarifas.cumplida], [false, f.tarifas.noCumplida]] as const) {
          if (!t) continue;
          reemplazadas.add(`${id}|${cumplida}`);
          nuevas.push({ idModelo: id, tasaCumplida: cumplida, importes: Object.fromEntries(Object.entries(t.importes).filter(([k]) => tramos.includes(k))), activo: t.activo, orden: t.orden });
        }
      }
      setPlan((p) => ({ ...p, tarifasVN: renumerarOrden([...p.tarifasVN.filter((x) => !reemplazadas.has(`${x.idModelo}|${x.tasaCumplida}`)), ...nuevas], modelosCat) }));
      mostrar(`✅ Plantilla «${elegida.nombre}» aplicada: ${plural(nuevos, "modelo nuevo", "modelos nuevos")}, ${plural(sustituidos, "sustituido", "sustituidos")}.${creado} Revisa las tarifas y pulsa «Guardar plan» para conservarlas.`);
      alCerrar();
    } catch (e) {
      mostrar(`No se ha aplicado la plantilla. ${textoError(e)}`, "error");
    } finally {
      setTrabajando(false);
    }
  };

  const chip = (estado: FilaModelo["estado"]) => {
    const t = { nuevo: ["Nuevo en el plan", "var(--success)"], falta: ["Se crea en el catálogo", "var(--primary)"], sustituye: ["Sustituye lo que hay", "var(--warning)"], igual: ["Ya está igual", "var(--text-muted)"] }[estado];
    return <span style={{ fontSize: "0.7rem", fontWeight: 600, color: t[1], border: `1px solid ${t[1]}`, borderRadius: "999px", padding: "1px 8px", whiteSpace: "nowrap" }}>{t[0]}</span>;
  };

  return (
    <Modal
      titulo={elegida ? `📋 Aplicar «${elegida.nombre}»` : "📋 Aplicar una plantilla de tarifas"}
      ancho="860px"
      pie={
        <>
          {elegida && (
            <button type="button" className="btn btn-secondary" style={{ marginRight: "auto" }} onClick={() => setElegida(null)} disabled={trabajando}>
              ← Elegir otra plantilla
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={trabajando}>
            Cancelar
          </button>
          {elegida && (
            <button type="button" className="btn btn-primary" disabled={trabajando || seleccion.length === 0 || seleccion.length === iguales} onClick={() => void aplicar()} title="Pone las tarifas elegidas en el plan. No se guarda el plan hasta que pulses «Guardar plan».">
              {trabajando ? "Aplicando…" : `Aplicar ${plural(seleccion.length - iguales, "modelo", "modelos")}`}
            </button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem" }}>
        {!elegida && (
          <>
            <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Una plantilla guarda las tarifas por <b>nombre de marca y modelo</b>, así sirve para cualquier plan. Elige una; en el siguiente paso verás modelo a modelo qué se añade, qué sustituye lo que ya tienes y qué marcas o modelos habría que crear. <b>No se guarda nada</b> hasta que pulses «Guardar plan».
            </div>
            {lista === null && <div style={{ color: "var(--text-muted)" }}>Cargando plantillas…</div>}
            {lista?.length === 0 && <div style={{ color: "var(--text-muted)" }}>Todavía no hay plantillas. Puedes crear una con «Guardar como plantilla…».</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {lista?.map((p) => (
                <div key={p.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: "240px" }}>
                    <div style={{ fontWeight: 700 }}>
                      {p.nombre} {p.sistema && <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: "999px", padding: "1px 8px" }}>Incluida</span>}
                    </div>
                    {p.descripcion && <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{p.descripcion}</div>}
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {p.marcas.join(", ")} · {plural(p.modelos, "modelo", "modelos")}
                    </div>
                  </div>
                  <button type="button" className="btn btn-primary" style={botonChico} disabled={cargando} onClick={() => void elegirPlantilla(p)}>
                    Elegir
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {elegida && (
          <>
            {sinCatalogo && (
              <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--primary)", background: "var(--bg-card)", lineHeight: 1.5 }}>
                <b>Todavía no tienes {cat.marcas.length === 0 ? "marcas" : "modelos"} dadas de alta.</b> Marca abajo las marcas y modelos que quieres crear: se darán de alta en tu catálogo (con «Sist. Comisiones» activado) y recibirán sus tarifas. Los que no marques no se crean.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>¿Qué quieres poner en este plan?</div>
              {(
                [
                  ["completar", "Completar solo lo que falta", "Añade los modelos que el plan todavía no tiene (y crea los que no existan en el catálogo). No toca las tarifas que ya has puesto."],
                  ["reemplazar", "Reemplazar todo", "Pone todas las tarifas de la plantilla; los modelos que ya tenían tarifas se sustituyen por las de la plantilla."],
                  ["elegir", "Elegir modelo a modelo", "Marca tú abajo, marca por marca o modelo por modelo, qué se aplica."],
                ] as [Preajuste, string, string][]
              ).map(([id, titulo, ayuda]) => (
                <label key={id} style={{ display: "flex", gap: "8px", alignItems: "flex-start", cursor: "pointer" }} title={ayuda}>
                  <input type="radio" name="preajuste" checked={preajuste === id} onChange={() => setPreajuste(id)} style={{ marginTop: "3px" }} />
                  <span>
                    <b>{titulo}</b>
                    <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{ayuda}</span>
                  </span>
                </label>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <input className="form-input" placeholder="Buscar marca o modelo…" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ flex: 1, minWidth: "180px" }} />
              <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => alternar(filas.map((f) => f.clave), true)}>
                Marcar todos
              </button>
              <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => alternar(filas.map((f) => f.clave), false)}>
                Ninguno
              </button>
            </div>

            <div style={{ maxHeight: "320px", overflowY: "auto", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)" }}>
              {porMarca.map(([marca, fs]) => {
                const vis = visibles(fs);
                if (vis.length === 0) return null;
                const todas = fs.every((f) => marcados.has(f.clave));
                return (
                  <div key={marca}>
                    <label style={{ display: "flex", gap: "8px", alignItems: "center", padding: "8px 12px", background: "var(--bg-card)", fontWeight: 700, cursor: "pointer", position: "sticky", top: 0, borderBottom: "1px solid var(--border-light)" }}>
                      <input type="checkbox" checked={todas} onChange={(e) => alternar(fs.map((f) => f.clave), e.target.checked)} style={{ accentColor: "var(--primary)" }} />
                      {marca.toUpperCase()}
                      <span style={{ fontWeight: 400, fontSize: "0.78rem", color: "var(--text-muted)" }}>{plural(fs.length, "modelo", "modelos")}{fs[0].idMarca === null ? " · la marca no existe en el catálogo" : ""}</span>
                    </label>
                    {vis.map((f) => (
                      <label key={f.clave} style={{ display: "flex", gap: "8px", alignItems: "center", padding: "6px 12px 6px 30px", cursor: "pointer", borderBottom: "1px solid var(--border-light)" }}>
                        <input type="checkbox" checked={marcados.has(f.clave)} onChange={(e) => alternar([f.clave], e.target.checked)} style={{ accentColor: "var(--primary)" }} />
                        <span style={{ flex: 1, minWidth: 0 }}>{f.modelo}</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }} title="Importe del tramo X con la tasa cumplida / no cumplida">
                          X: {f.resumen}
                        </span>
                        {chip(f.estado)}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: "0.85rem", lineHeight: 1.5, padding: "10px 12px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)" }}>
              <b>Resumen:</b> {plural(seleccion.length, "modelo marcado", "modelos marcados")} → {plural(nuevos, "nuevo", "nuevos")}, {plural(sustituidos, "sustituye lo que hay", "sustituyen lo que hay")}, {plural(iguales, "ya está igual", "ya están igual")}.
              {aCrearModelos > 0 && (
                <div style={{ color: "var(--primary)" }}>
                  Se crearán en el catálogo {plural(aCrearMarcas.size, "marca", "marcas")} y {plural(aCrearModelos, "modelo", "modelos")} al aplicar{marcasSinModelo.size > 0 ? " (en las marcas que ya existen solo se añaden los modelos; si alguna no tenía «Sist. Comisiones», se activa)" : ""}.
                </div>
              )}
              {tramosFuera > 0 && <div style={{ color: "var(--warning)" }}>La plantilla trae {plural(tramosFuera, "tramo", "tramos")} fuera del rango de este plan: se ignoran.</div>}
              <div style={{ color: "var(--text-muted)" }}>Los modelos del plan que no están en la plantilla no se tocan. Importes en euros, con decimales.</div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Guardar las tarifas del plan como plantilla                         */
/* ------------------------------------------------------------------ */

function ModalGuardar({ plan, cat, alCerrar }: PropsBase & { alCerrar: () => void }) {
  const { mostrar } = useToast();
  const lista = usePlantillas(0);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [sustituir, setSustituir] = useState<number | "">("");
  const [trabajando, setTrabajando] = useState(false);

  const modelos = useMemo(() => {
    const salida = new Map<number, { id: number; marca: string; modelo: string }>();
    for (const t of plan.tarifasVN) {
      const modelo = cat.modelos.find((m) => m.id === t.idModelo);
      const marca = modelo ? cat.marcas.find((m) => m.id === modelo.marcaId) : undefined;
      if (modelo && marca) salida.set(modelo.id, { id: modelo.id, marca: marca.nombre, modelo: modelo.nombre });
    }
    return [...salida.values()].sort((a, b) => a.marca.localeCompare(b.marca, "es") || a.modelo.localeCompare(b.modelo, "es"));
  }, [plan.tarifasVN, cat]);
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(modelos.map((m) => m.id)));
  const marcas = [...new Set(modelos.map((m) => m.marca))];
  const propias = (lista ?? []).filter((p) => !p.sistema);

  const alternar = (ids: number[], activo: boolean) =>
    setMarcados((prev) => {
      const n = new Set(prev);
      for (const i of ids) {
        if (activo) n.add(i);
        else n.delete(i);
      }
      return n;
    });

  const guardar = async () => {
    setTrabajando(true);
    try {
      const elegidos = modelos.filter((m) => marcados.has(m.id));
      const tarifas = plan.tarifasVN
        .filter((t) => marcados.has(t.idModelo))
        .map((t) => {
          const m = modelos.find((x) => x.id === t.idModelo)!;
          return { marca: m.marca, modelo: m.modelo, tasaCumplida: t.tasaCumplida, importes: Object.fromEntries(Object.entries(t.importes).map(([k, v]) => [k, Math.round(v)])), activo: t.activo, orden: t.orden };
        });
      const datos: DatosPlantillaTarifas = { marcas: [...new Set(elegidos.map((m) => m.marca))].map((n) => ({ nombre: n, sistemaComisiones: true, accesoRapido: false })), tarifas };
      const cuerpo = { nombre: nombre.trim(), descripcion: descripcion.trim() || null, datos };
      if (sustituir !== "") await llamar(`/api/comisiones/plantillas?id=${sustituir}`, { method: "PUT", cuerpo });
      else await llamar("/api/comisiones/plantillas", { method: "POST", cuerpo });
      mostrar(`✅ Plantilla «${cuerpo.nombre}» guardada con ${plural(elegidos.length, "modelo", "modelos")}. La encontrarás en «Aplicar plantilla…» para cualquier plan.`);
      alCerrar();
    } catch (e) {
      mostrar(`No se ha guardado la plantilla. ${textoError(e)}`, "error");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <Modal
      titulo="💾 Guardar las tarifas de este plan como plantilla"
      ancho="720px"
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
          Se guardan las tarifas tal como están ahora en pantalla (aunque no hayas guardado el plan). Marcas y modelos se guardan por nombre, así podrás usar la plantilla en otros planes y en otras instalaciones.
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Nombre de la plantilla</label>
          <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Ej.: Renault y Dacia 2027" autoFocus />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Descripción (opcional)</label>
          <input className="form-input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500} />
        </div>
        {propias.length > 0 && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">¿Nueva o sustituir una tuya?</label>
            <select
              className="form-input"
              value={sustituir}
              onChange={(e) => {
                const v = e.target.value === "" ? "" : Number(e.target.value);
                setSustituir(v);
                const p = propias.find((x) => x.id === v);
                if (p) {
                  setNombre(p.nombre);
                  setDescripcion(p.descripcion ?? "");
                }
              }}
            >
              <option value="">Crear una plantilla nueva</option>
              {propias.map((p) => (
                <option key={p.id} value={p.id}>
                  Sustituir «{p.nombre}»
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <div style={{ fontWeight: 600, marginBottom: "6px" }}>¿Qué marcas y modelos incluir? ({marcados.size} de {modelos.length})</div>
          <div style={{ maxHeight: "260px", overflowY: "auto", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)" }}>
            {marcas.map((marca) => {
              const ms = modelos.filter((m) => m.marca === marca);
              return (
                <div key={marca}>
                  <label style={{ display: "flex", gap: "8px", alignItems: "center", padding: "8px 12px", background: "var(--bg-card)", fontWeight: 700, cursor: "pointer", borderBottom: "1px solid var(--border-light)" }}>
                    <input type="checkbox" checked={ms.every((m) => marcados.has(m.id))} onChange={(e) => alternar(ms.map((m) => m.id), e.target.checked)} style={{ accentColor: "var(--primary)" }} />
                    {marca.toUpperCase()} <span style={{ fontWeight: 400, fontSize: "0.78rem", color: "var(--text-muted)" }}>{plural(ms.length, "modelo", "modelos")}</span>
                  </label>
                  {ms.map((m) => (
                    <label key={m.id} style={{ display: "flex", gap: "8px", alignItems: "center", padding: "6px 12px 6px 30px", cursor: "pointer", borderBottom: "1px solid var(--border-light)" }}>
                      <input type="checkbox" checked={marcados.has(m.id)} onChange={(e) => alternar([m.id], e.target.checked)} style={{ accentColor: "var(--primary)" }} />
                      {m.modelo}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Gestionar plantillas                                                */
/* ------------------------------------------------------------------ */

function ModalGestionar({ alCerrar }: { alCerrar: () => void }) {
  const { mostrar } = useToast();
  const [version, setVersion] = useState(0);
  const lista = usePlantillas(version);
  const [editando, setEditando] = useState<ResumenPlantilla | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [aBorrar, setABorrar] = useState<ResumenPlantilla | null>(null);
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

  const guardarEdicion = () =>
    accion(async () => {
      if (!editando) return;
      const { data } = await llamar<PlantillaCompleta>(`/api/comisiones/plantillas?id=${editando.id}`);
      await llamar(`/api/comisiones/plantillas?id=${editando.id}`, { method: "PUT", cuerpo: { nombre: nombre.trim(), descripcion: descripcion.trim() || null, datos: data.datos } });
      setEditando(null);
    }, "✅ Plantilla actualizada.");

  return (
    <>
      <Modal
        titulo="⚙️ Plantillas de tarifas"
        ancho="820px"
        pie={
          <button type="button" className="btn btn-secondary" onClick={alCerrar}>
            Cerrar
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ color: "var(--text-secondary)", maxWidth: "460px", lineHeight: 1.5 }}>
              La plantilla «incluida» viene con la aplicación y no se puede cambiar ni borrar, pero puedes <b>duplicarla</b> y modificar la copia. Para guardar una nueva usa «Guardar como plantilla…» desde las tarifas de un plan.
            </div>
            <BotonesDatosSeccion modo="botones" seccion="plantillas_tarifas" alCambiar={recargar} />
          </div>
          {lista === null && <div style={{ color: "var(--text-muted)" }}>Cargando…</div>}
          {lista?.map((p) => (
            <div key={p.id} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "240px" }}>
                {editando?.id === p.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
                    <input className="form-input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={500} placeholder="Descripción (opcional)" />
                  </div>
                ) : (
                  <>
                    <div style={{ fontWeight: 700 }}>
                      {p.nombre} {p.sistema && <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: "999px", padding: "1px 8px" }}>Incluida</span>}
                    </div>
                    {p.descripcion && <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{p.descripcion}</div>}
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {p.marcas.join(", ")} · {plural(p.modelos, "modelo", "modelos")} · {plural(p.tarifas, "fila", "filas")} · actualizada {new Date(p.actualizadaEn).toLocaleDateString("es-ES")}
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {editando?.id === p.id ? (
                  <>
                    <button type="button" className="btn btn-primary" style={botonChico} disabled={ocupado || !nombre.trim()} onClick={() => void guardarEdicion()}>
                      Guardar
                    </button>
                    <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    {!p.sistema && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={botonChico}
                        onClick={() => {
                          setEditando(p);
                          setNombre(p.nombre);
                          setDescripcion(p.descripcion ?? "");
                        }}
                        title="Cambia el nombre o la descripción. Para cambiar las tarifas, aplícala a un plan, edítalas y vuelve a guardarla con «Sustituir»."
                      >
                        ✏️ Renombrar
                      </button>
                    )}
                    <button type="button" className="btn btn-secondary" style={botonChico} disabled={ocupado} onClick={() => void accion(async () => void (await llamar(`/api/comisiones/plantillas/duplicar?id=${p.id}`, { method: "POST" })), "✅ Plantilla duplicada.")} title="Crea una copia editable de esta plantilla.">
                      📄 Duplicar
                    </button>
                    {!p.sistema && (
                      <button type="button" className="btn btn-secondary" style={{ ...botonChico, color: "var(--danger)" }} onClick={() => setABorrar(p)} title="Borra esta plantilla. Los planes que ya la usaron no cambian.">
                        🗑️ Borrar
                      </button>
                    )}
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
              Se borrará la plantilla <b>{aBorrar.nombre}</b>. Los planes donde ya la aplicaste no cambian. Antes puedes exportarla para guardar un archivo.
            </>
          }
          textoConfirmar="Sí, borrar la plantilla"
          textoOcupado="Borrando…"
          ocupado={ocupado}
          alConfirmar={() =>
            void accion(async () => {
              await llamar(`/api/comisiones/plantillas?id=${aBorrar.id}`, { method: "DELETE" });
              setABorrar(null);
            }, "Plantilla borrada.")
          }
          alCancelar={() => setABorrar(null)}
        />
      )}
    </>
  );
}
