"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { iniciarLectura, leerResumenLecturas, suscribirResumenLecturas } from "@/lib/lecturas-pedidos-cliente";
import type { AjustesOcrDto } from "@/app/api/admin/ocr/route";

/**
 * Controles de la lectura junto a las zonas de arrastrar, sin ir a Configuración. `parte="pedidos"`: el botón «Iniciar lectura» (cuando la
 * lectura es manual y hay pedidos subidos esperando) y, para administradores, si la lectura es manual. `parte="motor"`: el motor de OCR
 * (solo administradores), que sirve tanto para los pedidos como para los pagos de la financiera.
 */
export default function ControlesLectura({ parte = "pedidos" }: { parte?: "motor" | "pedidos" }) {
  const { mostrar } = useToast();
  const resumen = useSyncExternalStore(suscribirResumenLecturas, leerResumenLecturas, () => null);
  const [a, setA] = useState<AjustesOcrDto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [iniciando, setIniciando] = useState(false);

  useEffect(() => {
    let vivo = true;
    // Los que no son administradores reciben un 403 y simplemente no ven el selector
    llamar<AjustesOcrDto>("/api/admin/ocr")
      .then((r) => vivo && setA(r.data))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  const guardar = async (cambios: { motor?: string; lecturaManual?: boolean }, mensaje: string) => {
    setGuardando(true);
    try {
      const { data } = await llamar<AjustesOcrDto>("/api/admin/ocr", { method: "PUT", cuerpo: cambios });
      setA(data);
      mostrar(mensaje);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setGuardando(false);
    }
  };

  const esperando = resumen?.subiendo ?? 0;
  const manual = resumen?.manual ?? a?.lecturaManual ?? false;
  if (parte === "motor") {
    if (!a) return null;
    return (
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", fontSize: "0.82rem" }}>
        <b title="El motor de OCR se usa para leer los pedidos y los pagos de la financiera que vengan escaneados o en foto">🔎 Motor de lectura (OCR) para pedidos y pagos</b>
        <select
          className="form-input"
          value={a.motor}
          disabled={guardando}
          onChange={(e) => void guardar({ motor: e.target.value }, "Motor de lectura cambiado.")}
          title="Motor con el que se leen los documentos. Entre paréntesis, el equipo en el que va mejor (★ = el recomendado para este equipo)"
          style={{ padding: "4px 8px", fontSize: "0.82rem", flex: "1 1 320px", maxWidth: "560px" }}
        >
          {a.opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre} ({o.equipo}){o.recomendado ? " ★" : ""}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (!a && !(manual && esperando > 0)) return null;

  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", fontSize: "0.78rem" }}>
      {manual && esperando > 0 && (
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: "5px 12px", fontSize: "0.82rem" }}
          disabled={iniciando}
          onClick={() => {
            setIniciando(true);
            void iniciarLectura().finally(() => setIniciando(false));
          }}
          title="Empieza a leer todos los pedidos que ya están subidos y esperando"
        >
          ▶ Iniciar lectura ({esperando})
        </button>
      )}
      {a && (
        <>
          <label style={{ display: "flex", gap: "5px", alignItems: "center", cursor: "pointer" }} title="Con la lectura manual, tras subir los pedidos no se lee nada hasta que pulses «Iniciar lectura». Sin marcar, se leen solos al terminar de subirlos.">
            <input type="checkbox" checked={a.lecturaManual} disabled={guardando} onChange={(e) => void guardar({ lecturaManual: e.target.checked }, e.target.checked ? "Lectura manual: pulsarás «Iniciar lectura»." : "Lectura automática: se leerá al terminar de subir.")} style={{ accentColor: "var(--primary)" }} />
            Lectura manual
          </label>
        </>
      )}
    </div>
  );
}
