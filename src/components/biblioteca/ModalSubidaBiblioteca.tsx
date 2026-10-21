"use client";

import { useMemo, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { adivinarCategoria, CATEGORIAS, type CategoriaBiblioteca } from "@/lib/biblioteca-categorias";
import { ETIQUETAS, subirABiblioteca, tamanoLegible } from "@/lib/biblioteca-cliente";

interface Props {
  archivos: File[];
  /** Si solo se admite un tipo (p. ej. al añadir desde una zona de pedidos), se propone ese. */
  tipoFijo?: CategoriaBiblioteca;
  /** Se llama al cerrar; `guardados` es cuántos archivos nuevos han entrado (para recargar la lista). */
  alCerrar: (guardados: number) => void;
}

type Estado = "espera" | "subiendo" | "nuevo" | "repetido" | "error";
interface Fila {
  archivo: File;
  categoria: CategoriaBiblioteca;
  estado: Estado;
  mensaje?: string;
}

const ICONO: Record<Estado, string> = { espera: "⏳", subiendo: "⬆️", nuevo: "✅", repetido: "♻️", error: "❌" };
const TEXTO: Record<Estado, string> = { espera: "En espera", subiendo: "Guardando…", nuevo: "Guardado", repetido: "Ya estaba en la biblioteca", error: "No se ha guardado" };

/**
 * Ventana previa a guardar archivos en la biblioteca: enseña cada archivo con el tipo que se propone por su nombre (cambiable uno a uno o
 * todos a la vez, o volver a la detección automática), y al aceptar los guarda con una barra de progreso real de lo subido.
 */
export default function ModalSubidaBiblioteca({ archivos, tipoFijo, alCerrar }: Props) {
  const [filas, setFilas] = useState<Fila[]>(() => archivos.map((archivo) => ({ archivo, categoria: tipoFijo ?? adivinarCategoria(archivo.name, archivo.type), estado: "espera" })));
  const [fase, setFase] = useState<"elegir" | "guardando" | "fin">("elegir");
  // Bytes enviados por archivo, para la barra global
  const [enviado, setEnviado] = useState<number[]>(() => archivos.map(() => 0));
  const guardados = useRef(0);

  const totalBytes = useMemo(() => archivos.reduce((s, f) => s + Math.max(1, f.size), 0), [archivos]);
  const hechos = enviado.reduce((s, b) => s + b, 0);
  const porcentaje = fase === "fin" ? 100 : Math.min(100, Math.round((hechos / totalBytes) * 100));
  const hechosN = filas.filter((f) => f.estado !== "espera" && f.estado !== "subiendo").length;

  const cambiarTodos = (v: string) => {
    if (v === "auto") setFilas((fs) => fs.map((f) => ({ ...f, categoria: adivinarCategoria(f.archivo.name, f.archivo.type) })));
    else if ((CATEGORIAS as readonly string[]).includes(v)) setFilas((fs) => fs.map((f) => ({ ...f, categoria: v as CategoriaBiblioteca })));
  };
  const poner = (i: number, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  const guardar = async () => {
    setFase("guardando");
    for (let i = 0; i < filas.length; i++) {
      poner(i, { estado: "subiendo" });
      try {
        const r = await subirABiblioteca(filas[i].archivo, filas[i].categoria, (e) => setEnviado((p) => p.map((v, j) => (j === i ? e : v))));
        if (!r.repetido) guardados.current++;
        poner(i, r.repetido ? { estado: "repetido", categoria: r.archivo.categoria, mensaje: `Ya estaba guardado como «${r.archivo.nombre}» (${ETIQUETAS[r.archivo.categoria]})` } : { estado: "nuevo" });
      } catch (e) {
        poner(i, { estado: "error", mensaje: e instanceof Error ? e.message : "Error desconocido" });
      }
      setEnviado((p) => p.map((v, j) => (j === i ? Math.max(1, filas[i].archivo.size) : v)));
    }
    setFase("fin");
  };

  const nuevos = filas.filter((f) => f.estado === "nuevo").length;
  const repetidos = filas.filter((f) => f.estado === "repetido").length;
  const errores = filas.filter((f) => f.estado === "error").length;

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
          <button type="button" className="btn btn-secondary" disabled>
            Guardando… {hechosN} de {filas.length}
          </button>
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
              <span>{fase === "fin" ? "Terminado" : `Guardando archivo ${Math.min(hechosN + 1, filas.length)} de ${filas.length}…`}</span>
              <span>{porcentaje} %</span>
            </div>
            <div role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} style={{ height: "10px", borderRadius: "999px", background: "rgba(255, 255, 255, 0.1)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${porcentaje}%`, background: errores > 0 && fase === "fin" ? "var(--danger)" : "var(--primary)", transition: "width 0.2s" }} />
            </div>
            {fase === "fin" && (
              <div style={{ marginTop: "8px", color: errores > 0 ? "var(--danger)" : "var(--text-secondary)" }}>
                {nuevos} guardado{nuevos === 1 ? "" : "s"}
                {repetidos > 0 ? `, ${repetidos} que ya estaba${repetidos === 1 ? "" : "n"} en la biblioteca` : ""}
                {errores > 0 ? `, ${errores} con error` : ""}.
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
