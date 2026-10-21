"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import ModalSubidaBiblioteca from "@/components/biblioteca/ModalSubidaBiblioteca";
import { archivoDeBiblioteca, ETIQUETAS, listarBiblioteca, tamanoLegible } from "@/lib/biblioteca-cliente";
import { formatDate } from "@/lib/date-utils";
import { CATEGORIAS } from "@/lib/biblioteca-categorias";
import type { ArchivoBibliotecaDto, CategoriaBiblioteca } from "@/lib/servicios/biblioteca";

interface Props {
  /** Categorías que se ofrecen (las de lo que se sube en esa zona). */
  categorias: CategoriaBiblioteca[];
  /** Si se pueden elegir varios a la vez. */
  multiple?: boolean;
  /** Texto del botón. */
  etiqueta?: string;
  deshabilitado?: boolean;
  /** Recibe los archivos elegidos, como si se hubieran escogido en el equipo. */
  alElegir: (archivos: File[]) => void | Promise<void>;
  /** Estilo del botón (por defecto, el de los botones secundarios pequeños). */
  className?: string;
}

/** «Elegir de la biblioteca»: abre una ventana con los archivos guardados de esas categorías y entrega los elegidos a la zona de subida. */
export default function BotonBiblioteca({ categorias, multiple = true, etiqueta = "📚 Elegir de la biblioteca", deshabilitado, alElegir, className = "btn btn-secondary" }: Props) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className={className} disabled={deshabilitado} onClick={() => setAbierto(true)} title="Elige archivos que ya tienes guardados en la biblioteca de la aplicación, sin volver a buscarlos en el equipo" style={{ padding: "6px 12px", fontSize: "0.82rem" }}>
        {etiqueta}
      </button>
      {abierto && <Selector categorias={categorias} multiple={multiple} alElegir={alElegir} alCerrar={() => setAbierto(false)} />}
    </>
  );
}

