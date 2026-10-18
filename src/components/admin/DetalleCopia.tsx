"use client";

import Modal from "@/components/Modal";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { useCarga } from "@/components/comisiones/useCarga";
import type { CopiaDto } from "@/lib/servicios/copias";
import type { DetalleCopia, TablaDeCopia } from "@/lib/servicios/copias-detalle";

const tamano = (b: number): string => (b >= 1073741824 ? `${(b / 1073741824).toLocaleString("es-ES", { maximumFractionDigits: 2 })} GB` : b >= 1048576 ? `${(b / 1048576).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB` : b >= 1024 ? `${(b / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} KB` : `${b} B`);
const porcentaje = (parte: number, total: number): string => (total <= 0 ? "—" : `${((parte * 100) / total).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`);
const fechaHora = (iso: string): string => new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });

const VACIO: DetalleCopia | null = null;

const COLORES = ["var(--primary)", "var(--secondary)", "var(--warning)", "var(--success)", "#a78bfa", "#f472b6", "#38bdf8", "var(--text-muted)"];

function Dato({ etiqueta, children, ayuda }: { etiqueta: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <div title={ayuda} style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
      <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{etiqueta}</span>
      <span style={{ fontSize: "0.9rem", fontWeight: 600, overflowWrap: "anywhere" }}>{children}</span>
    </div>
  );
}

