"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { mensajeDeError } from "@/components/expedientes/comun";
import Modal from "@/components/Modal";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import type { AnalisisBbdd, CategoriaAnomalia, FilaAnomalia } from "@/lib/servicios/mantenimiento";
import PanelCopias from "./PanelCopias";
import PanelDatos from "./PanelDatos";
import PanelPapelera, { GestorFilas } from "./PanelPapelera";
import { SubPestanas } from "./estructura";
import { guardarPreferencia } from "@/lib/preferencias";
import { alTerminarTarea, lanzarTarea } from "@/lib/tareas-cliente";
import type { Categoria } from "@/lib/servicios/papelera";
import PanelActualizar from "./PanelActualizar";
import PanelOcr from "./PanelOcr";
import PanelRegistro from "./PanelRegistro";
import PanelRendimiento from "./PanelRendimiento";
import PanelMigracion from "./PanelMigracion";
import PanelVaciar from "./PanelVaciar";
import { estiloPanel } from "./utilidades";

interface Props {
  mostrarBotonesCsvInicial: boolean;
}

const tarjeta = { padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" } as const;

/** Pestaña «BBDD»: limpieza de huérfanos con copia previa y ajustes de interfaz. */
export default function PestanaBbdd({ mostrarBotonesCsvInicial }: Props) {
  const router = useRouter();
  const { mostrar, confirmar } = useToast();
  const [analizando, setAnalizando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [analisis, setAnalisis] = useState<AnalisisBbdd | null>(null);
  /** Las tarjetas que hablan de documentos, clientes y expedientes eliminados abren la lista completa de la Papelera (con vista previa). */
  const [gestor, setGestor] = useState<{ categoria: Categoria; titulo: string; explicacion: string; motivo?: string } | null>(null);
  const [mostrarCsv, setMostrarCsv] = useState(mostrarBotonesCsvInicial);
  /** Se incrementa para que la lista de copias de seguridad se vuelva a leer (p. ej. tras crear la copia previa de un borrado). */
  const [versionCopias, setVersionCopias] = useState(0);

  const analizar = async () => {
    setAnalizando(true);
    try {
      const res = await fetch("/api/admin/db-cleanup");
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al analizar base de datos."));
      setAnalisis((await res.json()) as AnalisisBbdd);
      mostrar("Análisis de base de datos completado.");
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error de conexión al analizar la base de datos.", "error");
    } finally {
      setAnalizando(false);
    }
  };

  // Al terminar la limpieza (que va en segundo plano) se vuelve a analizar y se actualiza la lista de copias
  useEffect(() =>
    alTerminarTarea((t) => {
      if (t.tipo !== "limpieza") return;
      setVersionCopias((n) => n + 1);
      void analizar();
      router.refresh();
    }),
  );

  const limpiar = async () => {
    if (!analisis || analisis.stats.totalAnomalies === 0) {
      mostrar("No hay registros huérfanos que limpiar.", "error");
      return;
    }
    if (!await confirmar({ texto: `Se van a borrar ${analisis.stats.totalAnomalies} registro(s) huérfano(s) (solo los de las tarjetas «Se puede limpiar»).\n\nAntes se guarda una copia de seguridad completa; la verás en «Copias de seguridad» y podrás restaurarla si algo no era lo que esperabas. Los avisos «A revisar» no se tocan. ¿Continuar?`, peligro: true })) return;

    setLimpiando(true);
    try {
      const d = analisis.details;
      // La limpieza va a la cola de segundo plano (puede tardar si hay documentos pesados): se sigue usando la aplicación mientras tanto
      await lanzarTarea("/api/admin/db-cleanup", {
        cleanEmails: d.orphanEmails.map((e) => e.id),
        cleanTelefonos: d.orphanTelefonos.map((t) => t.id),
        cleanUserTiendas: d.orphanUserTiendas.map((u) => u.id),
        cleanImportRegistros: d.orphanImportRegistros.map((r) => r.id),
        cleanAdjuntos: d.orphanAdjuntos.map((a) => a.id),
        cleanAdjuntosEliminados: d.orphanAdjuntosEliminados.map((a) => a.id),
      });
      mostrar("La limpieza sigue en segundo plano: puedes seguir usando la aplicación. Verás el avance arriba y un aviso al terminar.");
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al limpiar la base de datos.", "error");
    } finally {
      setLimpiando(false);
    }
  };

  const alternarCsv = async (valor: boolean) => {
    setMostrarCsv(valor);
    try {
      const res = await fetch("/api/admin/ajustes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave: "mostrar_botones_csv", valor: String(valor) }) });
      if (!res.ok) throw new Error();
      mostrar("Ajuste de visibilidad de botones CSV guardado con éxito");
      router.refresh();
    } catch {
      setMostrarCsv(!valor);
      mostrar("Error al guardar el ajuste de CSV en la base de datos", "error");
    }
  };

  const [abierta, setAbierta] = useState<CategoriaAnomalia | null>(null);
  /** «AAAA-MM-DD» → «DD/MM/AAAA». */
  const fechaLegible = (v: string | number | null | undefined): string => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v === null || v === undefined || v === "" ? "—" : String(v));
  /** Las columnas de la tabla de una categoría: las de siempre y las que trae cada una (matrícula, fechas, vendedor…), que se gestionan con «Columnas y vistas». */
  const columnasDe = (c: CategoriaAnomalia): ColumnaTabla<FilaAnomalia>[] => [
    { clave: "texto", etiqueta: "Qué es", valor: (f) => f.texto, celda: (f) => <b>{f.texto}</b>, ayuda: "Qué se ha encontrado" },
    { clave: "detalle", etiqueta: "Por qué se señala", valor: (f) => f.detalle, celda: (f) => <span style={{ whiteSpace: "normal" }}>{f.detalle}</span>, ayuda: "Por qué aparece en esta lista" },
    ...(c.columnas ?? []).map(
      (col): ColumnaTabla<FilaAnomalia> => ({
        clave: col.clave,
        etiqueta: col.etiqueta,
        ayuda: col.ayuda,
        valor: (f) => f.extra?.[col.clave] ?? "",
        celda: (f) => (col.tipo === "fecha" ? fechaLegible(f.extra?.[col.clave]) : col.tipo === "numero" ? (f.extra?.[col.clave] ?? "—") : <span style={{ whiteSpace: "normal" }}>{f.extra?.[col.clave] ?? "—"}</span>),
        alinear: col.tipo === "numero" ? "right" : undefined,
      }),
    ),
    {
      clave: "enlace",
      etiqueta: "Abrir",
      valor: () => "",
      celda: (f) =>
        f.enlace ? (
          <a href={f.enlace} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", whiteSpace: "nowrap" }}>
            Abrir ↗
          </a>
        ) : null,
      ayuda: "Abre el expediente o el cliente en otra pestaña",
    },
  ];
  const abrirCategoria = (c: CategoriaAnomalia) => {
    const aGestor: Record<string, { categoria: Categoria; motivo?: string }> = {
      lim_adjuntos: { categoria: "documentos", motivo: "sin_vincular" },
      lim_adjuntos_eliminados: { categoria: "documentos", motivo: "eliminados" },
      info_clientes_eliminados: { categoria: "clientes" },
      info_expedientes_eliminados: { categoria: "expedientes" },
    };
    const g = aGestor[c.id];
    if (g) setGestor({ ...g, titulo: c.titulo, explicacion: c.explicacion });
    else setAbierta(c);
  };
  const tarjetaCategoria = (c: CategoriaAnomalia) => {
    const color = c.cantidad === 0 ? "var(--text-muted)" : c.tipo === "limpiable" ? "var(--warning)" : "var(--info)";
    return (
      <button key={c.id} type="button" onClick={() => c.cantidad > 0 && abrirCategoria(c)} disabled={c.cantidad === 0} title={c.cantidad > 0 ? "Ver cuáles son" : c.explicacion} style={{ ...tarjeta, textAlign: "left", cursor: c.cantidad > 0 ? "pointer" : "default", color: "inherit", font: "inherit" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.02em" }}>{c.titulo}</div>
        <div style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "4px", color }}>{c.cantidad}</div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>{c.cantidad > 0 ? "Pulsa para ver cuáles" : "Todo en orden"}</div>
      </button>
    );
  };

  return (
    <div className="glass-panel" style={{ ...estiloPanel, padding: "32px" }}>
      <SubPestanas
        id="bbdd"
        pestanas={[
          { clave: "analisis", etiqueta: "🔍 Análisis y limpieza", ayuda: "Busca registros huérfanos y cosas a revisar en la base de datos", insignia: analisis ? analisis.stats.totalAnomalies + analisis.stats.totalARevisar : undefined },
          { clave: "papelera", etiqueta: "🗑️ Papelera y purga", ayuda: "Todo lo eliminado que sigue guardado: verlo, descargarlo y purgarlo de verdad" },
          { clave: "datos", etiqueta: "📦 Exportar e importar", ayuda: "Exportar, importar y guardar copias internas de cada sección de datos" },
          { clave: "copias", etiqueta: "💾 Copias de seguridad", ayuda: "Copias completas .dump, descarga, restauración y Google Drive" },
          { clave: "sistema", etiqueta: "⚙️ Sistema", ayuda: "Actualizar la aplicación y opciones de interfaz" },
          { clave: "rendimiento", etiqueta: "🩺 Rendimiento", ayuda: "Por qué va lenta la aplicación: procesador, memoria, temperatura, disco, base de datos, lecturas y peticiones lentas" },
          { clave: "registro", etiqueta: "📜 Registro del servidor", ayuda: "Lo que anota el programa (errores, avisos, restauraciones) para verlo, copiarlo o descargarlo" },
          { clave: "peligro", etiqueta: "🧨 Migración y borrado", ayuda: "Traer datos de la aplicación antigua o borrar todos los datos" },
        ]}
      >
        {(pestana) => (
          <>
            {pestana === "analisis" && (
              <>
              <div>
                <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>🗄️ Análisis y limpieza de la base de datos</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: "1.5" }}>
                  Busca dos cosas: <b>registros huérfanos</b> que se pueden borrar sin riesgo (correos y teléfonos sin cliente, archivos subidos que nunca se vincularon…) y <b>cosas a revisar a mano</b> (expedientes sin cliente, bastidores o DNI repetidos, clientes sin expedientes…). Pulsa cualquier tarjeta para ver la lista.
                  <br />
                  <strong style={{ color: "var(--warning)" }}>Seguro:</strong> solo se borra lo de «Se puede limpiar», y antes se guarda una copia de seguridad completa que puedes restaurar. Lo de «A revisar» nunca se toca solo.
                </p>
              </div>

              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-secondary" onClick={() => void analizar()} disabled={analizando || limpiando} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px" }}>
                  {analizando ? "Analizando..." : analisis ? "🔍 Analizar de nuevo" : "🔍 Analizar la base de datos"}
                </button>
                {analisis && analisis.stats.totalAnomalies > 0 && (
                  <button type="button" className="btn btn-primary" onClick={() => void limpiar()} disabled={analizando || limpiando} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", backgroundColor: "var(--warning)", borderColor: "var(--warning)" }}>
                    {limpiando ? "Limpiando..." : `🧹 Limpiar los ${analisis.stats.totalAnomalies} huérfanos (con copia previa)`}
                  </button>
                )}
              </div>

              {analisis && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
                  <h4 style={{ fontSize: "1rem", color: "var(--text-primary)" }}>🧹 Se puede limpiar</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>{analisis.categorias.filter((c) => c.tipo === "limpiable").map(tarjetaCategoria)}</div>
                  {analisis.stats.totalAnomalies === 0 ? (
                    <div style={{ padding: "12px 16px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "var(--radius-sm)", color: "var(--success)", fontSize: "0.9rem", fontWeight: 600 }}>✅ No hay registros huérfanos que borrar.</div>
                  ) : (
                    <div style={{ padding: "12px 16px", background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.2)", borderRadius: "var(--radius-sm)", color: "var(--warning)", fontSize: "0.9rem", fontWeight: 600 }}>
                      ⚠️ Hay {analisis.stats.totalAnomalies} registros huérfanos que se pueden borrar de forma segura.
                    </div>
                  )}
                  <h4 style={{ fontSize: "1rem", color: "var(--text-primary)" }}>🔎 A revisar a mano ({analisis.stats.totalARevisar})</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>{analisis.categorias.filter((c) => c.tipo === "revisar").map(tarjetaCategoria)}</div>
                </div>
              )}

              {gestor && <GestorFilas categoria={gestor.categoria} titulo={gestor.titulo} explicacion={gestor.explicacion} motivo={gestor.motivo} alCerrar={() => setGestor(null)} alTerminar={() => void analizar()} />}
      {abierta && (
                <Modal
                  titulo={`${abierta.titulo} (${abierta.cantidad})`}
                  ancho="min(1500px, 96vw)"
                  pie={
                    <button type="button" className="btn btn-secondary" onClick={() => setAbierta(null)}>
                      Cerrar
                    </button>
                  }
                >
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.5 }}>
                    {abierta.explicacion}
                    {abierta.cantidad > abierta.filas.length ? ` Se muestran las primeras ${abierta.filas.length}.` : ""}
                  </p>
                  <TablaDatos<FilaAnomalia> id={`bbdd-${abierta.id}`} columnas={columnasDe(abierta)} filas={abierta.filas} clave={(f) => `${abierta.id}-${f.id}-${f.detalle}`} compacta placeholder="Buscar…" />
                </Modal>
              )}
              </>
            )}
            {pestana === "papelera" && (
              <>
              <PanelPapelera />
              </>
            )}
            {pestana === "datos" && (
              <>
              <PanelDatos alIrACopias={() => guardarPreferencia("subpestana-bbdd", "copias")} />
              </>
            )}
            {pestana === "copias" && (
              <>
              <div id="copias-de-seguridad">
                <PanelCopias key={versionCopias} />
              </div>
              </>
            )}
            {pestana === "sistema" && (
              <>
              <PanelActualizar />
              <PanelOcr />
              <div>
                <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>⚙️ Opciones de Interfaz y Seguridad</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: "1.5", marginBottom: "16px" }}>
                  Ajusta la visibilidad de elementos clave del sistema. Los cambios se guardan directamente en la base de datos.
                </p>
                <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "rgba(255, 255, 255, 0.01)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <input type="checkbox" id="toggleCSVButtonsCheckbox" checked={mostrarCsv} onChange={(e) => void alternarCsv(e.target.checked)} style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "var(--primary)" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <label htmlFor="toggleCSVButtonsCheckbox" style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}>
                        Mostrar botones de Exportar todo (CSV) e Importar CSV
                      </label>
                      <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Si se desmarca, los botones de CSV en la pestaña de expedientes se ocultarán para todos los usuarios.</span>
                    </div>
                  </div>
                </div>
              </div>
              </>
            )}
            {pestana === "rendimiento" && <PanelRendimiento />}
            {pestana === "registro" && <PanelRegistro />}
            {pestana === "peligro" && (
              <>
              <PanelMigracion alTerminar={() => setVersionCopias((n) => n + 1)} />
              <PanelVaciar alTerminar={() => setVersionCopias((n) => n + 1)} />
              </>
            )}
          </>
        )}
      </SubPestanas>
    </div>
  );
}
