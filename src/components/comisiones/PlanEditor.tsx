"use client";

import { useEffect, useMemo, useState } from "react";
import { borrarBorrador, leerBorrador, useGuardarBorrador } from "@/lib/borrador";
import { useToast } from "@/components/Toast";
import { eurosConSigno, nombreMes } from "@/lib/formato";
import { llamar, textoError } from "./api";
import PlantillasPlan from "./PlantillasPlan";
import TabLiquidacion from "./TabLiquidacion";
import TabModelos from "./TabModelos";
import TabNotas from "./TabNotas";
import TabObjetivo from "./TabObjetivo";
import { TabBonus, TabPenalizaciones, TabReglas } from "./TabReglas";
import TabResumen from "./TabResumen";
import TabUsados from "./TabUsados";
import type { Ambito } from "@/lib/plantillas-plan/fragmentos";
import type { CatalogosComisiones, Plan } from "./tipos";

const PESTANAS = [
  { id: "resumen", icono: "📋", titulo: "Resumen" },
  { id: "objetivo", icono: "🎯", titulo: "Objetivo" },
  { id: "modelos", icono: "🚙", titulo: "VN" },
  { id: "usados", icono: "🚐", titulo: "Usados / VO" },
  { id: "reglas", icono: "⚙️", titulo: "Financ/Reglas" },
  { id: "bonus", icono: "🎁", titulo: "Bonus" },
  { id: "penalizaciones", icono: "⚠️", titulo: "Penalizaciones" },
  { id: "liquidacion", icono: "💰", titulo: "Liquidación" },
  { id: "notas", icono: "📝", titulo: "Notas" },
] as const;

type IdPestana = (typeof PESTANAS)[number]["id"];

/** Qué hace cada pestaña y cómo se aplica, en lenguaje llano (se enseña encima de su contenido). */
const INTRO: Record<IdPestana, string> = {
  resumen:
    "Datos generales del plan: nombre, fechas y vendedores. Un plan vale para los meses entre «F. inicio» y «F. fin». Cada coche cuenta en el mes de su fecha de facturación (en un VN, por defecto igual a la de matriculación; sin facturación, la de matriculación). La fecha de entrega es solo un apunte y no afecta a nada.",
  objetivo:
    "Los puntos que debe sumar cada vendedor en el mes (Objetivo X = base + arrastre). Con los puntos reales (nuevos y usados) se calcula el tramo del mes, de −4 a +3, y el tramo decide cuánto se cobra por cada coche nuevo en la pestaña VN. Aquí también se fijan los puntos por defecto de cada marca y modelo, la tasa de intervención y las promociones de puntos.",
  modelos:
    "Lo que cobra el vendedor por cada coche NUEVO (VN), según el modelo, el tramo del mes y si se cumple la tasa de intervención de la marca. Esta pestaña no afecta a los usados: para ellos mira «Usados / VO».",
  usados:
    "Todo lo de los coches de ocasión (VO): si suman puntos, cuánto se paga por cada uno y en qué orden se decide. Usado, KM0, Demo y Buyback son lo mismo; los subtipos y qué estados son usados se gestionan en Configuración › Estados.",
  reglas:
    "Dinero por financiar. «Incentivo de financiación»: importe por marca y tipo (Crédito, Preference, Renting) en el mes de la fecha RCI. «Reglas Preference / BOX3»: extra por modelo o marca. En cada línea eliges «Se aplica a»: nuevos, usados o un subtipo de usado, porque los usados tienen su propio sistema. «Reglas especiales»: sumas de importe o puntos con condiciones.",
  bonus:
    "Premios de campaña: importe o puntos extra cuando un coche cumple las condiciones de la regla (evento, marca, modelo, fechas, tipo de vehículo o subtipo de usado, tasa de intervención). Cada bonus se genera en el mes de su propio evento.",
  penalizaciones:
    "Lo que se resta. La penalización única global se descuenta del total del mes (la comisión neta nunca baja de 0). Las reglas dinámicas restan su importe en el mes de su evento cuando el coche cumple los filtros, incluido el tipo de vehículo o subtipo de usado.",
  liquidacion:
    "El resultado del plan mes a mes y vendedor por vendedor. Lo generado en el mes M se cobra en la nómina de fin del mes M+1. Aquí generas, revisas y cierras las liquidaciones; si cambias un expediente de un mes cerrado, se recalcula y se guarda la versión anterior.",
  notas:
    "Notas libres del plan y control de dinero pendiente: lo que la empresa te debe de meses anteriores y lo que todavía no has cobrado. Se suma a la previsión de nómina y no cambia el cálculo de comisiones.",
};

