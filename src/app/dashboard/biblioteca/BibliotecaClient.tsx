"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import TablaDatos, { PANTALLA_COMPLETA, type ColumnaTabla } from "@/components/TablaDatos";
import { useCarga } from "@/components/comisiones/useCarga";
import { CATEGORIAS, type CategoriaBiblioteca } from "@/lib/biblioteca-categorias";
import { ETIQUETAS, subirABiblioteca, tamanoLegible, type RespuestaListado } from "@/lib/biblioteca-cliente";
import { formatDate } from "@/lib/date-utils";
import type { ArchivoBibliotecaDto } from "@/lib/servicios/biblioteca";

async function llamar(url: string, init: RequestInit): Promise<void> {
  const r = await fetch(url, { credentials: "same-origin", ...init });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(j.message ?? `Error ${r.status}`);
  }
}

type FiltroAsignacion = "todas" | "sin" | "con" | "cliente" | "expediente";
const TEXTO_ASIGNACION: Record<FiltroAsignacion, string> = { todas: "Todos", sin: "Sin asignar", con: "Asignados", cliente: "A un cliente", expediente: "A un expediente" };
const cumple = (f: ArchivoBibliotecaDto, a: FiltroAsignacion): boolean => (a === "todas" ? true : a === "sin" ? !f.idCliente && !f.idExpediente : a === "con" ? !!(f.idCliente || f.idExpediente) : a === "cliente" ? !!f.idCliente && !f.idExpediente : !!f.idExpediente);

