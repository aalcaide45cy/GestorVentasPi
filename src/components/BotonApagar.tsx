"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/components/Toast";
import { useCarga } from "@/components/comisiones/useCarga";
import { llamar, textoError } from "@/components/comisiones/api";

interface PropsAccion {
  colapsado: boolean;
  /** Dirección de la API: el GET dice si está disponible en este equipo; el POST ejecuta la acción. */
  api: string;
  etiqueta: string;
  etiquetaOcupado: string;
  ayuda: string;
  confirmacion: string;
  aviso: string;
  cuerpo?: Record<string, unknown>;
  icono: ReactNode;
  /** Se llama tras pedir la acción con éxito (por defecto solo se muestra el aviso). */
  alHecho?: () => void;
}

const iconoProps = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Botón de sistema (solo administrador): pide al servidor (Raspberry Pi) una acción, siempre tras confirmar. Solo si el instalador la activó. */
function BotonAccion({ colapsado, api, etiqueta, etiquetaOcupado, ayuda, confirmacion, aviso, cuerpo, icono, alHecho }: PropsAccion) {
  const { mostrar, confirmar } = useToast();
  const { datos } = useCarga<{ disponible: boolean } | null>(api, null);
  const [ocupado, setOcupado] = useState(false);
  if (!datos?.disponible) return null;

  const ejecutar = async () => {
    if (!await confirmar({ texto: confirmacion })) return;
    setOcupado(true);
    try {
      await llamar(api, { method: "POST", cuerpo: { confirmar: true, ...cuerpo } });
      mostrar(aviso);
      alHecho?.();
    } catch (e) {
      mostrar(textoError(e), "error");
      setOcupado(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void ejecutar()}
      disabled={ocupado}
      className="glass-panel-interactive"
      title={ayuda}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: colapsado ? "center" : "flex-start",
        gap: "12px",
        padding: "12px 16px",
        borderRadius: "var(--radius-sm)",
        fontSize: "0.95rem",
        fontWeight: 500,
        color: "var(--text-secondary)",
        background: "rgba(255, 255, 255, 0.01)",
        border: "1px solid transparent",
        width: "100%",
        cursor: ocupado ? "wait" : "pointer",
      }}
    >
      {icono}
      {!colapsado && <span>{ocupado ? etiquetaOcupado : etiqueta}</span>}
    </button>
  );
}

/** «Reiniciar equipo», «Forzar actualización» y «Apagar equipo» del menú lateral. */
export default function BotonApagar({ colapsado }: { colapsado: boolean }) {
  return (
    <>
      <BotonAccion
        colapsado={colapsado}
        api="/api/admin/reiniciar"
        etiqueta="Reiniciar equipo"
        etiquetaOcupado="Reiniciando…"
        ayuda="Reinicia de forma ordenada la Raspberry Pi donde se ejecuta la aplicación (pide confirmación)"
        confirmacion={"¿Reiniciar la Raspberry Pi?\n\nLa aplicación no estará disponible durante uno o dos minutos y volverá sola."}
        aviso="Reiniciando el equipo… vuelve a entrar dentro de uno o dos minutos."
        icono={
          <svg {...iconoProps}>
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        }
      />
      <BotonAccion
        colapsado={colapsado}
        api="/api/admin/actualizar"
        cuerpo={{ forzar: true }}
        etiqueta="Forzar actualización"
        etiquetaOcupado="Actualizando…"
        ayuda="Busca la última versión en GitHub y la instala ya (con copia previa), aunque haya quedado una actualización marcada como en curso"
        confirmacion={"¿Buscar e instalar ahora la última versión?\n\nSe hace una copia de seguridad antes y la aplicación se reinicia unos minutos. El avance se ve en Configuración → BBDD."}
        aviso="Actualización solicitada. Sigue el avance en Configuración → BBDD."
        icono={
          <svg {...iconoProps}>
            <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3" />
            <polyline points="3 17 6 20 9 17" />
            <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3" />
            <polyline points="21 7 18 4 15 7" />
          </svg>
        }
      />
      <BotonAccion
        colapsado={colapsado}
        api="/api/admin/apagar"
        etiqueta="Apagar equipo"
        etiquetaOcupado="Apagando…"
        ayuda="Apaga de forma ordenada la Raspberry Pi donde se ejecuta la aplicación (pide confirmación)"
        confirmacion={"¿Apagar la Raspberry Pi?\n\nLa aplicación dejará de estar disponible para todos hasta que vuelvas a encenderla (desenchufándola y enchufándola de nuevo)."}
        aviso="Apagando el equipo… Espera a que se apague la luz verde antes de desenchufarlo."
        icono={
          <svg {...iconoProps}>
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <line x1="12" y1="2" x2="12" y2="12" />
          </svg>
        }
      />
    </>
  );
}

