"use client";

import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import Modal from "@/components/Modal";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import VistaPreviaBiblioteca from "@/components/biblioteca/VistaPreviaBiblioteca";
import { borrarDeBiblioteca, ETIQUETAS, subirABiblioteca, tamanoLegible } from "@/lib/biblioteca-cliente";
import { adivinarCategoria, CATEGORIAS, type CategoriaBiblioteca } from "@/lib/biblioteca-categorias";
import { formatDate } from "@/lib/date-utils";
import { lanzarTarea } from "@/lib/tareas-cliente";

interface Props {
  archivos: File[];
  /** Si solo se admite un tipo (p. ej. al añadir desde una zona de pedidos), se propone ese. */
  tipoFijo?: CategoriaBiblioteca;
  /** Se llama al cerrar; `guardados` es cuántos archivos nuevos han quedado (para recargar la lista). */
  alCerrar: (guardados: number) => void;
}

type Estado = "espera" | "subiendo" | "pausa" | "nuevo" | "repetido" | "error" | "cancelado" | "eliminado";
interface Fila {
  i: number;
  archivo: File;
  categoria: CategoriaBiblioteca;
  estado: Estado;
  mensaje?: string;
  idGuardado?: number;
}

const ICONO: Record<Estado, string> = { espera: "⏳", subiendo: "⬆️", pausa: "⏸️", nuevo: "✅", repetido: "♻️", error: "❌", cancelado: "🚫", eliminado: "🗑️" };
const TEXTO: Record<Estado, string> = {
  espera: "En espera",
  subiendo: "Guardando…",
  pausa: "En pausa (se reanuda desde el principio de este archivo)",
  nuevo: "Guardado",
  repetido: "Ya estaba en la biblioteca",
  error: "No se ha guardado",
  cancelado: "Cancelado, no se ha guardado",
  eliminado: "Guardado y eliminado al cancelar",
};

const esAbortar = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
const extensionDe = (n: string) => (n.includes(".") ? (n.split(".").pop() ?? "").toUpperCase() : "—");
const carpetaDe = (f: File) => {
  const r = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
  return r.includes("/") ? r.slice(0, r.lastIndexOf("/")) : "";
};
const plural = (k: number, uno: string, varios: string) => (k === 1 ? uno : varios);

/**
 * Ventana previa a guardar archivos en la biblioteca. Los archivos salen en una tabla (ordenable, con búsqueda y columnas a elegir) con el tipo que
 * se propone por su nombre; se puede cambiar uno a uno, a todos los que se ven con el filtro o la búsqueda de ese momento, o volver a la detección.
 * Al aceptar se guardan con una barra de progreso real; se puede pausar, reanudar y cancelar (dejando o eliminando lo ya guardado).
 */
