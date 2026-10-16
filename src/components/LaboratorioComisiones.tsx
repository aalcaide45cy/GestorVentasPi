"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { InputCentesimas, InputEntero } from "@/components/comisiones/campos";
import { llamar, textoError } from "@/components/comisiones/api";
import type { CambiosEscenario, ResultadoMes } from "@/lib/comisiones";
import { contarCambios } from "@/lib/comisiones";
import { etiquetaTramo, euros, puntos } from "@/lib/formato";
import { usePreferencia } from "@/lib/preferencias";
import type { PlanEditableEscenario, RespuestaEscenario } from "@/lib/servicios/escenario";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const TRAMOS = [-4, -3, -2, -1, 0, 1, 2, 3];
const CLAVE_ABIERTO = "laboratorio-abierto";

const aIso = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}`;
const sinCambios: CambiosEscenario = {};

type Seccion = "objetivo" | "tasas" | "reglas" | "promos" | "tarifas" | "lineas";

const celda: CSSProperties = { padding: "4px 6px", fontSize: "0.82rem", whiteSpace: "nowrap" };

function Delta({ valor, formato }: { valor: number; formato: (n: number) => string }) {
  if (valor === 0) return <span style={{ color: "var(--text-secondary)" }}>sin cambio</span>;
  return <span style={{ color: valor > 0 ? "var(--success)" : "var(--danger)", fontWeight: 700 }}>{valor > 0 ? "▲ +" : "▼ "}{formato(valor)}</span>;
}

function Bloque({ titulo, abierta, alAlternar, resumen, children }: { titulo: string; abierta: boolean; alAlternar: () => void; resumen?: string; children: ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)" }}>
      <button type="button" onClick={alAlternar} aria-expanded={abierta} style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: "8px", padding: "10px 12px", background: "transparent", border: "none", color: "var(--text-primary)", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem", textAlign: "left" }}>
        <span>{abierta ? "▾" : "▸"} {titulo}</span>
        {resumen && <span style={{ color: "var(--text-secondary)", fontWeight: 500, fontSize: "0.78rem" }}>{resumen}</span>}
      </button>
      {abierta && <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: "8px", overflowX: "auto" }}>{children}</div>}
    </div>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", fontSize: "0.85rem" }}>
      <span style={{ color: "var(--text-secondary)" }}>{etiqueta}</span>
      {children}
    </div>
  );
}

/**
 * «Laboratorio de comisiones»: panel plegable disponible en todas las pantallas para tocar reglas (objetivo, puntos, tasas,
 * reglas, promociones y tarifas) y ver al instante cómo se mueven puntos, tramo y comisiones frente al cálculo real.
 * Todo es hipotético: no modifica el plan ni guarda nada.
 */
export default function LaboratorioComisiones({ esAdministrador }: { esAdministrador: boolean }) {
  const [abiertoGuardado, guardarAbierto] = usePreferencia(CLAVE_ABIERTO);
  const abierto = abiertoGuardado === "true";
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [usuario, setUsuario] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState<{ id: number; nombre: string | null }[]>([]);
  const [cambios, setCambios] = useState<CambiosEscenario>(sinCambios);
  const [datos, setDatos] = useState<RespuestaEscenario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [recalcular, setRecalcular] = useState(0);
  const [secciones, setSecciones] = useState<Record<Seccion, boolean>>({ objetivo: true, tasas: false, reglas: false, promos: false, tarifas: false, lineas: false });
  const ultima = useRef(0);

  const nCambios = contarCambios(cambios);

  useEffect(() => {
    if (!abierto || !esAdministrador || vendedores.length > 0) return;
    llamar<{ vendedores: { id: number; nombre: string | null }[] }>("/api/admin/catalogos")
      .then((r) => setVendedores(r.data.vendedores ?? []))
      .catch(() => undefined);
  }, [abierto, esAdministrador, vendedores.length]);

  // Cálculo con un pequeño retardo para no llamar en cada tecla
  useEffect(() => {
    if (!abierto) return;
    const turno = ++ultima.current;
    const t = setTimeout(() => {
      setCargando(true);
      llamar<RespuestaEscenario>(`/api/comisiones/escenario${usuario ? `?usuario=${usuario}` : ""}`, { method: "POST", cuerpo: { mes: aIso(anio, mes), cambios } })
        .then((r) => {
          if (turno !== ultima.current) return;
          setDatos(r.data);
          setError(null);
        })
        .catch((e: unknown) => {
          if (turno === ultima.current) setError(textoError(e));
        })
        .finally(() => {
          if (turno === ultima.current) setCargando(false);
        });
    }, 350);
    return () => clearTimeout(t);
  }, [abierto, anio, mes, usuario, cambios, recalcular]);

  const moverMes = (delta: number) => {
    const total = anio * 12 + (mes - 1) + delta;
    setAnio(Math.floor(total / 12));
    setMes((total % 12) + 1);
    setCambios(sinCambios);
  };
  const alternar = (s: Seccion) => setSecciones((x) => ({ ...x, [s]: !x[s] }));

  const plan: PlanEditableEscenario | null = datos?.plan ?? null;
  const base: ResultadoMes | null = datos?.base ?? null;
  const esc: ResultadoMes | null = datos?.escenario ?? null;

  /** Cambia un valor simple; si vuelve al valor real, el cambio desaparece. */
  const fijar = <K extends "objetivoBase" | "arrastre" | "puntosPorPedido" | "penalizacionImporte" | "tramoMin" | "tramoMax">(k: K, valor: number, real: number) =>
    setCambios((c) => {
      const n = { ...c };
      if (valor === real) delete n[k];
      else n[k] = valor;
      return n;
    });
  const fijarAnidado = (grupo: "tasas" | "reglas" | "promociones", id: number, campo: string, valor: number | boolean | string, real: number | boolean | string) =>
    setCambios((c) => {
      const actual = { ...(c[grupo] ?? {}) } as Record<string, Record<string, unknown>>;
      const fila = { ...(actual[String(id)] ?? {}) };
      if (valor === real) delete fila[campo];
      else fila[campo] = valor;
      if (Object.keys(fila).length === 0) delete actual[String(id)];
      else actual[String(id)] = fila;
      const n = { ...c } as Record<string, unknown>;
      if (Object.keys(actual).length === 0) delete n[grupo];
      else n[grupo] = actual;
      return n as CambiosEscenario;
    });
  const fijarTarifa = (idModelo: number, tasaCumplida: boolean, tramo: number, importe: number, real: number) =>
    setCambios((c) => {
      const resto = (c.tarifas ?? []).filter((t) => !(t.idModelo === idModelo && t.tasaCumplida === tasaCumplida && t.tramo === tramo));
      const lista = importe === real ? resto : [...resto, { idModelo, tasaCumplida, tramo, importe }];
      const n = { ...c };
      if (lista.length === 0) delete n.tarifas;
      else n.tarifas = lista;
      return n;
    });

  const valorReglas = (id: number) => cambios.reglas?.[String(id)];
  const valorTasa = (id: number) => cambios.tasas?.[String(id)];
  const valorPromo = (id: number) => cambios.promociones?.[String(id)];
  const importeTarifa = (idModelo: number, tasaCumplida: boolean, tramo: number, real: number) => cambios.tarifas?.find((t) => t.idModelo === idModelo && t.tasaCumplida === tasaCumplida && t.tramo === tramo)?.importe ?? real;

  if (!abierto) {
    return (
      <button type="button" onClick={() => guardarAbierto("true")} className="btn btn-primary" title="Abre el laboratorio: toca reglas y mira cómo se mueven las comisiones" style={{ position: "fixed", right: "16px", bottom: "16px", zIndex: 900, padding: "10px 16px", borderRadius: "999px", boxShadow: "var(--shadow-glow)" }}>
        🧪 Laboratorio{nCambios > 0 ? ` (${nCambios})` : ""}
      </button>
    );
  }

  return (
    <aside
      className="glass-panel laboratorio-panel"
      aria-label="Laboratorio de comisiones"
      style={{ position: "fixed", right: "16px", bottom: "16px", zIndex: 900, width: "min(600px, calc(100vw - 32px))", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px", background: "var(--bg-card)", boxShadow: "0 12px 40px rgba(0,0,0,0.45)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "1.05rem" }}>🧪 Laboratorio de comisiones</strong>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" onClick={() => setCambios(sinCambios)} disabled={nCambios === 0} style={{ padding: "5px 10px", fontSize: "0.8rem" }} title="Vuelve a los valores reales del plan">
            ↺ Restablecer{nCambios > 0 ? ` (${nCambios})` : ""}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setRecalcular((n) => n + 1)} style={{ padding: "5px 10px", fontSize: "0.8rem" }} title="Vuelve a leer los expedientes y recalcular (por si has cambiado fechas)">
            ⟳
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => guardarAbierto("false")} style={{ padding: "5px 10px", fontSize: "0.8rem" }} title="Plegar el laboratorio (los cambios se conservan)">
            ▾ Plegar
          </button>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary)" }}>
        Cambia valores y mira cómo se mueven los puntos, el tramo y la comisión. Es solo una prueba: <strong>no se guarda nada</strong>. Para dejar un cambio, hazlo en el plan (Comisiones).
      </p>

      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" onClick={() => moverMes(-1)} style={{ padding: "5px 10px" }} aria-label="Mes anterior">←</button>
        <strong style={{ minWidth: "130px", textAlign: "center" }}>{MESES[mes - 1]} {anio}</strong>
        <button type="button" className="btn btn-secondary" onClick={() => moverMes(1)} style={{ padding: "5px 10px" }} aria-label="Mes siguiente">→</button>
        {esAdministrador && vendedores.length > 0 && (
          <select className="form-select" value={usuario ?? ""} onChange={(e) => { setUsuario(e.target.value ? Number(e.target.value) : null); setCambios(sinCambios); }} style={{ padding: "5px 8px", fontSize: "0.85rem", maxWidth: "190px" }} title="Vendedor">
            <option value="">Yo</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>{v.nombre ?? `Usuario ${v.id}`}</option>
            ))}
          </select>
        )}
        {cargando && <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>calculando…</span>}
      </div>

      {error && <div style={{ color: "var(--danger)", fontSize: "0.85rem" }}>⚠ {error}</div>}
      {datos && !datos.hayPlan && <div style={{ color: "var(--warning)", fontSize: "0.9rem" }}>No hay plan de comisionamiento para este mes: nada que simular.</div>}

      {plan && base && esc && (
        <>
          <div className="rejilla-propia laboratorio-totales" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
            {[
              { t: "Puntos", real: puntos(base.puntosMes), nuevo: puntos(esc.puntosMes), d: <Delta valor={esc.puntosMes - base.puntosMes} formato={(n) => puntos(Math.abs(n))} /> },
              { t: "Tramo", real: etiquetaTramo(base.tramo), nuevo: etiquetaTramo(esc.tramo), d: <Delta valor={esc.tramo - base.tramo} formato={(n) => String(Math.abs(n))} /> },
              { t: "Bruto", real: euros(base.bruto), nuevo: euros(esc.bruto), d: <Delta valor={esc.bruto - base.bruto} formato={(n) => euros(Math.abs(n))} /> },
              { t: "Neto (se cobra el mes siguiente)", real: euros(base.neto), nuevo: euros(esc.neto), d: <Delta valor={esc.neto - base.neto} formato={(n) => euros(Math.abs(n))} /> },
            ].map((x) => (
              <div key={x.t} className="glass-panel" style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 600 }}>{x.t}</span>
                <span style={{ fontSize: "1.25rem", fontWeight: 700 }}>{x.nuevo}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>real {x.real}</span>
                <span style={{ fontSize: "0.78rem" }}>{x.d}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
            Plan «{plan.nombre ?? plan.idPlan}» · objetivo X {puntos(esc.objetivoX)} · {esc.lineas.filter((l) => l.cuenta).length} coche(s) cuentan este mes
          </div>

          <Bloque titulo="🎯 Objetivo y puntos" abierta={secciones.objetivo} alAlternar={() => alternar("objetivo")} resumen={`X ${puntos(esc.objetivoX)}`}>
            <Fila etiqueta="Objetivo X base (puntos)">
              <InputCentesimas valor={cambios.objetivoBase ?? plan.objetivoBase} onChange={(n) => fijar("objetivoBase", n ?? 0, plan.objetivoBase)} ancho="100px" />
            </Fila>
            <Fila etiqueta="Arrastre (puntos)">
              <InputCentesimas valor={cambios.arrastre ?? plan.arrastre} onChange={(n) => fijar("arrastre", n ?? 0, plan.arrastre)} ancho="100px" />
            </Fila>
            <Fila etiqueta="Puntos por pedido">
              <InputCentesimas valor={cambios.puntosPorPedido ?? plan.puntosPorPedido} onChange={(n) => fijar("puntosPorPedido", n ?? 0, plan.puntosPorPedido)} ancho="100px" />
            </Fila>
            <Fila etiqueta="Penalización global (€)">
              <InputCentesimas valor={cambios.penalizacionImporte ?? plan.penalizacionImporte} onChange={(n) => fijar("penalizacionImporte", n ?? 0, plan.penalizacionImporte)} ancho="100px" />
            </Fila>
            <Fila etiqueta="Tramo mínimo / máximo">
              <span style={{ display: "inline-flex", gap: "6px" }}>
                <InputEntero valor={cambios.tramoMin ?? plan.tramoMin} min={-20} max={0} onChange={(n) => fijar("tramoMin", n, plan.tramoMin)} />
                <InputEntero valor={cambios.tramoMax ?? plan.tramoMax} min={0} max={20} onChange={(n) => fijar("tramoMax", n, plan.tramoMax)} />
              </span>
            </Fila>
          </Bloque>

          <Bloque titulo="📈 Tasa de intervención y puntos por marca" abierta={secciones.tasas} alAlternar={() => alternar("tasas")} resumen={`${plan.tasas.length} marca(s)`}>
            {plan.tasas.length === 0 && <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>El plan no tiene tasas por marca (se usa 70 %).</span>}
            {plan.tasas.map((t) => {
              const v = valorTasa(t.idMarca);
              const tasa = esc.tasaIntervencion.find((x) => x.idMarca === t.idMarca);
              const tipo = v?.tipoTasa ?? t.tipoTasa;
              return (
                <div key={t.idMarca} style={{ display: "flex", flexDirection: "column", gap: "4px", borderTop: "1px solid var(--border-light)", paddingTop: "6px" }}>
                  <strong style={{ fontSize: "0.85rem" }}>{t.nombre}{tasa ? ` · ${tasa.numerador}/${tasa.denominador} → ${tasa.cumplida ? "✅ cumplida" : "❌ no cumplida"}` : ""}</strong>
                  <Fila etiqueta={`Objetivo (${tipo === "porcentaje" ? "%" : "unidades"})`}>
                    <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                      <select className="form-select" value={tipo} onChange={(e) => fijarAnidado("tasas", t.idMarca, "tipoTasa", e.target.value, t.tipoTasa)} style={{ padding: "4px 6px", fontSize: "0.8rem" }}>
                        <option value="porcentaje">%</option>
                        <option value="unidades">unidades</option>
                      </select>
                      <InputEntero valor={v?.objetivo ?? t.objetivo} min={0} onChange={(n) => fijarAnidado("tasas", t.idMarca, "objetivo", n, t.objetivo)} />
                    </span>
                  </Fila>
                  <Fila etiqueta="Puntos por defecto del coche">
                    <InputCentesimas valor={v?.puntosDefecto ?? t.puntosDefecto} onChange={(n) => fijarAnidado("tasas", t.idMarca, "puntosDefecto", n ?? 0, t.puntosDefecto)} ancho="90px" />
                  </Fila>
                </div>
              );
            })}
          </Bloque>

          <Bloque titulo="🎁 Reglas y bonus" abierta={secciones.reglas} alAlternar={() => alternar("reglas")} resumen={`${plan.reglas.filter((r) => (valorReglas(r.id)?.activa ?? r.activa)).length}/${plan.reglas.length} activas`}>
            {plan.reglas.length === 0 && <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>El plan no tiene reglas ni bonus.</span>}
            {plan.reglas.map((r) => {
              const v = valorReglas(r.id);
              const activa = v?.activa ?? r.activa;
              return (
                <div key={r.id} className="rejilla-propia" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: "8px", alignItems: "center", opacity: activa ? 1 : 0.55, fontSize: "0.82rem" }}>
                  <input type="checkbox" checked={activa} onChange={(e) => fijarAnidado("reglas", r.id, "activa", e.target.checked, r.activa)} title="Activar o desactivar la regla" />
                  <span title={`Evento: ${r.evento}`}>{r.nombre}{r.esPenalizacion ? " (resta)" : ""} <small style={{ color: "var(--text-secondary)" }}>· {r.evento}</small></span>
                  <InputCentesimas valor={v?.importe ?? r.importe} onChange={(n) => fijarAnidado("reglas", r.id, "importe", n ?? 0, r.importe)} sufijo="€" ancho="84px" />
                  <InputCentesimas valor={v?.puntos ?? r.puntos} onChange={(n) => fijarAnidado("reglas", r.id, "puntos", n ?? 0, r.puntos)} sufijo="pts" ancho="70px" />
                </div>
              );
            })}
          </Bloque>

          <Bloque titulo="⭐ Promociones de puntos" abierta={secciones.promos} alAlternar={() => alternar("promos")} resumen={`${plan.promociones.length}`}>
            {plan.promociones.length === 0 && <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>No hay promociones.</span>}
            {plan.promociones.map((p) => {
              const v = valorPromo(p.id);
              return (
                <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: "4px", borderTop: "1px solid var(--border-light)", paddingTop: "6px" }}>
                  <strong style={{ fontSize: "0.85rem" }}>{p.nombre}</strong>
                  <Fila etiqueta="Puntos especiales (si llega al mínimo)">
                    <InputCentesimas valor={v?.puntosEspeciales ?? p.puntosEspeciales} onChange={(n) => fijarAnidado("promociones", p.id, "puntosEspeciales", n ?? 0, p.puntosEspeciales)} ancho="90px" />
                  </Fila>
                  <Fila etiqueta="Mínimo de unidades">
                    <InputEntero valor={v?.minimoUnidades ?? p.minimoUnidades} min={0} onChange={(n) => fijarAnidado("promociones", p.id, "minimoUnidades", n, p.minimoUnidades)} />
                  </Fila>
                  <Fila etiqueta="Puntos si no cumple">
                    <InputCentesimas valor={v?.puntosSiNoCumple ?? p.puntosSiNoCumple} onChange={(n) => fijarAnidado("promociones", p.id, "puntosSiNoCumple", n ?? 0, p.puntosSiNoCumple)} ancho="90px" />
                  </Fila>
                </div>
              );
            })}
          </Bloque>

          <Bloque titulo="🚗 Tarifas VN de los modelos de este mes" abierta={secciones.tarifas} alAlternar={() => alternar("tarifas")} resumen={`tramo actual ${etiquetaTramo(esc.tramo)}`}>
            {plan.tarifas.length === 0 && <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Este mes no cuenta ningún VN: no hay tarifas que mostrar.</span>}
            {plan.tarifas.length > 0 && (
              <table style={{ borderCollapse: "collapse", minWidth: "520px" }}>
                <thead>
                  <tr style={{ color: "var(--text-secondary)" }}>
                    <th style={{ ...celda, textAlign: "left" }}>Modelo</th>
                    {TRAMOS.map((t) => (
                      <th key={t} style={{ ...celda, textAlign: "right", color: t === esc.tramo ? "var(--primary)" : undefined }}>{etiquetaTramo(t)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.tarifas.map((tf) => (
                    <tr key={`${tf.idModelo}-${tf.tasaCumplida}`} style={{ borderTop: "1px solid var(--border-light)" }}>
                      <td style={celda}>{tf.nombre}<br /><small style={{ color: "var(--text-secondary)" }}>{tf.tasaCumplida ? "tasa cumplida" : "tasa no cumplida"}</small></td>
                      {TRAMOS.map((t) => (
                        <td key={t} style={{ ...celda, background: t === esc.tramo ? "var(--bg-surface-tint)" : undefined }}>
                          <InputCentesimas valor={importeTarifa(tf.idModelo, tf.tasaCumplida, t, tf.importes[String(t)] ?? 0)} onChange={(n) => fijarTarifa(tf.idModelo, tf.tasaCumplida, t, n ?? 0, tf.importes[String(t)] ?? 0)} ancho="72px" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Bloque>

          <Bloque titulo="📋 Resultado por expediente" abierta={secciones.lineas} alAlternar={() => alternar("lineas")} resumen={`${esc.lineas.length}`}>
            {esc.lineas.length === 0 && <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>No hay expedientes que cuenten este mes.</span>}
            {esc.lineas.length > 0 && (
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ color: "var(--text-secondary)", textAlign: "left" }}>
                    <th style={celda}>Expediente</th>
                    <th style={{ ...celda, textAlign: "right" }}>Puntos</th>
                    <th style={{ ...celda, textAlign: "right" }}>Real</th>
                    <th style={{ ...celda, textAlign: "right" }}>Prueba</th>
                  </tr>
                </thead>
                <tbody>
                  {esc.lineas.map((l) => {
                    const real = base.lineas.find((x) => x.idExpediente === l.idExpediente)?.importe ?? 0;
                    return (
                      <tr key={l.idExpediente} style={{ borderTop: "1px solid var(--border-light)" }}>
                        <td style={celda}><Link href={`/dashboard/expedientes/editar/${l.idExpediente}`} style={{ color: "inherit" }}>#{l.idExpediente} · {l.clase}{l.cuenta ? "" : " (otros conceptos)"}</Link></td>
                        <td style={{ ...celda, textAlign: "right" }}>{puntos(l.puntos)}</td>
                        <td style={{ ...celda, textAlign: "right" }}>{euros(real)}</td>
                        <td style={{ ...celda, textAlign: "right", fontWeight: 700, color: l.importe > real ? "var(--success)" : l.importe < real ? "var(--danger)" : undefined }}>{euros(l.importe)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Bloque>

          {esc.avisos.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {esc.avisos.map((a) => (
                <span key={a} style={{ color: "var(--warning)", fontSize: "0.78rem" }}>⚠ {a}</span>
              ))}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
