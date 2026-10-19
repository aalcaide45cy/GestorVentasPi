"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Modal, { ModalConfirmar } from "@/components/Modal";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { ContenidoSeccion, InfoSeccion, Informe, Modo, ParteContenido, Seccion } from "@/lib/servicios/intercambio";
import type { CopiaInternaDto } from "@/lib/servicios/copias-seccion";
import { TEXTO_SEGUNDO_CLIC, useDobleConfirmacion } from "@/components/useDobleConfirmacion";

/**
 * Piezas reutilizables para exportar, importar y guardar copias internas de una sección de datos.
 * Las usan el panel «Datos por secciones» (Configuración) y los botones de cada página (Clientes, Planes…).
 */

export interface SeccionDatos extends InfoSeccion {
  seccion: Seccion;
  registros: number;
  /** Texto con el desglose, si lo hay («120 clientes y 80 expedientes»). */
  detalle?: string;
}
export interface PlanElegible {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
}
export interface DatosPanel {
  secciones: SeccionDatos[];
  planes: PlanElegible[];
}

export const ICONOS: Record<Seccion, string> = { clientes: "👥", expedientes: "📁", clientes_expedientes: "🔗", marcas_modelos: "🚗", tipos_venta: "💳", estados: "🏷️", tiendas: "🏬", planes: "🎯", plantillas_tarifas: "📋", plantillas_plan: "🗒️", rejillas: "🧾", ajustes: "⚙️", usuarios: "🧑‍💼" };

const MODOS: Record<Modo, { titulo: string; ayuda: string }> = {
  anadir: { titulo: "Añadir solo lo nuevo", ayuda: "Crea lo que no existe y deja tal cual lo que ya existe. Es lo más seguro." },
  actualizar: { titulo: "Añadir y actualizar", ayuda: "Crea lo nuevo y modifica lo que ya existe con los datos del archivo (lo que no esté en el archivo no se toca)." },
  sustituir: { titulo: "Sustituir (que quede igual que el archivo)", ayuda: "Crea lo nuevo, actualiza lo existente y ELIMINA lo que no esté en el archivo. Es la opción más delicada." },
};

export const botonChico = { padding: "8px 14px", fontSize: "0.85rem" } as const;

export const numero = (n: number): string => n.toLocaleString("es-ES");

/** «1 cliente» / «3 clientes»; para el plural usa el texto de la sección. */
export function cuantos(n: number, s: Pick<InfoSeccion, "plural"> & { detalle?: string }): string {
  if (s.detalle) return s.detalle;
  if (n !== 1) return `${numero(n)} ${s.plural}`;
  const singulares: Record<string, string> = {
    clientes: "cliente",
    expedientes: "expediente",
    marcas: "marca",
    "marcas y modelos": "marca con sus modelos",
    "clientes y expedientes": "cliente o expediente",
    "tipos de venta": "tipo de venta",
    "estados de vehículo": "estado de vehículo",
    tiendas: "tienda",
    "planes de comisionamiento": "plan de comisionamiento",
    "plantillas de tarifas": "plantilla de tarifas",
    "plantillas de planes": "plantilla de plan",
    rejillas: "rejilla",
    ajustes: "ajuste",
    usuarios: "usuario",
  };
  return `1 ${singulares[s.plural] ?? s.plural}`;
}

export const tamanoLegible = (b: number): string => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1).replace(".", ",")} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const fechaHora = (iso: string): string => new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });

/** Descarga en el navegador el archivo de una sección (o de los planes elegidos). */
export async function descargarSeccion(s: Pick<SeccionDatos, "seccion" | "plural">, ids: number[] | null): Promise<{ nombre: string; registros: number }> {
  const res = await fetch(`/api/admin/datos/exportar?seccion=${s.seccion}${ids && ids.length > 0 ? `&ids=${ids.join(",")}` : ""}`);
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? "No se pudo exportar.");
  const registros = Number(res.headers.get("X-Registros") ?? 0);
  const nombre = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `gv_${s.seccion}.json`;
  guardarBlob(await res.blob(), nombre);
  return { nombre, registros };
}

function guardarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Ver el contenido                                                    */
/* ------------------------------------------------------------------ */

type FilaContenido = Record<string, string | number>;

/** Tabla de una parte del contenido, con orden por columnas, buscador y gestor de columnas. */
function TablaParte({ seccion, parte }: { seccion: Seccion; parte: ParteContenido }) {
  const columnas = useMemo<ColumnaTabla<FilaContenido>[]>(() => parte.columnas.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, valor: (f) => f[c.clave] ?? "" })), [parte]);
  const filas = useMemo(() => parte.filas.map((f, i) => ({ ...f, __i: i })), [parte]);
  return <TablaDatos<FilaContenido> id={`contenido-${seccion}-${parte.id}`} columnas={columnas} filas={filas} clave={(f) => f.__i} placeholder={`Buscar en ${parte.titulo.toLowerCase()}…`} vacio="No hay nada en esta sección." />;
}

