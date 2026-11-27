"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { cambiarSobre, useCorreoEnviado } from "@/lib/correo-enviados";
import { formatDate } from "@/lib/date-utils";
import type { ExpedienteDto } from "@/lib/dto";
import { usePreferencia } from "@/lib/preferencias";
import { CAMPO_WHATSAPP_SEGURO, CLAVE_SEGURO_NOMBRE, CLAVE_SEGURO_PLANTILLA, CLAVE_SEGURO_TELEFONO, PLANTILLA_SEGURO, enlaceWhatsapp, numeroWhatsapp, redactarSeguro } from "@/lib/whatsapp";

/** WhatsApp al compañero de los seguros con los datos del cliente y su vehículo; se puede retocar antes de abrirlo. */
export default function ModalWhatsappSeguro({ exp, alCerrar }: { exp: ExpedienteDto; alCerrar: () => void }) {
  const { mostrar } = useToast();
  const [nombre] = usePreferencia(CLAVE_SEGURO_NOMBRE);
  const [telefono] = usePreferencia(CLAVE_SEGURO_TELEFONO);
  const [plantilla] = usePreferencia(CLAVE_SEGURO_PLANTILLA);
  const [retocado, setRetocado] = useState<string | null>(null);
  const enVerde = !!useCorreoEnviado(CAMPO_WHATSAPP_SEGURO, exp.id_expediente, true);
  const entrega = formatDate(exp.fecha_entrega) || "";
  const redactado = redactarSeguro(plantilla?.trim() ? plantilla : PLANTILLA_SEGURO, {
    companero: nombre ?? "",
    nombre: exp.cliente?.nombre ?? "",
    telefono: exp.cliente?.telefonos[0]?.telefono ?? "",
    email: exp.cliente?.emails[0]?.email ?? "",
    vehiculo: [exp.modelo?.marca?.nombre, exp.modelo?.nombre_modelo].filter(Boolean).join(" "),
    matricula: exp.matricula ?? "",
    bastidor: exp.vin ?? "",
    entrega: entrega && exp.hora_entrega ? `${entrega} a las ${exp.hora_entrega}` : entrega,
  });
  const texto = retocado ?? redactado.texto;
  const numero = numeroWhatsapp(telefono ?? "");

  const cambiar = async (verde: boolean) => {
    try {
      await cambiarSobre(CAMPO_WHATSAPP_SEGURO, exp.id_expediente, verde);
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
      titulo="WhatsApp para el seguro"
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
        Para: <b>{nombre || "compañero de seguros"}</b> · {telefono || "sin teléfono"}
      </div>
      {!numero && <div style={{ color: "var(--danger)", fontSize: "0.88rem" }}>⚠️ Pon su móvil en Configuración › Expedientes › WhatsApp.</div>}
      {redactado.faltan.length > 0 && <div style={{ color: "var(--warning)", fontSize: "0.88rem" }}>⚠️ Falta: {redactado.faltan.join(", ")}. Esas líneas no salen en el mensaje.</div>}
      <textarea className="form-input" rows={16} value={texto} onChange={(e) => setRetocado(e.target.value)} aria-label="Mensaje de WhatsApp" style={{ resize: "vertical", fontSize: "0.9rem", lineHeight: 1.45 }} />
    </Modal>
  );
}
