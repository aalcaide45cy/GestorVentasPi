"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SubPestanas } from "@/components/admin/estructura";
import Modal from "@/components/Modal";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { useToast } from "@/components/Toast";
import { textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import { tamanoLegible } from "@/components/datos/DatosSeccion";
import type { Categoria, DocumentoDeFila, FilaPapelera, InfoCategoria } from "@/lib/servicios/papelera";
import { TEXTO_SEGUNDO_CLIC, useDobleConfirmacion } from "@/components/useDobleConfirmacion";
import { alTerminarTarea, lanzarTarea } from "@/lib/tareas-cliente";

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

/** Las pestañas de la papelera: una por cada cosa que se puede eliminar (más el resumen con el espacio y la purga a fondo). */
interface DefPestana {
  clave: string;
  etiqueta: string;
  ayuda: string;
  categoria: Categoria;
  clase?: { incluir?: string[]; excluir?: string[] };
  explicacion: string;
  cantidad: (c: InfoCategoria) => number;
}
const sub = (clave: string) => (c: InfoCategoria) => c.porSubtipo?.[clave] ?? 0;
const DEFINICIONES: DefPestana[] = [
  { clave: "expedientes", etiqueta: "📁 Expedientes", ayuda: "Expedientes eliminados", categoria: "expedientes", explicacion: "Expedientes que eliminaste: no se ven ni cuentan en ninguna comisión. Al restaurarlos vuelven a su sitio, recalculan las comisiones de sus meses y recuperan a su cliente si estaba eliminado.", cantidad: (c) => c.cantidad },
  { clave: "clientes", etiqueta: "👥 Clientes", ayuda: "Clientes eliminados", categoria: "clientes", explicacion: "Clientes que eliminaste, con sus correos, teléfonos y documentos. No se restauran si ya hay otro cliente vigente con el mismo DNI.", cantidad: (c) => c.cantidad },
  { clave: "pedidos", etiqueta: "🧾 Pedidos", ayuda: "Pedidos (documentos) eliminados o sin vincular", categoria: "documentos", clase: { incluir: ["pedido"] }, explicacion: "Documentos de pedido que siguen guardados aunque ya no se ven: eliminados, de expedientes o clientes eliminados, o leídos y nunca vinculados.", cantidad: sub("pedido") },
  { clave: "pagos_rci", etiqueta: "💶 Pagos RCI", ayuda: "Pagos RCI (documentos) eliminados o sin vincular", categoria: "documentos", clase: { incluir: ["pago_rci"] }, explicacion: "Documentos de pago RCI que siguen guardados aunque ya no se ven.", cantidad: sub("pago_rci") },
  { clave: "otros_documentos", etiqueta: "📎 Otros documentos", ayuda: "DNI, fotos y otros documentos eliminados", categoria: "documentos", clase: { excluir: ["pedido", "pago_rci"] }, explicacion: "DNI, fotos de cliente y otros documentos que siguen guardados aunque ya no se ven.", cantidad: (c) => Object.entries(c.porSubtipo ?? {}).filter(([k]) => k !== "pedido" && k !== "pago_rci").reduce((a, [, n]) => a + n, 0) },
  { clave: "marcas", etiqueta: "🏷️ Marcas", ayuda: "Marcas eliminadas", categoria: "catalogo", clase: { incluir: ["marcas"] }, explicacion: "Marcas que eliminaste. Se pueden restaurar siempre que no haya otra vigente con el mismo nombre.", cantidad: sub("marcas") },
  { clave: "modelos", etiqueta: "🚗 Modelos", ayuda: "Modelos eliminados", categoria: "catalogo", clase: { incluir: ["modelos"] }, explicacion: "Modelos que eliminaste. Un modelo solo se restaura si su marca está vigente (restaura antes la marca, o elige las dos a la vez).", cantidad: sub("modelos") },
  { clave: "formas_pago", etiqueta: "💳 Formas de pago", ayuda: "Formas de pago eliminadas", categoria: "catalogo", clase: { incluir: ["tipo_de_venta"] }, explicacion: "Formas de pago (tipos de venta) que eliminaste.", cantidad: sub("tipo_de_venta") },
  { clave: "estados", etiqueta: "🚙 Estados de vehículo", ayuda: "Estados de vehículo eliminados", categoria: "catalogo", clase: { incluir: ["estado_vehiculo"] }, explicacion: "Estados de vehículo que eliminaste.", cantidad: sub("estado_vehiculo") },
  { clave: "tiendas", etiqueta: "🏬 Tiendas", ayuda: "Tiendas eliminadas", categoria: "catalogo", clase: { incluir: ["tiendas"] }, explicacion: "Tiendas que eliminaste.", cantidad: sub("tiendas") },
  { clave: "historial", etiqueta: "↩️ Historial", ayuda: "Diario de deshacer y rehacer", categoria: "historial", explicacion: "El diario de cambios que permite deshacer y rehacer. Para vaciarlo por antigüedad o del todo, usa el Resumen.", cantidad: (c) => c.cantidad },
  { clave: "lecturas", etiqueta: "📄 Lecturas", ayuda: "Registro de lecturas de pedidos", categoria: "lecturas", explicacion: "Una fila por cada documento subido para leer (leído, descartado, cancelado o con error). Para vaciarlo por antigüedad o del todo, usa el Resumen.", cantidad: (c) => c.cantidad },
  { clave: "auditoria", etiqueta: "🛡️ Auditoría", ayuda: "Registro de auditoría", categoria: "auditoria", explicacion: "Quién hizo qué y cuándo. Para vaciarlo por antigüedad o del todo, usa el Resumen.", cantidad: (c) => c.cantidad },
];

const botonChico = { padding: "6px 12px", fontSize: "0.82rem" } as const;
const tamano = (b: number): string => (b <= 0 ? "—" : tamanoLegible(b));

/** Cuadro de doble verificación (dos pulsaciones del botón) para confirmar un borrado de verdad. */
function ModalConfirmarPurga({ titulo, texto, boton, trabajando, alConfirmar, alCancelar, extra }: { titulo: string; texto: string; boton: string; trabajando: boolean; alConfirmar: () => void; alCancelar: () => void; extra?: React.ReactNode }) {
  // Doble verificación sin escribir nada: el primer clic arma el botón y el segundo confirma
  const doble = useDobleConfirmacion(alConfirmar);
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
          <button type="button" className="btn btn-danger" onClick={doble.pulsar} disabled={trabajando} style={doble.armado ? { outline: "3px solid var(--danger)" } : undefined}>
            {trabajando ? "Purgando… (se hace antes una copia de seguridad, puede tardar)" : doble.armado ? TEXTO_SEGUNDO_CLIC : boton}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>{texto}</p>
      {extra}
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
        Antes de borrar nada se guarda una <b>copia de seguridad completa</b> (la verás en «Copias de seguridad»), así que se puede restaurar. Para confirmar, pulsa el botón dos veces.
      </p>
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
            <img src={url} alt={actual.nombre} style={{ maxWidth: "100%", maxHeight: "calc(68 * var(--uvh))", objectFit: "contain", borderRadius: "var(--radius-sm)", background: "#fff" }} />
          ) : (
            <iframe key={actual.id} src={url} title={actual.nombre} style={{ width: "100%", height: "calc(68 * var(--uvh))", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "#fff" }} />
          )}
        </>
      )}
    </div>
  );
}

