"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useCarga } from "@/components/comisiones/useCarga";
import { PALETA_POR_DEFECTO } from "@/lib/paletas-colores";
import type { PaletaDto } from "@/lib/servicios/paletas";

interface Listado {
  paletas: PaletaDto[];
}

async function enviar(metodo: string, cuerpo?: unknown, url = "/api/admin/paletas"): Promise<{ data?: unknown; avisos?: string[] }> {
  const r = await fetch(url, { method: metodo, credentials: "same-origin", ...(cuerpo !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) } : {}) });
  const j = (await r.json().catch(() => ({}))) as { message?: string; data?: unknown; avisos?: string[] };
  if (!r.ok) throw new Error(j.message ?? `Error ${r.status}`);
  return j;
}

const descargar = (url: string) => {
  const a = document.createElement("a");
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/** «Paletas de colores»: guardar, aplicar, exportar e importar los colores de los pagos (botones de creación rápida), marcas y estados. */
export default function PanelPaletas({ alCerrar }: { alCerrar: () => void }) {
  const { mostrar, confirmar } = useToast();
  const router = useRouter();
  const { datos, recargar } = useCarga<Listado | null>("/api/admin/paletas", null);
  const [nombre, setNombre] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<{ id: number; nombre: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const ejecutar = async (f: () => Promise<void>) => {
    setOcupado(true);
    try {
      await f();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "No se ha podido completar la acción.", "error");
    } finally {
      setOcupado(false);
    }
  };

  const textoResultado = (r: { tiposVenta: number; marcas: number; estados: number; sinCoincidencia: string[] }) =>
    `Paleta aplicada: ${r.tiposVenta} pago(s), ${r.marcas} marca(s) y ${r.estados} estado(s).${r.sinCoincidencia.length > 0 ? ` Sin coincidencia en esta instalación: ${r.sinCoincidencia.slice(0, 4).join(", ")}${r.sinCoincidencia.length > 4 ? "…" : ""}.` : ""}`;

  const aplicar = (cuerpo: { id?: number; defecto?: boolean }, descripcion: string) =>
    ejecutar(async () => {
      if (!(await confirmar({ texto: `¿Aplico ${descripcion}? Cambia los colores de los botones de creación rápida, marcas y estados que tengan el mismo nombre.` }))) return;
      const r = await enviar("POST", { accion: "aplicar", ...cuerpo });
      mostrar(textoResultado(r.data as { tiposVenta: number; marcas: number; estados: number; sinCoincidencia: string[] }));
      router.refresh();
    });

  const guardarActuales = () =>
    ejecutar(async () => {
      const n = nombre.trim();
      if (!n) return mostrar("Pon un nombre a la paleta para guardarla.", "aviso");
      const existe = datos?.paletas.some((p) => p.nombre.toLowerCase() === n.toLowerCase());
      if (existe && !(await confirmar({ texto: `Ya hay una paleta que se llama «${n}». ¿La sustituyo por los colores de ahora?` }))) return;
      await enviar("POST", { accion: "guardar_actuales", nombre: n, sustituir: !!existe });
      mostrar(`Paleta «${n}» guardada con los colores de ahora.`);
      setNombre("");
      recargar();
    });

  const importar = (archivos: FileList | null) =>
    ejecutar(async () => {
      const archivo = archivos?.[0];
      if (!archivo) return;
      const contenido = await archivo.text();
      let r: Awaited<ReturnType<typeof enviar>>;
      try {
        r = await enviar("POST", { accion: "importar", contenido });
      } catch (e) {
        // Mismo nombre que otra paleta: se pregunta si se sustituye
        if (e instanceof Error && /Ya hay una paleta/.test(e.message) && (await confirmar({ texto: `${e.message} ¿La sustituyo por la del archivo?` }))) r = await enviar("POST", { accion: "importar", contenido, sustituir: true });
        else throw e;
      }
      mostrar(`Paleta «${(r.data as PaletaDto).nombre}» importada.${(r.avisos ?? []).length > 0 ? ` ${(r.avisos ?? []).join(" ")}` : ""}`, (r.avisos ?? []).length > 0 ? "aviso" : "exito");
      recargar();
      if (entrada.current) entrada.current.value = "";
    });

  const borrar = (p: PaletaDto) =>
    ejecutar(async () => {
      if (!(await confirmar({ texto: `¿Borro la paleta «${p.nombre}»? Los colores que ya tengas puestos no cambian.`, peligro: true }))) return;
      await enviar("DELETE", undefined, `/api/admin/paletas?id=${p.id}`);
      mostrar("Paleta borrada.");
      recargar();
    });

  const renombrar = () =>
    ejecutar(async () => {
      if (!editando) return;
      await enviar("PATCH", { id: editando.id, nombre: editando.nombre });
      setEditando(null);
      recargar();
    });

  const muestra = PALETA_POR_DEFECTO.tiposVenta;
  const tarjeta = { border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "10px 12px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" } as const;
  const boton = { padding: "5px 12px", fontSize: "0.82rem" } as const;

  return (
    <Modal
      titulo="🎨 Paletas de colores"
      ancho="820px"
      pie={
        <button type="button" className="btn btn-secondary" onClick={alCerrar}>
          Cerrar
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "0.9rem" }}>
        <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Una paleta guarda los colores de los pagos (los botones de creación rápida de expedientes), de las marcas y de los estados, por nombre. Puedes guardar los de ahora, cambiar de una a otra, exportarlas a un archivo y llevarlas a otra instalación o versión de la aplicación.
        </div>

        <div style={{ ...tarjeta, background: "rgba(255, 255, 255, 0.03)" }}>
          <div style={{ flex: 1, minWidth: "220px" }}>
            <b>Por defecto</b>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>La paleta de siempre: los pagos en rojo, ámbar y azul, y marcas y estados sin color.</div>
            <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
              {muestra.map((t) => (
                <span key={t.nombre} style={{ background: t.color ?? undefined, color: "#fff", padding: "2px 10px", borderRadius: "4px", fontSize: "0.78rem", fontWeight: 600 }}>
                  {t.nombre}
                </span>
              ))}
            </div>
          </div>
          <button type="button" className="btn btn-primary" style={boton} disabled={ocupado} onClick={() => void aplicar({ defecto: true }, "la paleta por defecto")}>
            Aplicar
          </button>
          <button type="button" className="btn btn-secondary" style={boton} onClick={() => descargar("/api/admin/paletas?exportar=1&defecto=1")}>
            ⬇️ Exportar
          </button>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la paleta nueva…" style={{ flex: 1, minWidth: "200px", padding: "6px 10px" }} maxLength={120} />
          <button type="button" className="btn btn-primary" style={boton} disabled={ocupado} onClick={() => void guardarActuales()} title="Guarda los colores que hay ahora en la aplicación como una paleta">
            💾 Guardar los colores de ahora
          </button>
          <button type="button" className="btn btn-secondary" style={boton} onClick={() => descargar("/api/admin/paletas?exportar=1&actuales=1")} title="Descarga los colores de ahora en un archivo, sin guardarlos como paleta">
            ⬇️ Exportar los de ahora
          </button>
          <button type="button" className="btn btn-secondary" style={boton} disabled={ocupado} onClick={() => entrada.current?.click()} title="Carga una paleta desde un archivo exportado antes (de esta u otra versión de la aplicación)">
            📥 Importar archivo
          </button>
          <input ref={entrada} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => void importar(e.target.files)} />
        </div>

        <b>Mis paletas</b>
        {datos === null ? (
          <div style={{ color: "var(--text-muted)" }}>Cargando…</div>
        ) : datos.paletas.length === 0 ? (
          <div style={{ color: "var(--text-muted)" }}>Todavía no has guardado ninguna. Pon los colores como los quieras y pulsa «Guardar los colores de ahora».</div>
        ) : (
          datos.paletas.map((p) => (
            <div key={p.id} style={tarjeta}>
              <div style={{ flex: 1, minWidth: "200px" }}>
                {editando?.id === p.id ? (
                  <input className="form-input" value={editando.nombre} autoFocus onChange={(e) => setEditando({ id: p.id, nombre: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void renombrar(); if (e.key === "Escape") setEditando(null); }} style={{ padding: "4px 8px" }} />
                ) : (
                  <>
                    <b>{p.nombre}</b>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                      {p.elementos} elemento(s) · guardada el {new Date(p.actualizadaEn).toLocaleDateString("es-ES")}
                    </div>
                  </>
                )}
              </div>
              {editando?.id === p.id ? (
                <>
                  <button type="button" className="btn btn-primary" style={boton} onClick={() => void renombrar()}>
                    Guardar
                  </button>
                  <button type="button" className="btn btn-secondary" style={boton} onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" style={boton} disabled={ocupado} onClick={() => void aplicar({ id: p.id }, `la paleta «${p.nombre}»`)}>
                    Aplicar
                  </button>
                  <button type="button" className="btn btn-secondary" style={boton} onClick={() => descargar(`/api/admin/paletas?exportar=1&id=${p.id}`)} title="Descarga la paleta en un archivo">
                    ⬇️ Exportar
                  </button>
                  <button type="button" className="btn btn-secondary" style={boton} onClick={() => setEditando({ id: p.id, nombre: p.nombre })} title="Cambia el nombre">
                    ✏️
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ ...boton, color: "var(--danger)" }} disabled={ocupado} onClick={() => void borrar(p)} title="Borra la paleta">
                    🗑️
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
