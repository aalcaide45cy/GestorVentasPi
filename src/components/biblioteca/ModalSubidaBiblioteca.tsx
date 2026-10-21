"use client";

import { useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { adivinarCategoria, CATEGORIAS, type CategoriaBiblioteca } from "@/lib/biblioteca-categorias";
import { borrarDeBiblioteca, ETIQUETAS, subirABiblioteca, tamanoLegible } from "@/lib/biblioteca-cliente";

interface Props {
  archivos: File[];
  /** Si solo se admite un tipo (p. ej. al añadir desde una zona de pedidos), se propone ese. */
  tipoFijo?: CategoriaBiblioteca;
  /** Se llama al cerrar; `guardados` es cuántos archivos nuevos han quedado (para recargar la lista). */
  alCerrar: (guardados: number) => void;
}

type Estado = "espera" | "subiendo" | "pausa" | "nuevo" | "repetido" | "error" | "cancelado" | "eliminado";
interface Fila {
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

/**
 * Ventana previa a guardar archivos en la biblioteca: enseña cada archivo con el tipo que se propone por su nombre (cambiable uno a uno, todos a
 * la vez, o volver a la detección automática), y al aceptar los guarda con una barra de progreso real. Se puede pausar, reanudar y cancelar; al
 * cancelar se elige entre dejar lo ya guardado, eliminarlo o seguir.
 */
export default function ModalSubidaBiblioteca({ archivos, tipoFijo, alCerrar }: Props) {
  const [filas, setFilas] = useState<Fila[]>(() => archivos.map((archivo) => ({ archivo, categoria: tipoFijo ?? adivinarCategoria(archivo.name, archivo.type), estado: "espera" })));
  const [fase, setFase] = useState<"elegir" | "guardando" | "fin">("elegir");
  const [enviado, setEnviado] = useState<number[]>(() => archivos.map(() => 0));
  const [enPausa, setEnPausa] = useState(false);
  const [preguntaCancelar, setPreguntaCancelar] = useState(false);
  const [errorFinal, setErrorFinal] = useState<string | null>(null);
  const pausaRef = useRef(false);
  const cancelarRef = useRef(false);
  const control = useRef<AbortController | null>(null);
  const guardados = useRef(0);
  /** Lo mismo que `guardados`, para que la ventana se repinte. */
  const [nGuardados, setNGuardados] = useState(0);
  /** Ids de lo que esta tanda ha guardado como nuevo (para poder quitarlo al cancelar). */
  const idsNuevos = useRef<number[]>([]);

  const totalBytes = useMemo(() => archivos.reduce((s, f) => s + Math.max(1, f.size), 0), [archivos]);
  const hechos = enviado.reduce((s, b) => s + b, 0);
  const porcentaje = fase === "fin" ? 100 : Math.min(100, Math.round((hechos / totalBytes) * 100));
  const hechosN = filas.filter((f) => !["espera", "subiendo", "pausa"].includes(f.estado)).length;

  const cambiarTodos = (v: string) => {
    if (v === "auto") setFilas((fs) => fs.map((f) => ({ ...f, categoria: adivinarCategoria(f.archivo.name, f.archivo.type) })));
    else if ((CATEGORIAS as readonly string[]).includes(v)) setFilas((fs) => fs.map((f) => ({ ...f, categoria: v as CategoriaBiblioteca })));
  };
  const poner = (i: number, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
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
        setEnviado((p) => p.map((v, j) => (j === i ? 0 : v)));
        const c = new AbortController();
        control.current = c;
        try {
          const r = await subirABiblioteca(filas[i].archivo, filas[i].categoria, (e) => setEnviado((p) => p.map((v, j) => (j === i ? e : v))), c.signal);
          if (r.repetido) poner(i, { estado: "repetido", categoria: r.archivo.categoria, mensaje: `Ya estaba guardado como «${r.archivo.nombre}» (${ETIQUETAS[r.archivo.categoria]})` });
          else {
            guardados.current++;
            setNGuardados(guardados.current);
            idsNuevos.current.push(r.archivo.id);
            poner(i, { estado: "nuevo", idGuardado: r.archivo.id });
          }
          setEnviado((p) => p.map((v, j) => (j === i ? Math.max(1, filas[i].archivo.size) : v)));
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

  return (
    <Modal
      titulo="📚 Guardar en la biblioteca"
      ancho="760px"
      pie={
        fase === "elegir" ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => alCerrar(0)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={filas.length === 0}>
              Aceptar y guardar {filas.length} archivo{filas.length === 1 ? "" : "s"}
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
              Elige de qué tipo es cada archivo, o deja que se detecte por su nombre y su formato (los Excel son listados, «rci» o «pago» en el nombre es un pago de RCI, «rejilla» o «comisión» una rejilla; un PDF o una foto sin más pistas se toma por pedido). El tipo decide en qué zonas de subida aparece luego y se puede cambiar después.
            </div>
            <label style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <b>Poner a todos:</b>
              <select className="form-input" value="" onChange={(e) => cambiarTodos(e.target.value)} style={{ width: "auto", padding: "5px 10px" }} aria-label="Poner el mismo tipo a todos los archivos">
                <option value="">Elegir…</option>
                <option value="auto">🔎 Detectar por el nombre</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETAS[c]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {fase !== "elegir" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontWeight: 600 }}>
              <span>{fase === "fin" ? "Terminado" : enPausa ? "⏸️ En pausa" : `Guardando archivo ${Math.min(hechosN + 1, filas.length)} de ${filas.length}…`}</span>
              <span>{porcentaje} %</span>
            </div>
            <div role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} style={{ height: "10px", borderRadius: "999px", background: "rgba(255, 255, 255, 0.1)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${porcentaje}%`, background: errores > 0 && fase === "fin" ? "var(--danger)" : "var(--primary)", transition: "width 0.2s" }} />
            </div>
            {preguntaCancelar && <div style={{ marginTop: "10px", padding: "10px 12px", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)" }}>La subida está parada mientras eliges. Se han guardado {nGuardados} archivo{nGuardados === 1 ? "" : "s"} nuevo{nGuardados === 1 ? "" : "s"}: ¿los dejo en la biblioteca o los elimino? También puedes seguir subiendo.</div>}
            {fase === "fin" && (
              <div style={{ marginTop: "8px", color: errores > 0 || errorFinal ? "var(--danger)" : "var(--text-secondary)" }}>
                {nuevos} guardado{nuevos === 1 ? "" : "s"}
                {repetidos > 0 ? `, ${repetidos} que ya estaba${repetidos === 1 ? "" : "n"} en la biblioteca` : ""}
                {eliminados > 0 ? `, ${eliminados} eliminado${eliminados === 1 ? "" : "s"} al cancelar` : ""}
                {cancelados > 0 ? `, ${cancelados} cancelado${cancelados === 1 ? "" : "s"}` : ""}
                {errores > 0 ? `, ${errores} con error` : ""}.{errorFinal ? ` ${errorFinal}` : ""}
              </div>
            )}
          </div>
        )}

        <div className="table-container" style={{ maxHeight: "40vh", overflow: "auto" }}>
          <table className="table-premium">
            <thead>
              <tr>
                <th>Archivo</th>
                <th style={{ textAlign: "right" }}>Tamaño</th>
                <th>Tipo</th>
                {fase !== "elegir" && <th>Estado</th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={`${f.archivo.name}-${i}`}>
                  <td style={{ wordBreak: "break-word" }}>{f.archivo.name}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{tamanoLegible(f.archivo.size)}</td>
                  <td>
                    {fase === "elegir" ? (
                      <select className="form-input" value={f.categoria} onChange={(e) => poner(i, { categoria: e.target.value as CategoriaBiblioteca })} style={{ padding: "3px 8px", width: "auto" }} aria-label={`Tipo de ${f.archivo.name}`}>
                        {CATEGORIAS.map((c) => (
                          <option key={c} value={c}>
                            {ETIQUETAS[c]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ETIQUETAS[f.categoria]
                    )}
                  </td>
                  {fase !== "elegir" && (
                    <td title={f.mensaje} style={{ color: f.estado === "error" ? "var(--danger)" : undefined }}>
                      {ICONO[f.estado]} {f.estado === "error" && f.mensaje ? f.mensaje : TEXTO[f.estado]}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
