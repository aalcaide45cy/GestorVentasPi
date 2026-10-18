"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import { tamanoLegible } from "@/components/datos/DatosSeccion";
import type { Categoria, DocumentoDeFila, FilaPapelera, InfoCategoria, ResultadoCompactado, ResultadoPurga } from "@/lib/servicios/papelera";

interface Resumen {
  categorias: InfoCategoria[];
  espacio: { total: number; tablas: { tabla: string; bytes: number; filas: number }[] };
}

const VACIO: Resumen = { categorias: [], espacio: { total: 0, tablas: [] } };
const ICONOS: Record<Categoria, string> = { expedientes: "📁", clientes: "👥", documentos: "📎", catalogo: "🏷️", historial: "↩️", lecturas: "📄", auditoria: "🛡️" };

/** Qué arrastra purgar cada categoría (para la confirmación cuando se purga desde fuera de la Papelera). */
const TEXTOS_PURGA: Record<Categoria, string> = {
  expedientes: "Se borran el expediente, sus documentos y sus marcas de pagado/reclamado.",
  clientes: "Se borran el cliente, sus correos, teléfonos y documentos.",
  documentos: "Se borra el archivo de verdad. Si un pedido sin vincular sigue en tu cola de pedidos, esa entrada ya no se podrá usar.",
  catalogo: "Se borran los que ningún expediente ni plan usa ya.",
  historial: "Ya no se podrá deshacer nada de lo purgado.",
  lecturas: "Se pierde el registro de lecturas.",
  auditoria: "Se pierde ese rastro de seguridad.",
};

const botonChico = { padding: "6px 12px", fontSize: "0.82rem" } as const;
const tamano = (b: number): string => (b <= 0 ? "—" : tamanoLegible(b));

/** Cuadro que pide escribir una palabra para confirmar un borrado de verdad. */
function ModalConfirmarPurga({ titulo, texto, palabra, boton, trabajando, alConfirmar, alCancelar, extra }: { titulo: string; texto: string; palabra: string; boton: string; trabajando: boolean; alConfirmar: () => void; alCancelar: () => void; extra?: React.ReactNode }) {
  const [escrito, setEscrito] = useState("");
  const listo = escrito.trim().toUpperCase() === palabra;
  return (
    <Modal
      titulo={titulo}
      ancho="560px"
      peligro
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCancelar} disabled={trabajando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={alConfirmar} disabled={!listo || trabajando}>
            {trabajando ? "Purgando… (se hace antes una copia de seguridad, puede tardar)" : boton}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>{texto}</p>
      {extra}
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
        Antes de borrar nada se guarda una <b>copia de seguridad completa</b> (la verás en «Copias de seguridad»), así que se puede restaurar. Para confirmar, escribe <b>{palabra}</b>:
      </p>
      <input className="form-input" autoFocus value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder={palabra} disabled={trabajando} />
    </Modal>
  );
}

const ESPERA_VISTA = "Cargando el documento…";