/**
 * «¿Qué se exportaría?»: el contenido de la sección en una tabla (orden, buscador y columnas a tu gusto), tal cual iría al archivo.
 */
export function ModalContenido({ seccion, alCerrar }: { seccion: SeccionDatos; alCerrar: () => void }) {
  const { mostrar } = useToast();
  const [contenido, setContenido] = useState<ContenidoSeccion | null>(null);
  const [parte, setParte] = useState(0);
  useEffect(() => {
    let vivo = true;
    llamar<ContenidoSeccion>(`/api/admin/datos/contenido?seccion=${seccion.seccion}`)
      .then((r) => vivo && setContenido(r.data))
      .catch((e: unknown) => {
        mostrar(textoError(e), "error");
        alCerrar();
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion.seccion]);
  const actual = contenido?.partes[parte];
  return (
    <Modal
      titulo={`${ICONOS[seccion.seccion]} ${seccion.titulo}: qué se exportaría`}
      ancho="1200px"
      pie={
        <button type="button" className="btn btn-secondary" onClick={alCerrar}>
          Cerrar
        </button>
      }
    >
      {!contenido ? (
        <p style={{ color: "var(--text-secondary)" }}>Cargando…</p>
      ) : (
        <>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.85rem", lineHeight: 1.5 }}>
            Esto es lo que contendría el archivo si exportas ahora. Puedes ordenar por columnas, buscar y elegir qué columnas ver (solo cambia lo que ves aquí, no lo que se exporta).
          </p>
          {contenido.partes.length > 1 && (
            <div style={{ display: "flex", gap: "8px" }}>
              {contenido.partes.map((p, i) => (
                <button key={p.id} type="button" className={i === parte ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "6px 14px" }} onClick={() => setParte(i)}>
                  {p.titulo} ({numero(p.total)})
                </button>
              ))}
            </div>
          )}
          {actual && actual.total > actual.filas.length && <div style={{ fontSize: "0.82rem", color: "var(--warning)" }}>Se enseñan las primeras {numero(actual.filas.length)} de {numero(actual.total)} (el archivo lleva todas).</div>}
          {actual && <TablaParte key={`${seccion.seccion}-${actual.id}`} seccion={seccion.seccion} parte={actual} />}
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Exportar                                                            */
/* ------------------------------------------------------------------ */

export function ModalExportar({ seccion, planes, idsIniciales, alCerrar }: { seccion: SeccionDatos; planes: PlanElegible[]; idsIniciales?: number[]; alCerrar: () => void }) {
  const { mostrar } = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [elegidos, setElegidos] = useState<number[] | null>(idsIniciales && idsIniciales.length > 0 ? idsIniciales : null);
  const [filtro, setFiltro] = useState("");
  const esPlanes = seccion.seccion === "planes";
  // Clientes y expedientes van enlazados: si solo se exporta una de las dos, se ofrece llevar las dos juntas (lo recomendado)
  const esPareja = seccion.seccion === "clientes" || seccion.seccion === "expedientes";
  const [juntos, setJuntos] = useState(true);
  const exportaJuntos = esPareja && juntos;
  const destino = exportaJuntos ? { seccion: "clientes_expedientes" as Seccion, plural: "clientes y expedientes" } : seccion;
  const numExportar = esPlanes && elegidos !== null ? elegidos.length : seccion.registros;
  const visibles = planes.filter((p) => p.nombre.toLowerCase().includes(filtro.trim().toLowerCase()));

  const exportar = async () => {
    setOcupado(true);
    try {
      const r = await descargarSeccion(destino, elegidos);
      mostrar(`✅ Exportados ${cuantos(r.registros, exportaJuntos ? { plural: "registros (clientes y expedientes)" } : seccion)} al archivo ${r.nombre} (se ha descargado en tu equipo).`);
      alCerrar();
    } catch (e) {
      mostrar(`No se ha exportado nada. ${textoError(e)}`, "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo={`📤 Exportar ${exportaJuntos ? "clientes y expedientes" : seccion.plural}`}
      ancho="620px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void exportar()} disabled={ocupado || numExportar === 0}>
            {ocupado ? "Exportando…" : exportaJuntos ? "Sí, exportar clientes y expedientes" : `Sí, exportar ${numero(numExportar)}`}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
        {esPareja && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer", padding: "10px 12px", border: `1px solid ${juntos ? "var(--primary)" : "var(--border-light)"}`, borderRadius: "var(--radius-sm)" }}>
              <input type="radio" name="pareja-exportar" checked={juntos} onChange={() => setJuntos(true)} style={{ marginTop: "3px" }} />
              <span>
                <b>Clientes y expedientes juntos</b> <span style={{ color: "var(--success)", fontSize: "0.8rem" }}>(recomendado)</span>
                <br />
                <span style={{ color: "var(--text-secondary)", fontSize: "0.83rem" }}>Un solo archivo: al importarlo, los clientes vuelven con todos sus datos (dirección, correos, teléfonos) y cada expediente se enlaza solo con su cliente.</span>
              </span>
            </label>
            <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer", padding: "10px 12px", border: `1px solid ${!juntos ? "var(--warning)" : "var(--border-light)"}`, borderRadius: "var(--radius-sm)" }}>
              <input type="radio" name="pareja-exportar" checked={!juntos} onChange={() => setJuntos(false)} style={{ marginTop: "3px" }} />
              <span>
                <b>Solo {seccion.plural}</b>
                <br />
                <span style={{ color: "var(--warning)", fontSize: "0.83rem" }}>
                  ⚠️{" "}
                  {seccion.seccion === "clientes"
                    ? "Al importarlo tendrás los clientes pero sin ninguno de sus expedientes (y viceversa: si luego importas solo expedientes, no tendrán los datos completos de sus clientes)."
                    : "Cada expediente llevará únicamente el nombre y el DNI de su cliente: al importarlo se crearán clientes incompletos, sin dirección, correos ni teléfonos."}
                </span>
              </span>
            </label>
          </div>
        )}
        <div>
          Se van a exportar <b>{exportaJuntos ? "los clientes y los expedientes" : cuantos(numExportar, seccion)}</b> a un archivo <b>.json</b> que se descargará en tu equipo. No se borra ni se cambia nada en la aplicación.
        </div>
        {esPlanes && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" }} title="Exporta todos los planes de comisionamiento en un solo archivo.">
              <input type="radio" name="planes-exportar" checked={elegidos === null} onChange={() => setElegidos(null)} /> Todos los planes ({numero(planes.length)})
            </label>
            <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" }} title="Elige uno o varios planes concretos para exportarlos.">
              <input type="radio" name="planes-exportar" checked={elegidos !== null} onChange={() => setElegidos([])} /> Elegir planes concretos
            </label>
            {elegidos !== null && (
              <>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <input className="form-input" placeholder="Buscar plan…" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ flex: 1, minWidth: "160px" }} />
                  <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setElegidos(visibles.map((p) => p.id))} title="Marca todos los planes de la lista (los que se ven con el buscador).">
                    Marcar todos
                  </button>
                  <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setElegidos([])} title="Desmarca todos los planes.">
                    Ninguno
                  </button>
                </div>
                <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {visibles.map((p) => (
                    <label key={p.id} style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer", fontSize: "0.85rem" }}>
                      <input type="checkbox" checked={elegidos.includes(p.id)} onChange={(e) => setElegidos((prev) => (e.target.checked ? [...(prev ?? []), p.id] : (prev ?? []).filter((x) => x !== p.id)))} />
                      <span>
                        {p.nombre} <span style={{ color: "var(--text-muted)" }}>({p.fechaInicio} a {p.fechaFin} · {p.estado})</span>
                      </span>
                    </label>
                  ))}
                  {visibles.length === 0 && <span style={{ color: "var(--text-muted)" }}>{planes.length === 0 ? "Todavía no hay planes." : "Ningún plan coincide con la búsqueda."}</span>}
                </div>
              </>
            )}
          </div>
        )}
        {seccion.aviso && <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--warning)", background: "var(--bg-card)", fontSize: "0.85rem" }}>⚠️ {seccion.aviso}</div>}
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>El archivo no incluye contraseñas ni claves. Podrás volver a importarlo con «Importar».</div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Importar: archivo → vista previa → confirmación → aplicar           */
/* ------------------------------------------------------------------ */

function VistaPrevia({ informe, modo, hayCambios, textoAntes }: { informe: Informe; modo: Modo; hayCambios: boolean; textoAntes: string }) {
  const fila = (etiqueta: string, valor: number, color?: string, ayuda?: string) => (
    <div key={etiqueta} title={ayuda} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "0.88rem" }}>
      <span style={{ color: "var(--text-secondary)" }}>{etiqueta}</span>
      <b style={{ color: valor > 0 ? color : "var(--text-muted)" }}>{numero(valor)}</b>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ fontWeight: 700 }}>Vista previa: esto es lo que pasará (todavía no se ha cambiado nada)</div>
      <div style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
        {fila("Registros en el archivo", informe.total)}
        {fila("Se crearán (nuevos)", informe.nuevos, "var(--success)")}
        {fila("Se actualizarán", informe.actualizados, "var(--primary)")}
        {fila("Ya están igual (sin cambios)", informe.sinCambios)}
        {fila("Se omitirán (ya existen o tienen errores)", informe.omitidos, "var(--warning)", "No se importan. Los que tienen error se detallan abajo.")}
        {informe.eliminados > 0 && fila("Se eliminarán (no están en el archivo)", informe.eliminados, "var(--danger)")}
      </div>
      {informe.muestra.length > 0 && (
        <div style={{ fontSize: "0.82rem" }}>
          <div style={{ color: "var(--text-muted)", marginBottom: "4px" }}>Primeros cambios previstos:</div>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {informe.muestra.map((m, i) => (
              <li key={i} style={{ color: m.accion === "elimina" ? "var(--danger)" : m.accion === "omite" ? "var(--text-muted)" : undefined }}>
                {m.texto}
              </li>
            ))}
          </ul>
        </div>
      )}
      {informe.totalErrores > 0 && (
        <div style={{ fontSize: "0.82rem", borderLeft: "4px solid var(--danger)", paddingLeft: "10px" }}>
          <div style={{ color: "var(--danger)", fontWeight: 700, marginBottom: "4px" }}>{numero(informe.totalErrores)} registro(s) con errores (se omiten; el resto sí se importa)</div>
          <ul style={{ margin: 0, paddingLeft: "18px" }}>
            {informe.errores.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {informe.totalErrores > informe.errores.length && <div style={{ color: "var(--text-muted)" }}>…y {numero(informe.totalErrores - informe.errores.length)} más.</div>}
        </div>
      )}
      {informe.avisos.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.82rem", color: "var(--warning)" }}>
          {informe.avisos.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      {modo === "sustituir" && (
        <div style={{ padding: "10px 12px", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.08)", fontSize: "0.85rem" }}>
          ⚠️ <b>Sustituir elimina</b> todo lo que no esté en el archivo. Antes se guardará una copia con la que podrás volver atrás.
        </div>
      )}
      {hayCambios ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{textoAntes} Al aplicar se te pedirá confirmar dos veces.</div>
      ) : (
        <div style={{ color: "var(--text-muted)" }}>No hay nada que cambiar con esta opción.</div>
      )}
    </div>
  );
}

function SelectorModo({ modos, modo, alCambiar, bloqueado }: { modos: Modo[]; modo: Modo; alCambiar: (m: Modo) => void; bloqueado: boolean }) {
  return (
    <fieldset style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }} disabled={bloqueado}>
      <legend style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "0 6px" }}>¿Cómo quieres hacerlo?</legend>
      {modos.map((m) => (
        <label key={m} title={MODOS[m].ayuda} style={{ display: "flex", gap: "8px", alignItems: "flex-start", cursor: "pointer" }}>
          <input type="radio" name="modo-importacion" checked={modo === m} onChange={() => alCambiar(m)} style={{ marginTop: "3px" }} />
          <span>
            <b style={{ color: m === "sustituir" ? "var(--danger)" : undefined }}>{MODOS[m].titulo}</b>
            <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{MODOS[m].ayuda}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function ModalImportar({ seccion, alCerrar, alTerminar }: { seccion: SeccionDatos; alCerrar: () => void; alTerminar: () => void }) {
  const { mostrar } = useToast();
  const [paquete, setPaquete] = useState<unknown>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [modo, setModo] = useState<Modo>("anadir");
  const [informe, setInforme] = useState<Informe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  // El servidor sigue pidiendo la palabra de confirmación: se manda sola, porque la verificación es el doble clic del botón
  const palabra = modo === "sustituir" ? "SUSTITUIR" : "IMPORTAR";

  const previsualizar = async (p: unknown, m: Modo) => {
    setTrabajando(true);
    setError(null);
    setInforme(null);
    try {
      const { extra } = await llamar("/api/admin/datos/importar", { method: "POST", cuerpo: { paquete: p, modo: m, aplicar: false, seccion: seccion.seccion } });
      setInforme(extra.informe as Informe);
    } catch (e) {
      setError(textoError(e));
    } finally {
      setTrabajando(false);
    }
  };

  const elegirArchivo = async (ev: ChangeEvent<HTMLInputElement>) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!archivo) return;
    setError(null);
    setInforme(null);
    try {
      const p = JSON.parse(await archivo.text()) as unknown;
      setPaquete(p);
      setNombreArchivo(archivo.name);
      await previsualizar(p, modo);
    } catch {
      setPaquete(null);
      setError("No se pudo leer el archivo: no es un JSON válido.");
    }
  };

  const cambiarModo = (m: Modo) => {
    setModo(m);
    if (paquete) void previsualizar(paquete, m);
  };

  const aplicar = async () => {
    if (!paquete) return;
    setTrabajando(true);
    setError(null);
    try {
      const { extra } = await llamar("/api/admin/datos/importar", { method: "POST", cuerpo: { paquete, modo, aplicar: true, seccion: seccion.seccion, confirmacion: palabra } });
      const r = extra.informe as Informe;
      const copia = extra.copia as { nombre: string; creadaAhora: boolean } | null;
      mostrar(
        `✅ Importación de ${seccion.plural} terminada: ${numero(r.nuevos)} nuevos, ${numero(r.actualizados)} actualizados, ${numero(r.sinCambios)} sin cambios${r.eliminados ? `, ${numero(r.eliminados)} eliminados` : ""}${r.omitidos ? `, ${numero(r.omitidos)} omitidos` : ""}.${copia ? ` Copia de seguridad previa: ${copia.nombre}.` : ""} También queda una copia interna del estado anterior.`,
      );
      alTerminar();
      alCerrar();
    } catch (e) {
      setError(`No se ha importado nada. ${textoError(e)}`);
      mostrar("No se ha importado nada: mira el motivo en la ventana.", "error");
    } finally {
      setTrabajando(false);
    }
  };

  const hayCambios = !!informe && informe.nuevos + informe.actualizados + informe.eliminados > 0;
  const puedeAplicar = hayCambios && !trabajando;
  const doble = useDobleConfirmacion(() => void aplicar());

  return (
    <Modal
      titulo={`📥 Importar ${seccion.plural}`}
      ancho="720px"
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={trabajando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!puedeAplicar} onClick={doble.pulsar} style={doble.armado ? { background: "var(--danger)", borderColor: "var(--danger)" } : undefined} title={hayCambios ? "Aplica los cambios que ves en la vista previa. Antes se guardan copias del estado actual. Hay que pulsar dos veces." : "Elige un archivo con cambios para poder aplicarlos."}>
            {trabajando ? "Trabajando…" : doble.armado ? TEXTO_SEGUNDO_CLIC : "Sí, aplicar importación"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem" }}>
        <div style={{ color: "var(--text-secondary)" }}>
          Elige un archivo <b>.json</b> exportado desde «{seccion.titulo}» (de esta u otra instalación). Verás una <b>vista previa exacta</b> de lo que cambiará; <b>no se toca nada</b> hasta que confirmes.
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <label className="btn btn-secondary" style={{ ...botonChico, cursor: "pointer" }} title="Elige en tu equipo el archivo .json que exportaste antes. Se lee aquí y no cambia nada todavía.">
            📂 Elegir archivo…
            <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => void elegirArchivo(e)} disabled={trabajando} />
          </label>
          <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{nombreArchivo || "Ningún archivo elegido"}</span>
        </div>
        <SelectorModo modos={seccion.modos} modo={modo} alCambiar={cambiarModo} bloqueado={trabajando} />
        {trabajando && !informe && <div style={{ color: "var(--text-muted)" }}>Analizando el archivo…</div>}
        {error && (
          <div role="alert" style={{ padding: "10px 12px", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.08)", color: "var(--danger)" }}>
            🛑 {error}
          </div>
        )}
        {informe && <VistaPrevia informe={informe} modo={modo} hayCambios={hayCambios} textoAntes="Antes se guardarán una copia interna de esta sección y una copia de seguridad del estado actual." />}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Copias internas                                                     */
/* ------------------------------------------------------------------ */

interface RespuestaCopias {
  copias: CopiaInternaDto[];
  total: number;
  conteo: Record<string, number>;
}

/**
 * Lista de copias internas con buscador y filtros, para guardar una nueva, descargar, restaurar o borrar.
 * Con `seccion` solo muestra las de esa sección; sin ella, las de todas (con un filtro por sección).
 */
export function ModalCopiasInternas({ seccion, secciones, alCerrar, alCambiar }: { seccion: Seccion | null; secciones: SeccionDatos[]; alCerrar: () => void; alCambiar: () => void }) {
  const { mostrar } = useToast();
  const [filtroSeccion, setFiltroSeccion] = useState<Seccion | "">(seccion ?? "");
  const [texto, setTexto] = useState("");
  const [origen, setOrigen] = useState<"" | "manual" | "automatica">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [lista, setLista] = useState<RespuestaCopias>({ copias: [], total: 0, conteo: {} });
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [restaurando, setRestaurando] = useState<CopiaInternaDto | null>(null);
  const [borrando, setBorrando] = useState<CopiaInternaDto | null>(null);
  const info = (s: Seccion) => secciones.find((x) => x.seccion === s);
  const titulo = (s: Seccion) => info(s)?.titulo ?? s;
  const seccionGuardar = seccion ?? (filtroSeccion || null);

  useEffect(() => {
    let vivo = true;
    const q = new URLSearchParams();
    if (filtroSeccion) q.set("seccion", filtroSeccion);
    if (texto.trim()) q.set("q", texto.trim());
    if (origen) q.set("origen", origen);
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    const temporizador = setTimeout(() => {
      llamar<{ copias: CopiaInternaDto[]; total: number; conteo: Record<string, number> }>(`/api/admin/datos/copias?${q.toString()}`)
        .then((r) => {
          if (vivo) setLista(r.data);
        })
        .catch((e: unknown) => {
          if (vivo) mostrar(textoError(e), "error");
        })
        .finally(() => {
          if (vivo) setCargando(false);
        });
    }, 200);
    return () => {
      vivo = false;
      clearTimeout(temporizador);
    };
  }, [filtroSeccion, texto, origen, desde, hasta, version, mostrar]);

  const refrescar = useCallback(() => {
    setVersion((v) => v + 1);
    alCambiar();
  }, [alCambiar]);

  const guardar = async () => {
    if (!seccionGuardar) return;
    setOcupado(true);
    try {
      const { data } = await llamar<CopiaInternaDto>("/api/admin/datos/copias", { method: "POST", cuerpo: { seccion: seccionGuardar, nota: nota.trim() || null } });
      mostrar(`✅ Copia interna guardada: ${data.nombre} (${cuantos(data.registros, info(seccionGuardar) ?? { plural: "registros" })}).`);
      setNota("");
      refrescar();
    } catch (e) {
      mostrar(`No se ha guardado la copia. ${textoError(e)}`, "error");
    } finally {
      setOcupado(false);
    }
  };

  const descargar = async (c: CopiaInternaDto) => {
    try {
      const res = await fetch(`/api/admin/datos/copias?id=${c.id}&descargar=1`);
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? "No se pudo descargar.");
      const nombre = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `gv_copia_${c.id}.json`;
      guardarBlob(await res.blob(), nombre);
      mostrar(`✅ Copia descargada: ${nombre}`);
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const borrar = async () => {
    if (!borrando) return;
    setOcupado(true);
    try {
      await llamar(`/api/admin/datos/copias?id=${borrando.id}`, { method: "DELETE" });
      mostrar("Copia interna eliminada.");
      setBorrando(null);
      refrescar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  const hayFiltros = !!(texto || origen || desde || hasta || (!seccion && filtroSeccion));

  return (
    <>
      <Modal
        titulo={`🗂️ Copias internas${seccion ? ` de ${info(seccion)?.plural ?? seccion}` : ""}`}
        ancho="860px"
        pie={
          <button type="button" className="btn btn-secondary" onClick={alCerrar}>
            Cerrar
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem" }}>
          <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Son copias de una sola sección guardadas <b>dentro de la propia aplicación</b> (también entran en las copias de seguridad completas). Sirven para volver atrás en esa sección sin tocar el resto. Se guardan solas antes de cada importación (se conservan las últimas 20 de cada sección) y también puedes guardarlas tú.
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
            {!seccion && (
              <div style={{ minWidth: "200px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "2px" }}>Sección</div>
                <select className="form-input" value={filtroSeccion} onChange={(e) => setFiltroSeccion(e.target.value as Seccion | "")}>
                  <option value="">Todas las secciones</option>
                  {secciones.filter((s) => s.importable).map((s) => (
                    <option key={s.seccion} value={s.seccion}>
                      {s.titulo}
                      {lista.conteo[s.seccion] ? ` (${lista.conteo[s.seccion]})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ flex: 1, minWidth: "180px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "2px" }}>Nota para esta copia (opcional)</div>
              <input className="form-input" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Ej.: antes de la campaña de noviembre" />
            </div>
            <button type="button" className="btn btn-primary" style={botonChico} disabled={ocupado || !seccionGuardar} onClick={() => void guardar()} title={seccionGuardar ? "Guarda ahora una copia de esta sección dentro de la aplicación." : "Elige primero una sección concreta en el desplegable."}>
              {ocupado ? "Guardando…" : "💾 Guardar copia interna ahora"}
            </button>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: "180px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "2px" }}>🔎 Buscar por nombre o nota</div>
              <input className="form-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar…" />
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "2px" }}>Origen</div>
              <select className="form-input" value={origen} onChange={(e) => setOrigen(e.target.value as "" | "manual" | "automatica")}>
                <option value="">Todas</option>
                <option value="manual">Guardadas por mí</option>
                <option value="automatica">Automáticas</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "2px" }}>Desde</div>
              <input className="form-input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "2px" }}>Hasta</div>
              <input className="form-input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            {hayFiltros && (
              <button
                type="button"
                className="btn btn-secondary"
                style={botonChico}
                onClick={() => {
                  setTexto("");
                  setOrigen("");
                  setDesde("");
                  setHasta("");
                  if (!seccion) setFiltroSeccion("");
                }}
              >
                Quitar filtros
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {cargando && <div style={{ color: "var(--text-muted)" }}>Cargando…</div>}
            {!cargando && lista.copias.length === 0 && <div style={{ color: "var(--text-muted)", padding: "12px 0" }}>{hayFiltros ? "Ninguna copia coincide con los filtros." : "Todavía no hay copias internas."}</div>}
            {lista.copias.map((c) => (
              <div key={c.id} style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                <div style={{ flex: 1, minWidth: "220px" }}>
                  <div style={{ fontWeight: 600, display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <span>
                      {ICONOS[c.seccion]} {c.nombre}
                    </span>
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "1px 8px", borderRadius: "999px", border: "1px solid var(--border-light)", color: c.origen === "automatica" ? "var(--text-muted)" : "var(--primary)" }}>{c.origen === "automatica" ? "Automática" : "Guardada por mí"}</span>
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    {!seccion && <>{titulo(c.seccion)} · </>}
                    {fechaHora(c.creadaEn)} · {numero(c.registros)} {c.registros === 1 ? "registro" : "registros"} · {tamanoLegible(c.tamano)}
                  </div>
                  {c.nota && <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "2px" }}>📝 {c.nota}</div>}
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setRestaurando(c)} title="Vuelve a cargar el contenido de esta copia en su sección. Verás antes una vista previa de lo que cambiaría; no se toca nada hasta que confirmes.">
                    ↩️ Restaurar…
                  </button>
                  <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => void descargar(c)} title="Descarga esta copia como archivo .json (se puede importar desde «Importar»).">
                    ⬇️ Descargar
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ ...botonChico, color: "var(--danger)" }} onClick={() => setBorrando(c)} title="Borra solo esta copia interna. No cambia ningún dato de la aplicación.">
                    🗑️ Borrar
                  </button>
                </div>
              </div>
            ))}
            {lista.total > lista.copias.length && <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Se muestran las {numero(lista.copias.length)} más recientes de {numero(lista.total)}. Usa el buscador o los filtros para ver el resto.</div>}
          </div>
        </div>
      </Modal>

      {restaurando && (
        <ModalRestaurar
          copia={restaurando}
          seccion={info(restaurando.seccion)}
          alCerrar={() => setRestaurando(null)}
          alTerminar={() => {
            setRestaurando(null);
            refrescar();
          }}
        />
      )}

      {borrando && (
        <ModalConfirmar
          titulo="🗑️ Borrar copia interna"
          mensaje={
            <>
              Se borrará la copia <b>{borrando.nombre}</b> ({fechaHora(borrando.creadaEn)}). Los datos actuales de la aplicación no cambian, pero ya no podrás volver a ese punto.
            </>
          }
          textoConfirmar="Sí, borrar la copia"
          textoOcupado="Borrando…"
          ocupado={ocupado}
          alConfirmar={() => void borrar()}
          alCancelar={() => setBorrando(null)}
        />
      )}
    </>
  );
}

function ModalRestaurar({ copia, seccion, alCerrar, alTerminar }: { copia: CopiaInternaDto; seccion: SeccionDatos | undefined; alCerrar: () => void; alTerminar: () => void }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const modosDisponibles: Modo[] = seccion?.modos.length ? seccion.modos : ["anadir", "actualizar"];
  const modoInicial: Modo = modosDisponibles.includes("sustituir") ? "sustituir" : (modosDisponibles[modosDisponibles.length - 1] ?? "actualizar");
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(true);
  const palabra = modo === "sustituir" ? "SUSTITUIR" : "RESTAURAR";

  const previsualizar = useCallback(
    async (m: Modo) => {
      setTrabajando(true);
      setError(null);
      setInforme(null);
      try {
        const r = await llamar("/api/admin/datos/copias/restaurar", { method: "POST", cuerpo: { id: copia.id, modo: m, aplicar: false } });
        setInforme(r.extra.informe as Informe);
      } catch (e) {
        setError(textoError(e));
      } finally {
        setTrabajando(false);
      }
    },
    [copia.id],
  );

  useEffect(() => {
    let vivo = true;
    llamar("/api/admin/datos/copias/restaurar", { method: "POST", cuerpo: { id: copia.id, modo: modoInicial, aplicar: false } })
      .then((r) => {
        if (vivo) setInforme(r.extra.informe as Informe);
      })
      .catch((e: unknown) => {
        if (vivo) setError(textoError(e));
      })
      .finally(() => {
        if (vivo) setTrabajando(false);
      });
    return () => {
      vivo = false;
    };
  }, [copia.id, modoInicial]);

  const aplicar = async () => {
    setTrabajando(true);
    setError(null);
    try {
      const r = await llamar("/api/admin/datos/copias/restaurar", { method: "POST", cuerpo: { id: copia.id, modo, aplicar: true, confirmacion: palabra } });
      const inf = r.extra.informe as Informe;
      mostrar(`✅ Copia restaurada: ${numero(inf.nuevos)} nuevos, ${numero(inf.actualizados)} actualizados${inf.eliminados ? `, ${numero(inf.eliminados)} eliminados` : ""}. Antes se guardó una copia interna del estado anterior.`);
      router.refresh();
      alTerminar();
    } catch (e) {
      setError(`No se ha restaurado nada. ${textoError(e)}`);
    } finally {
      setTrabajando(false);
    }
  };

  const hayCambios = !!informe && informe.nuevos + informe.actualizados + informe.eliminados > 0;
  const doble = useDobleConfirmacion(() => void aplicar());
  return (
    <Modal
      titulo={`↩️ Restaurar «${copia.nombre}»`}
      ancho="720px"
      peligro
      pie={
        <>
          <button type="button" className="btn btn-secondary" onClick={alCerrar} disabled={trabajando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!hayCambios || trabajando} onClick={doble.pulsar} style={doble.armado ? { background: "var(--danger)", borderColor: "var(--danger)" } : undefined}>
            {trabajando ? "Trabajando…" : doble.armado ? TEXTO_SEGUNDO_CLIC : "Sí, restaurar esta copia"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "0.9rem" }}>
        <div style={{ color: "var(--text-secondary)" }}>
          Copia de <b>{seccion?.titulo ?? copia.seccion}</b> guardada el {fechaHora(copia.creadaEn)} ({numero(copia.registros)} {copia.registros === 1 ? "registro" : "registros"}). Elige cómo restaurarla y mira la vista previa: <b>no se cambia nada</b> hasta que confirmes.
        </div>
        <SelectorModo
          modos={modosDisponibles}
          modo={modo}
          alCambiar={(m) => {
            setModo(m);
                    void previsualizar(m);
          }}
          bloqueado={trabajando}
        />
        {trabajando && !informe && <div style={{ color: "var(--text-muted)" }}>Calculando la vista previa…</div>}
        {error && (
          <div role="alert" style={{ padding: "10px 12px", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.08)", color: "var(--danger)" }}>
            🛑 {error}
          </div>
        )}
        {informe && <VistaPrevia informe={informe} modo={modo} hayCambios={hayCambios} textoAntes="Antes se guardarán una copia interna del estado actual y, si hace falta, una copia de seguridad completa." />}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Botones para el encabezado de cada página                           */
/* ------------------------------------------------------------------ */

/**
 * Tres botones (Exportar, Importar, Copias internas) para una sección concreta. Solo los administradores los ven:
 * si la API responde que no hay permiso, no se pinta nada.
 */
export function BotonesDatosSeccion({ seccion, alCambiar, planesIniciales }: { seccion: Seccion; alCambiar?: () => void; planesIniciales?: number[] }) {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosPanel | null>(null);
  const [modal, setModal] = useState<"exportar" | "importar" | "copias" | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;
    llamar<DatosPanel>("/api/admin/datos")
      .then((r) => {
        if (vivo) setDatos(r.data);
      })
      .catch(() => {
        /* sin permiso o sin conexión: no se muestran los botones */
      });
    return () => {
      vivo = false;
    };
  }, [version]);

  const s = datos?.secciones.find((x) => x.seccion === seccion);
  if (!datos || !s) return null;
  const terminar = () => {
    setVersion((v) => v + 1);
    router.refresh();
    alCambiar?.();
  };

  return (
    <>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setModal("exportar")} title={`Descarga un archivo .json con ${seccion === "planes" ? "los planes que elijas (todos o uno a uno)" : `los ${s.plural}`}. No borra ni cambia nada.`}>
          📤 Exportar SOLO {seccion === "planes" ? "planes" : s.plural}
        </button>
        {s.importable && (
          <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setModal("importar")} title={`Carga ${s.plural} desde un archivo .json exportado antes. Verás una vista previa y no se aplica nada sin tu confirmación.`}>
            📥 Importar
          </button>
        )}
        {s.importable && (
          <button type="button" className="btn btn-secondary" style={botonChico} onClick={() => setModal("copias")} title={`Copias de ${s.plural} guardadas dentro de la aplicación: guardar una, restaurarla, descargarla o borrarla.`}>
            🗂️ Copias internas
          </button>
        )}
      </div>
      {modal === "exportar" && <ModalExportar seccion={s} planes={datos.planes} idsIniciales={planesIniciales} alCerrar={() => setModal(null)} />}
      {modal === "importar" && <ModalImportar seccion={s} alCerrar={() => setModal(null)} alTerminar={terminar} />}
      {modal === "copias" && <ModalCopiasInternas seccion={seccion} secciones={datos.secciones} alCerrar={() => setModal(null)} alCambiar={terminar} />}
    </>
  );
}
