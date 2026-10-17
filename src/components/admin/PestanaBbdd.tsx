"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { descargarTexto } from "@/lib/csv-expedientes";
import { mensajeDeError } from "@/components/expedientes/comun";
import type { AnalisisBbdd } from "@/lib/servicios/mantenimiento";
import PanelCopias from "./PanelCopias";
import PanelDatos from "./PanelDatos";
import PanelActualizar from "./PanelActualizar";
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
  const { mostrar } = useToast();
  const [analizando, setAnalizando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [analisis, setAnalisis] = useState<AnalisisBbdd | null>(null);
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

  const respaldarYLimpiar = async () => {
    if (!analisis || analisis.stats.totalAnomalies === 0) {
      mostrar("No hay anomalías que limpiar.", "error");
      return;
    }
    if (!window.confirm(`¿Estás seguro de que deseas limpiar las ${analisis.stats.totalAnomalies} anomalías detectadas?\n\nSe descargará automáticamente un backup JSON antes de proceder de forma segura.`)) return;

    setLimpiando(true);
    try {
      const copia = await fetch("/api/admin/backup");
      if (!copia.ok) throw new Error("Error al generar el backup previo.");
      descargarTexto(`backup_previo_limpieza_${new Date().toISOString().split("T")[0]}.json`, JSON.stringify(await copia.json(), null, 2), "application/json");

      const d = analisis.details;
      const res = await fetch("/api/admin/db-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cleanLines: d.orphanLines.map((l) => l.id_line),
          cleanEmails: d.orphanEmails.map((e) => e.id),
          cleanTelefonos: d.orphanTelefonos.map((t) => t.id),
          cleanUserTiendas: d.orphanUserTiendas.map((u) => u.id),
          cleanImportRegistros: d.orphanImportRegistros.map((r) => r.id),
        }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al ejecutar limpieza."));
      mostrar("Base de datos limpiada con éxito. Backup descargado.");
      await analizar();
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al realizar backup y limpieza.", "error");
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

  const tarjetaCifra = (etiqueta: string, cifra: number, ancho2 = false) => (
    <div style={{ ...tarjeta, ...(ancho2 ? { gridColumn: "span 2" } : {}) }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{etiqueta}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "4px", color: cifra > 0 ? "var(--warning)" : "var(--text-muted)" }}>{cifra}</div>
    </div>
  );

  return (
    <div className="glass-panel" style={{ ...estiloPanel, padding: "32px" }}>
      <PanelActualizar />

      <hr style={{ border: "none", borderTop: "1px solid var(--border-light)", margin: "8px 0" }} />

      <div>
        <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>🗄️ Herramientas de Mantenimiento y Limpieza de BBDD</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: "1.5" }}>
          Analiza y depura registros huérfanos o anomalías de la base de datos de manera segura.
          <br />
          <strong style={{ color: "var(--warning)" }}>IMPORTANTE:</strong> Para garantizar la seguridad de tus datos, se descargará automáticamente un backup JSON completo antes de ejecutar cualquier acción de limpieza.
        </p>
      </div>

      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" onClick={() => void analizar()} disabled={analizando || limpiando} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px" }}>
          {analizando ? "Analizando..." : "🔍 Analizar Base de Datos"}
        </button>
        {analisis && analisis.stats.totalAnomalies > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => void respaldarYLimpiar()} disabled={analizando || limpiando} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", backgroundColor: "var(--warning)", borderColor: "var(--warning)" }}>
            {limpiando ? "Limpiando BBDD..." : "💾 Descargar Backup y Limpiar BBDD"}
          </button>
        )}
      </div>

      {analisis && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
          <h4 style={{ fontSize: "1rem", color: "var(--text-primary)" }}>Resultados del Análisis:</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            {tarjetaCifra("LÍNEAS FANTASMA (#EXP-null)", analisis.stats.orphanLinesCount)}
            {tarjetaCifra("EMAILS HUÉRFANOS DE CLIENTES", analisis.stats.orphanEmailsCount)}
            {tarjetaCifra("TELÉFONOS HUÉRFANOS DE CLIENTES", analisis.stats.orphanTelefonosCount)}
            {tarjetaCifra("RELACIONES TIENDA-USUARIO OBSOLETAS", analisis.stats.orphanUserTiendasCount)}
            {tarjetaCifra("REGISTROS DE IMPORTACIÓN HUÉRFANOS", analisis.stats.orphanImportRegistrosCount, true)}
          </div>
          {analisis.stats.totalAnomalies === 0 ? (
            <div style={{ padding: "16px 20px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "var(--radius-sm)", color: "var(--success)", fontSize: "0.9rem", fontWeight: 600 }}>
              ✅ Base de datos completamente optimizada. No se detectaron registros huérfanos.
            </div>
          ) : (
            <div style={{ padding: "16px 20px", background: "rgba(245, 158, 11, 0.06)", border: "1px solid rgba(245, 158, 11, 0.2)", borderRadius: "var(--radius-sm)", color: "var(--warning)", fontSize: "0.9rem", fontWeight: 600 }}>
              ⚠️ Se han detectado {analisis.stats.totalAnomalies} registros huérfanos/obsoletos que pueden ser depurados de forma segura.
            </div>
          )}
        </div>
      )}

      <hr style={{ border: "none", borderTop: "1px solid var(--border-light)", margin: "8px 0" }} />

      <PanelDatos />

      <hr style={{ border: "none", borderTop: "1px solid var(--border-light)", margin: "8px 0" }} />

      <div id="copias-de-seguridad">
        <PanelCopias key={versionCopias} />
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--border-light)", margin: "8px 0" }} />

      <PanelMigracion alTerminar={() => setVersionCopias((n) => n + 1)} />

      <hr style={{ border: "none", borderTop: "1px solid var(--border-light)", margin: "8px 0" }} />

      <PanelVaciar alTerminar={() => setVersionCopias((n) => n + 1)} />

      <hr style={{ border: "none", borderTop: "1px solid var(--border-light)", margin: "8px 0" }} />

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
    </div>
  );
}