/** Vista previa de los documentos de una fila (de un expediente, de un cliente o el propio documento): PDF y fotos, sin descargar. */
function PanelVista({ categoria, fila, alCerrar }: { categoria: Categoria; fila: FilaPapelera; alCerrar: () => void }) {
  const { datos } = useCarga<DocumentoDeFila[] | null>(`/api/admin/papelera/documentos?categoria=${categoria}&id=${fila.id}`, null);
  const [elegido, setElegido] = useState<number | null>(null);
  const docs = datos ?? [];
  const actual = docs.find((d) => d.id === elegido) ?? docs[0] ?? null;
  const url = actual ? `/api/admin/papelera/documento?id=${actual.id}&ver=1` : null;
  return (
    <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: "8px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px", background: "var(--bg-surface-tint)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
        <strong style={{ fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={fila.texto}>
          👁 {fila.texto}
        </strong>
        <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: "0.78rem" }} onClick={alCerrar}>
          ✕ Cerrar vista
        </button>
      </div>
      {!datos && <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{ESPERA_VISTA}</span>}
      {datos && docs.length === 0 && <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>No tiene documentos.</span>}
      {docs.length > 1 && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {docs.map((d) => (
            <button key={d.id} type="button" className={`btn ${actual?.id === d.id ? "btn-primary" : "btn-secondary"}`} style={{ padding: "3px 10px", fontSize: "0.78rem" }} onClick={() => setElegido(d.id)} title={`${d.tipo} · ${tamano(d.tamano)}${d.eliminado ? " · eliminado" : ""}`}>
              {d.nombre}
            </button>
          ))}
        </div>
      )}
      {actual && url && (
        <>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
            <span>
              📄 {actual.nombre} · {actual.tipo} · {tamano(actual.tamano)}
              {actual.eliminado ? " · eliminado" : ""}
            </span>
            <span style={{ display: "flex", gap: "10px" }}>
              <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>
                Abrir en otra pestaña
              </a>
              <a href={`/api/admin/papelera/documento?id=${actual.id}`} style={{ color: "var(--primary)" }}>
                Descargar
              </a>
            </span>
          </div>
          {actual.mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={actual.nombre} style={{ maxWidth: "100%", maxHeight: "68vh", objectFit: "contain", borderRadius: "var(--radius-sm)", background: "#fff" }} />
          ) : (
            <iframe key={actual.id} src={url} title={actual.nombre} style={{ width: "100%", height: "68vh", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "#fff" }} />
          )}
        </>
      )}
    </div>
  );
}

