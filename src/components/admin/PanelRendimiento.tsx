"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { Instantanea, Muestra, PruebaBd, PruebaDisco } from "@/lib/rendimiento";
import type { ConsultaLenta, ResumenRuta } from "@/lib/rendimiento-registro";

interface Respuesta {
  instantanea: Instantanea;
  historial: Muestra[];
  peticiones: { total: number; rutas: ResumenRuta[] };
  consultasLentas: ConsultaLenta[];
}

const COLOR = { alto: "var(--danger)", medio: "var(--warning)", info: "var(--text-secondary)" } as const;
const ICONO = { alto: "🔴", medio: "🟠", info: "ℹ️" } as const;

/** Línea pequeña con la evolución de una medida (últimas muestras). */
function Linea({ valores, max, color = "var(--primary)" }: { valores: (number | null)[]; max: number; color?: string }) {
  const v = valores.map((x) => x ?? 0);
  if (v.length < 2) return <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>recogiendo datos…</span>;
  const w = 220;
  const h = 34;
  const puntos = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - (Math.min(x, max) / max) * (h - 2) - 1).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label="evolución">
      <polyline points={puntos} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Medidor({ titulo, valor, texto, pct, malo, ayuda, historia, maxHistoria, invertir }: { titulo: string; valor: string; texto?: string; pct: number | null; malo: boolean; ayuda: string; historia?: (number | null)[]; maxHistoria?: number; invertir?: boolean }) {
  const color = malo ? "var(--danger)" : "var(--primary)";
  return (
    <div className="glass-panel" title={ayuda} style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "6px", border: "1px solid var(--border-light)" }}>
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{titulo}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 700, color: malo ? "var(--danger)" : undefined }}>{valor}</div>
      {texto && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{texto}</div>}
      {pct !== null && (
        <div style={{ height: "6px", borderRadius: "3px", background: "var(--border-light)", overflow: "hidden" }}>
          <div style={{ width: `${Math.max(0, Math.min(100, invertir ? 100 - pct : pct))}%`, height: "100%", background: color }} />
        </div>
      )}
      {historia && <Linea valores={historia} max={maxHistoria ?? 100} color={color} />}
    </div>
  );
}