/** Detalle de una copia de seguridad: de qué está hecha y en qué se va su tamaño. */
export default function ModalDetalleCopia({ copia, alCerrar }: { copia: CopiaDto; alCerrar: () => void }) {
  const { datos: d } = useCarga<DetalleCopia | null>(`/api/admin/copias/detalle?id=${copia.id}`, VACIO);

  const columnasTablas: ColumnaTabla<TablaDeCopia>[] = [
    { clave: "tabla", etiqueta: "Tabla", valor: (t) => t.tabla, celda: (t) => <span style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{t.tabla}</span>, ayuda: "Nombre de la tabla de la base de datos" },
    { clave: "que", etiqueta: "Qué guarda", valor: (t) => t.descripcion, celda: (t) => <span style={{ whiteSpace: "normal", fontSize: "0.82rem" }}>{t.descripcion}</span>, ayuda: "Para qué sirve esta tabla" },
    { clave: "grupo", etiqueta: "Grupo", valor: (t) => t.grupo, ayuda: "Grupo de tablas parecidas" },
    { clave: "bytes", etiqueta: "En la copia", valor: (t) => t.bytes, celda: (t) => <strong>{tamano(t.bytes)}</strong>, alinear: "right", ayuda: "Lo que ocupan sus datos dentro del archivo de la copia, ya comprimidos" },
    { clave: "pc", etiqueta: "% de la copia", valor: (t) => t.bytes, celda: (t) => porcentaje(t.bytes, d?.tamano ?? 0), alinear: "right", ayuda: "Parte del archivo que ocupa esta tabla" },
    { clave: "filas", etiqueta: "Filas ahora", valor: (t) => t.filasAhora ?? -1, celda: (t) => (t.filasAhora === null ? "—" : t.filasAhora.toLocaleString("es-ES")), alinear: "right", ayuda: "Filas que tiene ahora la tabla en la base de datos (la copia puede ser de otro momento)" },
  ];

  const sinVincular = d?.documentosAhora.filter((x) => x.situacion.startsWith("Sin vincular")).reduce((a, x) => a + x.bytes, 0) ?? 0;
  const totalDocumentos = d?.documentosAhora.reduce((a, x) => a + x.bytes, 0) ?? 0;
  const nSinVincular = d?.documentosAhora.filter((x) => x.situacion.startsWith("Sin vincular")).reduce((a, x) => a + x.cantidad, 0) ?? 0;

  return (
    <Modal
      titulo={`🔎 Detalle de la copia`}
      ancho="1000px"
      pie={
        <button type="button" className="btn btn-primary" onClick={alCerrar}>
          Cerrar
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "70vh", overflowY: "auto", paddingRight: "4px" }}>
        {!d && <p style={{ margin: 0, color: "var(--text-secondary)" }}>Leyendo el archivo de la copia… (si es muy grande, puede tardar unos segundos)</p>}
        {d && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px" }}>
              <Dato etiqueta="Archivo" ayuda="Nombre del archivo en el servidor">
                <span style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{d.nombre}</span>
              </Dato>
              <Dato etiqueta="Tamaño total" ayuda="Lo que ocupa el archivo en el disco">
                {tamano(d.tamano)} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({d.tamano.toLocaleString("es-ES")} bytes)</span>
              </Dato>
              <Dato etiqueta="Tipo">{copia.tipo}</Dato>
              <Dato etiqueta="Hecha el" ayuda="Fecha y hora de la copia (la que figura dentro del propio archivo)">
                {d.creadaEnArchivo ? fechaHora(d.creadaEnArchivo) : fechaHora(copia.creadaEn)}
              </Dato>
              <Dato etiqueta="Base de datos">{d.baseDeDatos ?? "—"}</Dato>
              <Dato etiqueta="PostgreSQL" ayuda="Versión del servidor de bases de datos al hacer la copia y de la herramienta que la hizo">
                {d.versionServidor ?? "—"}
              </Dato>
              <Dato etiqueta="Formato" ayuda="Formato personalizado de PostgreSQL (pg_dump -Fc): se restaura con pg_restore">
                .dump {d.formato} · compresión {d.compresion}
              </Dato>
              <Dato etiqueta="Contenido" ayuda="Partes en las que se divide el archivo: tablas con datos, índices, claves, vistas…">
                {d.tablasConDatos} tablas con datos · {d.partes} partes en total
              </Dato>
              <Dato etiqueta="Estructura y varios" ayuda="Lo que ocupa el archivo fuera de los datos de las tablas: cabecera, definición de tablas, índices y claves">
                {tamano(d.bytesEstructura)}
              </Dato>
              <Dato etiqueta="Google Drive">{copia.enDrive ? "☁️ Subida" : "No subida"}</Dato>
              <Dato etiqueta="Huella SHA-256" ayuda={copia.sha256}>
                <span style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{copia.sha256.slice(0, 16)}…</span>
              </Dato>
              <Dato etiqueta="Estado">{copia.estado === "ok" ? "✔ Válida" : `⚠ ${copia.error ?? "No válida"}`}</Dato>
            </div>
            {copia.notas && (
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                📝 {copia.notas}
              </div>
            )}

            <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <h4 style={{ margin: 0, fontSize: "1rem" }}>¿En qué se va el tamaño?</h4>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Es lo que ocupa cada parte dentro del archivo, ya comprimida (cifras reales del archivo, no estimaciones).
              </p>
              <div style={{ display: "flex", height: "18px", borderRadius: "999px", overflow: "hidden", border: "1px solid var(--border-light)" }} role="img" aria-label="Reparto del tamaño de la copia por grupos">
                {d.grupos.map((g, i) => (
                  <div key={g.grupo} title={`${g.grupo}: ${tamano(g.bytes)} (${porcentaje(g.bytes, d.tamano)})`} style={{ width: `${(g.bytes * 100) / d.tamano}%`, background: COLORES[i % COLORES.length], minWidth: g.bytes > 0 ? "2px" : 0 }} />
                ))}
                <div title={`Estructura y varios: ${tamano(d.bytesEstructura)}`} style={{ flex: 1, background: "var(--border-light)" }} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: "0.82rem" }}>
                {d.grupos.map((g, i) => (
                  <span key={g.grupo} title={`${g.tablas} tabla${g.tablas === 1 ? "" : "s"}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "999px", background: COLORES[i % COLORES.length] }} />
                    {g.grupo}: <strong>{tamano(g.bytes)}</strong> ({porcentaje(g.bytes, d.tamano)})
                  </span>
                ))}
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "999px", background: "var(--border-light)" }} />
                  Estructura y varios: <strong>{tamano(d.bytesEstructura)}</strong> ({porcentaje(d.bytesEstructura, d.tamano)})
                </span>
              </div>
              <TablaDatos<TablaDeCopia> id="detalle-copia-tablas" columnas={columnasTablas} filas={d.tablas} clave={(t) => t.tabla} compacta ordenInicial={{ clave: "bytes", asc: false }} placeholder="Buscar tabla…" pie={(fs) => ({ tabla: `${fs.length} tablas`, bytes: tamano(fs.reduce((a, t) => a + t.bytes, 0)) })} />
            </section>

            {d.documentosAhora.length > 0 && (
              <section style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "1rem" }}>Documentos adjuntos que hay ahora</h4>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  Los documentos (pedidos, DNI y fotos) suelen ser lo que más pesa. Estas cifras son las de ahora (la copia pudo hacerse en otro momento) y van sin comprimir.
                </p>
                {nSinVincular > 0 && sinVincular * 5 >= totalDocumentos && (
                  <div role="note" style={{ padding: "10px 14px", borderLeft: "4px solid var(--warning)", background: "var(--bg-card)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem" }}>
                    ⚠️ <b>{nSinVincular.toLocaleString("es-ES")}</b> documentos ({tamano(sinVincular)}, el {porcentaje(sinVincular, totalDocumentos)} de los documentos) se leyeron pero no se asociaron a ningún expediente ni cliente, y siguen guardados. Si ya no los necesitas, en Configuración › BBDD, «Analizar base de datos» (o la Papelera) te deja borrarlos; así las copias pesan mucho menos.
                  </div>
                )}
                <TablaDatos<DetalleCopia["documentosAhora"][number]>
                  id="detalle-copia-documentos"
                  columnas={[
                    { clave: "tipo", etiqueta: "Documento", valor: (x) => x.tipo },
                    { clave: "situacion", etiqueta: "Situación", valor: (x) => x.situacion, celda: (x) => <span style={{ whiteSpace: "normal" }}>{x.situacion}</span> },
                    { clave: "cantidad", etiqueta: "Cantidad", valor: (x) => x.cantidad, celda: (x) => x.cantidad.toLocaleString("es-ES"), alinear: "right" },
                    { clave: "bytes", etiqueta: "Tamaño", valor: (x) => x.bytes, celda: (x) => <strong>{tamano(x.bytes)}</strong>, alinear: "right" },
                    { clave: "mayor", etiqueta: "El mayor", valor: (x) => x.mayor, celda: (x) => tamano(x.mayor), alinear: "right", ayuda: "Tamaño del documento más grande de este grupo" },
                  ]}
                  filas={d.documentosAhora}
                  clave={(x) => `${x.tipo}|${x.situacion}`}
                  compacta
                  ordenInicial={{ clave: "bytes", asc: false }}
                  pie={(fs) => ({ tipo: "Total", cantidad: fs.reduce((a, x) => a + x.cantidad, 0).toLocaleString("es-ES"), bytes: tamano(fs.reduce((a, x) => a + x.bytes, 0)) })}
                />
              </section>
            )}

            {d.tiposDePartes.length > 0 && (
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Partes del archivo por tipo: {d.tiposDePartes.map((t) => `${t.cantidad} ${t.tipo.toLowerCase()}`).join(" · ")}.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