/** Lista de lo que hay en una categoría, para ver (con vista previa de sus documentos), elegir, descargar y purgar fila a fila. */
function ModalFilas({ categoria, titulo, explicacion, motivo, alCerrar, alPurgar }: { categoria: Categoria; titulo: string; explicacion: string; motivo?: string; alCerrar: () => void; alPurgar: (ids: string[]) => void }) {
  const { datos } = useCarga<{ total: number; filas: FilaPapelera[] } | null>(`/api/admin/papelera?categoria=${categoria}${motivo ? `&motivo=${motivo}` : ""}`, null);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [vista, setVista] = useState<FilaPapelera | null>(null);
  const alternar = (id: string, v: boolean) => setMarcadas((m) => (v ? [...m, id] : m.filter((x) => x !== id)));
  const filas = datos?.filas ?? [];
  const purgables = filas.filter((f) => !f.bloqueo).map((f) => f.id);
  const conVista = categoria === "expedientes" || categoria === "clientes" || categoria === "documentos";

  const columnas: ColumnaTabla<FilaPapelera>[] = [
    {
      clave: "marca",
      etiqueta: "✔",
      valor: (f) => (marcadas.includes(f.id) ? 1 : 0),
      celda: (f) => <input type="checkbox" checked={marcadas.includes(f.id)} onChange={(e) => alternar(f.id, e.target.checked)} style={{ accentColor: "var(--primary)" }} title="Elige esta fila para descargarla o purgarla" />,
      ayuda: "Elige filas para descargarlas o purgarlas",
    },
    { clave: "texto", etiqueta: "Qué es", valor: (f) => f.texto, celda: (f) => <span style={{ whiteSpace: "normal", fontWeight: 600 }}>{f.texto}</span>, ayuda: "Nombre del documento, cliente o expediente" },
    { clave: "detalle", etiqueta: "Detalle", valor: (f) => f.detalle, celda: (f) => <span style={{ whiteSpace: "normal", fontSize: "0.82rem" }}>{f.detalle}</span>, ayuda: "Cuándo se eliminó o se subió y qué arrastra" },
    { clave: "eliminado", etiqueta: "Eliminado el", valor: (f) => f.eliminadoEn ?? "", celda: (f) => (f.eliminadoEn ? new Date(f.eliminadoEn).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—"), ayuda: "Cuándo se eliminó (los documentos sin vincular no se han eliminado: nunca se vincularon)" },
    { clave: "documentos", etiqueta: "Docs", valor: (f) => f.documentos, celda: (f) => f.documentos.toLocaleString("es-ES"), alinear: "right", ayuda: "Cuántos documentos tiene" },
    { clave: "bytes", etiqueta: "Ocupa", valor: (f) => f.bytes, celda: (f) => tamano(f.bytes), alinear: "right", ayuda: "Lo que ocupa (con sus documentos, si los tiene)" },
    { clave: "bloqueo", etiqueta: "Estado", valor: (f) => f.bloqueo ?? "", celda: (f) => (f.bloqueo ? <span style={{ color: "var(--warning)", whiteSpace: "normal", fontSize: "0.8rem" }}>⏳ {f.bloqueo}</span> : <span style={{ color: "var(--text-muted)" }}>Se puede purgar</span>), ayuda: "Si algo impide purgarla ahora mismo" },
  ];
  if (conVista) {
    columnas.push({
      clave: "ver",
      etiqueta: "Ver",
      valor: () => "",
      celda: (f) => (
        <button type="button" className={`btn ${vista?.id === f.id ? "btn-primary" : "btn-secondary"}`} style={{ padding: "2px 10px", fontSize: "0.78rem" }} disabled={f.documentos === 0} onClick={() => setVista(vista?.id === f.id ? null : f)} title={f.documentos === 0 ? "No tiene documentos" : "Vista previa de sus documentos (PDF o fotos) sin descargarlos"}>
          👁 Ver
        </button>
      ),
      ayuda: "Vista previa de los documentos antes de decidir",
    });
  }
  if (categoria === "documentos") {
    columnas.push({
      clave: "archivo",
      etiqueta: "Archivo",
      valor: () => "",
      celda: (f) => (
        <a className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.78rem" }} href={`/api/admin/papelera/documento?id=${f.id}`} title="Descarga el archivo tal cual (ya descifrado)">
          Descargar
        </a>
      ),
    });
  }

  return (
    <Modal
      titulo={`${ICONOS[categoria]} ${titulo}${datos ? ` (${datos.total.toLocaleString("es-ES")})` : ""}`}
      ancho="min(1600px, 96vw)"
      pie={
        <>
          <a className={`btn btn-secondary${marcadas.length === 0 ? " disabled" : ""}`} aria-disabled={marcadas.length === 0} style={marcadas.length === 0 ? { pointerEvents: "none", opacity: 0.5 } : undefined} href={`/api/admin/papelera?categoria=${categoria}&descargar=1&ids=${marcadas.join(",")}`} title="Descarga en JSON lo que has elegido (sin los archivos de los documentos)">
            📥 Descargar lo elegido ({marcadas.length})
          </a>
          <button type="button" className="btn btn-danger" disabled={marcadas.length === 0} onClick={() => alPurgar(marcadas)} title="Borra de verdad lo que has elegido">
            🗑️ Purgar lo elegido ({marcadas.length})
          </button>
          <button type="button" className="btn btn-primary" onClick={alCerrar}>
            Cerrar
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "72vh", overflowY: "auto" }}>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>{explicacion}</p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setMarcadas(purgables)} disabled={!datos}>
            Elegir todo lo que se puede purgar ({purgables.length})
          </button>
          <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setMarcadas([])} disabled={marcadas.length === 0}>
            Quitar la elección
          </button>
        </div>
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: vista ? "1.2 1 520px" : "1 1 100%", minWidth: 0 }}>
            {!datos ? <p style={{ margin: 0, color: "var(--text-secondary)" }}>Cargando…</p> : <TablaDatos<FilaPapelera> id={`papelera-${categoria}`} columnas={columnas} filas={filas} clave={(f) => f.id} compacta ordenInicial={categoria === "historial" || categoria === "lecturas" || categoria === "auditoria" ? undefined : { clave: "bytes", asc: false }} placeholder="Buscar…" vacio="No hay nada." />}
            {datos && datos.total > filas.length && <p style={{ margin: "8px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>Se muestran {filas.length.toLocaleString("es-ES")} de {datos.total.toLocaleString("es-ES")}. «Purgar todo» de la categoría los alcanza todos.</p>}
          </div>
          {vista && (
            <div style={{ flex: "1 1 460px", minWidth: 0, position: "sticky", top: 0 }}>
              <PanelVista key={vista.id} categoria={categoria} fila={vista} alCerrar={() => setVista(null)} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Lista de una categoría con todo lo necesario para gestionarla: ver, previsualizar documentos, elegir, descargar y purgar con
 * confirmación. Lo usan la Papelera y las tarjetas del análisis que hablan de documentos, clientes y expedientes eliminados.
 */
export function GestorFilas({ categoria, titulo, explicacion, alPurga, motivo, alCerrar, alTerminar }: { categoria: Categoria; titulo: string; explicacion: string; alPurga?: string; motivo?: string; alCerrar: () => void; alTerminar: () => void }) {
  const { mostrar } = useToast();
  const [ids, setIds] = useState<string[] | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const purgar = async () => {
    if (!ids) return;
    setTrabajando(true);
    try {
      const { data } = await llamar<ResultadoPurga>("/api/admin/papelera", { method: "POST", cuerpo: { categoria, ids, confirmacion: "PURGAR" } });
      mostrar(`✅ ${data.purgados.toLocaleString("es-ES")} purgados${data.bloqueados > 0 ? ` y ${data.bloqueados} que se han dejado porque algo los usa aún` : ""}. Copia previa: ${data.copiaPrevia ?? "—"}. Si quieres que el disco recupere el espacio, usa «Compactar base de datos» en la Papelera.`, data.purgados === 0 ? "aviso" : undefined, 12000);
      setIds(null);
      alTerminar();
      alCerrar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };
  return (
    <>
      <ModalFilas categoria={categoria} titulo={titulo} explicacion={explicacion} motivo={motivo} alCerrar={alCerrar} alPurgar={setIds} />
      {ids && (
        <ModalConfirmarPurga
          titulo={`🗑️ Purgar ${ids.length.toLocaleString("es-ES")} elegidos de «${titulo}»`}
          texto={`Se borran de verdad y no se pueden recuperar salvo restaurando la copia previa. ${alPurga ?? TEXTOS_PURGA[categoria]}`}
          palabra="PURGAR"
          boton="Purgar de verdad"
          trabajando={trabajando}
          alConfirmar={() => void purgar()}
          alCancelar={() => setIds(null)}
        />
      )}
    </>
  );
}

/** «Papelera y purga»: todo lo que sigue guardado aunque se haya eliminado, con control total para verlo, descargarlo y borrarlo de verdad. */
export default function PanelPapelera() {
  const router = useRouter();
  const { mostrar } = useToast();
  const { datos, recargar } = useCarga<Resumen>("/api/admin/papelera", VACIO);
  const [ver, setVer] = useState<InfoCategoria | null>(null);
  const [purga, setPurga] = useState<{ info: InfoCategoria; ids: string[] | null; dias: number | null } | null>(null);
  const [aFondo, setAFondo] = useState(false);
  const [sinVincular, setSinVincular] = useState(false);
  const [conservarHistorial, setConservarHistorial] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [dias, setDias] = useState<Record<string, number>>({ historial: 30, lecturas: 30, auditoria: 365 });
  const [compactando, setCompactando] = useState(false);

  const refrescar = () => {
    recargar();
    router.refresh();
  };
  const resumenPurga = (r: ResultadoPurga): string => `${r.purgados.toLocaleString("es-ES")} purgados${r.bloqueados > 0 ? ` y ${r.bloqueados} que se han dejado porque algo los usa aún` : ""}. Copia previa: ${r.copiaPrevia ?? "—"}.`;

  const ejecutarPurga = async () => {
    if (!purga) return;
    setTrabajando(true);
    try {
      const { data } = await llamar<ResultadoPurga>("/api/admin/papelera", { method: "POST", cuerpo: { categoria: purga.info.categoria, ...(purga.ids ? { ids: purga.ids } : { todo: true }), ...(purga.dias !== null ? { antesDeDias: purga.dias } : {}), confirmacion: "PURGAR" } });
      mostrar(`✅ ${resumenPurga(data)} Si quieres que el disco recupere el espacio, pulsa «Compactar base de datos».`, data.purgados === 0 ? "aviso" : undefined, 12000);
      setPurga(null);
      setVer(null);
      refrescar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const ejecutarAFondo = async () => {
    setTrabajando(true);
    try {
      const { data } = await llamar<ResultadoPurga & { compactado: ResultadoCompactado | null }>("/api/admin/papelera", { method: "POST", cuerpo: { accion: "a_fondo", confirmacion: "PURGAR A FONDO", incluirSinVincular: sinVincular, conservarHistorial } });
      mostrar(`✅ Purga a fondo hecha: ${data.detalle.length > 0 ? data.detalle.join(", ") : "no había nada que purgar"}${data.bloqueados > 0 ? `; ${data.bloqueados} se han dejado porque algo los usa aún` : ""}. ${data.compactado ? `La base pasó de ${tamano(data.compactado.antes)} a ${tamano(data.compactado.despues)}.` : ""} Copia previa: ${data.copiaPrevia}.`, undefined, 15000);
      setAFondo(false);
      refrescar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const compactar = async () => {
    if (!window.confirm("Se va a compactar la base de datos: el espacio de todo lo borrado vuelve al disco. Las tablas afectadas quedan bloqueadas unos segundos (puede tardar un poco si hay documentos grandes). No se borra ningún dato. ¿Continuar?")) return;
    setCompactando(true);
    try {
      const { data } = await llamar<ResultadoCompactado>("/api/admin/papelera", { method: "POST", cuerpo: { accion: "compactar" } });
      mostrar(`✅ Base de datos compactada: de ${tamano(data.antes)} a ${tamano(data.despues)}.`);
      refrescar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setCompactando(false);
    }
  };

  return (
    <div id="papelera" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <div>
        <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>🗑️ Papelera y purga</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, margin: 0 }}>
          Al eliminar un cliente, un expediente, un documento o un elemento de un catálogo, la aplicación <b>solo lo oculta</b> (así se puede deshacer y el histórico de comisiones se conserva). Aquí ves <b>todo lo que sigue guardado</b>, lo descargas, eliges y <b>purgas de verdad</b>. Antes de purgar se guarda siempre una copia de seguridad completa. Las liquidaciones y los puntos ya guardados no se tocan: son el histórico de lo cobrado.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: "14px 16px", display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap", border: "1px solid var(--border-light)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>La base de datos ocupa en disco</span>
          <strong style={{ fontSize: "1.3rem" }}>{datos.espacio.total > 0 ? tamano(datos.espacio.total) : "…"}</strong>
        </div>
        <div style={{ flex: 1, minWidth: "260px", fontSize: "0.8rem", color: "var(--text-secondary)" }} title="Las tablas que más ocupan, con el hueco de lo borrado que aún no se ha devuelto al disco">
          {datos.espacio.tablas.slice(0, 5).map((t) => `${t.tabla}: ${tamano(t.bytes)} (${t.filas.toLocaleString("es-ES")} filas)`).join(" · ")}
        </div>
        <button type="button" className="btn btn-secondary" style={botonChico} onClick={compactar} disabled={compactando} title="Al borrar filas, PostgreSQL deja el hueco reservado y la base no encoge sola. Esto devuelve ese espacio al disco (VACUUM FULL). No borra ningún dato.">
          {compactando ? "Compactando…" : "🧽 Compactar base de datos"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "14px", alignItems: "stretch" }} className="rejilla-propia">
        {datos.categorias.map((c) => (
          <div key={c.categoria} className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px", border: "1px solid var(--border-light)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
              <strong>
                {ICONOS[c.categoria]} {c.titulo}
              </strong>
              <span style={{ color: c.cantidad > 0 ? "var(--warning)" : "var(--text-muted)", fontSize: "0.85rem", textAlign: "right" }}>
                {c.cantidad.toLocaleString("es-ES")} · {tamano(c.bytes)}
              </span>
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.45 }}>{c.explicacion}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>🗑️ Al purgar: {c.alPurgar}</div>
            {c.porAntiguedad && (
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem" }}>
                Anteriores a
                <input type="number" className="form-input" min={0} max={36500} style={{ width: "80px" }} value={dias[c.categoria] ?? 30} onChange={(e) => setDias((d) => ({ ...d, [c.categoria]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
                días
              </label>
            )}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "auto" }}>
              <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setVer(c)} title="Mira lo que hay, elige fila a fila, descarga y purga lo elegido">
                👁 Ver y elegir
              </button>
              <a className="btn btn-secondary" style={botonChico} href={`/api/admin/papelera?categoria=${c.categoria}&descargar=1`} title="Descarga todo el contenido de esta categoría en un archivo JSON (los documentos, sin su archivo)">
                📥 Descargar
              </a>
              {c.porAntiguedad && (
                <button type="button" className="btn btn-danger" style={botonChico} disabled={c.cantidad === 0} onClick={() => setPurga({ info: c, ids: null, dias: dias[c.categoria] ?? 30 })} title="Borra de verdad lo anterior a los días indicados">
                  🗑️ Purgar anteriores
                </button>
              )}
              <button type="button" className="btn btn-danger" style={botonChico} disabled={c.cantidad === 0} onClick={() => setPurga({ info: c, ids: null, dias: null })} title="Borra de verdad todo lo de esta categoría que se pueda">
                🗑️ Purgar todo
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px", border: "1px solid var(--danger)" }}>
        <div style={{ fontWeight: 700 }}>🔥 Purgar a fondo</div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Borra de una vez los expedientes y clientes eliminados con todo lo suyo, los documentos eliminados, los catálogos eliminados que nadie usa y el registro de lecturas, y al final compacta la base para que el disco recupere el espacio. Una sola copia previa para todo.
        </div>
        <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={sinVincular} onChange={(e) => setSinVincular(e.target.checked)} style={{ marginTop: "3px" }} />
          <span>Incluir también los documentos leídos y <b>sin vincular</b> a ningún expediente (si alguno sigue en tu cola de pedidos, ese pedido ya no se podrá usar).</span>
        </label>
        <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={conservarHistorial} onChange={(e) => setConservarHistorial(e.target.checked)} style={{ marginTop: "3px" }} />
          <span>Conservar el historial de deshacer y rehacer (si lo desmarcas, también se vacía).</span>
        </label>
        <div>
          <button type="button" className="btn btn-danger" onClick={() => setAFondo(true)}>
            🔥 Purgar a fondo…
          </button>
        </div>
      </div>

      {ver && <GestorFilas categoria={ver.categoria} titulo={ver.titulo} explicacion={ver.explicacion} alPurga={ver.alPurgar} alCerrar={() => setVer(null)} alTerminar={refrescar} />}
      {purga && (
        <ModalConfirmarPurga
          titulo={`🗑️ Purgar «${purga.info.titulo}»`}
          texto={`${purga.ids ? `Vas a purgar las ${purga.ids.length.toLocaleString("es-ES")} filas que has elegido` : purga.dias !== null ? `Vas a purgar lo anterior a ${purga.dias} días` : `Vas a purgar todo lo que se pueda de esta categoría (${purga.info.cantidad.toLocaleString("es-ES")})`}. Se borran de verdad y no se pueden recuperar salvo restaurando la copia previa. ${purga.info.alPurgar}`}
          palabra="PURGAR"
          boton="Purgar de verdad"
          trabajando={trabajando}
          alConfirmar={() => void ejecutarPurga()}
          alCancelar={() => setPurga(null)}
        />
      )}
      {aFondo && (
        <ModalConfirmarPurga
          titulo="🔥 Purgar a fondo"
          texto={`Se van a borrar de verdad ${datos.categorias.filter((c) => ["expedientes", "clientes", "catalogo", "lecturas"].includes(c.categoria)).reduce((a, c) => a + c.cantidad, 0).toLocaleString("es-ES")} elementos entre expedientes, clientes, catálogos y lecturas eliminados${sinVincular ? ", más los documentos sin vincular" : ""}${conservarHistorial ? "" : " y todo el historial de deshacer"}, y la base se compactará.`}
          palabra="PURGAR A FONDO"
          boton="Purgar a fondo"
          trabajando={trabajando}
          alConfirmar={() => void ejecutarAFondo()}
          alCancelar={() => setAFondo(false)}
        />
      )}
    </div>
  );
}