/** «Rendimiento»: qué hace que el equipo vaya lento (CPU, memoria, temperatura, disco, base de datos, lecturas, peticiones lentas). */
export default function PanelRendimiento() {
  const { mostrar } = useToast();
  const [d, setD] = useState<Respuesta | null>(null);
  const [auto, setAuto] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [probando, setProbando] = useState<"disco" | "bd" | null>(null);
  const [disco, setDisco] = useState<PruebaDisco | null>(null);
  const [bd, setBd] = useState<PruebaBd | null>(null);
  const vivo = useRef(true);

  const leer = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await llamar<Respuesta>("/api/admin/rendimiento");
      if (vivo.current) setD(data);
    } catch (e) {
      if (vivo.current) mostrar(textoError(e), "error");
    } finally {
      if (vivo.current) setCargando(false);
    }
  }, [mostrar]);

  useEffect(() => {
    vivo.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void leer();
    return () => {
      vivo.current = false;
    };
  }, [leer]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void leer(), 5000);
    return () => clearInterval(t);
  }, [auto, leer]);

  const probar = async (prueba: "disco" | "bd") => {
    setProbando(prueba);
    try {
      const { data } = await llamar<PruebaDisco | PruebaBd>("/api/admin/rendimiento", { method: "POST", cuerpo: { prueba } });
      if (prueba === "disco") setDisco(data as PruebaDisco);
      else setBd(data as PruebaBd);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setProbando(null);
    }
  };

  const copiarInforme = async () => {
    try {
      const r = await fetch("/api/admin/rendimiento?informe=1", { credentials: "same-origin" });
      if (!r.ok) throw new Error("No se pudo generar el informe");
      let texto = await r.text();
      if (disco) texto += `\n\n== Prueba de disco ==\nEscritura ${disco.escrituraMBs} MB/s · lectura ${disco.lecturaMBs} MB/s · ${disco.escriturasSyncPorSeg} escrituras pequeñas sincronizadas por segundo (${disco.latenciaSyncMs} ms cada una)\n${disco.veredicto}`;
      if (bd) texto += `\n\n== Prueba de base de datos ==\nConsulta mínima ${bd.consultaMinimaMs} ms de media (máx ${bd.consultaMinimaMaxMs} ms) · contar expedientes ${bd.contarExpedientesMs} ms · listar 200 clientes ${bd.listarClientesMs} ms\n${bd.veredicto}`;
      await navigator.clipboard.writeText(texto);
      mostrar("Informe copiado: pégalo donde haga falta.");
    } catch (e) {
      mostrar(`No se pudo copiar solo (${textoError(e)}). Usa «Descargar informe».`, "error");
    }
  };

  if (!d) return <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Midiendo el equipo…</p>;
  const s = d.instantanea;
  const m = s.muestra;
  const h = d.historial;
  const serie = (f: (x: Muestra) => number | null) => h.map(f);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>🩺 Rendimiento: por qué va lento</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
          Mide el equipo (procesador, memoria, temperatura, disco), la base de datos, las lecturas de pedidos y las peticiones más lentas, y te dice qué parece estar frenando. Se anota cada 30 segundos aunque no tengas esta pantalla abierta. Cuando vaya lento, pulsa <b>Copiar informe</b> y pégamelo.
        </p>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.85rem" }} onClick={() => void copiarInforme()} title="Copia al portapapeles un informe completo con todo lo de esta pantalla, la evolución y los últimos avisos del registro">
          📋 Copiar informe
        </button>
        <a className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.85rem", textDecoration: "none" }} href="/api/admin/rendimiento?informe=1" target="_blank" rel="noreferrer" title="Abre el informe como texto en otra pestaña">
          📄 Ver informe
        </a>
        <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.85rem" }} disabled={cargando} onClick={() => void leer()}>
          {cargando ? "Midiendo…" : "🔄 Actualizar"}
        </button>
        <label style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "0.85rem", cursor: "pointer" }} title="Vuelve a medir cada 5 segundos">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ accentColor: "var(--primary)" }} />
          Actualizar solo
        </label>
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {s.equipo.modelo ?? `${s.equipo.plataforma}/${s.equipo.arquitectura}`} · {s.equipo.nucleos} núcleos · encendido hace {s.equipo.arrancadoHaceMin} min
        </span>
      </div>

      <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px", border: "1px solid var(--border-light)" }}>
        <div style={{ fontWeight: 700 }}>Qué parece estar pasando</div>
        {s.hallazgos.map((x, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", fontSize: "0.88rem", lineHeight: 1.5, color: x.nivel === "info" ? COLOR.info : undefined }}>
            <span aria-hidden="true">{ICONO[x.nivel]}</span>
            <span style={{ borderLeft: `3px solid ${COLOR[x.nivel]}`, paddingLeft: "8px" }}>{x.texto}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "12px" }}>
        <Medidor titulo="Procesador (CPU)" valor={`${m.cpu} %`} texto={`carga ${m.carga1} · ${s.equipo.nucleos} núcleos · la aplicación usa ${s.proceso.cpuPct} %`} pct={m.cpu} malo={m.cpu >= 90} ayuda="Porcentaje de uso de todo el procesador. Sostenido por encima del 90 % el equipo va lento." historia={serie((x) => x.cpu)} />
        <Medidor titulo="Memoria libre" valor={`${m.memLibrePct} %`} texto={`${s.memoria.libreMb} de ${s.memoria.totalMb} MB · swap usado ${s.memoria.swapUsadoMb} MB`} pct={m.memLibrePct} invertir malo={m.memLibrePct <= 10 || s.memoria.swapUsadoMb >= 300} ayuda="Memoria disponible. Si se agota, el sistema usa la tarjeta SD como memoria (swap) y todo se vuelve muy lento." historia={serie((x) => 100 - x.memLibrePct)} />
        <Medidor titulo="Temperatura" valor={m.tempC === null ? "—" : `${m.tempC} °C`} texto={s.limitacion ? (s.limitacion.ahora.length > 0 ? `⚠️ limitando: ${s.limitacion.ahora[0]}` : s.limitacion.desdeElArranque.length > 0 ? "limitó la velocidad antes (desde el arranque)" : "sin limitaciones") : "sin datos de limitación"} pct={m.tempC === null ? null : Math.round((m.tempC / 90) * 100)} malo={(m.tempC ?? 0) >= 80 || (s.limitacion?.ahora.length ?? 0) > 0} ayuda="A partir de 80 °C la Raspberry baja su velocidad para no quemarse. También avisa si la fuente de alimentación no da suficiente tensión." historia={serie((x) => x.tempC)} maxHistoria={90} />
        <Medidor titulo={`Disco${s.disco.dispositivo ? ` (${s.disco.dispositivo})` : ""}`} valor={s.disco.ioPct === null ? "—" : `${s.disco.ioPct} %`} texto={`lee ${s.disco.leidoMBs ?? "—"} MB/s · escribe ${s.disco.escritoMBs ?? "—"} MB/s · libre ${s.disco.libreGb ?? "—"} de ${s.disco.totalGb ?? "—"} GB`} pct={s.disco.ioPct} malo={(s.disco.ioPct ?? 0) >= 85} ayuda="Cuánto tiempo está ocupado el disco. Una tarjeta SD saturada es la causa más común de lentitud en una Raspberry." historia={serie((x) => x.ioPct)} />
        <Medidor titulo="Espera de disco (PSI)" valor={m.psiIo === null ? "—" : `${m.psiIo} %`} texto={`espera de CPU ${m.psiCpu ?? "—"} % · de memoria ${m.psiMem ?? "—"} %`} pct={m.psiIo === null ? null : Math.min(100, m.psiIo * 2)} malo={(m.psiIo ?? 0) >= 25} ayuda="Porcentaje del tiempo en que los programas esperan al disco. Más del 10-25 % se nota como lentitud." historia={serie((x) => x.psiIo)} maxHistoria={50} />
        <Medidor titulo="Bloqueo del servidor" valor={`${m.lagMs} ms`} texto={`la aplicación ocupa ${s.proceso.rssMb} MB`} pct={Math.min(100, m.lagMs / 5)} malo={m.lagMs >= 300} ayuda="Lo máximo que el servidor ha estado sin atender peticiones en los últimos 30 segundos. Más de 300 ms se nota como pantallas que tardan." historia={serie((x) => x.lagMs)} maxHistoria={500} />
      </div>

      <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px", border: "1px solid var(--border-light)" }}>
        <div style={{ fontWeight: 700 }}>Lo que se está ejecutando</div>
        {s.lecturas && (
          <div style={{ fontSize: "0.88rem" }}>
            📄 Lecturas de pedidos: <b>{s.lecturas.leyendo}</b> leyéndose, <b>{s.lecturas.pendientes}</b> en espera · motor <b>{s.lecturas.motor}</b> · a la vez: <b>{s.lecturas.simultaneas === 0 ? "automático" : s.lecturas.simultaneas}</b>
          </div>
        )}
        {s.trabajos.restauracionEnCurso && <div style={{ fontSize: "0.88rem" }}>♻️ Hay una restauración de copia en curso.</div>}
        {"error" in s.bd ? (
          <div style={{ fontSize: "0.88rem", color: "var(--danger)" }}>🛑 Base de datos: {s.bd.error}</div>
        ) : (
          <>
            <div style={{ fontSize: "0.88rem" }}>
              🗄️ Base de datos: {s.bd.version} · {s.bd.tamanoMb} MB · responde en <b>{s.bd.latenciaMs} ms</b> · acierto de caché <b>{s.bd.aciertoCachePct ?? "—"} %</b> · conexiones {s.bd.conexiones.activas} activas / {s.bd.conexiones.ociosas} ociosas (máx. {s.bd.conexiones.maximo})
            </div>
            {s.bd.consultasActivas.length > 0 && (
              <div style={{ fontSize: "0.8rem" }}>
                <div style={{ color: "var(--text-muted)", marginBottom: "4px" }}>Consultas en marcha ahora:</div>
                {s.bd.consultasActivas.map((c) => (
                  <div key={c.pid} style={{ fontFamily: "monospace", wordBreak: "break-word", color: c.segundos >= 5 ? "var(--danger)" : undefined }}>
                    {c.segundos} s · {c.estado}
                    {c.espera ? ` (${c.espera})` : ""} · {c.sql}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Tablas más grandes: {s.bd.tablasGrandes.map((t) => `${t.tabla} ${t.mb} MB`).join(" · ")}</div>
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px" }}>
        <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "6px", border: "1px solid var(--border-light)" }}>
          <div style={{ fontWeight: 700 }}>Peticiones más pesadas (última media hora)</div>
          {d.peticiones.rutas.length === 0 ? (
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Todavía no hay datos.</div>
          ) : (
            d.peticiones.rutas.map((r) => (
              <div key={`${r.metodo} ${r.ruta}`} style={{ fontSize: "0.8rem", display: "flex", gap: "8px", justifyContent: "space-between" }} title={`${r.veces} veces · máximo ${r.maxMs} ms${r.errores ? ` · ${r.errores} con error` : ""}`}>
                <span style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                  {r.metodo} {r.ruta}
                </span>
                <span style={{ whiteSpace: "nowrap", color: r.mediaMs >= 1500 ? "var(--danger)" : undefined }}>
                  {r.mediaMs} ms · {r.veces}×
                </span>
              </div>
            ))
          )}
        </div>
        <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "6px", border: "1px solid var(--border-light)" }}>
          <div style={{ fontWeight: 700 }}>Consultas lentas a la base de datos (más de 0,5 s)</div>
          {d.consultasLentas.length === 0 ? (
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Ninguna desde que arrancó el servidor.</div>
          ) : (
            d.consultasLentas.map((c, i) => (
              <div key={i} style={{ fontSize: "0.78rem", fontFamily: "monospace", wordBreak: "break-word" }}>
                {new Date(c.en).toLocaleTimeString("es-ES")} · <b>{c.ms} ms</b> · {c.sql.slice(0, 160)}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px", border: "1px solid var(--border-light)" }}>
        <div style={{ fontWeight: 700 }}>Pruebas</div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.85rem" }} disabled={probando !== null} onClick={() => void probar("disco")} title="Escribe y lee un archivo de prueba de 64 MB (y lo borra) para medir la velocidad real del disco. Tarda unos segundos y durante la prueba el equipo puede ir más lento.">
            {probando === "disco" ? "Probando el disco…" : "💽 Probar la velocidad del disco"}
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.85rem" }} disabled={probando !== null} onClick={() => void probar("bd")} title="Mide cuánto tarda la base de datos en responder a consultas simples y típicas">
            {probando === "bd" ? "Probando la base de datos…" : "🗄️ Probar la base de datos"}
          </button>
        </div>
        {disco && (
          <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
            <b>Disco</b> ({disco.carpeta}): escribe <b>{disco.escrituraMBs} MB/s</b>, lee <b>{disco.lecturaMBs} MB/s</b>, {disco.escriturasSyncPorSeg} escrituras pequeñas sincronizadas por segundo ({disco.latenciaSyncMs} ms cada una).
            <br />
            {disco.veredicto}
          </div>
        )}
        {bd && (
          <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
            <b>Base de datos</b>: consulta mínima {bd.consultaMinimaMs} ms de media (máx. {bd.consultaMinimaMaxMs} ms) · contar expedientes {bd.contarExpedientesMs} ms · listar 200 clientes {bd.listarClientesMs} ms.
            <br />
            {bd.veredicto}
          </div>
        )}
      </div>
    </div>
  );
}