/** Ámbito de plantillas de cada pestaña (VN tiene sus propias plantillas de tarifas y Liquidación no se edita). */
const AMBITO_PESTANA: Partial<Record<IdPestana, Ambito>> = { resumen: "resumen", objetivo: "objetivo", usados: "usados", reglas: "reglas", bonus: "bonus", penalizaciones: "penalizaciones", notas: "notas" };

interface Props {
  inicial: Plan | null;
  cat: CatalogosComisiones;
  solapados: string[];
  onGuardado: (idPlan: number) => void;
  onVolver: () => void;
  /** Pestaña con la que se abre (por ejemplo desde un enlace del desglose de un expediente). */
  pestanaInicial?: string;
}

const PLAN_VACIO = (): Plan => {
  const hoy = new Date();
  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return {
    idPlan: 0,
    nombre: nombreMes(mes),
    fechaInicio: `${mes}-01`,
    fechaFin: `${mes}-${String(ultimo).padStart(2, "0")}`,
    estado: "borrador",
    tramoMin: -4,
    tramoMax: 3,
    puntosPorPedido: 0,
    voPuntosModo: "cuentan",
    voPuntos: 100,
    tasaGlobalTipo: "porcentaje",
    tasaGlobalObjetivo: null,
    tasaVoTipo: "porcentaje",
    tasaVoObjetivo: null,
    tasaIncluyeVo: true,
    penalizacionImporte: 0,
    penalizacionTitulo: null,
    penalizacionDescripcion: null,
    notas: null,
    vendedores: [],
    promociones: [],
    puntosModelo: [],
    tasas: [],
    tarifasVN: [],
    usados: [],
    patrones: [],
    financiacion: [],
    preference: [],
    reglas: [],
    bonus: [],
    pendientes: [],
  };
};

