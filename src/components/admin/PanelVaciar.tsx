"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useDobleConfirmacion } from "@/components/useDobleConfirmacion";

/** «Borrar todo»: deja la base de datos sin datos, como recién instalada (conserva las cuentas de acceso). */
export default function PanelVaciar({ alTerminar }: { alTerminar?: () => void }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [otrosUsuarios, setOtrosUsuarios] = useState(false);
  const [porDefecto, setPorDefecto] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [copiaPrevia, setCopiaPrevia] = useState<string | null>(null);

  const vaciar = async () => {
    setTrabajando(true);
    try {
      const { data } = await llamar<{ copiaPrevia: string | null }>("/api/admin/vaciar", { method: "POST", cuerpo: { confirmacion: "BORRAR TODO", eliminarOtrosUsuarios: otrosUsuarios, catalogosPorDefecto: porDefecto } });
      setCopiaPrevia(data.copiaPrevia);
      alTerminar?.();
      mostrar("Base de datos vaciada.");
      router.refresh();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(false);
    }
  };

  const doble = useDobleConfirmacion(() => void vaciar());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "18px", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)" }}>
      <h3 style={{ fontSize: "1.15rem", color: "var(--danger)" }}>🧨 Borrar todos los datos</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0, lineHeight: 1.5 }}>
        Deja la base de datos <b>sin datos</b>, como recién instalada: se eliminan tiendas, marcas, modelos, formas de pago, estados, clientes, expedientes, planes y liquidaciones de comisiones, rejillas, adjuntos e historial de importaciones. Las cuentas de usuario, los ajustes y la <b>biblioteca de archivos</b> (Herramientas › Biblioteca) se conservan; de la biblioteca solo se quita la asignación a clientes y expedientes, y sus archivos solo se borran desde la propia biblioteca. Antes de borrar se crea automáticamente una copia de seguridad (en «Copias de seguridad»), y si no se puede crear, no se borra nada.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <input type="checkbox" id="chkVaciarUsuarios" checked={otrosUsuarios} onChange={(e) => setOtrosUsuarios(e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
        <label htmlFor="chkVaciarUsuarios" style={{ fontSize: "0.9rem", cursor: "pointer" }} title="Si lo marcas, solo queda tu cuenta de administrador; las demás cuentas de vendedores y administradores se eliminan">
          Eliminar también las demás cuentas de usuario (solo queda la mía)
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <input type="checkbox" id="chkVaciarDefecto" checked={porDefecto} onChange={(e) => setPorDefecto(e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
        <label htmlFor="chkVaciarDefecto" style={{ fontSize: "0.9rem", cursor: "pointer" }} title="Vuelve a crear los estados (Nuevo, Demo, KM0…), las formas de pago (Contado, Crédito, Preference) y las marcas y modelos de partida (Dacia, Renault, Hyundai, Peugeot y Toyota)">
          Dejar los catálogos de partida (estados, formas de pago y marcas Dacia, Renault, Hyundai, Peugeot y Toyota con sus modelos)
        </label>
      </div>
      <div style={{ display: "flex", gap: "10px", alignItems: "end", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" disabled={trabajando} onClick={doble.pulsar} style={{ backgroundColor: "var(--danger)", borderColor: "var(--danger)", ...(doble.armado ? { outline: "3px solid var(--danger)" } : {}) }} title="Crea una copia de seguridad y después borra todos los datos. Hay que pulsar dos veces.">
          {trabajando ? "Borrando…" : doble.armado ? "⚠️ ¿Seguro? Se borran TODOS los datos. Pulsa otra vez" : "Borrar todos los datos"}
        </button>
      </div>
      {copiaPrevia && <div style={{ fontSize: "0.88rem", color: "var(--success)" }}>✅ Hecho. Copia previa guardada como {copiaPrevia}; puedes restaurarla desde «Copias de seguridad».</div>}
    </div>
  );
}