/** «Reiniciar servidor» (solo el programa, no el equipo): va encima de «Cerrar sesión». */
export function BotonReiniciarServidor({ colapsado }: { colapsado: boolean }) {
  return (
    <BotonAccion
        colapsado={colapsado}
        api="/api/admin/reiniciar-servidor"
        etiqueta="Reiniciar servidor"
        etiquetaOcupado="Reiniciando…"
        ayuda="Reinicia solo el programa (no el equipo). Sirve para que cojan efecto los cambios o si algo se queda colgado (pide confirmación)"
        confirmacion={"¿Reiniciar el servidor de la aplicación?\n\nNo estará disponible unos segundos y la página se recargará sola."}
        aviso="Reiniciando el servidor… la página se recargará sola."
        alHecho={() => {
          // Se espera a que vuelva a responder y se recarga
          const intento = (n: number) => {
            if (n > 60) return;
            window.setTimeout(() => {
              fetch("/api/salud", { cache: "no-store" }).then((r) => (r.ok && n > 2 ? window.location.reload() : intento(n + 1))).catch(() => intento(n + 1));
            }, 2000);
          };
          intento(0);
        }}
        icono={
          <svg {...iconoProps}>
            <rect x="3" y="4" width="18" height="6" rx="1" />
            <rect x="3" y="14" width="18" height="6" rx="1" />
            <path d="M7 7h.01M7 17h.01" />
          </svg>
        }
      />
  );
}

type Modo = "desarrollo" | "normal";

/**
 * «Modo: desarrollo / normal» (solo el PC de desarrollo con Windows): cambia el servidor entre desarrollo (se actualiza solo al tocar el código,
 * más lento) y normal (compilado, como en la Raspberry, más rápido). Mientras cambia, una ventana avisa de lo que está pasando y del tiempo, y la
 * página se recarga sola cuando el servidor vuelve en el modo pedido.
 */