/** Editor de un plan con las 9 pestañas del original. */
export default function PlanEditor({ inicial, cat, solapados, onGuardado, onVolver, pestanaInicial }: Props) {
  const { mostrar } = useToast();
  // Si se recarga la página (F5) con el plan a medias, se recupera lo que había sin guardar y la pestaña en la que estabas
  const claveBorrador = `plan-${inicial?.idPlan ?? 0}`;
  // Un plan que se abre a propósito con sus datos (por ejemplo, una copia con el mes elegido) no recupera un borrador viejo: el borrador solo
  // sirve para volver a donde estabas tras recargar la página. Antes, un borrador olvidado de otro plan nuevo pisaba las fechas de la copia.
  const [borrador] = useState(() => (inicial && inicial.idPlan === 0 ? null : leerBorrador<{ plan: Plan; pestana: IdPestana }>(claveBorrador)));
  useEffect(() => {
    if (inicial && inicial.idPlan === 0) borrarBorrador(claveBorrador);
    // Al salir del editor dentro de la aplicación (Volver, el menú…) el borrador ya no hace falta; al recargar (F5) sí se conserva
    return () => borrarBorrador(claveBorrador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [plan, setPlanEstado] = useState<Plan>(borrador?.plan ?? inicial ?? PLAN_VACIO());
  const [guardado, setGuardado] = useState(JSON.stringify(inicial && inicial.idPlan !== 0 ? inicial : null));
  const [pestana, setPestana] = useState<IdPestana>(borrador?.pestana && PESTANAS.some((p) => p.id === borrador.pestana) ? borrador.pestana : PESTANAS.some((p) => p.id === pestanaInicial) ? (pestanaInicial as IdPestana) : "resumen");
  const [guardando, setGuardando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  // Fechas bloqueadas por defecto: con el candado cerrado solo se cambian con las flechas
  const [fechasBloqueadas, setFechasBloqueadas] = useState(true);
  // Si el usuario escribe un nombre propio en esta sesión, el nombre deja de seguir al mes
  const [nombreManual, setNombreManual] = useState(false);

  const hayCambios = useMemo(() => JSON.stringify(plan) !== guardado, [plan, guardado]);
  const setPlan = (cambio: (p: Plan) => Plan) => setPlanEstado((p) => cambio(p));
  useGuardarBorrador(claveBorrador, () => ({ plan, pestana }), hayCambios);
  // La dirección recuerda qué plan y qué pestaña hay abiertos: al recargar con F5 se vuelve justo ahí
  useEffect(() => {
    window.history.replaceState(null, "", `${window.location.pathname}?plan=${plan.idPlan === 0 ? "nuevo" : plan.idPlan}&tab=${pestana}`);
  }, [plan.idPlan, pestana]);
  useEffect(
    () => () => {
      window.history.replaceState(null, "", window.location.pathname);
    },
    [],
  );

  /** Nombre automático: «Julio 2026», «Copia de Julio 2026» (plan copiado) o el antiguo «Plan AAAA-MM». Un nombre propio («Plan especial») no lo es. */
  const esNombreAutomatico = (n: string) => {
    const t = n.trim();
    if (t === "" || /^Plan \d{4}-\d{2}$/.test(t)) return true;
    return /^(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) \d{4}$/.test(t.replace(/^Copia de /i, ""));
  };
  const siguePorMes = (p: Plan) => !nombreManual && esNombreAutomatico(p.nombre);

  /** Si las fechas son un mes natural completo y el nombre es automático, el nombre sigue al mes. */
  const nombreSegunFechas = (p: Plan): Plan => {
    const ini = /^(\d{4})-(\d{2})-01$/.exec(p.fechaInicio);
    if (!ini || !siguePorMes(p)) return p;
    const ultimo = new Date(Number(ini[1]), Number(ini[2]), 0).getDate();
    return p.fechaFin === `${ini[1]}-${ini[2]}-${String(ultimo).padStart(2, "0")}` ? { ...p, nombre: nombreMes(`${ini[1]}-${ini[2]}`) } : p;
  };

  /** Fija el plan a un mes natural (día 1 al último día) y, si el nombre es automático, lo pone al mes («Septiembre 2026»). */
  const fijarMes = (anio: number, mes0: number) => {
    const m = new Date(anio, mes0, 1);
    const clave = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
    const ultimo = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    setPlan((p) => ({
      ...p,
      nombre: siguePorMes(p) ? nombreMes(clave) : p.nombre,
      fechaInicio: `${clave}-01`,
      fechaFin: `${clave}-${String(ultimo).padStart(2, "0")}`,
    }));
  };
  const moverMes = (delta: -1 | 1) => {
    const base = /^\d{4}-\d{2}/.test(plan.fechaInicio) ? plan.fechaInicio : new Date().toISOString().slice(0, 7);
    fijarMes(Number(base.slice(0, 4)), Number(base.slice(5, 7)) - 1 + delta);
  };
  const mesActual = () => {
    const hoy = new Date();
    fijarMes(hoy.getFullYear(), hoy.getMonth());
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const nuevo = plan.idPlan === 0;
      const { data, extra } = await llamar<Plan>(nuevo ? "/api/comisiones/planes" : `/api/comisiones/planes?id=${plan.idPlan}`, { method: nuevo ? "POST" : "PUT", cuerpo: plan });
      setPlanEstado(data);
      setGuardado(JSON.stringify(data));
      const impactos = (extra.impactos ?? []) as { mes: string; diferencia: number }[];
      mostrar(impactos.length ? `Plan guardado. Meses cerrados modificados: ${impactos.map((i) => `${nombreMes(i.mes)} ${eurosConSigno(i.diferencia)}`).join(", ")}` : "Plan guardado correctamente", "exito");
      if (nuevo) onGuardado(data.idPlan);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setGuardando(false);
    }
  };

  const props = { plan, setPlan, cat };
  const estiloFlecha: React.CSSProperties = { padding: "4px 12px", opacity: fechasBloqueadas ? 0.45 : 1, cursor: fechasBloqueadas ? "not-allowed" : "pointer" };
  const campoCabecera = { display: "flex", alignItems: "center", gap: "12px" } as const;
  const etiquetaCabecera = { color: "var(--text-secondary)", fontSize: "0.95rem", minWidth: "72px" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {borrador && (
        <div role="status" style={{ padding: "10px 14px", borderLeft: "4px solid var(--info)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: "0.88rem", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          ♻️ Se han recuperado los cambios del plan que tenías sin guardar (la página se recargó). Revísalos y guarda.
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} onClick={() => { borrarBorrador(claveBorrador); window.location.reload(); }}>
            Descartarlos y volver a lo guardado
          </button>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <button type="button" className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "0.85rem" }} onClick={() => (hayCambios ? setSaliendo(true) : onVolver())}>
              ← Volver a Planes
            </button>
          </div>
          <div style={campoCabecera}>
            <label style={etiquetaCabecera}>Nombre:</label>
            <input className="form-input" style={{ width: "min(420px, 80vw)", fontSize: "1.05rem", fontWeight: 600 }} value={plan.nombre} onChange={(e) => { setNombreManual(!esNombreAutomatico(e.target.value)); setPlan((p) => ({ ...p, nombre: e.target.value })); }} />
          </div>
          <div style={{ ...campoCabecera, flexWrap: "wrap", gap: "12px 20px" }}>
            <span style={campoCabecera}>
              <label style={etiquetaCabecera}>F. Inicio:</label>
              <input className="form-input" type="date" disabled={fechasBloqueadas} style={{ width: "165px" }} value={plan.fechaInicio} onChange={(e) => setPlan((p) => nombreSegunFechas({ ...p, fechaInicio: e.target.value }))} />
            </span>
            <span style={campoCabecera}>
              <label style={{ ...etiquetaCabecera, minWidth: 0 }}>F. Fin:</label>
              <input className="form-input" type="date" disabled={fechasBloqueadas} style={{ width: "165px" }} value={plan.fechaFin} onChange={(e) => setPlan((p) => nombreSegunFechas({ ...p, fechaFin: e.target.value }))} />
            </span>
            <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px" }} onClick={() => setFechasBloqueadas((b) => !b)} title={fechasBloqueadas ? "Fechas bloqueadas: pulsa para escribirlas a mano" : "Fechas desbloqueadas: pulsa para bloquearlas"}>
              {fechasBloqueadas ? "🔒" : "🔓"}
            </button>
            <span style={{ display: "flex", gap: "6px" }}>
              <button type="button" className="btn btn-secondary" style={estiloFlecha} disabled={fechasBloqueadas} onClick={() => moverMes(-1)} title={fechasBloqueadas ? "Desbloquea el candado para mover las fechas" : "Mes anterior"}>←</button>
              <button type="button" className="btn btn-secondary" style={estiloFlecha} disabled={fechasBloqueadas} onClick={mesActual} title={fechasBloqueadas ? "Desbloquea el candado para mover las fechas" : "Mes actual"}>Actual</button>
              <button type="button" className="btn btn-secondary" style={estiloFlecha} disabled={fechasBloqueadas} onClick={() => moverMes(1)} title={fechasBloqueadas ? "Desbloquea el candado para mover las fechas" : "Mes siguiente"}>→</button>
            </span>
          </div>
        </div>
        <button type="button" className="btn btn-primary" disabled={guardando || !hayCambios} onClick={guardar}>
          {guardando ? "Guardando…" : hayCambios ? "💾 Guardar Cambios" : "Sin cambios"}
        </button>
      </div>

      <div role="tablist" style={{ display: "flex", gap: "4px", flexWrap: "wrap", borderBottom: "1px solid var(--border-light)" }}>
        {PESTANAS.map((p) => {
          const activa = pestana === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setPestana(p.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 16px",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${activa ? "var(--primary)" : "transparent"}`,
                marginBottom: "-1px",
                color: activa ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: activa ? 700 : 600,
                fontSize: "0.95rem",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "var(--transition)",
              }}
            >
              <span aria-hidden="true">{p.icono}</span>
              {p.titulo}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px 24px", flexWrap: "wrap" }}>
        {AMBITO_PESTANA[pestana] ? <PlantillasPlan key={pestana} ambito={AMBITO_PESTANA[pestana]!} plan={plan} setPlan={setPlan} cat={cat} /> : <span />}
        <PlantillasPlan ambito="global" plan={plan} setPlan={setPlan} cat={cat} />
      </div>

      <div style={{ padding: "10px 14px", borderLeft: "3px solid var(--primary)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", lineHeight: 1.55, color: "var(--text-secondary)" }}>{INTRO[pestana]}</div>

      {pestana === "resumen" && <TabResumen {...props} solapados={solapados} />}
      {pestana === "objetivo" && <TabObjetivo {...props} />}
      {pestana === "modelos" && <TabModelos {...props} />}
      {pestana === "usados" && <TabUsados {...props} />}
      {pestana === "reglas" && <TabReglas {...props} />}
      {pestana === "bonus" && <TabBonus {...props} />}
      {pestana === "penalizaciones" && <TabPenalizaciones {...props} />}
      {pestana === "liquidacion" && (plan.idPlan === 0 ? <p>Guarda el plan para poder calcular liquidaciones.</p> : <TabLiquidacion {...props} hayCambios={hayCambios} />)}
      {pestana === "notas" && <TabNotas {...props} />}

      {saliendo && (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: "20px" }}>
          <div className="glass-panel" style={{ padding: "32px", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "16px", borderLeft: "4px solid var(--warning)" }}>
            <h3>⚠️ Cambios sin guardar</h3>
            <p style={{ color: "var(--text-secondary)" }}>Hay cambios en el plan que no se han guardado. ¿Quieres salir y descartarlos?</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSaliendo(false)}>
                Seguir editando
              </button>
              <button type="button" className="btn btn-primary" onClick={() => { borrarBorrador(claveBorrador); onVolver(); }}>
                Descartar y salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