/** «Biblioteca»: los archivos de trabajo (pedidos, pagos de RCI, rejillas, listados Excel) guardados en el servidor para no volver a subirlos. */
export default function BibliotecaClient() {
  const { mostrar, confirmar } = useToast();
  const { datos, recargar } = useCarga<RespuestaListado | null>("/api/biblioteca", null);
  const [asignacion, setAsignacion] = useState<FiltroAsignacion>("todas");
  const [filtro, setFiltro] = useState<"todas" | CategoriaBiblioteca>("todas");
  const [categoriaSubida, setCategoriaSubida] = useState<"auto" | CategoriaBiblioteca>("auto");
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [editando, setEditando] = useState<{ id: number; nombre: string } | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [visibles, setVisibles] = useState<ArchivoBibliotecaDto[]>([]);
  const [asignando, setAsignando] = useState<number[] | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const todos = useMemo(() => datos?.archivos ?? [], [datos]);
  // Solo cuentan las marcas de archivos que siguen existiendo
  const elegidos = useMemo(() => todos.filter((f) => marcados.has(f.id)), [todos, marcados]);
  const cuentaTipo = (c: CategoriaBiblioteca) => todos.filter((f) => f.categoria === c && cumple(f, asignacion)).length;
  const cuentaAsignacion = (a: FiltroAsignacion) => todos.filter((f) => cumple(f, a) && (filtro === "todas" || f.categoria === filtro)).length;
  const filas = useMemo(() => todos.filter((f) => cumple(f, asignacion) && (filtro === "todas" || f.categoria === filtro)), [todos, asignacion, filtro]);

  const subir = async (files: FileList | File[] | null) => {
    const lista = files ? Array.from(files) : [];
    if (lista.length === 0) return;
    setSubiendo(true);
    let nuevos = 0;
    let repetidos = 0;
    try {
      for (const f of lista) {
        try {
          const r = await subirABiblioteca(f, categoriaSubida === "auto" ? undefined : categoriaSubida);
          if (r.repetido) repetidos++;
          else nuevos++;
        } catch (e) {
          mostrar(e instanceof Error ? e.message : `No se ha podido guardar «${f.name}».`, "error");
        }
      }
      if (nuevos + repetidos > 0) mostrar(`${nuevos} archivo(s) guardado(s)${repetidos > 0 ? ` y ${repetidos} que ya estaba(n) en la biblioteca` : ""}.`, repetidos > 0 && nuevos === 0 ? "aviso" : "exito");
      recargar();
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  };

  const cambiar = async (ids: number[], cambios: { nombre?: string; categoria?: CategoriaBiblioteca; idCliente?: number | null; idExpediente?: number | null }, ok?: string) => {
    try {
      await llamar("/api/biblioteca", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, ...cambios }) });
      setEditando(null);
      setAsignando(null);
      if (ok) mostrar(ok);
      recargar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido cambiar el archivo.", "error");
    }
  };

  const borrar = async (lista: ArchivoBibliotecaDto[]) => {
    if (lista.length === 0) return;
    const texto = lista.length === 1 ? `¿Borro «${lista[0].nombre}» de la biblioteca?` : `¿Borro ${lista.length} archivos de la biblioteca?`;
    if (!(await confirmar({ texto: `${texto} Los pedidos o pagos que ya hayas creado con ellos no cambian.`, peligro: true }))) return;
    try {
      await llamar("/api/biblioteca", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: lista.map((f) => f.id) }) });
      mostrar(lista.length === 1 ? "Archivo borrado de la biblioteca." : `${lista.length} archivos borrados de la biblioteca.`);
      setMarcados(new Set());
      recargar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido borrar.", "error");
    }
  };

  const descargar = (lista: ArchivoBibliotecaDto[]) => {
    if (lista.length === 0) return;
    const a = document.createElement("a");
    if (lista.length === 1) {
      a.href = `/api/biblioteca?id=${lista[0].id}`;
      a.download = lista[0].nombre;
    } else {
      a.href = `/api/biblioteca/zip?ids=${lista.map((f) => f.id).join(",")}`;
      a.download = "biblioteca.zip";
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const alternar = (id: number) =>
    setMarcados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const columnas: ColumnaTabla<ArchivoBibliotecaDto>[] = [
    {
      clave: "marca",
      etiqueta: "Elegir",
      cabecera: "☑",
      valor: (f) => (marcados.has(f.id) ? 0 : 1),
      celda: (f) => <input type="checkbox" checked={marcados.has(f.id)} onChange={() => alternar(f.id)} aria-label={`Elegir ${f.nombre}`} />,
      ancho: 40,
      alinear: "center",
      ayuda: "Marca archivos para descargarlos, asignarlos o borrarlos de una vez",
    },
    {
      clave: "nombre",
      etiqueta: "Archivo",
      valor: (f) => f.nombre,
      celda: (f) =>
        editando?.id === f.id ? (
          <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
            <input className="form-input" value={editando.nombre} autoFocus onChange={(e) => setEditando({ id: f.id, nombre: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void cambiar([f.id], { nombre: editando.nombre }); if (e.key === "Escape") setEditando(null); }} style={{ padding: "4px 8px", minWidth: "260px" }} />
            <button type="button" className="btn btn-primary" style={{ padding: "3px 10px" }} onClick={() => void cambiar([f.id], { nombre: editando.nombre })}>
              Guardar
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px" }} onClick={() => setEditando(null)}>
              Cancelar
            </button>
          </span>
        ) : (
          <b style={{ wordBreak: "break-word" }}>{f.nombre}</b>
        ),
    },
    {
      clave: "categoria",
      etiqueta: "Tipo",
      valor: (f) => ETIQUETAS[f.categoria],
      celda: (f) => (
        <select className="form-input" value={f.categoria} onChange={(e) => void cambiar([f.id], { categoria: e.target.value as CategoriaBiblioteca })} style={{ padding: "3px 8px", width: "auto" }} title="Cambia el tipo: decide en qué zonas de subida aparece este archivo">
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {ETIQUETAS[c]}
            </option>
          ))}
        </select>
      ),
    },
    {
      clave: "asignado",
      etiqueta: "Asignado a",
      valor: (f) => f.asignadoA ?? "",
      celda: (f) =>
        f.asignadoA ? (
          f.idExpediente ? (
            <Link href={`/dashboard/expedientes/editar/${f.idExpediente}`} title="Abre el expediente" style={{ fontWeight: 600 }}>
              {f.asignadoA}
            </Link>
          ) : (
            <span style={{ fontWeight: 600 }}>👤 {f.asignadoA}</span>
          )
        ) : (
          <span style={{ color: "var(--text-muted)" }}>Sin asignar</span>
        ),
    },
    { clave: "tamano", etiqueta: "Tamaño", valor: (f) => f.tamano, celda: (f) => tamanoLegible(f.tamano), alinear: "right" },
    { clave: "fecha", etiqueta: "Guardado", valor: (f) => f.creadoEn, celda: (f) => formatDate(f.creadoEn.slice(0, 10)) },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      valor: () => "",
      celda: (f) => (
        <span style={{ display: "inline-flex", gap: "6px", whiteSpace: "nowrap" }}>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} onClick={() => descargar([f])} title="Descargar el archivo a tu equipo" aria-label="Descargar">
            ⬇️
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} onClick={() => setAsignando([f.id])} title="Asignar el archivo a un cliente o a un expediente" aria-label="Asignar">
            🔗
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} onClick={() => setEditando({ id: f.id, nombre: f.nombre })} title="Renombrar el archivo" aria-label="Renombrar">
            ✏️
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem", color: "var(--danger)" }} onClick={() => void borrar([f])} title="Borrar el archivo de la biblioteca" aria-label="Borrar">
            🗑️
          </button>
        </span>
      ),
    },
  ];

  const chip = (activo: boolean, texto: string, alPulsar: () => void) => (
    <button key={texto} type="button" className={activo ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "5px 12px" }} onClick={alPulsar}>
      {texto}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Biblioteca de archivos</h1>
        <p style={{ color: "var(--text-secondary)" }}>Guarda aquí pedidos, pagos de RCI, rejillas y listados Excel una sola vez. Después, en cada zona de subida, pulsa «📚 Elegir de la biblioteca» y no tendrás que buscarlos en tu equipo. También puedes asignar cada archivo a un cliente o a un expediente.</p>
      </div>

      <section
        className="glass-panel"
        style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", outline: arrastrando ? "2px dashed var(--primary)" : undefined, outlineOffset: "-6px" }}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); void subir(e.dataTransfer.files); }}
      >
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-primary" disabled={subiendo} onClick={() => entrada.current?.click()}>
            {subiendo ? "Guardando…" : "➕ Añadir archivos"}
          </button>
          <input ref={entrada} type="file" multiple style={{ display: "none" }} onChange={(e) => void subir(e.target.files)} />
          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.85rem" }}>
            Guardar como
            <select className="form-input" value={categoriaSubida} onChange={(e) => setCategoriaSubida(e.target.value as "auto" | CategoriaBiblioteca)} style={{ width: "auto", padding: "5px 10px" }}>
              <option value="auto">Detectar por el nombre</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETAS[c]}
                </option>
              ))}
            </select>
          </label>
          <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>También puedes arrastrar los archivos aquí. El mismo archivo no se guarda dos veces.</span>
          {datos && (
            <span style={{ marginLeft: "auto", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              {datos.resumen.archivos} archivo(s) · {tamanoLegible(datos.resumen.bytes)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", minWidth: "78px" }}>ASIGNACIÓN</span>
          {(Object.keys(TEXTO_ASIGNACION) as FiltroAsignacion[]).map((a) => chip(asignacion === a, `${TEXTO_ASIGNACION[a]} (${cuentaAsignacion(a)})`, () => setAsignacion(a)))}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", minWidth: "78px" }}>TIPO</span>
          {chip(filtro === "todas", `Todos (${todos.filter((f) => cumple(f, asignacion)).length})`, () => setFiltro("todas"))}
          {CATEGORIAS.map((c) => chip(filtro === c, `${ETIQUETAS[c]} (${cuentaTipo(c)})`, () => setFiltro(c)))}
        </div>
      </section>

      {/* Acciones sobre lo marcado */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "-8px" }}>
        <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => setMarcados(new Set(visibles.map((f) => f.id)))} disabled={visibles.length === 0} title="Marca todos los archivos que se ven ahora en la tabla (con los filtros y la búsqueda aplicados)">
          ☑ Marcar los {visibles.length} que se ven
        </button>
        {marcados.size > 0 && (
          <>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => setMarcados(new Set())}>
              Quitar marcas
            </button>
            <b style={{ color: "var(--primary)", fontSize: "0.9rem" }}>{elegidos.length} marcado(s):</b>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => descargar(elegidos)} title={elegidos.length > 1 ? "Descarga todos los marcados juntos en un archivo .zip" : "Descarga el archivo"}>
              ⬇️ Descargar{elegidos.length > 1 ? " (.zip)" : ""}
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => setAsignando(elegidos.map((f) => f.id))}>
              🔗 Asignar…
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => void cambiar(elegidos.map((f) => f.id), { idCliente: null }, "Asignación quitada.")} title="Deja los archivos marcados sin asignar a ningún cliente ni expediente">
              Quitar asignación
            </button>
            <select className="form-input" value="" onChange={(e) => e.target.value && void cambiar(elegidos.map((f) => f.id), { categoria: e.target.value as CategoriaBiblioteca }, "Tipo cambiado.")} style={{ width: "auto", padding: "5px 10px" }} aria-label="Cambiar el tipo de los marcados">
              <option value="">Cambiar tipo…</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETAS[c]}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px", color: "var(--danger)" }} onClick={() => void borrar(elegidos)}>
              🗑️ Borrar
            </button>
          </>
        )}
      </div>

      <TablaDatos<ArchivoBibliotecaDto>
        id="biblioteca"
        columnas={columnas}
        filas={filas}
        clave={(f) => f.id}
        placeholder="Buscar por nombre, tipo o asignación…"
        vacio={datos === null ? "Cargando…" : "No hay archivos con estos filtros. Añade el primero con «Añadir archivos»."}
        alto={PANTALLA_COMPLETA}
        alVerFilas={setVisibles}
        pie={(fs) => ({ nombre: `${fs.length} archivo${fs.length === 1 ? "" : "s"}` })}
      />

      {asignando && <ModalAsignar cantidad={asignando.length} alCancelar={() => setAsignando(null)} alAsignar={(cambios, texto) => void cambiar(asignando, cambios, texto)} />}
    </div>
  );
}