function Selector({ categorias, multiple, alElegir, alCerrar }: { categorias: CategoriaBiblioteca[]; multiple: boolean; alElegir: (a: File[]) => void | Promise<void>; alCerrar: () => void }) {
  const { mostrar } = useToast();
  const [lista, setLista] = useState<ArchivoBibliotecaDto[] | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [texto, setTexto] = useState("");
  /** Qué se enseña: lo de esta zona (por defecto), todo, o un tipo concreto. */
  const [filtro, setFiltro] = useState<"zona" | "todos" | CategoriaBiblioteca>("zona");
  const [trabajando, setTrabajando] = useState(false);
  const [version, setVersion] = useState(0);
  const [nuevos, setNuevos] = useState<File[] | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    // Se pide todo y se filtra aquí: así se puede cambiar de tipo sin volver a pedirlo
    listarBiblioteca()
      .then((r) => vivo && setLista(r.archivos))
      .catch((e: unknown) => {
        if (!vivo) return;
        setLista([]);
        mostrar(e instanceof Error ? e.message : "No se ha podido leer la biblioteca.", "error");
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const delTipo = (f: ArchivoBibliotecaDto) => (filtro === "todos" ? true : filtro === "zona" ? categorias.includes(f.categoria) : f.categoria === filtro);
  const visibles = useMemo(() => (lista ?? []).filter((f) => delTipo(f) && f.nombre.toLowerCase().includes(texto.trim().toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lista, texto, filtro]);
  const cuenta = (a: ArchivoBibliotecaDto[], c: "zona" | "todos" | CategoriaBiblioteca) => a.filter((f) => (c === "todos" ? true : c === "zona" ? categorias.includes(f.categoria) : f.categoria === c)).length;
  const alternar = (id: number) =>
    setMarcados((prev) => {
      const n = new Set(multiple ? prev : []);
      if (prev.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todosMarcados = visibles.length > 0 && visibles.every((f) => marcados.has(f.id));

  const usar = async () => {
    const elegidos = (lista ?? []).filter((f) => marcados.has(f.id));
    if (elegidos.length === 0) return;
    setTrabajando(true);
    try {
      const archivos = await Promise.all(elegidos.map((f) => archivoDeBiblioteca(f)));
      alCerrar();
      await alElegir(archivos);
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se han podido abrir los archivos.", "error");
    } finally {
      setTrabajando(false);
    }
  };

  const anadir = (files: FileList | null) => {
    const archivos = files ? Array.from(files) : [];
    if (entrada.current) entrada.current.value = "";
    if (archivos.length > 0) setNuevos(archivos);
  };

  const nombresCategorias = categorias.map((c) => ETIQUETAS[c]).join(", ");

  return (
    <>
    <Modal
      titulo={`📚 Elegir de la biblioteca${lista === null ? "" : ` · ${visibles.length} ${visibles.length === 1 ? "archivo" : "archivos"}${marcados.size > 0 ? ` · ${marcados.size} ${marcados.size === 1 ? "elegido" : "elegidos"}` : ""}`}`}
      ancho="760px"
      pie={
        <>
          <Link href="/dashboard/herramientas?p=biblioteca" className="btn btn-secondary" style={{ marginRight: "auto" }} title="Abre la biblioteca para ver, renombrar o borrar archivos">
            Abrir la biblioteca
          </Link>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={trabajando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void usar()} disabled={trabajando || marcados.size === 0}>
            {trabajando ? "Abriendo…" : marcados.size > 0 ? `Usar ${marcados.size} archivo${marcados.size === 1 ? "" : "s"}` : "Elige archivos"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
        <div style={{ color: "var(--text-secondary)" }}>
          Se usan igual que si los hubieras elegido en tu equipo. Por defecto salen los de esta zona (<b>{nombresCategorias}</b>); cambia el tipo para ver otros, o elige «Todos».
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)" }}>TIPO</span>
          {([["zona", `De esta zona (${cuenta(lista ?? [], "zona")})`], ["todos", `Todos (${(lista ?? []).length})`], ...CATEGORIAS.map((c) => [c, `${ETIQUETAS[c]} (${cuenta(lista ?? [], c)})`])] as [typeof filtro, string][]).map(([id, etiqueta]) => (
            <button key={id} type="button" className={filtro === id ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setFiltro(id)}>
              {etiqueta}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <input className="form-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="🔎 Buscar por nombre…" style={{ flex: 1, minWidth: "180px", padding: "6px 10px" }} />
          <button type="button" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.82rem" }} disabled={trabajando} onClick={() => entrada.current?.click()} title="Guarda archivos nuevos en la biblioteca para tenerlos siempre a mano">
            ➕ Añadir a la biblioteca
          </button>
          <input ref={entrada} type="file" multiple style={{ display: "none" }} onChange={(e) => anadir(e.target.files)} />
        </div>
        {lista === null ? (
          <div style={{ color: "var(--text-muted)" }}>Cargando…</div>
        ) : visibles.length === 0 ? (
          <div style={{ color: "var(--text-muted)" }}>{lista.length === 0 ? "Todavía no hay archivos en la biblioteca. Usa «Añadir a la biblioteca»." : texto.trim() ? "Ningún archivo coincide con la búsqueda." : "No hay archivos de este tipo. Prueba con «Todos» u otro tipo."}</div>
        ) : (
          <div className="table-container" style={{ maxHeight: "50vh", overflow: "auto" }}>
            <table className="table-premium">
              <thead>
                <tr>
                  <th style={{ width: "36px" }}>
                    {multiple && <input type="checkbox" checked={todosMarcados} onChange={(e) => setMarcados(e.target.checked ? new Set(visibles.map((f) => f.id)) : new Set())} title="Marcar o desmarcar todos los que se ven" />}
                  </th>
                  <th>Archivo</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: "right" }}>Tamaño</th>
                  <th>Guardado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.id} onClick={() => alternar(f.id)} style={{ cursor: "pointer", background: marcados.has(f.id) ? "rgba(var(--primary-rgb), 0.08)" : undefined }}>
                    <td>
                      <input type="checkbox" checked={marcados.has(f.id)} onChange={() => alternar(f.id)} onClick={(e) => e.stopPropagation()} aria-label={`Elegir ${f.nombre}`} />
                    </td>
                    <td style={{ wordBreak: "break-word" }}>{f.nombre}</td>
                    <td>{ETIQUETAS[f.categoria]}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{tamanoLegible(f.tamano)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(f.creadoEn.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
      {nuevos && (
        <ModalSubidaBiblioteca
          archivos={nuevos}
          tipoFijo={categorias.length === 1 ? categorias[0] : undefined}
          alCerrar={(guardados) => {
            setNuevos(null);
            if (guardados > 0) setVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
