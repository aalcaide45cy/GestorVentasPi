"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { CuentaDto, PlantillaDto } from "@/lib/correo";
import EditorHtml from "./EditorHtml";

/** Plantillas de correo: asunto y cuerpo con campos del cliente, el expediente y las fechas entre llaves. */
export default function PanelPlantillas() {
  const { mostrar, confirmar } = useToast();
  const [lista, setLista] = useState<PlantillaDto[] | null>(null);
  const [b, setB] = useState<{
    id: number | null;
    nombre: string;
    asunto: string;
    para: string;
    cc: string;
    cco: string;
    id_cuenta: number | null;
    con_firma: boolean;
    firma: string;
    cuerpo: string;
  } | null>(null);
  const [cuentas, setCuentas] = useState<CuentaDto[]>([]);
  useEffect(() => {
    llamar<CuentaDto[]>("/api/correo/cuentas")
      .then((r) => setCuentas(r.data))
      .catch(() => undefined);
  }, []);
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(() => {
    llamar<PlantillaDto[]>("/api/correo/plantillas")
      .then((r) => setLista(r.data))
      .catch((e: unknown) => mostrar(textoError(e), "error"));
  }, [mostrar]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);
  const guardar = async () => {
    if (!b) return;
    setOcupado(true);
    try {
      await llamar(`/api/correo/plantillas${b.id ? `?id=${b.id}` : ""}`, {
        method: b.id ? "PUT" : "POST",
        cuerpo: {
          nombre: b.nombre,
          asunto: b.asunto,
          para: b.para,
          cc: b.cc,
          cco: b.cco,
          id_cuenta: b.id_cuenta,
          con_firma: b.con_firma,
          firma: b.firma,
          cuerpo: b.cuerpo,
        },
      });
      setB(null);
      cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <p
        style={{
          margin: 0,
          color: "var(--text-secondary)",
          fontSize: "0.9rem",
        }}
      >
        Escribe el correo una vez, con campos como {"{cliente}"}, {"{bastidor}"}{" "}
        o {"{fecha_entrega}"}, y se rellena solo con los datos de cada
        expediente.
      </p>
      <div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            setB({
              id: null,
              nombre: "",
              asunto: "",
              para: "",
              cc: "",
              cco: "",
              id_cuenta: null,
              con_firma: true,
              firma: "",
              cuerpo: "",
            })
          }
        >
          ＋ Nueva plantilla
        </button>
      </div>
      {lista?.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>Todavía no hay plantillas.</p>
      )}
      {lista?.map((p) => (
        <div
          key={p.id}
          className="glass-panel"
          style={{
            padding: "10px 14px",
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: "220px" }}>
            <strong>{p.nombre}</strong>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Asunto: {p.asunto || "(sin asunto)"}
              {p.para ? ` · Para: ${p.para}` : ""}
              {p.cc ? ` · CC: ${p.cc}` : ""}
              {p.cco ? ` · CCO: ${p.cco}` : ""}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            title="Abre una copia para que la cambies y la guardes con otro nombre"
            onClick={() =>
              setB({
                id: null,
                nombre: `${p.nombre} (copia)`.slice(0, 80),
                asunto: p.asunto,
                para: p.para,
                cc: p.cc,
                cco: p.cco,
                id_cuenta: p.id_cuenta,
                con_firma: p.con_firma,
                firma: p.firma,
                cuerpo: p.cuerpo,
              })
            }
            style={{ padding: "3px 10px", fontSize: "0.82rem" }}
          >
            📄 Duplicar
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setB({
                id: p.id,
                nombre: p.nombre,
                asunto: p.asunto,
                para: p.para,
                cc: p.cc,
                cco: p.cco,
                id_cuenta: p.id_cuenta,
                con_firma: p.con_firma,
                firma: p.firma,
                cuerpo: p.cuerpo,
              })
            }
            style={{ padding: "3px 10px", fontSize: "0.82rem" }}
          >
            ✏️ Editar
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: "3px 10px", fontSize: "0.82rem" }}
            onClick={async () => {
              if (
                !(await confirmar({
                  titulo: "Quitar la plantilla",
                  texto: `¿Quitar «${p.nombre}»?`,
                  aceptar: "Quitar",
                  peligro: true,
                }))
              )
                return;
              await llamar(`/api/correo/plantillas?id=${p.id}`, {
                method: "DELETE",
              }).catch((e: unknown) => mostrar(textoError(e), "error"));
              cargar();
            }}
          >
            🗑️
          </button>
        </div>
      ))}
      {b && (
        <Modal
          titulo={b.id ? "Editar la plantilla" : "Nueva plantilla"}
          ancho="min(calc(96 * var(--uvw)), 780px)"
          pie={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setB(null)}
                disabled={ocupado}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void guardar()}
                disabled={ocupado}
              >
                Guardar
              </button>
            </>
          }
        >
          <label
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            Nombre de la plantilla
            <input
              className="form-input"
              value={b.nombre}
              onChange={(e) => setB({ ...b, nombre: e.target.value })}
            />
          </label>
          <label
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            Asunto (admite campos entre llaves)
            <input
              className="form-input"
              value={b.asunto}
              onChange={(e) => setB({ ...b, asunto: e.target.value })}
              placeholder="Ej. Entrega de su {marca} {modelo}"
            />
          </label>
          <label
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            Enviar desde la cuenta (opcional)
            <select
              className="form-input"
              value={b.id_cuenta ?? ""}
              onChange={(e) =>
                setB({
                  ...b,
                  id_cuenta: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">— La primera cuenta de quien la use —</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.email})
                </option>
              ))}
            </select>
          </label>
          <label
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            Destinatarios (opcional)
            <input
              className="form-input"
              value={b.para}
              onChange={(e) => setB({ ...b, para: e.target.value })}
              placeholder="Ej. {email_cliente}, jefe@ejemplo.com"
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Varias direcciones separadas por comas; puedes usar campos como{" "}
              {"{email_cliente}"}. Si lo dejas vacío, se envía al correo del
              cliente del expediente. Al crear el correo se puede cambiar.
            </span>
          </label>
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
              CC (copia, opcional)
              <input
                className="form-input"
                value={b.cc}
                onChange={(e) => setB({ ...b, cc: e.target.value })}
                placeholder="Ej. compañero@ejemplo.com"
              />
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                flex: 1,
                minWidth: "220px",
              }}
            >
              CCO (copia oculta, opcional)
              <input
                className="form-input"
                value={b.cco}
                onChange={(e) => setB({ ...b, cco: e.target.value })}
                placeholder="Ej. yo@ejemplo.com"
              />
            </label>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            Cuerpo
            <EditorHtml
              valor={b.cuerpo}
              alCambiar={(h) => setB((x) => (x ? { ...x, cuerpo: h } : x))}
              conCampos
            />
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.9rem",
            }}
            title="Pone al final del correo la firma de la cuenta desde la que se envía (se cambia en Cuentas). Si ya escribes {firma} en el texto, sale ahí."
          >
            <input
              type="checkbox"
              checked={b.con_firma}
              onChange={(e) => setB({ ...b, con_firma: e.target.checked })}
            />
            Incluir al final la firma
          </label>
          {b.con_firma && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              Firma de esta plantilla (opcional)
              <EditorHtml
                valor={b.firma}
                alCambiar={(h) => setB((x) => (x ? { ...x, firma: h } : x))}
                conImagenes
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Si la dejas vacía, sale la firma de la cuenta con la que se
                envía. Puedes pegar aquí una firma de Gmail con su formato y sus
                imágenes.
              </span>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
