"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { avisarCambioDeDatos } from "@/lib/datos-version";
import type { EstadoHistorial, PasoHistorial } from "@/lib/servicios/historial";

const cuando = (iso: string): string => new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const NOMBRE_TABLA: Record<string, string> = {
  expedientes: "expedientes",
  clientes: "clientes",
  emails_clientes: "correos",
  telefonos_clientes: "teléfonos",
  marcas: "marcas",
  modelos: "modelos",
  alias_modelos: "alias de modelos",
  tipo_de_venta: "tipos de pago",
  estado_vehiculo: "estados",
  tiendas: "tiendas",
  commission_plans: "planes",
};
const queCambio = (p: PasoHistorial): string => {
  const principales = p.tablas.filter((t) => NOMBRE_TABLA[t]).map((t) => NOMBRE_TABLA[t]);
  return principales.length > 0 ? principales.join(", ") : "ajustes de comisiones";
};

/** Deshacer, rehacer e historial de cambios del usuario (menú lateral). Atajos: Ctrl+Z, Ctrl+Y y Ctrl+Mayús+Z fuera de los campos de texto. */
export default function BarraHistorial({ colapsado }: { colapsado: boolean }) {
  const { mostrar, confirmar } = useToast();
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoHistorial | null>(null);
  const [lista, setLista] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(() => {
    llamar<EstadoHistorial>("/api/historial")
      .then((r) => setEstado(r.data))
      .catch(() => undefined);
  }, []);

  const programarCarga = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(cargar, 500);
  }, [cargar]);

  useEffect(() => {
    cargar();
    // Cada cambio que hace la aplicación (una petición que no es de lectura y sale bien) actualiza el historial
    const fetchOriginal = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const respuesta = await fetchOriginal(...args);
      const metodo = (args[1]?.method ?? (args[0] instanceof Request ? args[0].method : "GET")).toUpperCase();
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0]);
      if (respuesta.ok && metodo !== "GET" && url.includes("/api/") && !url.includes("/api/historial")) programarCarga();
      return respuesta;
    };
    const alVolver = () => cargar();
    window.addEventListener("focus", alVolver);
    return () => {
      window.fetch = fetchOriginal;
      window.removeEventListener("focus", alVolver);
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [cargar, mostrar, programarCarga]);

  const aplicar = useCallback(
    async (direccion: "deshacer" | "rehacer", grupo?: string): Promise<void> => {
      setOcupado(true);
      // Si algún registro cambió después por otra vía, se avisa y, si el usuario insiste, se repite forzando
      for (let forzar = false; ; forzar = true) {
        try {
          const r = await llamar<{ pasos: number; accion: string }>(`/api/historial/${direccion}`, { method: "POST", cuerpo: { grupo, forzar } });
          const texto = direccion === "deshacer" ? "Deshecho" : "Rehecho";
          // Sin recargar la página: se refrescan los datos en su sitio y se conserva el scroll
          router.refresh();
          avisarCambioDeDatos();
          mostrar(r.data.pasos > 1 ? `${texto}: ${r.data.pasos} cambios, hasta «${r.data.accion}»` : `${texto}: ${r.data.accion}`);
          setOcupado(false);
          cargar();
          return;
        } catch (e) {
          const mensaje = textoError(e);
          if (!forzar && /se ha modificado después/.test(mensaje) && await confirmar({ texto: `${mensaje}

¿Quieres hacerlo igualmente?` })) continue;
          setOcupado(false);
          mostrar(mensaje, "error");
          cargar();
          return;
        }
      }
    },
    [cargar, mostrar, confirmar, router],
  );

  // Atajos de teclado, solo cuando no se está escribiendo ni hay una ventana abierta
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const tecla = e.key.toLowerCase();
      const destino = e.target instanceof HTMLElement ? e.target : null;
      if (destino && (destino.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(destino.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (tecla === "z" && !e.shiftKey && estado?.puedeDeshacer) {
        e.preventDefault();
        void aplicar("deshacer");
      } else if ((tecla === "y" || (tecla === "z" && e.shiftKey)) && estado?.puedeRehacer) {
        e.preventDefault();
        void aplicar("rehacer");
      }
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [aplicar, estado]);

  const boton = (texto: string, titulo: string, onClick: () => void, deshabilitado: boolean) => (
    <button type="button" className="glass-panel-interactive" onClick={onClick} disabled={deshabilitado || ocupado} title={titulo} style={{ flex: colapsado ? undefined : 1, padding: "8px 10px", borderRadius: "var(--radius-sm)", fontSize: "0.9rem", fontWeight: 600, color: deshabilitado ? "var(--text-muted)" : "var(--text-primary)", border: "1px solid var(--border-light)", background: "rgba(255, 255, 255, 0.01)", cursor: deshabilitado ? "not-allowed" : "pointer", opacity: deshabilitado ? 0.55 : 1, whiteSpace: "nowrap" }}>
      {texto}
    </button>
  );

  const pasoDeshacer = estado?.puedeDeshacer ?? null;
  const pasoRehacer = estado?.puedeRehacer ?? null;
  return (
    <div style={{ display: "flex", flexDirection: colapsado ? "column" : "row", gap: "6px" }}>
      {boton(colapsado ? "↶" : "↶ Deshacer", pasoDeshacer ? `Deshacer: ${pasoDeshacer.accion} (Ctrl+Z)` : "No hay nada que deshacer", () => void aplicar("deshacer"), !pasoDeshacer)}
      {boton(colapsado ? "↷" : "↷ Rehacer", pasoRehacer ? `Rehacer: ${pasoRehacer.accion} (Ctrl+Y)` : "No hay nada que rehacer", () => void aplicar("rehacer"), !pasoRehacer)}
      {boton("🕘", "Historial de cambios", () => { cargar(); setLista(true); }, false)}
      {lista && (
        <Modal
          titulo="🕘 Historial de cambios"
          ancho="min(calc(96 * var(--uvw)), 820px)"
          pie={
            <button type="button" className="btn btn-secondary" onClick={() => setLista(false)}>
              Cerrar
            </button>
          }
        >
          <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            Tus últimos cambios (se guardan 30 días). «Volver a este punto» deshace todo lo posterior; si ya lo habías deshecho, lo rehace hasta aquí. Las acciones de cobros y liquidaciones calculadas no entran.
          </p>
          {(estado?.pasos.length ?? 0) === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>Todavía no hay cambios.</p>
          ) : (
            <table className="table-premium table-compact" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Qué hiciste</th>
                  <th>Afecta a</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {estado?.pasos.map((p) => (
                  <tr key={p.grupo} style={{ opacity: p.estado === "deshecho" ? 0.55 : 1 }}>
                    <td style={{ whiteSpace: "nowrap" }}>{cuando(p.en)}</td>
                    <td>
                      <strong>{p.accion}</strong>
                      {p.estado === "deshecho" && <span style={{ marginLeft: "6px", fontSize: "0.75rem", color: "var(--warning)" }}>↶ deshecho</span>}
                    </td>
                    <td style={{ fontSize: "0.8rem" }}>
                      {queCambio(p)} ({p.filas} fila{p.filas === 1 ? "" : "s"})
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "2px 10px", fontSize: "0.75rem" }}
                        disabled={ocupado}
                        onClick={async () => {
                          const direccion = p.estado === "aplicado" ? "deshacer" : "rehacer";
                          if (await confirmar({ texto: p.estado === "aplicado" ? `¿Deshacer «${p.accion}» y todo lo que hiciste después?` : `¿Rehacer los cambios hasta «${p.accion}»?`, peligro: true })) void aplicar(direccion, p.grupo);
                        }}
                      >
                        {p.estado === "aplicado" ? "Volver antes de esto" : "Rehacer hasta aquí"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}
