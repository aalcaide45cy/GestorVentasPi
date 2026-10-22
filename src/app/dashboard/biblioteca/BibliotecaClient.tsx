"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { EnlaceCliente } from "@/components/Enlaces";
import { useToast } from "@/components/Toast";
import TablaDatos, { PANTALLA_COMPLETA, type ColumnaTabla } from "@/components/TablaDatos";
import ModalSubidaBiblioteca from "@/components/biblioteca/ModalSubidaBiblioteca";
import VistaPreviaBiblioteca from "@/components/biblioteca/VistaPreviaBiblioteca";
import { useCarga } from "@/components/comisiones/useCarga";
import { CATEGORIAS, necesitaRenombrar, type CategoriaBiblioteca } from "@/lib/biblioteca-categorias";
import { ETIQUETAS, tamanoLegible, type RespuestaListado } from "@/lib/biblioteca-cliente";
import { alTerminarTarea, lanzarTarea, llamarComoTarea } from "@/lib/tareas-cliente";
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
export default function BibliotecaClient({ incrustada = false }: { incrustada?: boolean }) {
  const { mostrar, confirmar } = useToast();
  const { datos, recargar } = useCarga<RespuestaListado | null>("/api/biblioteca", null);
  const [asignacion, setAsignacion] = useState<FiltroAsignacion>("todas");
  const [filtro, setFiltro] = useState<"todas" | CategoriaBiblioteca>("todas");
  const [pendientes, setPendientes] = useState<File[] | null>(null);
  const [viendo, setViendo] = useState<ArchivoBibliotecaDto | null>(null);
  /** Qué acción de peso está en marcha (para dejar los botones parados y que se vea que algo ocurre). */
  const [haciendo, setHaciendo] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [editando, setEditando] = useState<{ id: number; nombre: string } | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [visibles, setVisibles] = useState<ArchivoBibliotecaDto[]>([]);
  const [asignando, setAsignando] = useState<number[] | null>(null);
  const [renombrandoTodo, setRenombrandoTodo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const todos = useMemo(() => datos?.archivos ?? [], [datos]);
  // Solo cuentan las marcas de archivos que siguen existiendo
  const elegidos = useMemo(() => todos.filter((f) => marcados.has(f.id)), [todos, marcados]);
  /** Los que aún tienen un nombre raro (de escáner o de móvil) y se pueden leer para ponerles el ordenado. */
  const sinNombreOrdenado = useMemo(() => todos.filter((f) => necesitaRenombrar(f.nombre, f.categoria, f.mime)), [todos]);
  const cuentaTipo = (c: CategoriaBiblioteca) => todos.filter((f) => f.categoria === c && cumple(f, asignacion)).length;
  const cuentaAsignacion = (a: FiltroAsignacion) => todos.filter((f) => cumple(f, a) && (filtro === "todas" || f.categoria === filtro)).length;
  const filas = useMemo(() => todos.filter((f) => cumple(f, asignacion) && (filtro === "todas" || f.categoria === filtro)), [todos, asignacion, filtro]);

  /** Archivos elegidos o soltados que esperan en la ventana «Guardar en la biblioteca» (donde se confirma el tipo de cada uno). */
  const preparar = (files: FileList | File[] | null) => {
    const lista = files ? Array.from(files) : [];
    if (entrada.current) entrada.current.value = "";
    if (lista.length > 0) setPendientes(lista);
  };

  const cambiar = async (ids: number[], cambios: { nombre?: string; categoria?: CategoriaBiblioteca; idCliente?: number | null; idExpediente?: number | null }, ok?: string) => {
    setHaciendo(ids.length === 1 ? "Guardando el cambio…" : `Aplicando el cambio a ${ids.length} archivos…`);
    try {
      await llamar("/api/biblioteca", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, ...cambios }) });
      setEditando(null);
      setAsignando(null);
      mostrar(ok ?? (ids.length === 1 ? "Cambio guardado." : `Cambio aplicado a ${ids.length} archivos.`));
      recargar();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido cambiar el archivo.", "error");
    } finally {
      setHaciendo(null);
    }
  };

  const borrar = async (lista: ArchivoBibliotecaDto[]) => {
    if (lista.length === 0) return;
    const texto = lista.length === 1 ? `¿Mando «${lista[0].nombre}» a la Papelera?` : `¿Mando ${lista.length} archivos a la Papelera?`;
    if (!(await confirmar({ texto: `${texto} No se pierden: se pueden restaurar desde Herramientas › Papelera, y solo ahí se borran de verdad. Los pedidos o pagos que ya hayas creado con ellos no cambian.`, peligro: true }))) return;
    setHaciendo(`Mandando ${lista.length === 1 ? "el archivo" : `${lista.length} archivos`} a la Papelera…`);
    mostrar(`🗑️ Mandando ${lista.length === 1 ? "el archivo" : `${lista.length} archivos`} a la Papelera… Se hace en segundo plano: puedes seguir usando la aplicación y verás el avance arriba.`, "aviso", 5000);
    try {
      // En segundo plano y por lotes: una sola orden enorme con muchos archivos grandes bloquearía la base de datos
      const r = await llamarComoTarea<{ borrados: number }>("/api/biblioteca/borrar", { ids: lista.map((f) => f.id) }, (t) => setHaciendo(t.total > 0 ? `Mandando a la Papelera… ${t.hecho} de ${t.total}` : "Mandando a la Papelera…"));
      mostrar(r.borrados === 1 ? "Archivo en la Papelera (recuperable desde Herramientas › Papelera)." : `${r.borrados} archivos en la Papelera (recuperables desde Herramientas › Papelera).`);
      setMarcados(new Set());
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido borrar.", "error");
    } finally {
      setHaciendo(null);
      recargar();
    }
  };

  // Al terminar el renombrado en segundo plano, la lista se pone al día sola
  useEffect(() =>
    alTerminarTarea((t) => {
      if (t.tipo !== "biblioteca") return;
      recargar();
      // Si era un renombrado, se dice cuántos se han puesto bien y por qué no los demás
      const r = t.resultado as { renombrados?: number; sinDatos?: number; conRespaldo?: number; cambios?: { antes: string; despues: string }[]; omitidos?: number; errores?: number; fallos?: { nombre: string; motivo: string }[] } | undefined;
      if (!r || typeof r.renombrados !== "number") return;
      const malos = (r.sinDatos ?? 0) + (r.errores ?? 0);
      const primero = r.fallos?.[0];
      mostrar(
        `🏷️ Renombrados ${r.renombrados}${r.conRespaldo ? ` (${r.conRespaldo} con «Sin cliente» o con la fecha de subida porque no se leyó del documento)` : ""}${malos > 0 ? ` · no se han podido renombrar ${malos}` : ""}${r.omitidos ? ` · ${r.omitidos} omitidos (Excel)` : ""}.${primero ? ` Por ejemplo «${primero.nombre}»: ${primero.motivo}.` : ""} El nombre original se conserva (columna «Nombre original»).`,
        malos > 0 ? "aviso" : "exito",
        malos > 0 ? 15000 : 6000,
      );
    }),
  );

  /** Lee con OCR los pedidos, pagos de RCI y rejillas de la lista y les pone el nombre «Tipo - Cliente - Fecha» (tarea en segundo plano). */
  const renombrarLeyendo = async (lista: ArchivoBibliotecaDto[]) => {
    const ids = lista.filter((f) => f.categoria !== "listado" && (f.mime === "application/pdf" || f.mime.startsWith("image/"))).map((f) => f.id);
    if (ids.length === 0) {
      mostrar("Solo se pueden renombrar leyéndolos los PDF y las fotos (los Excel no se leen).", "aviso");
      return;
    }
    try {
      await lanzarTarea("/api/biblioteca/renombrar", { ids });
      mostrar(`🏷️ Leyendo ${ids.length} archivo${ids.length === 1 ? "" : "s"} para ponerles nombre, en segundo plano: verás el avance arriba y los nombres se irán actualizando aquí.`, "aviso", 6000);
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido empezar a renombrar.", "error");
    }
  };

  const descargar = async (lista: ArchivoBibliotecaDto[]) => {
    if (lista.length === 0) return;
    const guardarComo = (url: string, nombre: string) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    if (lista.length === 1) {
      guardarComo(`/api/biblioteca?id=${lista[0].id}`, lista[0].nombre);
      mostrar(`⬇️ Descargando «${lista[0].nombre}»…`, "aviso", 3000);
      return;
    }
    // El servidor prepara el .zip antes de empezar a enviarlo: se baja aquí para poder avisar mientras tanto y si falla
    setHaciendo(`Preparando el .zip de ${lista.length} archivos…`);
    mostrar(`⬇️ Preparando el .zip de ${lista.length} archivos… la descarga empezará sola al terminar.`, "aviso", 5000);
    try {
      const r = await fetch(`/api/biblioteca/zip?ids=${lista.map((f) => f.id).join(",")}`, { credentials: "same-origin" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? `Error ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      guardarComo(url, `biblioteca_${new Date().toISOString().slice(0, 10)}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      mostrar(`.zip con ${lista.length} archivos descargado.`);
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido preparar el .zip.", "error");
    } finally {
      setHaciendo(null);
    }
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
    { clave: "original", etiqueta: "Nombre original", valor: (f) => f.nombreOriginal ?? "", celda: (f) => <span style={{ wordBreak: "break-word", color: "var(--text-muted)", fontSize: "0.82rem" }}>{f.nombreOriginal ?? "—"}</span>, oculta: true, ayuda: "El nombre con el que se subió el archivo (el de escáner o móvil): se conserva al renombrarlo" },
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
            <span style={{ fontWeight: 600 }}>
              👤 <EnlaceCliente id={f.idCliente} nombre={f.asignadoA} />
            </span>
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
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} onClick={() => setViendo(f)} title="Ver el documento sin descargarlo" aria-label="Ver">
            👁️
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} onClick={() => void descargar([f])} title="Descargar el archivo a tu equipo" aria-label="Descargar">
            ⬇️
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} onClick={() => setAsignando([f.id])} title="Asignar el archivo a un cliente o a un expediente" aria-label="Asignar">
            🔗
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} disabled={!!haciendo || f.categoria === "listado"} onClick={() => void renombrarLeyendo([f])} title={f.categoria === "listado" ? "Los Excel no se pueden leer para ponerles nombre" : "Leer el documento con OCR y ponerle el nombre «Tipo - Cliente - Fecha»"} aria-label="Renombrar leyendo el documento">
            🏷️
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} onClick={() => setEditando({ id: f.id, nombre: f.nombre })} title="Renombrar el archivo" aria-label="Renombrar">
            ✏️
          </button>
          <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem", color: "var(--danger)" }} onClick={() => void borrar([f])} disabled={!!haciendo} title="Mandar el archivo a la Papelera (se puede restaurar)" aria-label="Mandar a la Papelera">
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
      {incrustada ? (
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.88rem" }}>Guarda aquí pedidos, pagos de RCI, rejillas y listados Excel una sola vez. Después, en cada zona de subida, pulsa «📚 Elegir de la biblioteca» y no tendrás que buscarlos en tu equipo. «Borrar todos los datos» no los toca. También puedes asignar cada archivo a un cliente o a un expediente.</p>
      ) : (
        <div>
          <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Biblioteca de archivos</h1>
          <p style={{ color: "var(--text-secondary)" }}>Guarda aquí pedidos, pagos de RCI, rejillas y listados Excel una sola vez. Después, en cada zona de subida, pulsa «📚 Elegir de la biblioteca» y no tendrás que buscarlos en tu equipo. También puedes asignar cada archivo a un cliente o a un expediente.</p>
        </div>
      )}

      <section
        className="glass-panel"
        style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", outline: arrastrando ? "2px dashed var(--primary)" : undefined, outlineOffset: "-6px" }}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); preparar(e.dataTransfer.files); }}
      >
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-primary" onClick={() => entrada.current?.click()} title="Elige archivos de tu equipo: antes de guardarlos podrás confirmar de qué tipo es cada uno">
            ➕ Añadir archivos
          </button>
          <input ref={entrada} type="file" multiple style={{ display: "none" }} onChange={(e) => preparar(e.target.files)} />
          <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>También puedes arrastrar los archivos aquí; antes de guardar te dejo elegir el tipo de cada uno o detectarlo. El mismo archivo no se guarda dos veces.</span>
          <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} disabled={!!haciendo || sinNombreOrdenado.length === 0} onClick={() => setRenombrandoTodo(true)} title={sinNombreOrdenado.length === 0 ? "Todos los archivos ya tienen nombre ordenado" : "Lee los archivos que aún tienen un nombre de escáner o de móvil y les pone «Pedido - Cliente - Fecha», «Pago RCI - Cliente - Fecha» o «Rejilla - Mes Año», con aviso, vista de lo que se va a tocar y avance; el nombre original se conserva"}>
            🏷️ Renombrar toda la biblioteca{sinNombreOrdenado.length > 0 ? ` (${sinNombreOrdenado.length})` : ""}
          </button>
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
        {haciendo && (
          <b role="status" style={{ color: "var(--warning)", fontSize: "0.9rem" }}>
            ⏳ {haciendo}
          </b>
        )}
        {marcados.size > 0 && (
          <>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => setMarcados(new Set())}>
              Quitar marcas
            </button>
            <b style={{ color: "var(--primary)", fontSize: "0.9rem" }}>{elegidos.length} marcado(s):</b>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => void descargar(elegidos)} disabled={!!haciendo} title={elegidos.length > 1 ? "Descarga todos los marcados juntos en un archivo .zip" : "Descarga el archivo"}>
              ⬇️ Descargar{elegidos.length > 1 ? " (.zip)" : ""}
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => setAsignando(elegidos.map((f) => f.id))}>
              🔗 Asignar…
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} onClick={() => void cambiar(elegidos.map((f) => f.id), { idCliente: null }, "Asignación quitada.")} title="Deja los archivos marcados sin asignar a ningún cliente ni expediente">
              Quitar asignación
            </button>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px" }} disabled={!!haciendo} onClick={() => void renombrarLeyendo(elegidos)} title="Lee con OCR los pedidos, pagos de RCI y rejillas marcados y les pone el nombre «Pedido - Cliente - Fecha», «Pago RCI - Cliente - Fecha» o «Rejilla - Mes Año». En segundo plano.">
              🏷️ Renombrar leyendo
            </button>
            <select className="form-input" value="" onChange={(e) => e.target.value && void cambiar(elegidos.map((f) => f.id), { categoria: e.target.value as CategoriaBiblioteca }, "Tipo cambiado.")} style={{ width: "auto", padding: "5px 10px" }} aria-label="Cambiar el tipo de los marcados">
              <option value="">Cambiar tipo…</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETAS[c]}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary" style={{ padding: "5px 12px", color: "var(--danger)" }} onClick={() => void borrar(elegidos)} disabled={!!haciendo}>
              🗑️ A la Papelera
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

      {pendientes && (
        <ModalSubidaBiblioteca
          archivos={pendientes}
          alCerrar={(guardados) => {
            setPendientes(null);
            if (guardados > 0) {
              mostrar(`${guardados} archivo${guardados === 1 ? "" : "s"} guardado${guardados === 1 ? "" : "s"} en la biblioteca.`);
            }
            recargar();
          }}
        />
      )}
      {viendo && <VistaPreviaBiblioteca archivo={viendo} alCerrar={() => setViendo(null)} />}
      {renombrandoTodo && (
        <Modal
          titulo={`🏷️ Renombrar ${sinNombreOrdenado.length.toLocaleString("es-ES")} archivos`}
          ancho="min(900px, calc(96 * var(--uvw)))"
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setRenombrandoTodo(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setRenombrandoTodo(false);
                  void lanzarTarea("/api/biblioteca/renombrar", { ids: sinNombreOrdenado.map((f) => f.id) })
                    .then(() => mostrar(`🏷️ Leyendo ${sinNombreOrdenado.length.toLocaleString("es-ES")} archivos para ponerles nombre, en segundo plano: verás el avance arriba y los nombres se irán actualizando aquí.`, "aviso", 8000))
                    .catch((e: unknown) => mostrar(e instanceof Error ? e.message : "No se ha podido empezar a renombrar.", "error"));
                }}
              >
                Empezar a renombrar
              </button>
            </>
          }
        >
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            Estos archivos aún tienen un nombre de escáner o de móvil. Se van a <b>leer con OCR</b> uno a uno, en segundo plano y por orden, para ponerles «Pedido - Cliente - Fecha», «Pago RCI - Cliente - Fecha» o «Rejilla - Mes Año». Si de uno no se consigue leer el cliente o la fecha, se le pone «Sin cliente» o la fecha en que se subió, para que siempre tenga fecha. <b>El nombre original se conserva</b> (columna «Nombre original») y los Excel no se tocan. Puedes seguir usando la aplicación y cancelar la tarea desde la barra de arriba; al terminar saldrá un resumen de lo que ha pasado.
          </p>
          <div style={{ maxHeight: "40vh", overflowY: "auto", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)" }}>
            <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
                  <th style={{ padding: "6px 10px" }}>Nombre actual</th>
                  <th style={{ padding: "6px 10px" }}>Tipo</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Tamaño</th>
                </tr>
              </thead>
              <tbody>
                {sinNombreOrdenado.slice(0, 300).map((f) => (
                  <tr key={f.id} style={{ borderTop: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "4px 10px", wordBreak: "break-word" }}>{f.nombre}</td>
                    <td style={{ padding: "4px 10px" }}>{ETIQUETAS[f.categoria]}</td>
                    <td style={{ padding: "4px 10px", textAlign: "right" }}>{tamanoLegible(f.tamano)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sinNombreOrdenado.length > 300 && <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>Se ven los 300 primeros de {sinNombreOrdenado.length.toLocaleString("es-ES")}.</p>}
        </Modal>
      )}
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
