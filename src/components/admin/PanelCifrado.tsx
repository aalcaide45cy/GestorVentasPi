"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import type { EstadoCifrado } from "@/lib/servicios/cifrado-datos";
import { alTerminarTarea, lanzarTarea } from "@/lib/tareas-cliente";

/**
 * Interruptor general del cifrado de los datos (documentos, archivos de la biblioteca, capturas, doble factor, conexión con Drive…). Desactivado
 * por defecto mientras se desarrolla: así no hay problemas de claves al mover datos entre equipos ni al restaurar copias. Al cambiarlo se hace una copia
 * de seguridad previa y se convierte todo lo ya guardado, en segundo plano y con avance.
 */
export default function PanelCifrado() {
  const { confirmar, notificar, mostrar } = useToast();
  const { datos, recargar } = useCarga<EstadoCifrado | null>("/api/admin/cifrado", null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => alTerminarTarea((t) => { if (t.tipo === "cifrado") recargar(); }));

  const cambiar = async (activar: boolean) => {
    const texto = activar
      ? "Vas a ACTIVAR el cifrado: los documentos, los archivos de la biblioteca, las capturas, el doble factor y la conexión con Drive se guardarán cifrados con la clave de esta instalación (APP_SECRET del archivo .env), y lo que ya está guardado en claro se cifrará.\n\nSi después pierdes el archivo .env (o restauras una copia en otro equipo sin su clave), esos datos no se podrán abrir. Antes de empezar se guarda una copia de seguridad completa. Puede tardar si hay muchos documentos. ¿Continuar?"
      : "Vas a DEJAR LOS DATOS SIN CIFRAR: lo que está cifrado (documentos, archivos de la biblioteca, capturas, doble factor, conexión con Drive) se guardará en claro y ya no dependerá de ninguna clave, así que se puede mover entre equipos y restaurar sin problemas. Quien tenga acceso a la base de datos o a una copia podrá leerlo.\n\nAntes de empezar se guarda una copia de seguridad completa. Puede tardar si hay muchos documentos. ¿Continuar?";
    if (!(await confirmar({ texto, peligro: activar }))) return;
    setTrabajando(true);
    try {
      await lanzarTarea("/api/admin/cifrado", { activar });
      void notificar({ titulo: "Se está convirtiendo en segundo plano", texto: activar ? "Cifrando lo ya guardado." : "Dejando lo ya guardado sin cifrar.", detalles: ["Primero se hace una copia de seguridad.", "Puedes seguir usando la aplicación: verás el avance en la barra de tareas de arriba.", "Lo nuevo ya se guarda en el formato elegido y lo que aún no se ha convertido se sigue leyendo bien."] });
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const activo = datos?.activo ?? false;
  const pendientes = datos ? (activo ? datos.enClaro : datos.cifrados) : 0;
  return (
    <div>
      <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>🔐 Cifrado de los datos</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "16px" }}>
        Interruptor general para cifrar o no los documentos, los archivos de la biblioteca, las capturas de las incidencias, el doble factor y la conexión con Google Drive. <b>Ahora, mientras se desarrolla, debe estar desactivado</b>: así no hay problemas de claves al mover datos entre equipos o restaurar copias. Se activará al final.
      </p>
      <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", backgroundColor: "rgba(255, 255, 255, 0.01)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <button
            type="button"
            role="switch"
            aria-checked={activo}
            disabled={!datos || trabajando}
            onClick={() => void cambiar(!activo)}
            title={activo ? "Pulsa para dejar los datos sin cifrar" : "Pulsa para activar el cifrado"}
            style={{ width: "54px", height: "30px", borderRadius: "999px", border: "1px solid var(--border-light)", background: activo ? "var(--primary)" : "rgba(255,255,255,0.08)", position: "relative", cursor: "pointer", padding: 0, flexShrink: 0 }}
          >
            <span style={{ position: "absolute", top: "3px", left: activo ? "27px" : "3px", width: "22px", height: "22px", borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <strong>{activo ? "🔒 Cifrado ACTIVADO" : "🔓 Cifrado DESACTIVADO"}</strong>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{datos ? `${datos.cifrados.toLocaleString("es-ES")} datos cifrados · ${datos.enClaro.toLocaleString("es-ES")} en claro` : "Cargando…"}</span>
          </div>
        </div>
        {datos && pendientes > 0 && (
          <div style={{ fontSize: "0.85rem", color: "var(--warning)" }}>
            ⏳ Quedan {pendientes.toLocaleString("es-ES")} datos en el otro formato (se siguen leyendo bien).{" "}
            <button type="button" className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: "0.8rem" }} disabled={trabajando} onClick={() => void cambiar(activo)}>
              Convertirlos ahora
            </button>
          </div>
        )}
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Las contraseñas de los usuarios nunca se guardan en claro (van con hash, no cifradas) y no dependen de este interruptor.</span>
      </div>
    </div>
  );
}
