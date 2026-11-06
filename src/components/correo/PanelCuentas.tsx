"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import EditorHtml from "./EditorHtml";
import { PROVEEDORES, type CuentaDto, type Proveedor } from "@/lib/correo";

interface Borrador {
  id: number | null;
  nombre: string;
  email: string;
  proveedor: Proveedor;
  host: string;
  puerto: number;
  seguro: boolean;
  usuario_smtp: string;
  password: string;
  firma: string;
  limite_diario: number;
  activa: boolean;
  leer_respuestas: boolean;
  imap_host: string;
  imap_puerto: number;
  con_password: boolean;
}
/** Las firmas antiguas eran texto plano: se pasan a párrafos para el editor. */
const deTextoAHtml = (t: string): string =>
  t && !/<[a-z][\s\S]*>/i.test(t)
    ? t
        .split(/\r?\n/)
        .map((l) => `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
        .join("")
    : t;

const nueva = (): Borrador => ({
  id: null,
  nombre: "",
  email: "",
  proveedor: "gmail",
  host: PROVEEDORES.gmail.host,
  puerto: PROVEEDORES.gmail.puerto,
  seguro: PROVEEDORES.gmail.seguro,
  usuario_smtp: "",
  password: "",
  firma: "",
  limite_diario: 200,
  activa: true,
  leer_respuestas: false,
  imap_host: "",
  imap_puerto: 993,
  con_password: false,
});

/** Mis cuentas de correo para enviar (la contraseña se guarda cifrada y no se vuelve a mostrar). */
export default function PanelCuentas() {
  const { mostrar, confirmar } = useToast();
  const [cuentas, setCuentas] = useState<CuentaDto[] | null>(null);
  const [b, setB] = useState<Borrador | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(() => {
    llamar<CuentaDto[]>("/api/correo/cuentas")
      .then((r) => setCuentas(r.data))
      .catch((e: unknown) => mostrar(textoError(e), "error"));
  }, [mostrar]);
  const [revision, setRevision] = useState<
    Record<number, { ultima: string | null; error: string | null }>
  >({});
  const cargarRevision = useCallback(() => {
    llamar<Record<number, { ultima: string | null; error: string | null }>>(
      "/api/correo/respuestas",
    )
      .then((x) => setRevision(x.data))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    cargarRevision();
  }, [cargar, cargarRevision]);
  const revisarAhora = async () => {
    setOcupado(true);
    try {
      const x = await llamar<{
        cuentas: number;
        mensajes: number;
        bajas: number;
        respuestas: number;
        errores: string[];
      }>("/api/correo/respuestas", { method: "POST", cuerpo: {} });
      if (x.data.errores.length > 0) mostrar(x.data.errores[0], "error", 9000);
      else
        mostrar(
          x.data.cuentas === 0
            ? "No hay cuentas con la lectura de respuestas activada, o todavía no has escrito a ningún cliente potencial."
            : `Buzón revisado: ${x.data.mensajes} respuestas nuevas, ${x.data.bajas} bajas.`,
        );
      cargarRevision();
    } catch (e) {
      mostrar(textoError(e), "error", 9000);
    } finally {
      setOcupado(false);
    }
  };

  const guardar = async () => {
    if (!b) return;
    setOcupado(true);
    try {
      const { id, con_password, ...cuerpo } = b;
      void con_password;
      await llamar(`/api/correo/cuentas${id ? `?id=${id}` : ""}`, {
        method: id ? "PUT" : "POST",
        cuerpo,
      });
      setB(null);
      cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };
  const probar = async (c: CuentaDto) => {
    const destino = window.prompt(
      "¿A qué dirección envío la prueba? (vacío = a la propia cuenta)",
      "",
    );
    if (destino === null) return;
    setOcupado(true);
    try {
      const r = await llamar<{ mensaje: string }>(
        `/api/correo/cuentas?id=${c.id}`,
        { method: "PATCH", cuerpo: { destino: destino.trim() || undefined } },
      );
      mostrar(r.data.mensaje);
    } catch (e) {
      mostrar(textoError(e), "error", 9000);
    } finally {
      setOcupado(false);
    }
  };
  const elegirProveedor = (p: Proveedor) =>
    setB((x) =>
      x
        ? {
            ...x,
            proveedor: p,
            ...(p === "otro"
              ? {}
              : {
                  host: PROVEEDORES[p].host,
                  puerto: PROVEEDORES[p].puerto,
                  seguro: PROVEEDORES[p].seguro,
                }),
          }
        : x,
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <p
        style={{
          margin: 0,
          color: "var(--text-secondary)",
          fontSize: "0.9rem",
        }}
      >
        Las cuentas desde las que se envían los correos (solo envío, no se lee
        nada). Puedes tener todas las que quieras.
      </p>
      <div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setB(nueva())}
        >
          ＋ Añadir cuenta
        </button>
      </div>
      {cuentas?.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          Todavía no hay ninguna cuenta.
        </p>
      )}
      {cuentas?.map((c) => (
        <div
          key={c.id}
          className="glass-panel"
          style={{
            padding: "10px 14px",
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
            opacity: c.activa ? 1 : 0.6,
          }}
        >
          <div style={{ flex: 1, minWidth: "220px" }}>
            <strong>{c.nombre}</strong>{" "}
            <span style={{ color: "var(--text-secondary)" }}>· {c.email}</span>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {PROVEEDORES[c.proveedor].nombre} · {c.host}:{c.puerto} · hoy{" "}
              {c.enviados_hoy}
              {c.limite_diario > 0 ? ` de ${c.limite_diario}` : ""} correos
              {c.activa ? "" : " · desactivada"}
            </div>
            {c.leer_respuestas && (
              <div
                style={{
                  fontSize: "0.78rem",
                  color: revision[c.id]?.error
                    ? "var(--danger)"
                    : "var(--text-muted)",
                }}
              >
                👁️ Lee las respuestas de potenciales (solo lectura)
                {revision[c.id]?.error
                  ? ` · ⚠️ ${revision[c.id].error}`
                  : revision[c.id]?.ultima
                    ? ` · revisado a las ${new Date(revision[c.id].ultima as string).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`
                    : " · todavía sin revisar"}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={ocupado}
            onClick={() => void probar(c)}
            style={{ padding: "3px 10px", fontSize: "0.82rem" }}
          >
            ✉️ Enviar prueba
          </button>
          {c.leer_respuestas && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={ocupado}
              onClick={() => void revisarAhora()}
              title="Mira ahora si ha llegado alguna respuesta (solo lectura)"
              style={{ padding: "3px 10px", fontSize: "0.82rem" }}
            >
              👁️ Revisar respuestas
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setB({ ...c, password: "" })}
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
                  titulo: "Quitar la cuenta",
                  texto: `¿Quitar «${c.nombre}»? Los correos ya enviados se conservan en el histórico.`,
                  aceptar: "Quitar",
                  peligro: true,
                }))
              )
                return;
              try {
                await llamar(`/api/correo/cuentas?id=${c.id}`, {
                  method: "DELETE",
                });
                cargar();
              } catch (e) {
                mostrar(textoError(e), "error");
              }
            }}
          >
            🗑️
          </button>
        </div>
      ))}
      {b && (
        <Modal
          titulo={b.id ? "Editar la cuenta" : "Nueva cuenta de correo"}
          ancho="min(calc(96 * var(--uvw)), 620px)"
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
                {ocupado ? "Guardando…" : "Guardar"}
              </button>
            </>
          }
        >
          <span data-sin-enter hidden />
          <label
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            Proveedor
            <select
              className="form-input"
              value={b.proveedor}
              onChange={(e) => elegirProveedor(e.target.value as Proveedor)}
            >
              {(Object.keys(PROVEEDORES) as Proveedor[]).map((p) => (
                <option key={p} value={p}>
                  {PROVEEDORES[p].nombre}
                </option>
              ))}
            </select>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              {PROVEEDORES[b.proveedor].ayuda}
            </span>
          </label>
          <label
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            Nombre de la cuenta (para reconocerla)
            <input
              className="form-input"
              value={b.nombre}
              onChange={(e) => setB({ ...b, nombre: e.target.value })}
              placeholder="Ej. Mi correo del concesionario"
            />
          </label>
          <label
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            Correo (de quién salen los mensajes)
            <input
              className="form-input"
              type="email"
              value={b.email}
              onChange={(e) =>
                setB({
                  ...b,
                  email: e.target.value,
                  usuario_smtp: b.usuario_smtp || e.target.value,
                })
              }
            />
          </label>
          <label
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            Usuario del servidor (normalmente, el mismo correo)
            <input
              className="form-input"
              value={b.usuario_smtp}
              onChange={(e) => setB({ ...b, usuario_smtp: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            Contraseña{" "}
            {b.id && b.con_password
              ? "(déjala vacía para conservar la actual)"
              : ""}
            <input
              className="form-input"
              type="password"
              value={b.password}
              onChange={(e) => setB({ ...b, password: e.target.value })}
              autoComplete="new-password"
            />
          </label>
          {b.proveedor === "otro" && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  flex: 1,
                  minWidth: "200px",
                }}
              >
                Servidor de salida (SMTP)
                <input
                  className="form-input"
                  value={b.host}
                  onChange={(e) => setB({ ...b, host: e.target.value })}
                  placeholder="smtp.tuproveedor.com"
                />
              </label>
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  width: "100px",
                }}
              >
                Puerto
                <input
                  className="form-input"
                  type="number"
                  value={b.puerto}
                  onChange={(e) =>
                    setB({ ...b, puerto: Number(e.target.value) || 587 })
                  }
                />
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  alignSelf: "flex-end",
                }}
              >
                <input
                  type="checkbox"
                  checked={b.seguro}
                  onChange={(e) => setB({ ...b, seguro: e.target.checked })}
                />{" "}
                Conexión segura directa (puerto 465)
              </label>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            Firma (sale con el campo {"{firma}"} de las plantillas)
            <EditorHtml
              valor={deTextoAHtml(b.firma)}
              alCambiar={(h) => setB((x) => (x ? { ...x, firma: h } : x))}
              conImagenes
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Copia tu firma de Gmail (o de Outlook) y pégala aquí: se conservan
              el formato, los colores, los enlaces, las tablas y las imágenes.
              También puedes subir una imagen o poner su dirección web.
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              padding: "8px 10px",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <label
              style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}
            >
              <input
                type="checkbox"
                checked={b.leer_respuestas}
                onChange={(e) =>
                  setB({ ...b, leer_respuestas: e.target.checked })
                }
              />
              <span>
                <strong>Leer las respuestas de los clientes potenciales</strong>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.78rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  Solo lectura y solo de las personas a las que escribes desde
                  Potenciales: si alguien responde «BAJA», se le da de baja; lo
                  demás se guarda en su ficha y te avisa. No se abre nada más de
                  tu buzón. En Gmail tiene que estar activado IMAP (Ajustes →
                  Reenvío y correo POP/IMAP) y se usa la misma contraseña de
                  aplicación.
                </span>
              </span>
            </label>
            {b.leer_respuestas && (b.proveedor === "otro" || b.imap_host) && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    flex: 1,
                    minWidth: "200px",
                  }}
                >
                  Servidor de entrada (IMAP)
                  <input
                    className="form-input"
                    value={b.imap_host}
                    onChange={(e) => setB({ ...b, imap_host: e.target.value })}
                    placeholder="imap.tuproveedor.com (vacío = el habitual)"
                  />
                </label>
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    width: "100px",
                  }}
                >
                  Puerto
                  <input
                    className="form-input"
                    type="number"
                    value={b.imap_puerto}
                    onChange={(e) =>
                      setB({ ...b, imap_puerto: Number(e.target.value) || 993 })
                    }
                  />
                </label>
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              gap: "16px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
              title="Para que el proveedor no bloquee la cuenta. 0 = sin límite"
            >
              Máximo de correos al día
              <input
                className="form-input"
                type="number"
                min={0}
                value={b.limite_diario}
                onChange={(e) =>
                  setB({
                    ...b,
                    limite_diario: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                style={{ width: "90px" }}
              />
            </label>
            <label
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <input
                type="checkbox"
                checked={b.activa}
                onChange={(e) => setB({ ...b, activa: e.target.checked })}
              />{" "}
              Activa
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
