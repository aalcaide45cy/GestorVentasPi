"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { llamar, textoError } from "@/components/comisiones/api";
import { useToast } from "@/components/Toast";
import type { AlertaDto } from "@/lib/alertas";
import { useVersionDatos } from "@/lib/datos-version";
import {
  animacionDeAlerta,
  APLAZAMIENTOS,
  cuando,
  estiloIcono,
  useAspectoAlertas,
  useBotonesRapidos,
  type Aplazamiento,
  type CuerpoAlerta,
} from "./aspecto-alertas";
import PanelAlertas from "./PanelAlertas";
import VistaBotonAlertas from "./VistaBotonAlertas";

interface Datos {
  pendientes: AlertaDto[];
  pospuestas: AlertaDto[];
  resueltas: AlertaDto[];
}
const VACIO: Datos = { pendientes: [], pospuestas: [], resueltas: [] };
const CLAVE_VISTAS = "gv-alertas-vistas";

const leerVistas = (): Set<number> => {
  try {
    return new Set(
      JSON.parse(
        window.sessionStorage.getItem(CLAVE_VISTAS) ?? "[]",
      ) as number[],
    );
  } catch {
    return new Set();
  }
};
const guardarVistas = (v: Set<number>) => {
  try {
    window.sessionStorage.setItem(CLAVE_VISTAS, JSON.stringify([...v]));
  } catch {
    /* sin almacenamiento: el aviso saldrá otra vez */
  }
};

/**
 * El botón ❗ de la barra superior (junto a la campana): cuenta las alertas pendientes y, si hay alguna, parpadea (con el efecto elegido en
 * Configuración › Expedientes › Alertas). Una alerta nueva sale además en una ventana, una vez por sesión; se puede dar por hecha o posponer.
 */
export default function BotonAlertas() {
  const router = useRouter();
  const { mostrar } = useToast();
  const version = useVersionDatos();
  const aspecto = useAspectoAlertas();
  const rapidos = useBotonesRapidos();
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [vistas, setVistas] = useState<Set<number>>(new Set());
  const [registro, setRegistro] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [listo, setListo] = useState(false);
  const montado = useRef(true);

  const cargar = useCallback(async () => {
    try {
      const { data } = await llamar<Datos>("/api/alertas");
      if (montado.current) setDatos(data);
    } catch {
      /* sin conexión o sin sesión: se queda como estaba */
    }
  }, []);

  useEffect(() => {
    montado.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVistas(leerVistas());
    setListo(true);
    return () => {
      montado.current = false;
    };
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar, version]);
  useEffect(() => {
    const cada = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, 30_000);
    const alVolver = () => void cargar();
    window.addEventListener("focus", alVolver);
    return () => {
      window.clearInterval(cada);
      window.removeEventListener("focus", alVolver);
    };
  }, [cargar]);

  const marcarVista = (id: number) => {
    setVistas((v) => {
      const n = new Set(v).add(id);
      guardarVistas(n);
      return n;
    });
  };
  const accion = async (cuerpo: CuerpoAlerta, id: number, texto: string) => {
    setOcupado(true);
    try {
      await llamar("/api/alertas", {
        method: "POST",
        cuerpo: { ...cuerpo, id },
      });
      mostrar(texto);
      await cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  const pendientes = datos.pendientes.length;
  const animacion = animacionDeAlerta(aspecto);
  // La alerta que sale en ventana: la primera pendiente que todavía no se ha enseñado en esta sesión
  const enVentana =
    !registro && listo
      ? datos.pendientes.find((a) => !vistas.has(a.id))
      : undefined;

  return (
    <>
      <VistaBotonAlertas
        aspecto={aspecto}
        pendientes={pendientes}
        activo={pendientes > 0}
        alPulsar={() => setRegistro(true)}
        titulo={
          pendientes > 0
            ? `Alertas: ${pendientes} pendiente${pendientes === 1 ? "" : "s"}`
            : "Alertas (no hay ninguna pendiente)"
        }
      />

      {registro && (
        <PanelAlertas
          datos={datos}
          ocupado={ocupado}
          alCerrar={() => setRegistro(false)}
          alAccion={accion}
          alIr={(id) => {
            setRegistro(false);
            router.push(`/dashboard/expedientes/editar/${id}`);
          }}
        />
      )}

      {enVentana &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={() => marcarVista(enVentana.id)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100001,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(100%, 480px)",
                padding: "22px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                background: "var(--bg-card)",
                border: `2px solid ${aspecto.color}`,
                borderRadius: "var(--radius-md)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <span
                  className={animacion.clase}
                  style={{
                    ...animacion.estilo,
                    fontSize: "1.6rem",
                    lineHeight: 1,
                  }}
                >
                  ❗
                </span>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
                    {enVentana.regla}
                  </h3>
                  <span
                    style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                  >
                    {cuando(enVentana.creada_en)}
                    {datos.pendientes.length > 1
                      ? ` · hay ${datos.pendientes.length} alertas pendientes`
                      : ""}
                  </span>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: "1rem", lineHeight: 1.45 }}>
                {enVentana.mensaje}
              </p>
              <span
                style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}
              >
                {enVentana.cliente ?? "Sin cliente"}
                {enVentana.matricula ? ` · ${enVentana.matricula}` : ""}
              </span>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                  alignItems: "center",
                }}
              >
                {rapidos.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="btn btn-secondary"
                    disabled={ocupado}
                    onClick={() =>
                      void accion(
                        { accion: "posponer", hasta: r },
                        enVentana.id,
                        "Alerta pospuesta.",
                      )
                    }
                    style={{ padding: "6px 12px" }}
                    title={APLAZAMIENTOS.find((x) => x.id === r)?.etiqueta}
                  >
                    ⏰ {APLAZAMIENTOS.find((x) => x.id === r)?.corta}
                  </button>
                ))}
                <select
                  className="form-input"
                  aria-label="Posponer la alerta"
                  value=""
                  disabled={ocupado}
                  onChange={(e) => {
                    const v = e.target.value as Aplazamiento | "";
                    if (v)
                      void accion(
                        { accion: "posponer", hasta: v },
                        enVentana.id,
                        "Alerta pospuesta.",
                      );
                  }}
                  style={{
                    width: "auto",
                    padding: "6px 10px",
                    fontSize: "0.85rem",
                  }}
                >
                  <option value="">⏰ Posponer…</option>
                  {APLAZAMIENTOS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.etiqueta}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={ocupado}
                  onClick={() => marcarVista(enVentana.id)}
                  style={{ padding: "6px 14px" }}
                  title="Cierra esta ventana; la alerta sigue pendiente y volverá a salir al iniciar sesión"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={ocupado}
                  onClick={() => {
                    marcarVista(enVentana.id);
                    router.push(
                      `/dashboard/expedientes/editar/${enVentana.id_expediente}`,
                    );
                  }}
                  style={{ padding: "6px 14px" }}
                >
                  Ir al expediente
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={ocupado}
                  onClick={() =>
                    void accion(
                      { accion: "hecho" },
                      enVentana.id,
                      "Alerta atendida.",
                    )
                  }
                  style={{ padding: "6px 16px" }}
                >
                  ✔ Hecho
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