export default function ModalSubidaBiblioteca({ archivos, tipoFijo, alCerrar }: Props) {
  const [filas, setFilas] = useState<Fila[]>(() => archivos.map((archivo, i) => ({ i, archivo, categoria: tipoFijo ?? adivinarCategoria(archivo.name, archivo.type), estado: "espera" })));
  const [fase, setFase] = useState<"elegir" | "guardando" | "fin">("elegir");
  const [enPausa, setEnPausa] = useState(false);
  const [preguntaCancelar, setPreguntaCancelar] = useState(false);
  const [errorFinal, setErrorFinal] = useState<string | null>(null);
  const [viendo, setViendo] = useState<File | null>(null);
  const [filtro, setFiltro] = useState<"todos" | CategoriaBiblioteca>("todos");
  /** Tras guardar, leer con OCR los pedidos, pagos de RCI y rejillas para ponerles el nombre «Tipo - Cliente - Fecha» (en segundo plano). */
  const [renombrar, setRenombrar] = useState(true);
  const [avisoRenombrado, setAvisoRenombrado] = useState<string | null>(null);
  const pausaRef = useRef(false);
  const cancelarRef = useRef(false);
  const control = useRef<AbortController | null>(null);
  const guardados = useRef(0);
  /** Lo mismo que `guardados`, para que la ventana se repinte. */
  const [nGuardados, setNGuardados] = useState(0);
  /** Ids de lo que esta tanda ha guardado como nuevo (para poder quitarlo al cancelar). */
  const idsNuevos = useRef<number[]>([]);
  /** De esos, los que se pueden leer para ponerles nombre (PDF y fotos: pedidos, pagos de RCI y rejillas). */
  const idsLegibles = useRef<number[]>([]);
  /** Bytes enviados por archivo, en una referencia y con repintado espaciado: con cientos de archivos cada aviso de progreso repintaría toda la tabla. */
  const enviado = useRef<number[]>(archivos.map(() => 0));
  const [, repintar] = useReducer((n: number) => n + 1, 0);
  const ultimoRepintado = useRef(0);
  const avanzar = (i: number, bytes: number) => {
    enviado.current[i] = bytes;
    const ahora = Date.now();
    if (ahora - ultimoRepintado.current > 200) {
      ultimoRepintado.current = ahora;
      repintar();
    }
  };
  /** Filas que se ven en la tabla con la búsqueda y el orden de ahora (para «Poner a los que se ven»). */
  const vistas = useRef<Fila[]>([]);
  const alVerFilas = useCallback((f: Fila[]) => {
    vistas.current = f;
  }, []);

  const totalBytes = useMemo(() => archivos.reduce((s, f) => s + Math.max(1, f.size), 0), [archivos]);
  const hechos = enviado.current.reduce((s, b) => s + b, 0);
  const porcentaje = fase === "fin" ? 100 : Math.min(100, Math.round((hechos / totalBytes) * 100));
  const hechosN = filas.filter((f) => !["espera", "subiendo", "pausa"].includes(f.estado)).length;

  const poner = (i: number, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.i === i ? { ...f, ...cambio } : f)));
  const ponerTipo = useCallback((indices: number[], v: string) => {
    const conjunto = new Set(indices);
    if (v === "auto") setFilas((fs) => fs.map((f) => (conjunto.has(f.i) ? { ...f, categoria: adivinarCategoria(f.archivo.name, f.archivo.type) } : f)));
    else if ((CATEGORIAS as readonly string[]).includes(v)) setFilas((fs) => fs.map((f) => (conjunto.has(f.i) ? { ...f, categoria: v as CategoriaBiblioteca } : f)));
  }, []);
  const esperarSinPausa = async () => {
    while (pausaRef.current && !cancelarRef.current) await new Promise((r) => setTimeout(r, 150));
  };

  const pausar = () => {
    pausaRef.current = true;
    setEnPausa(true);
    control.current?.abort();
  };
  const reanudar = () => {
    pausaRef.current = false;
    setEnPausa(false);
  };

  const guardar = async () => {
    setFase("guardando");
    for (let i = 0; i < filas.length && !cancelarRef.current; i++) {
      for (;;) {
        await esperarSinPausa();
        if (cancelarRef.current) break;
        poner(i, { estado: "subiendo", mensaje: undefined });
        enviado.current[i] = 0;
        const c = new AbortController();
        control.current = c;
        try {
          const r = await subirABiblioteca(filas[i].archivo, filas[i].categoria, (e) => avanzar(i, e), c.signal);
          if (r.repetido) poner(i, { estado: "repetido", categoria: r.archivo.categoria, mensaje: `Ya estaba guardado como «${r.archivo.nombre}» (${ETIQUETAS[r.archivo.categoria]})` });
          else {
            guardados.current++;
            setNGuardados(guardados.current);
            idsNuevos.current.push(r.archivo.id);
            if (r.archivo.categoria !== "listado" && (r.archivo.mime === "application/pdf" || r.archivo.mime.startsWith("image/"))) idsLegibles.current.push(r.archivo.id);
            poner(i, { estado: "nuevo", idGuardado: r.archivo.id });
          }
          avanzar(i, Math.max(1, filas[i].archivo.size));
          break;
        } catch (e) {
          if (esAbortar(e)) {
            if (cancelarRef.current) break;
            poner(i, { estado: "pausa" }); // pausa: se vuelve a intentar este archivo al reanudar
            continue;
          }
          poner(i, { estado: "error", mensaje: e instanceof Error ? e.message : "Error desconocido" });
          break;
        }
      }
    }
    repintar();
    // Los guardados que se pueden leer (pedidos, pagos y rejillas) se renombran en segundo plano leyéndolos con OCR
    if (renombrar && !cancelarRef.current) {
      const idsUsados = [...idsLegibles.current];
      if (idsUsados.length > 0) {
        try {
          await lanzarTarea("/api/biblioteca/renombrar", { ids: idsUsados });
          setAvisoRenombrado(`Se están renombrando ${idsUsados.length} archivo${idsUsados.length === 1 ? "" : "s"} leyéndolos en segundo plano (verás el avance arriba y los nombres se irán actualizando en la biblioteca).`);
        } catch (e) {
          setAvisoRenombrado(`Guardados, pero no se ha podido empezar a renombrarlos: ${e instanceof Error ? e.message : "error"}`);
        }
      }
    }
    setFase("fin");
  };

  const cancelar = async (quitarLoGuardado: boolean) => {
    setPreguntaCancelar(false);
    cancelarRef.current = true;
    pausaRef.current = false;
    setEnPausa(false);
    control.current?.abort();
    // Deja pasar la cancelación del archivo en curso antes de decidir qué hacer con lo guardado
    await new Promise((r) => setTimeout(r, 300));
    const ids = [...idsNuevos.current];
    let aviso: string | undefined;
    if (quitarLoGuardado && ids.length > 0) {
      try {
        await borrarDeBiblioteca(ids);
        guardados.current = 0;
        setNGuardados(0);
        idsNuevos.current = [];
        setFilas((fs) => fs.map((f) => (f.idGuardado && ids.includes(f.idGuardado) ? { ...f, estado: "eliminado" } : f)));
      } catch (e) {
        aviso = e instanceof Error ? e.message : "No se han podido quitar los archivos guardados.";
      }
    }
    setFilas((fs) => fs.map((f) => (f.estado === "espera" || f.estado === "subiendo" || f.estado === "pausa" ? { ...f, estado: "cancelado" } : f)));
    setFase("fin");
    setErrorFinal(aviso ?? null);
  };

  const nuevos = filas.filter((f) => f.estado === "nuevo").length;
  const repetidos = filas.filter((f) => f.estado === "repetido").length;
  const errores = filas.filter((f) => f.estado === "error").length;
  const cancelados = filas.filter((f) => f.estado === "cancelado").length;
  const eliminados = filas.filter((f) => f.estado === "eliminado").length;
  const cuentaTipo = (c: CategoriaBiblioteca) => filas.filter((f) => f.categoria === c).length;
  const filasTabla = useMemo(() => (filtro === "todos" ? filas : filas.filter((f) => f.categoria === filtro)), [filas, filtro]);

  const columnas = useMemo<ColumnaTabla<Fila>[]>(
    () => [
      {
        clave: "nombre",
        etiqueta: "Archivo",
        valor: (f) => f.archivo.name,
        celda: (f) => (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.8rem" }} onClick={() => setViendo(f.archivo)} title="Ver el contenido del archivo antes de guardarlo" aria-label={`Ver ${f.archivo.name}`}>
              👁️
            </button>
            <span>{f.archivo.name}</span>
          </span>
        ),
        ancho: 320,
      },
      {
        clave: "tipo",
        etiqueta: "Tipo",
        valor: (f) => ETIQUETAS[f.categoria],
        celda: (f) =>
          fase === "elegir" ? (
            <select className="form-input" value={f.categoria} onChange={(e) => ponerTipo([f.i], e.target.value)} style={{ padding: "3px 8px", width: "auto" }} aria-label={`Tipo de ${f.archivo.name}`}>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETAS[c]}
                </option>
              ))}
            </select>
          ) : (
            ETIQUETAS[f.categoria]
          ),
      },
      { clave: "formato", etiqueta: "Formato", valor: (f) => extensionDe(f.archivo.name) },
      { clave: "tamano", etiqueta: "Tamaño", valor: (f) => f.archivo.size, celda: (f) => tamanoLegible(f.archivo.size) },
      {
        clave: "modificado",
        etiqueta: "Modificado",
        valor: (f) => f.archivo.lastModified,
        celda: (f) => (f.archivo.lastModified ? formatDate(new Date(f.archivo.lastModified).toISOString().slice(0, 10)) : "—"),
      },
      { clave: "carpeta", etiqueta: "Carpeta", valor: (f) => carpetaDe(f.archivo) || "—", oculta: true },
      ...(fase === "elegir"
        ? []
        : [
            {
              clave: "estado",
              etiqueta: "Estado",
              valor: (f: Fila) => TEXTO[f.estado],
              celda: (f: Fila) => (
                <span title={f.mensaje} style={{ color: f.estado === "error" ? "var(--danger)" : undefined }}>
                  {ICONO[f.estado]} {f.estado === "error" && f.mensaje ? f.mensaje : TEXTO[f.estado]}
                </span>
              ),
            },
          ]),
    ],
    [fase, ponerTipo],
  );

  const n = filas.length;

  return (
    <>
      <Modal
        titulo={`📚 Guardar en la biblioteca · ${n} ${plural(n, "archivo", "archivos")}`}
        ancho="1400px"
        pie={
          fase === "elegir" ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => alCerrar(0)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={n === 0}>
                Aceptar y guardar {n} {plural(n, "archivo", "archivos")}
              </button>
            </>
          ) : fase === "guardando" ? (
            preguntaCancelar ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => { setPreguntaCancelar(false); reanudar(); }}>
                  Seguir subiendo
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => void cancelar(false)} title="Para ahora; lo que ya se ha guardado se queda en la biblioteca">
                  Cancelar y dejar lo guardado ({nGuardados})
                </button>
                <button type="button" className="btn btn-primary" style={{ background: "var(--danger)" }} onClick={() => void cancelar(true)} disabled={nGuardados === 0} title="Para ahora y quita de la biblioteca lo que esta subida ya había guardado (no toca lo que ya estaba antes)">
                  Cancelar y eliminar lo guardado
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-secondary" onClick={enPausa ? reanudar : pausar} title={enPausa ? "Sigue guardando donde se quedó" : "Detiene la subida; el archivo en curso se vuelve a enviar desde el principio al reanudar"}>
                  {enPausa ? "▶️ Reanudar" : "⏸️ Pausar"}
                </button>
                <button type="button" className="btn btn-secondary" style={{ color: "var(--danger)" }} onClick={() => { pausar(); setPreguntaCancelar(true); }}>
                  ✖ Cancelar…
                </button>
              </>
            )
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => alCerrar(guardados.current)}>
              Cerrar
            </button>
          )
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
          {fase === "elegir" && (
            <>
              <div style={{ color: "var(--text-secondary)" }}>
                El tipo se propone por el nombre y el formato (Excel = listado, «rci» o «pago» = pago de RCI, «rejilla» o «comisión» = rejilla; un PDF o foto sin más pistas = pedido) y decide en qué zonas de subida aparece luego; se puede cambiar después. Ordena por cualquier columna, busca, y cambia el tipo de golpe a los archivos que ves.
              </div>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" }} title="Después de guardar, la aplicación lee cada pedido, pago de RCI y rejilla con OCR y les pone el nombre «Pedido - Cliente - Fecha», «Pago RCI - Cliente - Fecha» o «Rejilla - Mes Año». Va en segundo plano y no cambia nada si no consigue leer un documento.">
                <input type="checkbox" checked={renombrar} onChange={(e) => setRenombrar(e.target.checked)} style={{ accentColor: "var(--primary)" }} />
                🏷️ Renombrar los pedidos, pagos de RCI y rejillas leyéndolos (OCR): «Tipo - Cliente - Fecha»
              </label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)" }}>VER</span>
                <button type="button" className={filtro === "todos" ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setFiltro("todos")}>
                  Todos ({n})
                </button>
                {CATEGORIAS.filter((c) => cuentaTipo(c) > 0 || filtro === c).map((c) => (
                  <button key={c} type="button" className={filtro === c ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setFiltro(c)}>
                    {ETIQUETAS[c]} ({cuentaTipo(c)})
                  </button>
                ))}
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: "8px", alignItems: "center" }}>
                  <b>Poner a los que se ven:</b>
                  <select
                    className="form-input"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) ponerTipo(vistas.current.map((f) => f.i), e.target.value);
                    }}
                    style={{ width: "auto", padding: "5px 10px" }}
                    aria-label="Poner el mismo tipo a los archivos que se ven en la tabla"
                  >
                    <option value="">Elegir tipo…</option>
                    <option value="auto">🔎 Detectar por el nombre</option>
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>
                        {ETIQUETAS[c]}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
            </>
          )}

          {fase !== "elegir" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontWeight: 600 }}>
                <span>{fase === "fin" ? "Terminado" : enPausa ? "⏸️ En pausa" : `Guardando archivo ${Math.min(hechosN + 1, n)} de ${n}…`}</span>
                <span>{porcentaje} %</span>
              </div>
              <div role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} style={{ height: "10px", borderRadius: "999px", background: "rgba(255, 255, 255, 0.1)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${porcentaje}%`, background: errores > 0 && fase === "fin" ? "var(--danger)" : "var(--primary)", transition: "width 0.2s" }} />
              </div>
              {preguntaCancelar && <div style={{ marginTop: "10px", padding: "10px 12px", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)" }}>La subida está parada mientras eliges. Se han guardado {nGuardados} {plural(nGuardados, "archivo nuevo", "archivos nuevos")}: ¿los dejo en la biblioteca o los elimino? También puedes seguir subiendo.</div>}
              {fase === "fin" && avisoRenombrado && <div style={{ marginTop: "8px", color: "var(--text-secondary)" }}>🏷️ {avisoRenombrado}</div>}
              {fase === "fin" && (
                <div style={{ marginTop: "8px", color: errores > 0 || errorFinal ? "var(--danger)" : "var(--text-secondary)" }}>
                  {nuevos} {plural(nuevos, "guardado", "guardados")}
                  {repetidos > 0 ? `, ${repetidos} que ya ${plural(repetidos, "estaba", "estaban")} en la biblioteca` : ""}
                  {eliminados > 0 ? `, ${eliminados} ${plural(eliminados, "eliminado", "eliminados")} al cancelar` : ""}
                  {cancelados > 0 ? `, ${cancelados} ${plural(cancelados, "cancelado", "cancelados")}` : ""}
                  {errores > 0 ? `, ${errores} con error` : ""}.{errorFinal ? ` ${errorFinal}` : ""}
                </div>
              )}
            </div>
          )}

          <TablaDatos<Fila> id="subida-biblioteca" columnas={columnas} filas={filasTabla} clave={(f) => f.i} placeholder="Buscar por nombre, tipo, formato…" alto="min(52vh, 560px)" bloque={150} alVerFilas={alVerFilas} compacta />
        </div>
      </Modal>
      {viendo && <VistaPreviaBiblioteca archivo={{ id: 0, nombre: viendo.name, mime: viendo.type || "application/octet-stream", tamano: viendo.size }} local={viendo} alCerrar={() => setViendo(null)} />}
    </>
  );
}
