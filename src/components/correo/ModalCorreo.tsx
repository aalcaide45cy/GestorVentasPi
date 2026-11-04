"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { CorreoDto, CuentaDto, PlantillaDto } from "@/lib/correo";
import { guardarPreferencia, usePreferencia } from "@/lib/preferencias";
import EditorHtml from "./EditorHtml";

interface Adjunto {
  id: number;
  nombre: string;
  tipo: string;
}

/** Crear un correo nuevo o revisar/editar uno de la cola. Con una plantilla y un número de expediente, se rellena solo. */
export default function ModalCorreo({
  correo,
  inicial,
  alCerrar,
  alGuardar,
}: {
  correo: CorreoDto | null;
  /** Para un correo nuevo: el expediente de partida y una clave con la que se recuerda lo que se elige (el botón ✉️ de las fechas). */
  inicial?: {
    id_expediente: number;
    clave: string;
    predefinido?: {
      plantilla: number | null;
      cuenta: number | null;
      para: string;
    };
  };
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const { mostrar } = useToast();
  const [guardado] = usePreferencia(
    `correo-fecha-${inicial?.clave ?? "ninguna"}`,
  );
  const [recordado] = useState(() => {
    try {
      if (
        inicial?.predefinido &&
        (inicial.predefinido.plantilla ||
          inicial.predefinido.cuenta ||
          inicial.predefinido.para)
      )
        return inicial.predefinido;
      return inicial && guardado
        ? (JSON.parse(guardado) as {
            plantilla: number | null;
            para: string;
            cuenta: number | null;
          })
        : null;
    } catch {
      return null;
    }
  });
  const [cuentas, setCuentas] = useState<CuentaDto[]>([]);
  const [plantillas, setPlantillas] = useState<PlantillaDto[]>([]);
  const [idCuenta, setIdCuenta] = useState<number | null>(
    correo?.id_cuenta ?? recordado?.cuenta ?? null,
  );
  const [idPlantilla, setIdPlantilla] = useState<number | null>(
    recordado?.plantilla ?? null,
  );
  const [expediente, setExpediente] = useState(
    correo?.id_expediente
      ? String(correo.id_expediente)
      : inicial
        ? String(inicial.id_expediente)
        : "",
  );
  const [para, setPara] = useState(correo?.para ?? recordado?.para ?? "");
  const [asunto, setAsunto] = useState(correo?.asunto ?? "");
  const [cuerpo, setCuerpo] = useState(correo?.cuerpo ?? "");
  const [claveEditor, setClaveEditor] = useState(0);
  const [adjuntos, setAdjuntos] = useState<number[]>(correo?.adjuntos ?? []);
  const [disponibles, setDisponibles] = useState<Adjunto[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const idExp = Number(expediente.replace(/\D/g, "")) || null;

  useEffect(() => {
    llamar<CuentaDto[]>("/api/correo/cuentas")
      .then((r) => {
        setCuentas(r.data);
        setIdCuenta((x) => x ?? r.data.find((c) => c.activa)?.id ?? null);
      })
      .catch(() => undefined);
    llamar<PlantillaDto[]>("/api/correo/plantillas")
      .then((r) => setPlantillas(r.data))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!idExp) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisponibles([]);
      return;
    }
    llamar<Adjunto[]>(`/api/adjuntos?idExpediente=${idExp}`)
      .then((r) => setDisponibles(r.data))
      .catch(() => setDisponibles([]));
  }, [idExp]);

  // Con una plantilla recordada, se cargan su asunto y su cuerpo al abrir
  useEffect(() => {
    if (!recordado?.plantilla || correo) return;
    const p = plantillas.find((x) => x.id === recordado.plantilla);
    if (p) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAsunto(p.asunto);
      setCuerpo(p.cuerpo);
      setClaveEditor((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillas]);

  const guardar = async (enviarYa = false) => {
    setOcupado(true);
    try {
      if (correo) {
        await llamar(`/api/correo/cola?id=${correo.id}`, {
          method: "PUT",
          cuerpo: { id_cuenta: idCuenta, para, asunto, cuerpo, adjuntos },
        });
      } else {
        const r = await llamar<CorreoDto>("/api/correo/cola", {
          method: "POST",
          cuerpo: {
            id_cuenta: idCuenta,
            id_plantilla: idPlantilla,
            id_expediente: idExp,
            para,
            asunto,
            cuerpo,
            adjuntos,
          },
        });
        if (inicial)
          guardarPreferencia(
            `correo-fecha-${inicial.clave}`,
            JSON.stringify({ plantilla: idPlantilla, para, cuenta: idCuenta }),
          );
        if (enviarYa) {
          const e = await llamar<{ hechos: number; fallos?: string[] }>(
            "/api/correo/cola",
            { method: "PATCH", cuerpo: { ids: [r.data.id], accion: "enviar" } },
          );
          if (e.data.fallos?.length) throw new Error(e.data.fallos[0]);
          mostrar("Correo enviado");
        } else mostrar("Correo añadido a la cola de Correo");
      }
      alGuardar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };
  const soloLectura =
    correo !== null &&
    !["borrador", "programado", "error"].includes(correo.estado);

  return (
    <Modal
      titulo={
        correo ? (soloLectura ? "Correo" : "Revisar el correo") : "Nuevo correo"
      }
      ancho="min(calc(96 * var(--uvw)), 820px)"
      pie={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={alCerrar}
            disabled={ocupado}
          >
            {soloLectura ? "Cerrar" : "Cancelar"}
          </button>
          {!soloLectura && (
            <>
              {!correo && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void guardar(false)}
                  disabled={ocupado}
                >
                  Dejar en la cola
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void guardar(!correo)}
                disabled={ocupado}
              >
                {correo ? "Guardar cambios" : "📤 Enviar ahora"}
              </button>
            </>
          )}
        </>
      }
    >
      {correo?.error && (
        <div
          style={{
            padding: "8px 12px",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius-sm)",
            color: "var(--danger)",
            fontSize: "0.88rem",
          }}
        >
          ⚠️ {correo.error}
        </div>
      )}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flex: 1,
            minWidth: "220px",
          }}
        >
          Desde la cuenta
          <select
            className="form-input"
            value={idCuenta ?? ""}
            disabled={soloLectura}
            onChange={(e) =>
              setIdCuenta(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">— Elige una cuenta —</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.email})
              </option>
            ))}
          </select>
        </label>
        {!correo && (
          <>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                width: "130px",
              }}
              title="El número del expediente del que se sacan los datos"
            >
              Expediente nº
              <input
                className="form-input"
                inputMode="numeric"
                value={expediente}
                onChange={(e) => setExpediente(e.target.value)}
                placeholder="Ej. 4"
              />
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                flex: 1,
                minWidth: "200px",
              }}
            >
              Plantilla
              <select
                className="form-input"
                value={idPlantilla ?? ""}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setIdPlantilla(id);
                  const p = plantillas.find((x) => x.id === id);
                  if (p) {
                    setAsunto(p.asunto);
                    setCuerpo(p.cuerpo);
                    setClaveEditor((k) => k + 1);
                  }
                }}
              >
                <option value="">— Sin plantilla —</option>
                {plantillas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        Para (varias direcciones separadas por comas; vacío = el correo del
        cliente)
        <input
          className="form-input"
          value={para}
          readOnly={soloLectura}
          onChange={(e) => setPara(e.target.value)}
          placeholder={
            correo
              ? "Sin destinatario"
              : "Se usará el correo del cliente del expediente"
          }
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        Asunto
        <input
          className="form-input"
          value={asunto}
          readOnly={soloLectura}
          onChange={(e) => setAsunto(e.target.value)}
        />
      </label>
      {soloLectura ? (
        <div
          className="notas-contenido"
          style={{
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
          }}
          dangerouslySetInnerHTML={{ __html: cuerpo }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          Mensaje
          <EditorHtml
            key={claveEditor}
            valor={cuerpo}
            alCambiar={setCuerpo}
            conCampos={!correo}
          />
          {!correo && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Con una plantilla y un expediente, los campos entre llaves se
              rellenan al crear el borrador.
            </span>
          )}
        </div>
      )}
      {disponibles.length > 0 && !soloLectura && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          Documentos del expediente que se adjuntan
          {disponibles.map((a) => (
            <label
              key={a.id}
              style={{
                display: "flex",
                gap: "6px",
                alignItems: "center",
                fontSize: "0.88rem",
              }}
            >
              <input
                type="checkbox"
                checked={adjuntos.includes(a.id)}
                onChange={(e) =>
                  setAdjuntos(
                    e.target.checked
                      ? [...adjuntos, a.id]
                      : adjuntos.filter((x) => x !== a.id),
                  )
                }
              />
              📎 {a.nombre}
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
