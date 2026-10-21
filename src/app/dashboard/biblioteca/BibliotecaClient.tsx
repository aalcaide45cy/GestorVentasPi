"use client";

import { useMemo, useRef, useState } from "react";
import { useCarga } from "@/components/comisiones/useCarga";
import { useToast } from "@/components/Toast";
import TablaDatos, { PANTALLA_COMPLETA, type ColumnaTabla } from "@/components/TablaDatos";
import { ETIQUETAS, subirABiblioteca, tamanoLegible, type RespuestaListado } from "@/lib/biblioteca-cliente";
import { formatDate } from "@/lib/date-utils";
import { CATEGORIAS, type CategoriaBiblioteca } from "@/lib/biblioteca-categorias";
import type { ArchivoBibliotecaDto } from "@/lib/servicios/biblioteca";

async function llamar(url: string, init: RequestInit): Promise<void> {
  const r = await fetch(url, { credentials: "same-origin", ...init });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(j.message ?? `Error ${r.status}`);
  }
}

/** «Biblioteca»: los archivos de trabajo (pedidos, pagos de RCI, rejillas, listados Excel) guardados en el servidor para no volver a subirlos. */
export default function BibliotecaClient() {
  const { mostrar, confirmar } = useToast();
  const { datos, recargar } = useCarga<RespuestaListado | null>("/api/biblioteca", null);
  const [filtro, setFiltro] = useState<"todas" | CategoriaBiblioteca>("todas");
  const [categoriaSubida, setCategoriaSubida] = useState<"auto" | CategoriaBiblioteca>("auto");
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [editando, setEditando] = useState<{ id: number; nombre: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = async () => recargar();

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
      await cargar();
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  };

  const cambiar = async (id: number, cambios: { nombre?: string; categoria?: CategoriaBiblioteca }) => {
    try {
      await llamar("/api/biblioteca", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...cambios }) });
      setEditando(null);
      await cargar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido cambiar el archivo.", "error");
    }
  };

  const borrar = async (f: ArchivoBibliotecaDto) => {
    if (!(await confirmar({ texto: `¿Borro «${f.nombre}» de la biblioteca? Los pedidos o pagos que ya hayas creado con él no cambian.`, peligro: true }))) return;
    try {
      await llamar(`/api/biblioteca?id=${f.id}`, { method: "DELETE" });
      mostrar("Archivo borrado de la biblioteca.");
      await cargar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido borrar.", "error");
    }
  };

  const cuenta = (c: CategoriaBiblioteca) => (datos?.archivos ?? []).filter((f) => f.categoria === c).length;
  const filas = useMemo(() => (datos?.archivos ?? []).filter((f) => filtro === "todas" || f.categoria === filtro), [datos, filtro]);

  const columnas: ColumnaTabla<ArchivoBibliotecaDto>[] = [
    {
      clave: "nombre",
      etiqueta: "Archivo",
      valor: (f) => f.nombre,
      celda: (f) =>
        editando?.id === f.id ? (
          <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
            <input className="form-input" value={editando.nombre} autoFocus onChange={(e) => setEditando({ id: f.id, nombre: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void cambiar(f.id, { nombre: editando.nombre }); if (e.key === "Escape") setEditando(null); }} style={{ padding: "4px 8px", minWidth: "260px" }} />
            <button type="button" className="btn btn-primary" style={{ padding: "3px 10px" }} onClick={() => void cambiar(f.id, { nombre: editando.nombre })}>
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
        <select className="form-input" value={f.categoria} onChange={(e) => void cambiar(f.id, { categoria: e.target.value as CategoriaBiblioteca })} style={{ padding: "3px 8px", width: "auto" }} title="Cambia el tipo: decide en qué zonas de subida aparece este archivo">
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {ETIQUETAS[c]}
            </option>
          ))}
        </select>
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
          <a className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} href={`/api/biblioteca?id=${f.id}`} download={f.nombre} title="Descarga el archivo a tu equipo">
            ⬇️ Descargar
          </a>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} onClick={() => setEditando({ id: f.id, nombre: f.nombre })} title="Cambia el nombre del archivo">
            ✏️ Renombrar
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem", color: "var(--danger)" }} onClick={() => void borrar(f)} title="Borra el archivo de la biblioteca">
            🗑️ Borrar
          </button>
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Biblioteca de archivos</h1>
        <p style={{ color: "var(--text-secondary)" }}>Guarda aquí pedidos, pagos de RCI, rejillas y listados Excel una sola vez. Después, en cada zona de subida, pulsa «📚 Elegir de la biblioteca» y no tendrás que buscarlos en tu equipo.</p>
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
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className={filtro === "todas" ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "5px 12px" }} onClick={() => setFiltro("todas")}>
            Todos ({datos?.archivos.length ?? 0})
          </button>
          {CATEGORIAS.map((c) => (
            <button key={c} type="button" className={filtro === c ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "5px 12px" }} onClick={() => setFiltro(c)}>
              {ETIQUETAS[c]} ({cuenta(c)})
            </button>
          ))}
        </div>
      </section>

      <TablaDatos<ArchivoBibliotecaDto> id="biblioteca" columnas={columnas} filas={filas} clave={(f) => f.id} placeholder="Buscar por nombre o tipo…" vacio={datos === null ? "Cargando…" : "No hay archivos en esta categoría. Añade el primero con «Añadir archivos»."} alto={PANTALLA_COMPLETA} pie={(fs) => ({ nombre: `${fs.length} archivo${fs.length === 1 ? "" : "s"}` })} />
    </div>
  );
}
