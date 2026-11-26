"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { cambiarSobre, useCorreoEnviado } from "@/lib/correo-enviados";
import { formatDate } from "@/lib/date-utils";
import type { ExpedienteDto } from "@/lib/dto";
import { usePreferencia } from "@/lib/preferencias";
import { CAMPO_WHATSAPP, CLAVE_PLANTILLA_WHATSAPP, PLANTILLA_WHATSAPP, enlaceWhatsapp, numeroWhatsapp, redactarWhatsapp } from "@/lib/whatsapp";

/** ¿El cliente entrega un vehículo? Lo dice el semáforo «VO de retoma» del expediente («Con VO»). */
const tieneRetoma = (e: ExpedienteDto): boolean => (e.apuntes ?? []).some((a) => /retoma/i.test(a.titulo) && (a.estado_semaforo ?? 0) > 0);

/** Vista previa del WhatsApp al cliente: se puede retocar y se abre WhatsApp con el texto ya escrito (el envío lo pulsa la persona). */
export default function ModalWhatsapp({ exp, alCerrar }: { exp: ExpedienteDto; alCerrar: () => void }) {
  const { mostrar } = useToast();
  const [plantilla] = usePreferencia(CLAVE_PLANTILLA_WHATSAPP);
  const [conRetoma, setConRetoma] = useState(() => tieneRetoma(exp));
  // Lo retocado a mano; mientras sea null se muestra lo redactado con la plantilla
  const [retocado, setRetocado] = useState<string | null>(null);
  const enVerde = !!useCorreoEnviado(CAMPO_WHATSAPP, exp.id_expediente, true);
  const fecha = (v: string | null) => formatDate(v) || "";
  const redactado = redactarWhatsapp(
    plantilla?.trim() ? plantilla : PLANTILLA_WHATSAPP,
    { nombre: exp.cliente?.nombre ?? "", matricula: exp.matricula ?? "", fecha_matricula: fecha(exp.fecha_matriculacion), bastidor: exp.vin ?? "", dia: fecha(exp.fecha_entrega), hora: exp.hora_entrega ?? "" },
    conRetoma,
  );
  const texto = retocado ?? redactado.texto;
  const telefono = exp.cliente?.telefonos[0]?.telefono ?? "";
  const numero = numeroWhatsapp(telefono);

  const cambiar = async (verde: boolean) => {
    try {
      await cambiarSobre(CAMPO_WHATSAPP, exp.id_expediente, verde);
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se pudo cambiar el color del botón", "error");
    }
  };
  const abrir = () => {
    window.open(enlaceWhatsapp(numero, texto), "_blank", "noopener,noreferrer");
    void cambiar(true);
    alCerrar();
  };

  return (
    <Modal
      titulo="WhatsApp al cliente"
      ancho="min(calc(96 * var(--uvw)), 640px)"
      pie={
        <>
          {enVerde && (
            <button type="button" className="btn btn-secondary" onClick={() => void cambiar(false).then(alCerrar)} title="Devuelve el botón a azul (como si no se hubiera enviado)">
              🔵 Volver a azul
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={abrir} disabled={!numero || !texto.trim()}>
            💬 Abrir WhatsApp
          </button>
        </>
      }
    >
      <div style={{ fontSize: "0.9rem" }}>
        Para: <b>{exp.cliente?.nombre ?? "Sin cliente"}</b> · {telefono || "sin teléfono"}
      </div>
      {!numero && <div style={{ color: "var(--danger)", fontSize: "0.88rem" }}>⚠️ El cliente no tiene un móvil válido: ponlo en su ficha.</div>}
      {redactado.faltan.length > 0 && <div style={{ color: "var(--warning)", fontSize: "0.88rem" }}>⚠️ Falta: {redactado.faltan.join(", ")}. Esas líneas no salen en el mensaje.</div>}
      <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.9rem", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={conRetoma}
          onChange={(e) => {
            setConRetoma(e.target.checked);
            setRetocado(null);
          }}
        />
        Incluir la documentación del vehículo que entrega como forma de pago
      </label>
      <textarea className="form-input" rows={16} value={texto} onChange={(e) => setRetocado(e.target.value)} aria-label="Mensaje de WhatsApp" style={{ resize: "vertical", fontSize: "0.9rem", lineHeight: 1.45 }} />
    </Modal>
  );
}