interface DatosFilas {
  total: number;
  filas: FilaPapelera[];
}

/** Qué filas se ven en una pestaña: de una categoría, y solo de ciertas clases (por ejemplo, los pedidos entre todos los documentos). */
interface FiltroClase {
  incluir?: string[];
  excluir?: string[];
}

/** Categorías de las que se puede restaurar (el historial, las lecturas y la auditoría son registros: solo se purgan). */
const RESTAURABLES: Categoria[] = ["expedientes", "clientes", "documentos", "catalogo"];

/** Carga las filas de una categoría, las filtra por clase y lleva la elección; se refresca sola cuando acaba una tarea de la papelera. */
function useFilas(categoria: Categoria, motivo: string | undefined, clase: FiltroClase | undefined) {
  const { datos, recargar } = useCarga<DatosFilas | null>(`/api/admin/papelera?categoria=${categoria}${motivo ? `&motivo=${motivo}` : ""}`, null);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  useEffect(
    () =>
      alTerminarTarea((t) => {
        if (t.tipo === "papelera") {
          setMarcadas([]);
          recargar();
        }
      }),
  );
  const claseIncluir = clase?.incluir?.join("|");
  const claseExcluir = clase?.excluir?.join("|");
  const filas = useMemo(() => {
    const incluir = claseIncluir ? claseIncluir.split("|") : null;
    const excluir = claseExcluir ? claseExcluir.split("|") : [];
    return (datos?.filas ?? []).filter((f) => (!incluir || incluir.includes(f.subtipo)) && !excluir.includes(f.subtipo));
  }, [datos, claseIncluir, claseExcluir]);
  return { datos, filas, marcadas, setMarcadas, recargar, filtrada: !!clase };
}

