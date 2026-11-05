"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { Plegable } from "@/components/admin/estructura";
import PanelCola from "./PanelCola";

/** Los correos de un expediente o de un cliente (por enviar y enviados), en su ficha; en la del cliente, la casilla «no enviarle correos». */
export default function CorreosDeFicha({
  idExpediente,
  idCliente,
}: {
  idExpediente?: number;
  idCliente?: number;
}) {
  const { mostrar } = useToast();
  const [noEnviar, setNoEnviar] = useState<boolean | null>(null);
  useEffect(() => {
    if (!idCliente || idExpediente) return;
    llamar<{ no_enviar: boolean }>(`/api/correo/cliente?id=${idCliente}`)
      .then((r) => setNoEnviar(r.data.no_enviar))
      .catch(() => undefined);
  }, [idCliente, idExpediente]);
  return (
    <Plegable
      id={idExpediente ? "ficha-correos-exp" : "ficha-correos-cli"}
      titulo="✉️ Correos"
      abiertoPorDefecto={!!idExpediente}
    >
      {noEnviar !== null && idCliente && (
        <label
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            fontSize: "0.9rem",
          }}
          title="Las reglas no le pondrán su dirección en los correos que preparen; en la cola quedan «sin destinatario»"
        >
          <input
            type="checkbox"
            checked={noEnviar}
            onChange={async (e) => {
              const v = e.target.checked;
              setNoEnviar(v);
              try {
                await llamar(`/api/correo/cliente?id=${idCliente}`, {
                  method: "PUT",
                  cuerpo: { no_enviar: v },
                });
              } catch (err) {
                setNoEnviar(!v);
                mostrar(textoError(err), "error");
              }
            }}
          />
          🚫 No enviarle correos automáticos
        </label>
      )}
      <PanelCola
        modo="ficha"
        idExpediente={idExpediente}
        idCliente={idExpediente ? undefined : idCliente}
      />
    </Plegable>
  );
}
