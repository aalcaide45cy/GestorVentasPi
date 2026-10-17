"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BotonesBackup from "@/components/BotonesBackup";
import { useCarga } from "@/components/comisiones/useCarga";
import { ICONOS, ModalCopiasInternas, ModalExportar, ModalImportar, botonChico, cuantos, type DatosPanel, type SeccionDatos } from "@/components/datos/DatosSeccion";
import type { Seccion } from "@/lib/servicios/intercambio";

const VACIO: DatosPanel = { secciones: [], planes: [] };

const GRUPOS: { titulo: string; ayuda: string; secciones: Seccion[] }[] = [
  { titulo: "Personas y ventas", ayuda: "Lo que más cambia día a día.", secciones: ["clientes", "expedientes"] },
  { titulo: "Catálogos", ayuda: "Listas que se eligen al crear un expediente.", secciones: ["marcas_modelos", "tipos_venta", "estados", "tiendas"] },
  { titulo: "Comisiones", ayuda: "Planes, plantillas de tarifas y hojas de cotejo.", secciones: ["planes", "plantillas_tarifas", "plantillas_plan", "rejillas"] },
  { titulo: "Sistema", ayuda: "Configuración y usuarios.", secciones: ["ajustes", "usuarios"] },
];

/** «Datos por secciones»: exportar, importar y guardar copias internas de cada tipo de datos por separado. */
export default function PanelDatos() {
  const router = useRouter();
  const { datos, recargar } = useCarga<DatosPanel>("/api/admin/datos", VACIO);
  const { datos: copias, recargar: recargarCopias } = useCarga<{ conteo: Record<string, number> }>("/api/admin/datos/copias?soloConteo=1", { conteo: {} });
  const [modal, setModal] = useState<{ tipo: "exportar" | "importar" | "copias"; seccion: SeccionDatos | null } | null>(null);

  const refrescar = () => {
    recargar();
    recargarCopias();
    router.refresh();
  };

  return (
    <div id="datos-por-secciones" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>📦 Exportar e importar datos por secciones</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
          Cada sección se puede <b>exportar</b> a un archivo (.json), <b>importar</b> más tarde (aquí o en otra instalación) y <b>guardar como copia interna</b> dentro de la aplicación, sin tocar el resto de los datos. Antes de aplicar una importación siempre ves una <b>vista previa</b> y se guardan copias del estado actual. Los mismos botones están en la página de cada sección.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px", border: "1px solid var(--border-light)" }}>
        <div style={{ fontWeight: 700 }}>🗄️ Toda la aplicación</div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Para guardar o restaurar <b>todo</b> a la vez tienes dos opciones. La <b>copia completa (.dump)</b> es la más segura y la recomendada: incluye todo, se valida al crearla y está justo debajo, en «Copias de seguridad». El <b>JSON de datos básicos</b> es legible y sirve para llevar tiendas, usuarios, clientes, expedientes y catálogos a otro equipo, pero <b>NO incluye planes de comisionamiento, liquidaciones, puntos ni documentos</b> y <b>sí incluye las contraseñas cifradas y los secretos del doble factor</b>: guárdalo en un sitio seguro y guarda también el archivo .env (o al menos APP_SECRET).
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <a className="btn btn-primary" style={botonChico} href="#copias-de-seguridad" title="Baja a «Copias de seguridad»: crea una copia completa (.dump) de toda la aplicación, descárgala, súbela o restáurala. Es la forma más segura de guardar todo.">
            💾 Copia completa (.dump)…
          </a>
          <BotonesBackup deshabilitado={false} />
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setModal({ tipo: "copias", seccion: null })} title="Mira, busca, restaura, descarga o borra las copias internas de todas las secciones.">
          🗂️ Ver todas las copias internas
        </button>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{Object.values(copias.conteo).reduce((a, b) => a + b, 0)} guardadas en total</span>
      </div>

      {GRUPOS.map((g) => {
        const secciones = g.secciones.map((id) => datos.secciones.find((s) => s.seccion === id)).filter((s): s is SeccionDatos => !!s);
        if (secciones.length === 0) return null;
        return (
          <section key={g.titulo} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap", borderBottom: "1px solid var(--border-light)", paddingBottom: "6px" }}>
              <h4 style={{ margin: 0, fontSize: "1rem" }}>{g.titulo}</h4>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{g.ayuda}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "14px", alignItems: "stretch" }} className="rejilla-propia">
              {secciones.map((s) => (
                <TarjetaSeccion key={s.seccion} s={s} copias={copias.conteo[s.seccion] ?? 0} alAbrir={(tipo) => setModal({ tipo, seccion: s })} />
              ))}
            </div>
          </section>
        );
      })}

      {modal?.tipo === "exportar" && modal.seccion && <ModalExportar seccion={modal.seccion} planes={datos.planes} alCerrar={() => setModal(null)} />}
      {modal?.tipo === "importar" && modal.seccion && <ModalImportar seccion={modal.seccion} alCerrar={() => setModal(null)} alTerminar={refrescar} />}
      {modal?.tipo === "copias" && <ModalCopiasInternas seccion={modal.seccion?.seccion ?? null} secciones={datos.secciones} alCerrar={() => setModal(null)} alCambiar={refrescar} />}
    </div>
  );
}

function TarjetaSeccion({ s, copias, alAbrir }: { s: SeccionDatos; copias: number; alAbrir: (tipo: "exportar" | "importar" | "copias") => void }) {
  return (
    <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px", border: "1px solid var(--border-light)", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
        <strong>
          {ICONOS[s.seccion]} {s.titulo}
        </strong>
        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", whiteSpace: "nowrap" }}>{cuantos(s.registros, s)}</span>
      </div>
      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.45, flex: 1 }}>
        {s.descripcion}
        {s.aviso && (
          <span title={s.aviso} style={{ marginLeft: "6px", color: "var(--warning)", cursor: "help", whiteSpace: "nowrap" }}>
            ⚠️ Datos sensibles
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: s.importable ? "repeat(3, 1fr)" : "1fr", gap: "8px", marginTop: "auto" }}>
        <button type="button" className="btn btn-secondary" style={{ ...botonChico, padding: "8px 6px" }} onClick={() => alAbrir("exportar")} title={`Descarga un archivo .json con ${s.seccion === "planes" ? "los planes que elijas (todos o uno a uno)" : `los ${s.plural}`} (${cuantos(s.registros, s)}). No borra ni cambia nada.${s.aviso ? ` ${s.aviso}` : ""}`}>
          📤 Exportar
        </button>
        {s.importable ? (
          <>
            <button type="button" className="btn btn-secondary" style={{ ...botonChico, padding: "8px 6px" }} onClick={() => alAbrir("importar")} title={`Lee un archivo .json exportado antes, te enseña qué va a cambiar en «${s.titulo}» y solo lo aplica si lo confirmas. Antes se guardan copias del estado actual.`}>
              📥 Importar
            </button>
            <button type="button" className="btn btn-secondary" style={{ ...botonChico, padding: "8px 6px" }} onClick={() => alAbrir("copias")} title={`Copias de ${s.plural} guardadas dentro de la aplicación: guardar una, restaurarla, descargarla o borrarla. Ahora hay ${copias}.`}>
              🗂️ Copias{copias > 0 ? ` (${copias})` : ""}
            </button>
          </>
        ) : (
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Solo se exporta, para consultar. Los usuarios se crean en Configuración › Usuarios.</div>
        )}
      </div>
    </div>
  );
}