export function BotonCambiarModo({ colapsado }: { colapsado: boolean }) {
  const { mostrar, confirmar } = useToast();
  const { datos } = useCarga<{ modo: Modo; disponible: boolean } | null>("/api/admin/modo-servidor", null);
  const [objetivo, setObjetivo] = useState<Modo | null>(null);
  const [oculto, setOculto] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [fallo, setFallo] = useState(false);
  const [vistoCaido, setVistoCaido] = useState(false);

  // Mientras se cambia, se pregunta cada 3 s al servidor: cuando vuelve (tras haberse caído) en el modo pedido, se recarga la página
  useEffect(() => {
    if (!objetivo) return;
    const inicio = Date.now();
    let caido = false;
    const t = window.setInterval(() => {
      const seg = Math.round((Date.now() - inicio) / 1000);
      setSegundos(seg);
      if (seg > 20 * 60) {
        setFallo(true);
        return;
      }
      fetch("/api/salud", { cache: "no-store" })
        .then(async (r) => {
          if (!r.ok) throw new Error("caído");
          const j = (await r.json()) as { modo?: Modo };
          if (caido && j.modo === objetivo) window.location.reload();
          // Sigue vivo en el modo anterior: si pasan 90 s y no se ha cerrado, algo ha fallado
          else if (!caido && seg > 90) setFallo(true);
          else if (caido && j.modo !== objetivo && seg > 60) setFallo(true);
        })
        .catch(() => {
          caido = true;
          setVistoCaido(true);
        });
    }, 3000);
    return () => window.clearInterval(t);
  }, [objetivo]);

  if (!datos?.disponible) return null;
  const nuevo: Modo = datos.modo === "normal" ? "desarrollo" : "normal";

  const cambiar = async () => {
    const texto =
      nuevo === "normal"
        ? "¿Pasar a modo normal?\n\nSe compila la aplicación (suele tardar entre 1 y 5 minutos) y el servidor arranca ya compilado: va más rápido, pero los cambios en el código no se ven hasta volver a compilar. La aplicación no estará disponible mientras tanto y la página se recargará sola al terminar. Si la compilación falla, vuelve sola al modo desarrollo. Tendrás que volver a iniciar sesión."
        : "¿Volver a modo desarrollo?\n\nEl servidor se reinicia en modo desarrollo (los cambios en el código se ven al momento, pero va más lento). Tarda un minuto; la página se recargará sola y tendrás que volver a iniciar sesión.";
    if (!await confirmar({ texto, aceptar: nuevo === "normal" ? "Compilar y pasar a modo normal" : "Volver a modo desarrollo" })) return;
    try {
      await llamar("/api/admin/modo-servidor", { method: "POST", cuerpo: { modo: nuevo, confirmar: true } });
      setSegundos(0);
      setFallo(false);
      setVistoCaido(false);
      setOculto(false);
      setObjetivo(nuevo);
      mostrar(nuevo === "normal" ? "Cambiando a modo normal: compilando… la página se recargará sola." : "Cambiando a modo desarrollo… la página se recargará sola.", "aviso", 6000);
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const minutos = Math.floor(segundos / 60);
  const fase = !vistoCaido ? "Cerrando el servidor actual…" : objetivo === "normal" ? "El servidor está parado mientras se compila y arranca de nuevo." : "Arrancando en modo desarrollo…";
  return (
    <>
      <button
        type="button"
        onClick={() => void cambiar()}
        disabled={objetivo !== null}
        className="glass-panel-interactive"
        title={`Ahora el servidor está en modo ${datos.modo}. Pulsa para pasar a modo ${nuevo}: ${nuevo === "normal" ? "compilado, más rápido (tarda unos minutos en compilar)" : "desarrollo, se actualiza solo al tocar el código"}`}
        style={{ display: "flex", alignItems: "center", justifyContent: colapsado ? "center" : "flex-start", gap: "12px", padding: "12px 16px", borderRadius: "var(--radius-sm)", fontSize: "0.95rem", fontWeight: 500, color: "var(--text-secondary)", background: "rgba(255, 255, 255, 0.01)", border: "1px solid transparent", width: "100%", cursor: objetivo ? "wait" : "pointer" }}
      >
        <svg {...iconoProps}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        {!colapsado && <span>{objetivo ? "Cambiando de modo…" : `Pasar a modo ${nuevo}`}</span>}
      </button>
      {objetivo && !oculto && (
        <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 2000, background: "var(--bg-overlay)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="glass-panel" style={{ maxWidth: "520px", width: "100%", padding: "28px", display: "flex", flexDirection: "column", gap: "14px", background: "var(--bg-card)" }}>
            <h3 style={{ margin: 0 }}>{fallo ? "🛑 El cambio de modo está tardando demasiado" : objetivo === "normal" ? "⚙️ Pasando a modo normal…" : "⚙️ Volviendo a modo desarrollo…"}</h3>
            {!fallo && (
              <div style={{ height: "8px", borderRadius: "999px", background: "rgba(255, 255, 255, 0.1)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: "40%", background: "var(--primary)", borderRadius: "999px", animation: "modoBarra 1.4s ease-in-out infinite" }} />
              </div>
            )}
            <div style={{ color: "var(--text-secondary)", fontSize: "0.92rem", lineHeight: 1.5 }}>
              {fallo ? (
                <>No ha vuelto en el modo pedido. Revisa los registros en la carpeta temporal del equipo (los archivos <code>gestorventas-modo.log</code>, <code>gestorventas-build.log</code> y <code>gestorventas-dev-3000.log</code>) o lánzalo a mano con <code>npm run dev</code>.</>
              ) : (
                <>
                  {fase} {objetivo === "normal" ? "Compilar suele tardar entre 1 y 5 minutos." : "Suele tardar menos de un minuto."} La página se recargará sola cuando termine.
                  <br />
                  Tiempo transcurrido: <b>{minutos > 0 ? `${minutos} min ` : ""}{segundos % 60} s</b>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setOculto(true)}>
                Ocultar este aviso
              </button>
              {fallo && (
                <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                  Recargar la página
                </button>
              )}
            </div>
          </div>
          <style>{`@keyframes modoBarra { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }`}</style>
        </div>
      )}
    </>
  );
}
