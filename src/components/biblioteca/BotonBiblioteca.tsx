"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import VistaPreviaBiblioteca from "@/components/biblioteca/VistaPreviaBiblioteca";
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
  /** Qué se enseña: lo de esta zona (por defecto), todo, o un tipo concreto. */
  const [filtro, setFiltro] = useState<"zona" | "todos" | CategoriaBiblioteca>("zona");
  const [trabajando, setTrabajando] = useState(false);
  const [version, setVersion] = useState(0);
  const [nuevos, setNuevos] = useState<File[] | null>(null);
  const [viendo, setViendo] = useState<ArchivoBibliotecaDto | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  /** Filas que se ven en la tabla con la búsqueda y el orden de ahora (para «Marcar los que se ven»). */
  const vistas = useRef<ArchivoBibliotecaDto[]>([]);
  const [nVistas, setNVistas] = useState(0);
  const alVerFilas = useCallback((f: ArchivoBibliotecaDto[]) => {
    vistas.current = f;
    setNVistas((n) => (n === f.length ? n : f.length));
  }, []);

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

  const cuenta = (a: ArchivoBibliotecaDto[], c: "zona" | "todos" | CategoriaBiblioteca) => a.filter((f) => (c === "todos" ? true : c === "zona" ? categorias.includes(f.categoria) : f.categoria === c)).length;
  const filasTabla = useMemo(() => (lista ?? []).filter((f) => (filtro === "todos" ? true : filtro === "zona" ? categorias.includes(f.categoria) : f.categoria === filtro)), [lista, filtro, categorias]);
  const alternar = useCallback(
    (id: number) =>
      setMarcados((prev) => {
        const n = new Set(multiple ? prev : []);
        if (prev.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [multiple],
  );

  const columnas = useMemo<ColumnaTabla<ArchivoBibliotecaDto>[]>(
    () => [
      {
        clave: "marca",
        etiqueta: "Elegir",
        cabecera: "☑",
        valor: (f) => (marcados.has(f.id) ? 0 : 1),
        celda: (f) => <input type="checkbox" checked={marcados.has(f.id)} onChange={() => alternar(f.id)} aria-label={`Elegir ${f.nombre}`} />,
        ancho: 40,
        ayuda: "Ordena poniendo primero los elegidos",
      },
      {
        clave: "nombre",
        etiqueta: "Archivo",
        valor: (f) => f.nombre,
        celda: (f) => (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.8rem" }} onClick={() => setViendo(f)} title="Ver el contenido del archivo" aria-label={`Ver ${f.nombre}`}>
              👁️
            </button>
            <span onClick={() => alternar(f.id)} style={{ cursor: "pointer" }}>
              {f.nombre}
            </span>
          </span>
        ),
        ancho: 320,
      },
      { clave: "tipo", etiqueta: "Tipo", valor: (f) => ETIQUETAS[f.categoria] },
      { clave: "formato", etiqueta: "Formato", valor: (f) => (f.nombre.includes(".") ? (f.nombre.split(".").pop() ?? "").toUpperCase() : "—") },
      { clave: "tamano", etiqueta: "Tamaño", valor: (f) => f.tamano, celda: (f) => tamanoLegible(f.tamano) },
      { clave: "guardado", etiqueta: "Guardado", valor: (f) => f.creadoEn, celda: (f) => formatDate(f.creadoEn.slice(0, 10)) },
      { clave: "asignado", etiqueta: "Asignado a", valor: (f) => f.asignadoA ?? "Sin asignar" },
    ],
    [marcados, alternar],
  );

  const elegidos = (lista ?? []).filter((f) => marcados.has(f.id));
  const usar = async () => {
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
  const nTotal = filasTabla.length;

  return (
    <>
      <Modal
        titulo={`📚 Elegir de la biblioteca${lista === null ? "" : ` · ${nTotal} ${nTotal === 1 ? "archivo" : "archivos"}${marcados.size > 0 ? ` · ${marcados.size} ${marcados.size === 1 ? "elegido" : "elegidos"}` : ""}`}`}
        ancho="1300px"
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
            Se usan igual que si los hubieras elegido en tu equipo. Por defecto salen los de esta zona (<b>{nombresCategorias}</b>); cambia el tipo para ver otros, o elige «Todos». Ordena por cualquier columna, busca y elige de golpe todos los que se ven.
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)" }}>TIPO</span>
            {([["zona", `De esta zona (${cuenta(lista ?? [], "zona")})`], ["todos", `Todos (${(lista ?? []).length})`], ...CATEGORIAS.map((c) => [c, `${ETIQUETAS[c]} (${cuenta(lista ?? [], c)})`])] as [typeof filtro, string][]).map(([id, etiqueta]) => (
              <button key={id} type="button" className={filtro === id ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setFiltro(id)}>
                {etiqueta}
              </button>
            ))}
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              {multiple && (
                <>
                  <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} disabled={nVistas === 0} onClick={() => setMarcados((prev) => new Set([...prev, ...vistas.current.map((f) => f.id)]))} title="Marca todos los archivos que se ven ahora en la tabla (con el tipo y la búsqueda aplicados), sin quitar los que ya tenías marcados">
                    ☑ Marcar los {nVistas} que se ven
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} disabled={marcados.size === 0} onClick={() => setMarcados(new Set())}>
                    Quitar marcas
                  </button>
                </>
              )}
              <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} disabled={trabajando} onClick={() => entrada.current?.click()} title="Guarda archivos nuevos en la biblioteca para tenerlos siempre a mano">
                ➕ Añadir a la biblioteca
              </button>
              <input ref={entrada} type="file" multiple style={{ display: "none" }} onChange={(e) => anadir(e.target.files)} />
            </span>
          </div>
          {lista === null ? (
            <div style={{ color: "var(--text-muted)" }}>Cargando…</div>
          ) : (
            <TablaDatos<ArchivoBibliotecaDto>
              id="elegir-biblioteca"
              columnas={columnas}
              filas={filasTabla}
              clave={(f) => f.id}
              placeholder="Buscar por nombre, tipo, formato, asignación…"
              vacio={lista.length === 0 ? "Todavía no hay archivos en la biblioteca. Usa «Añadir a la biblioteca»." : "No hay archivos de este tipo. Prueba con «Todos» u otro tipo."}
              alto="min(52vh, 560px)"
              bloque={200}
              alVerFilas={alVerFilas}
              compacta
            />
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
      {viendo && <VistaPreviaBiblioteca archivo={viendo} alCerrar={() => setViendo(null)} />}
    </>
  );
}