interface Sugerencias {
  clientes: { id: number; label: string }[];
  expedientes: { id_expediente: number; label: string }[];
}

/** Elegir a quién se asignan los archivos: se busca un cliente o un expediente (por nombre, DNI, matrícula…) y se pulsa el que sea. */
function ModalAsignar({ cantidad, alCancelar, alAsignar }: { cantidad: number; alCancelar: () => void; alAsignar: (cambios: { idCliente?: number; idExpediente?: number }, texto: string) => void }) {
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<Sugerencias | null>(null);

  useEffect(() => {
    if (texto.trim().length < 2) return;
    let vivo = true;
    const t = setTimeout(() => {
      fetch(`/api/buscar?q=${encodeURIComponent(texto.trim())}`, { credentials: "same-origin" })
        .then((r) => (r.ok ? (r.json() as Promise<Sugerencias>) : null))
        .then((r) => vivo && setResultado(r))
        .catch(() => vivo && setResultado(null));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [texto]);

  const hay = texto.trim().length >= 2 ? resultado : null;
  const boton = { display: "flex", textAlign: "left", gap: "8px", padding: "8px 12px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "rgba(255, 255, 255, 0.03)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "inherit", width: "100%" } as const;

  return (
    <Modal
      titulo={`🔗 Asignar ${cantidad === 1 ? "el archivo" : `${cantidad} archivos`}`}
      ancho="640px"
      pie={
        <button type="button" className="btn btn-secondary" onClick={alCancelar}>
          Cancelar
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
        <div style={{ color: "var(--text-secondary)" }}>Busca un cliente (nombre o DNI) o un expediente (matrícula, bastidor, cliente, modelo…) y pulsa el que quieras. Al asignarlo a un expediente, el archivo también queda del cliente de ese expediente.</div>
        <input className="form-input" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="🔎 Escribe al menos 2 letras…" />
        {hay && hay.clientes.length === 0 && hay.expedientes.length === 0 && <div style={{ color: "var(--text-muted)" }}>No se ha encontrado nada con «{texto}».</div>}
        {hay && hay.clientes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <b>Clientes</b>
            {hay.clientes.map((c) => (
              <button key={c.id} type="button" style={boton} onClick={() => alAsignar({ idCliente: c.id }, `Asignado a ${c.label}.`)}>
                👤 {c.label}
              </button>
            ))}
          </div>
        )}
        {hay && hay.expedientes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <b>Expedientes</b>
            {hay.expedientes.map((e) => (
              <button key={e.id_expediente} type="button" style={boton} onClick={() => alAsignar({ idExpediente: e.id_expediente }, `Asignado al expediente #EXP-${String(e.id_expediente).padStart(4, "0")}.`)}>
                📋 {e.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
