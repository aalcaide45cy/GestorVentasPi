"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import type { AjustesCopias, CopiaDto, EstadoCopias } from "@/lib/servicios/copias";
import type { EstadoDrive } from "@/lib/servicios/drive";

interface Datos {
  copias: CopiaDto[];
  estado: EstadoCopias | null;
  ajustes: AjustesCopias | null;
  drive: EstadoDrive | null;
}

const VACIO: Datos = { copias: [], estado: null, ajustes: null, drive: null };

const tamanoLegible = (b: number): string => (b >= 1048576 ? `${(b / 1048576).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024)).toLocaleString("es-ES")} KB`);
const fechaLegible = (iso: string): string => new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });

/** «Copias de seguridad»: copias completas .dump, descarga, subida, restauración y Google Drive (13.3 y 13.4). */
export default function PanelCopias() {
  const router = useRouter();
  const { mostrar } = useToast();
  const { datos, recargar } = useCarga<Datos>("/api/admin/copias", VACIO);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [restaurar, setRestaurar] = useState<CopiaDto | null>(null);
  const [form, setForm] = useState({ password: "", codigo: "", confirmacion: "" });
  const [edicion, setEdicion] = useState<Partial<AjustesCopias>>({});
  const ajustes: AjustesCopias | null = datos.ajustes ? { ...datos.ajustes, ...edicion } : null;

  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("drive");
    if (d === "ok") mostrar("Google Drive conectado correctamente.");
    else if (d === "error") mostrar("No se pudo conectar con Google Drive.", "error");
    else if (d === "cancelado") mostrar("Conexión con Google Drive cancelada.", "aviso");
  }, [mostrar]);

  const accion = async (nombre: string, fn: () => Promise<string | void>) => {
    setTrabajando(nombre);
    try {
      const msg = await fn();
      if (msg) mostrar(msg);
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setTrabajando(null);
    }
  };

  const crear = (drive: boolean) =>
    accion("crear", async () => {
      const { extra } = await llamar(`/api/admin/copias${drive ? "?drive=1" : ""}`, { method: "POST" });
      return typeof extra.aviso === "string" && extra.aviso ? extra.aviso : "Copia creada correctamente.";
    });

  const subirDrive = (c: CopiaDto) =>
    accion(`drive${c.id}`, async () => {
      await llamar("/api/admin/drive/subir", { method: "POST", cuerpo: { id: c.id } });
      return "Copia subida a Google Drive.";
    });

  const borrar = (c: CopiaDto) => {
    if (!window.confirm(`¿Borrar la copia ${c.nombre}? ${c.enDrive ? "También se borrará de Google Drive." : ""}`)) return;
    void accion(`borrar${c.id}`, async () => {
      const { extra } = await llamar(`/api/admin/copias?id=${c.id}`, { method: "DELETE" });
      return typeof extra.aviso === "string" && extra.aviso ? extra.aviso : "Copia borrada.";
    });
  };

  const borrarInvalidas = () => {
    if (!window.confirm(`Se van a borrar ${estado?.invalidas ?? 0} copia(s) vacías o rotas. No sirven para restaurar nada, así que no se pierde ninguna copia útil. ¿Continuar?`)) return;
    void accion("invalidas", async () => {
      const { extra } = await llamar("/api/admin/copias?invalidas=1", { method: "DELETE" });
      return typeof extra.aviso === "string" && extra.aviso ? extra.aviso : `Copias inválidas borradas (${String(extra.borradas ?? 0)}).`;
    });
  };

  const subirFichero = (f: File | null) => {
    if (!f) return;
    void accion("subir", async () => {
      const r = await fetch("/api/admin/copias/subir", { method: "POST", headers: { "x-nombre-fichero": encodeURIComponent(f.name), "Content-Type": "application/octet-stream" }, body: f });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? "No se pudo subir el fichero");
      return "Fichero subido. Ya aparece en la lista; pulsa «Restaurar» para usarlo.";
    });
  };

  const confirmarRestaurar = () =>
    accion("restaurar", async () => {
      if (!restaurar) return;
      await llamar("/api/admin/copias/restaurar", { method: "POST", cuerpo: { id: restaurar.id, ...form } });
      setRestaurar(null);
      setForm({ password: "", codigo: "", confirmacion: "" });
      mostrar("Copia restaurada. Vuelve a iniciar sesión.");
      setTimeout(() => router.push("/login"), 1500);
    });

  const guardarAjustes = () =>
    accion("ajustes", async () => {
      if (!ajustes) return;
      await llamar("/api/admin/copias/ajustes", { method: "PUT", cuerpo: ajustes });
      setEdicion({});
      return "Ajustes de copias guardados.";
    });

  const conectarDrive = () =>
    accion("conectar", async () => {
      const { data } = await llamar<{ url: string }>("/api/admin/drive/conectar");
      window.location.href = data.url;
    });

  const desconectarDrive = () => {
    if (!window.confirm("¿Desconectar Google Drive? Las copias ya subidas no se borran.")) return;
    void accion("desconectar", async () => {
      await llamar("/api/admin/drive/estado", { method: "DELETE" });
      return "Google Drive desconectado.";
    });
  };

  const drive = datos.drive;
  const estado = datos.estado;
  const campoAjuste = <K extends keyof AjustesCopias>(k: K, v: AjustesCopias[K]) => setEdicion((a) => ({ ...a, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <h3 style={{ fontSize: "1.2rem" }}>💾 Copias de seguridad</h3>
      <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.9rem" }}>
        Copia completa de la base de datos (.dump de PostgreSQL). Si algo falla, reinstala la aplicación y restaura la última copia. Guarda también el fichero .env (o al menos APP_SECRET): sin él no se puede descifrar el 2FA.
      </p>

      {estado && !estado.pgDisponible && (
        <div role="alert" style={{ padding: "12px 16px", borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.08)", borderRadius: "var(--radius-sm)", color: "var(--danger)" }}>
          🛑 <b>No se pueden hacer copias de seguridad en este equipo.</b> {estado.pgDetalle}
        </div>
      )}
      {estado && estado.pgDisponible && (
        <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
          ✔ Herramienta de copias encontrada: {estado.pgDetalle}.{" "}
          {estado.ultimaValida ? `Última copia válida: hace ${estado.ultimaValida.minutos < 90 ? `${estado.ultimaValida.minutos} min` : `${Math.round(estado.ultimaValida.minutos / 60)} h`}.` : "Todavía no hay ninguna copia válida."}
        </div>
      )}
      {estado && estado.invalidas > 0 && (
        <div role="alert" style={{ padding: "12px 16px", borderLeft: "4px solid var(--warning)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <span>
            ⚠️ Hay <b>{estado.invalidas}</b> copia(s) vacías o rotas (se hicieron cuando no funcionaba pg_dump). No sirven para restaurar.
          </span>
          <button type="button" className="btn btn-secondary" disabled={trabajando !== null} onClick={borrarInvalidas} title="Borra del servidor solo las copias vacías o rotas. Las copias válidas no se tocan.">
            🗑️ Borrar las copias inválidas
          </button>
        </div>
      )}
      {estado?.avisoAntigua && (
        <div style={{ padding: "12px 16px", borderLeft: "4px solid var(--warning)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)" }}>
          ⚠️ No hay ninguna copia automática VÁLIDA de las últimas 48 horas.{estado.ultimoError ? ` Último error: ${estado.ultimoError}` : ""}
        </div>
      )}
      {!estado?.avisoAntigua && estado?.ultimoError && <div style={{ color: "var(--warning)" }}>⚠️ {estado.ultimoError}</div>}

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-primary" disabled={trabajando !== null} onClick={() => crear(false)} title="Hace ahora una copia completa de toda la aplicación (clientes, expedientes, planes, usuarios, ajustes…). Se comprueba que sea legible antes de darla por buena. Úsala antes de cambios importantes o de duplicar muchos expedientes.">
          {trabajando === "crear" ? "Creando copia…" : "Crear copia ahora"}
        </button>
        {drive?.conectado && !drive.requiereReconexion && (
          <button type="button" className="btn btn-secondary" disabled={trabajando !== null} onClick={() => crear(true)}>
            Crear y subir a Google Drive
          </button>
        )}
        <label className="btn btn-secondary" style={{ cursor: "pointer" }} title="Sube al servidor un archivo .dump que tengas guardado (por ejemplo descargado de otra instalación). Se comprueba que sea válido; después podrás restaurarlo desde la lista.">
          Subir un .dump…
          <input type="file" accept=".dump" style={{ display: "none" }} onChange={(e) => subirFichero(e.target.files?.[0] ?? null)} />
        </label>
        <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          {estado?.ultima ? `Última copia: ${fechaLegible(estado.ultima.creadaEn)} · ${tamanoLegible(estado.ultima.tamano)}${estado.ultima.enDrive ? " · en Drive" : ""}` : "Todavía no hay copias."}
        </span>
      </div>

      <div className="table-container">
        <table className="table-premium table-compact">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Fecha</th>
              <th style={{ textAlign: "right" }}>Tamaño</th>
              <th>SHA-256</th>
              <th>Drive</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {datos.copias.map((c) => (
              <tr key={c.id} style={{ opacity: c.archivoPresente ? 1 : 0.55, background: c.estado !== "ok" ? "rgba(239, 68, 68, 0.06)" : undefined }}>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                  {c.nombre}
                  {c.estado !== "ok" && (
                    <div style={{ color: "var(--danger)", fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 700 }} title={c.error ?? "Copia no válida"}>
                      ⚠ INVÁLIDA: {c.error ?? "no sirve para restaurar"}
                    </div>
                  )}
                </td>
                <td>{c.tipo}</td>
                <td>{fechaLegible(c.creadaEn)}</td>
                <td style={{ textAlign: "right" }}>{tamanoLegible(c.tamano)}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }} title={c.sha256}>
                  {c.sha256.slice(0, 10)}…
                </td>
                <td>{c.enDrive ? "☁️" : "—"}</td>
                <td style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {c.archivoPresente && c.estado === "ok" ? (
                    <>
                      <a className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} href={`/api/admin/copias/descargar?id=${c.id}`} title="Descarga este archivo .dump a tu equipo para guardarlo fuera del servidor (recomendado: una copia fuera de la Raspberry o del PC).">
                        Descargar
                      </a>
                      {drive?.conectado && !drive.requiereReconexion && !c.enDrive && (
                        <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} disabled={trabajando !== null} onClick={() => subirDrive(c)} title="Sube esta copia a tu Google Drive para tener una segunda copia en la nube.">
                          {trabajando === `drive${c.id}` ? "Subiendo…" : "Subir a Drive"}
                        </button>
                      )}
                      <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setRestaurar(c)} title="Devuelve TODA la aplicación al estado de esta copia (se pierde lo hecho después). Antes se guarda una copia automática del estado actual. Pide contraseña y doble factor.">
                        Restaurar
                      </button>
                    </>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>{c.estado !== "ok" ? "no se puede usar" : "fichero no encontrado"}</span>
                  )}
                  <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem", color: "var(--danger)" }} onClick={() => borrar(c)} title="Borra esta copia del servidor (y de Google Drive si estaba subida). No se puede deshacer.">
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
            {datos.copias.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: "var(--text-muted)" }}>
                  No hay copias todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {ajustes && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
          <h4>Copia automática y retención</h4>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input type="checkbox" checked={ajustes.automatica} onChange={(e) => campoAjuste("automatica", e.target.checked)} /> Copia automática diaria
            </label>
            <div>
              <label className="form-label">Hora</label>
              <input className="form-input" type="time" value={ajustes.hora} onChange={(e) => campoAjuste("hora", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Diarias</label>
              <input className="form-input" type="number" min={1} style={{ width: "80px" }} value={ajustes.retDiarias} onChange={(e) => campoAjuste("retDiarias", Number(e.target.value))} />
            </div>
            <div>
              <label className="form-label">Semanales</label>
              <input className="form-input" type="number" min={0} style={{ width: "80px" }} value={ajustes.retSemanales} onChange={(e) => campoAjuste("retSemanales", Number(e.target.value))} />
            </div>
            <div>
              <label className="form-label">Mensuales</label>
              <input className="form-input" type="number" min={0} style={{ width: "80px" }} value={ajustes.retMensuales} onChange={(e) => campoAjuste("retMensuales", Number(e.target.value))} />
            </div>
            <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <input type="checkbox" checked={ajustes.driveAutomatica} onChange={(e) => campoAjuste("driveAutomatica", e.target.checked)} /> Subir a Drive automáticamente
            </label>
            <button type="button" className="btn btn-secondary" disabled={trabajando !== null} onClick={guardarAjustes}>
              Guardar ajustes
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
        <h4>☁️ Google Drive</h4>
        {drive && !drive.configurado && (
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Falta configurar GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y PUBLIC_URL en el fichero .env (la guía de instalación explica cómo crearlos en Google Cloud). Sin Drive todo sigue funcionando: descarga las copias desde aquí.
          </p>
        )}
        {drive?.configurado && !drive.conectado && (
          <div>
            <button type="button" className="btn btn-primary" disabled={trabajando !== null} onClick={conectarDrive}>
              Conectar con Google Drive
            </button>
          </div>
        )}
        {drive?.conectado && (
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <span>{drive.requiereReconexion ? "⚠️ El permiso ha caducado o se ha revocado." : `✔ Conectado${drive.email ? ` como ${drive.email}` : ""}.`}</span>
            {drive.requiereReconexion && (
              <button type="button" className="btn btn-primary" disabled={trabajando !== null} onClick={conectarDrive}>
                Reconectar con Google Drive
              </button>
            )}
            <button type="button" className="btn btn-secondary" disabled={trabajando !== null} onClick={desconectarDrive}>
              Desconectar
            </button>
          </div>
        )}
      </div>

      {restaurar && (
        <Modal
          titulo="⚠️ Restaurar copia de seguridad"
          peligro
          ancho="520px"
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setRestaurar(null)} disabled={trabajando !== null}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" disabled={trabajando !== null || form.confirmacion !== "RESTAURAR" || !form.password || !form.codigo} onClick={confirmarRestaurar}>
                {trabajando === "restaurar" ? "Restaurando…" : "Restaurar"}
              </button>
            </>
          }
        >
          <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Se sustituirán <b>todos los datos actuales</b> por los de <code>{restaurar.nombre}</code>. Antes se hará una copia previa automática y, al terminar, todas las sesiones se cerrarán.
          </p>
          <div className="form-group">
            <label className="form-label">Tu contraseña</label>
            <input className="form-input" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Código de doble factor (o de recuperación)</label>
            <input className="form-input" inputMode="numeric" autoComplete="one-time-code" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Escribe RESTAURAR para confirmar</label>
            <input className="form-input" value={form.confirmacion} onChange={(e) => setForm({ ...form, confirmacion: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  );
}