/** Pone en marcha, en segundo plano, la restauración de lo elegido. */
function useRestaurar() {
  const { mostrar, notificar } = useToast();
  const [restaurando, setRestaurando] = useState(false);
  const restaurar = async (categoria: Categoria, ids: string[]) => {
    setRestaurando(true);
    try {
      await lanzarTarea("/api/admin/papelera", { accion: "restaurar", categoria, ids });
      void notificar({ titulo: "Se está restaurando en segundo plano", texto: "Lo elegido vuelve a su sitio.", detalles: ["Puedes seguir usando la aplicación mientras tanto.", "Verás el avance en la barra de tareas de arriba.", "Al terminar saldrá un aviso con el resultado (y con lo que no se haya podido restaurar, y por qué)."] });
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setRestaurando(false);
    }
  };
  return { restaurando, restaurar };
}

/** Tabla de una categoría (o de una clase de ella) con elegir, ver documentos y descargar de uno en uno. */
function CuerpoFilas({ categoria, explicacion, f, mostrarClase }: { categoria: Categoria; explicacion: string; f: ReturnType<typeof useFilas>; mostrarClase: boolean }) {
  const { datos, filas, marcadas, setMarcadas } = f;
  const [vista, setVista] = useState<FilaPapelera | null>(null);
  const alternar = (id: string, v: boolean) => setMarcadas((m) => (v ? [...m, id] : m.filter((x) => x !== id)));
  const purgables = filas.filter((x) => !x.bloqueo).map((x) => x.id);
  const conVista = categoria === "expedientes" || categoria === "clientes" || categoria === "documentos";
  const visibles = new Set(filas.map((x) => x.id));
  const elegidasAqui = marcadas.filter((id) => visibles.has(id));

  const columnas: ColumnaTabla<FilaPapelera>[] = [
    {
      clave: "marca",
      etiqueta: "✔",
      valor: (x) => (marcadas.includes(x.id) ? 1 : 0),
      celda: (x) => <input type="checkbox" checked={marcadas.includes(x.id)} onChange={(e) => alternar(x.id, e.target.checked)} style={{ accentColor: "var(--primary)" }} title="Elige esta fila para restaurarla, descargarla o purgarla" />,
      ayuda: "Elige filas para restaurarlas, descargarlas o purgarlas",
    },
    { clave: "texto", etiqueta: "Qué es", valor: (x) => x.texto, celda: (x) => <span style={{ whiteSpace: "normal", fontWeight: 600 }}>{x.texto}</span>, ayuda: "Nombre del documento, cliente o expediente" },
    { clave: "detalle", etiqueta: "Detalle", valor: (x) => x.detalle, celda: (x) => <span style={{ whiteSpace: "normal", fontSize: "0.82rem" }}>{x.detalle}</span>, ayuda: "Cuándo se eliminó o se subió y qué arrastra" },
    { clave: "eliminado", etiqueta: "Eliminado el", valor: (x) => x.eliminadoEn ?? "", celda: (x) => (x.eliminadoEn ? new Date(x.eliminadoEn).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—"), ayuda: "Cuándo se eliminó (los documentos sin vincular no se han eliminado: nunca se vincularon)" },
    { clave: "documentos", etiqueta: "Docs", valor: (x) => x.documentos, celda: (x) => x.documentos.toLocaleString("es-ES"), alinear: "right", ayuda: "Cuántos documentos tiene", oculta: categoria !== "expedientes" && categoria !== "clientes" },
    { clave: "bytes", etiqueta: "Ocupa", valor: (x) => x.bytes, celda: (x) => tamano(x.bytes), alinear: "right", ayuda: "Lo que ocupa (con sus documentos, si los tiene)" },
    { clave: "bloqueo", etiqueta: "Para purgar", valor: (x) => x.bloqueo ?? "", celda: (x) => (x.bloqueo ? <span style={{ color: "var(--warning)", whiteSpace: "normal", fontSize: "0.8rem" }}>⏳ {x.bloqueo}</span> : <span style={{ color: "var(--text-muted)" }}>Se puede purgar</span>), ayuda: "Si algo impide purgarla ahora mismo" },
  ];
  if (mostrarClase && (categoria === "documentos" || categoria === "catalogo")) columnas.splice(2, 0, { clave: "clase", etiqueta: "Clase", valor: (x) => x.subtipo, ayuda: "Tipo de documento o tabla del catálogo" });
  if (conVista) {
    columnas.push({
      clave: "ver",
      etiqueta: "Ver",
      valor: () => "",
      celda: (x) => (
        <button type="button" className={`btn ${vista?.id === x.id ? "btn-primary" : "btn-secondary"}`} style={{ padding: "2px 10px", fontSize: "0.78rem" }} disabled={x.documentos === 0} onClick={() => setVista(vista?.id === x.id ? null : x)} title={x.documentos === 0 ? "No tiene documentos" : "Vista previa de sus documentos (PDF o fotos) sin descargarlos"}>
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
      celda: (x) => (
        <a className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.78rem" }} href={`/api/admin/papelera/documento?id=${x.id}`} title="Descarga el archivo tal cual (ya descifrado)">
          Descargar
        </a>
      ),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>{explicacion}</p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setMarcadas(purgables)} disabled={!datos}>
          Elegir todo lo que se puede purgar ({purgables.length})
        </button>
        <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setMarcadas(filas.map((x) => x.id))} disabled={!datos || filas.length === 0}>
          Elegir todo lo que se ve ({filas.length})
        </button>
        <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setMarcadas([])} disabled={marcadas.length === 0}>
          Quitar la elección
        </button>
        {elegidasAqui.length > 0 && <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{elegidasAqui.length.toLocaleString("es-ES")} elegidas</span>}
      </div>
      <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: vista ? "1.2 1 520px" : "1 1 100%", minWidth: 0 }}>
          {!datos ? <p style={{ margin: 0, color: "var(--text-secondary)" }}>Cargando…</p> : <TablaDatos<FilaPapelera> id={`papelera-${categoria}`} columnas={columnas} filas={filas} clave={(x) => x.id} compacta ordenInicial={categoria === "historial" || categoria === "lecturas" || categoria === "auditoria" ? undefined : { clave: "bytes", asc: false }} placeholder="Buscar…" vacio="No hay nada." />}
          {datos && !f.filtrada && datos.total > filas.length && <p style={{ margin: "8px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>Se muestran {filas.length.toLocaleString("es-ES")} de {datos.total.toLocaleString("es-ES")}. «Purgar todo» de la categoría los alcanza todos.</p>}
        </div>
        {vista && (
          <div style={{ flex: "1 1 460px", minWidth: 0, position: "sticky", top: 0 }}>
            <PanelVista key={vista.id} categoria={categoria} fila={vista} alCerrar={() => setVista(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Restaurar, descargar y purgar lo elegido (los botones de cada lista). */
function BotonesFilas({ categoria, marcadas, restaurable, porFilas, alPurgar }: { categoria: Categoria; marcadas: string[]; restaurable: boolean; porFilas: boolean; alPurgar: (ids: string[]) => void }) {
  const { restaurando, restaurar } = useRestaurar();
  const sin = marcadas.length === 0;
  return (
    <>
      {restaurable && (
        <button type="button" className="btn btn-primary" disabled={sin || restaurando} onClick={() => void restaurar(categoria, marcadas)} title="Lo elegido vuelve a su sitio y a contar donde estaba (los expedientes recalculan las comisiones y recuperan a su cliente)">
          ♻️ Restaurar lo elegido ({marcadas.length})
        </button>
      )}
      <a className="btn btn-secondary" aria-disabled={sin} style={sin ? { pointerEvents: "none", opacity: 0.5 } : undefined} href={`/api/admin/papelera?categoria=${categoria}&descargar=1&ids=${marcadas.join(",")}`} title="Descarga en JSON lo que has elegido (sin los archivos de los documentos)">
        📥 Descargar lo elegido ({marcadas.length})
      </a>
      {porFilas && (
        <button type="button" className="btn btn-danger" disabled={sin} onClick={() => alPurgar(marcadas)} title="Borra de verdad lo que has elegido (la única forma de borrar definitivamente)">
          🗑️ Purgar lo elegido ({marcadas.length})
        </button>
      )}
    </>
  );
}

/** Lista de lo que hay en una categoría dentro de una ventana, para ver (con vista previa de sus documentos), elegir, restaurar, descargar y purgar fila a fila. */
function ModalFilas({ categoria, titulo, explicacion, motivo, alCerrar, alPurgar }: { categoria: Categoria; titulo: string; explicacion: string; motivo?: string; alCerrar: () => void; alPurgar: (ids: string[]) => void }) {
  const f = useFilas(categoria, motivo, undefined);
  return (
    <Modal
      titulo={`${ICONOS[categoria]} ${titulo}${f.datos ? ` (${f.datos.total.toLocaleString("es-ES")})` : ""}`}
      ancho="min(1600px, calc(96 * var(--uvw)))"
      pie={
        <>
          <BotonesFilas categoria={categoria} marcadas={f.marcadas} restaurable={RESTAURABLES.includes(categoria)} porFilas alPurgar={alPurgar} />
          <button type="button" className="btn btn-secondary" onClick={alCerrar}>
            Cerrar
          </button>
        </>
      }
    >
      <div style={{ maxHeight: "calc(72 * var(--uvh))", overflowY: "auto" }}>
        <CuerpoFilas categoria={categoria} explicacion={explicacion} f={f} mostrarClase />
      </div>
    </Modal>
  );
}

/** Purga lo elegido de una categoría (con la confirmación de dos pulsaciones y copia previa), en segundo plano. */
function usePurgaElegidos(categoria: Categoria, alPurgado: () => void) {
  const { mostrar, notificar } = useToast();
  const [ids, setIds] = useState<string[] | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const purgar = async () => {
    if (!ids) return;
    setTrabajando(true);
    try {
      await lanzarTarea("/api/admin/papelera", { categoria, ids, confirmacion: "PURGAR" });
      void notificar({ titulo: "Se está haciendo en segundo plano", texto: "La purga está en marcha.", detalles: ["Puedes seguir usando la aplicación mientras tanto.", "Verás el avance en la barra de tareas de arriba.", "Al terminar saldrá un aviso con el resultado."] });
      setIds(null);
      alPurgado();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };
  return { ids, setIds, trabajando, purgar };
}

/**
 * Lista de una categoría con todo lo necesario para gestionarla: ver, previsualizar documentos, elegir, restaurar, descargar y purgar con
 * confirmación. La usan las tarjetas del análisis que hablan de documentos, clientes y expedientes eliminados.
 */
export function GestorFilas({ categoria, titulo, explicacion, alPurga, motivo, alCerrar, alTerminar }: { categoria: Categoria; titulo: string; explicacion: string; alPurga?: string; motivo?: string; alCerrar: () => void; alTerminar: () => void }) {
  const p = usePurgaElegidos(categoria, () => {
    alTerminar();
    alCerrar();
  });
  return (
    <>
      <ModalFilas categoria={categoria} titulo={titulo} explicacion={explicacion} motivo={motivo} alCerrar={alCerrar} alPurgar={p.setIds} />
      {p.ids && (
        <ModalConfirmarPurga
          titulo={`🗑️ Purgar ${p.ids.length.toLocaleString("es-ES")} elegidos de «${titulo}»`}
          texto={`Se borran de verdad y no se pueden recuperar salvo restaurando la copia previa. ${alPurga ?? TEXTOS_PURGA[categoria]}`}
          boton="Purgar de verdad"
          trabajando={p.trabajando}
          alConfirmar={() => void p.purgar()}
          alCancelar={() => p.setIds(null)}
        />
      )}
    </>
  );
}

/** Una pestaña de la papelera: lo eliminado de una clase (pedidos, marcas…), con restaurar, descargar y purgar por filas. */
function PestanaFilas({ info, explicacion, clase, alPurgado }: { info: InfoCategoria; explicacion: string; clase?: FiltroClase; alPurgado: () => void }) {
  const f = useFilas(info.categoria, undefined, clase);
  const p = usePurgaElegidos(info.categoria, alPurgado);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <BotonesFilas categoria={info.categoria} marcadas={f.marcadas} restaurable={info.restaurable} porFilas={info.porFilas} alPurgar={p.setIds} />
      </div>
      <CuerpoFilas categoria={info.categoria} explicacion={explicacion} f={f} mostrarClase={false} />
      {p.ids && (
        <ModalConfirmarPurga
          titulo={`🗑️ Purgar ${p.ids.length.toLocaleString("es-ES")} elegidos`}
          texto={`Se borran de verdad y no se pueden recuperar salvo restaurando la copia previa. ${info.alPurgar}`}
          boton="Purgar de verdad"
          trabajando={p.trabajando}
          alConfirmar={() => void p.purgar()}
          alCancelar={() => p.setIds(null)}
        />
      )}
    </div>
  );
}

/** «Papelera y purga»: todo lo que sigue guardado aunque se haya eliminado, con control total para verlo, descargarlo y borrarlo de verdad. */
export default function PanelPapelera() {
  const router = useRouter();
  const { mostrar, confirmar, notificar } = useToast();
  const { datos, recargar } = useCarga<Resumen>("/api/admin/papelera", VACIO);
  const [ver, setVer] = useState<InfoCategoria | null>(null);
  const [purga, setPurga] = useState<{ info: InfoCategoria; ids: string[] | null; dias: number | null } | null>(null);
  const [aFondo, setAFondo] = useState(false);
  const [sinVincular, setSinVincular] = useState(false);
  const [conservarHistorial, setConservarHistorial] = useState(true);
  const [vaciarAuditoria, setVaciarAuditoria] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [dias, setDias] = useState<Record<string, number>>({ historial: 30, lecturas: 30, auditoria: 365 });
  const [compactando, setCompactando] = useState(false);

  const refrescar = () => {
    recargar();
    router.refresh();
  };
  // Al terminar una purga o la compactación (que van en segundo plano) se ponen al día los números de la pantalla
  useEffect(() => alTerminarTarea((t) => { if (t.tipo === "papelera") refrescar(); }));

  const ejecutarPurga = async () => {
    if (!purga) return;
    setTrabajando(true);
    try {
      await lanzarTarea("/api/admin/papelera", { categoria: purga.info.categoria, ...(purga.ids ? { ids: purga.ids } : { todo: true }), ...(purga.dias !== null ? { antesDeDias: purga.dias } : {}), confirmacion: "PURGAR" });
      void notificar({ titulo: "Se está haciendo en segundo plano", texto: "La purga está en marcha.", detalles: ["Puedes seguir usando la aplicación mientras tanto.", "Verás el avance en la barra de tareas de arriba.", "Al terminar saldrá un aviso con el resultado."] });
      setPurga(null);
      setVer(null);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const ejecutarAFondo = async () => {
    setTrabajando(true);
    try {
      await lanzarTarea("/api/admin/papelera", { accion: "a_fondo", confirmacion: "PURGAR A FONDO", incluirSinVincular: sinVincular, conservarHistorial, vaciarAuditoria });
      void notificar({ titulo: "Se está haciendo en segundo plano", texto: "La purga a fondo está en marcha.", detalles: ["Puedes seguir usando la aplicación mientras tanto.", "Verás el avance en la barra de tareas de arriba.", "Al terminar saldrá un aviso con el resultado."] });
      setAFondo(false);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const compactar = async () => {
    if (!await confirmar({ texto: "Se va a compactar la base de datos: el espacio de todo lo borrado vuelve al disco. Las tablas afectadas quedan bloqueadas unos segundos (puede tardar un poco si hay documentos grandes). No se borra ningún dato. ¿Continuar?" })) return;
    setCompactando(true);
    try {
      await lanzarTarea("/api/admin/papelera", { accion: "compactar" });
      void notificar({ titulo: "Se está haciendo en segundo plano", texto: "La base de datos se está compactando.", detalles: ["Puedes seguir usando la aplicación mientras tanto.", "Verás el avance en la barra de tareas de arriba.", "Al terminar saldrá un aviso con el resultado."] });
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
          Todo lo que se elimina en la aplicación <b>viene aquí</b> y se puede <b>restaurar</b>: solo la Papelera borra de verdad. Hay una pestaña por cada cosa (expedientes, pedidos, pagos RCI, marcas, modelos…) con buscador, orden y columnas a tu gusto. Aquí ves <b>todo lo que sigue guardado</b>, lo restauras, lo descargas, eliges y <b>purgas de verdad</b>. Antes de purgar se guarda siempre una copia de seguridad completa. Las liquidaciones y los puntos ya guardados no se tocan: son el histórico de lo cobrado.
        </p>
      </div>

      <SubPestanas
        id="papelera"
        pestanas={[
          { clave: "resumen", etiqueta: "📊 Resumen", ayuda: "Espacio, purga por categorías y purga a fondo", insignia: datos.categorias.reduce((a, c) => a + (c.restaurable ? c.cantidad : 0), 0) || undefined },
          ...DEFINICIONES.map((d) => {
            const info = datos.categorias.find((c) => c.categoria === d.categoria);
            return { clave: d.clave, etiqueta: d.etiqueta, ayuda: d.ayuda, insignia: info ? d.cantidad(info) : undefined };
          }),
        ]}
      >
        {(pestana) => {
          const def = DEFINICIONES.find((d) => d.clave === pestana);
          const info = def ? datos.categorias.find((c) => c.categoria === def.categoria) : undefined;
          if (def) return info ? <PestanaFilas key={def.clave} info={info} explicacion={def.explicacion} clase={def.clase} alPurgado={refrescar} /> : <p style={{ margin: 0, color: "var(--text-secondary)" }}>Cargando…</p>;
          return (
            <>
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
        <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={vaciarAuditoria} onChange={(e) => setVaciarAuditoria(e.target.checked)} style={{ marginTop: "3px" }} />
          <span>Vaciar también el registro de <b>auditoría</b> (quién hizo qué). Siempre quedará la anotación de esta propia purga.</span>
        </label>
        <div>
          <button type="button" className="btn btn-danger" onClick={() => setAFondo(true)}>
            🔥 Purgar a fondo…
          </button>
        </div>
      </div>
            </>
          );
        }}
      </SubPestanas>

      {ver && <GestorFilas categoria={ver.categoria} titulo={ver.titulo} explicacion={ver.explicacion} alPurga={ver.alPurgar} alCerrar={() => setVer(null)} alTerminar={refrescar} />}
      {purga && (
        <ModalConfirmarPurga
          titulo={`🗑️ Purgar «${purga.info.titulo}»`}
          texto={`${purga.ids ? `Vas a purgar las ${purga.ids.length.toLocaleString("es-ES")} filas que has elegido` : purga.dias !== null ? `Vas a purgar lo anterior a ${purga.dias} días` : `Vas a purgar todo lo que se pueda de esta categoría (${purga.info.cantidad.toLocaleString("es-ES")})`}. Se borran de verdad y no se pueden recuperar salvo restaurando la copia previa. ${purga.info.alPurgar}`}
          boton="Purgar de verdad"
          trabajando={trabajando}
          alConfirmar={() => void ejecutarPurga()}
          alCancelar={() => setPurga(null)}
        />
      )}
      {aFondo && (
        <ModalConfirmarPurga
          titulo="🔥 Purgar a fondo"
          texto={`Se van a borrar de verdad ${datos.categorias.filter((c) => ["expedientes", "clientes", "catalogo", "lecturas"].includes(c.categoria)).reduce((a, c) => a + c.cantidad, 0).toLocaleString("es-ES")} elementos entre expedientes, clientes, catálogos y lecturas eliminados${sinVincular ? ", más los documentos sin vincular" : ""}${conservarHistorial ? "" : " y todo el historial de deshacer"}${vaciarAuditoria ? ", y se vaciará el registro de auditoría" : ""}, y la base se compactará.`}
          boton="Purgar a fondo"
          trabajando={trabajando}
          alConfirmar={() => void ejecutarAFondo()}
          alCancelar={() => setAFondo(false)}
        />
      )}
    </div>
  );
}
