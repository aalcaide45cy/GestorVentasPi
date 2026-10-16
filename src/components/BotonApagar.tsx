"use client";

import { useState, type ReactNode } from "react";
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
}

const iconoProps = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Botón de sistema (solo administrador): pide al servidor (Raspberry Pi) una acción, siempre tras confirmar. Solo si el instalador la activó. */
function BotonAccion({ colapsado, api, etiqueta, etiquetaOcupado, ayuda, confirmacion, aviso, cuerpo, icono }: PropsAccion) {
  const { mostrar } = useToast();
  const { datos } = useCarga<{ disponible: boolean } | null>(api, null);
  const [ocupado, setOcupado] = useState(false);
  if (!datos?.disponible) return null;

  const ejecutar = async () => {
    if (!window.confirm(confirmacion)) return;
    setOcupado(true);
    try {
      await llamar(api, { method: "POST", cuerpo: { confirmar: true, ...cuerpo } });
      mostrar(aviso);
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
