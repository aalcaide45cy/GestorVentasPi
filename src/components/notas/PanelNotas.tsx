"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useVersionDatos } from "@/lib/datos-version";
import {
  ambitoDe,
  type EtiquetaDto,
  type GrupoDto,
  type NotaDto,
  type NotaResumenDto,
  type TipoNota,
} from "@/lib/notas";
import { usePreferencia } from "@/lib/preferencias";
import { fechaRelativa } from "./api-notas";
import ChipEtiqueta, { aspectoDe } from "./ChipEtiqueta";
import EditorNota from "./EditorNota";
import ModalEtiqueta from "./ModalEtiqueta";

const COLORES_GRUPO = [
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#a855f7",
  "#ec4899",
  "#6b7280",
];

type Vista =
  | { clase: "todas" }
  | { clase: "grupo"; id: number }
  | { clase: "sin-grupo" }
  | { clase: "compartidas" }
  | { clase: "fijadas" }
  | { clase: "papelera" }
  | { clase: "etiqueta"; texto: string };

const claveVista = (v: Vista): string =>
  v.clase === "grupo"
    ? `g${v.id}`
    : v.clase === "etiqueta"
      ? `e:${v.texto}`
      : v.clase;

/**
 * La sección «Notas»: a la izquierda los grupos y las etiquetas, en medio la lista (con buscador) y a la derecha la nota abierta.
 * En pantallas estrechas se ve una cosa cada vez (grupos, lista o nota).
 */
export default function PanelNotas({ tipos }: { tipos: TipoNota[] }) {
  const { mostrar, confirmar } = useToast();
  const version = useVersionDatos();
  const [lista, setLista] = useState<NotaResumenDto[]>([]);
  const [papelera, setPapelera] = useState<NotaResumenDto[]>([]);
  const [grupos, setGrupos] = useState<GrupoDto[]>([]);
  const [vista, setVista] = useState<Vista>({ clase: "todas" });
  const [buscar, setBuscar] = useState("");
  const [abierta, setAbierta] = useState<NotaDto | null>(null);
  const [pantalla, setPantalla] = useState<"grupos" | "lista" | "nota">(
    "lista",
  );
  const [cargando, setCargando] = useState(true);
  const [catalogo, setCatalogo] = useState<EtiquetaDto[]>([]);
  const [editandoEtiqueta, setEditandoEtiqueta] = useState<{
    inicial: EtiquetaDto | null;
  } | null>(null);
  // Filtros por color (de la nota o de sus etiquetas) y arrastrar notas a un grupo
  const [colorNota, setColorNota] = useState<string | null>(null);
  const [colorEtiqueta, setColorEtiqueta] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [ultima, fijarUltima] = usePreferencia("exp-notas-ultima");
  const refImportar = useRef<HTMLInputElement>(null);
  const ambito = ambitoDe(tipos[0]);
  const consulta = tipos.join(",");

  const cargar = useCallback(async () => {
    try {
      const [n, p, g, et] = await Promise.all([
        llamar<NotaResumenDto[]>(`/api/notas?tipos=${consulta}`),
        llamar<NotaResumenDto[]>(`/api/notas?tipos=${consulta}&papelera=1`),
        llamar<GrupoDto[]>(`/api/notas/grupos?ambito=${ambito}`),
        llamar<EtiquetaDto[]>("/api/notas/etiquetas"),
      ]);
      setCatalogo(et.data);
      setLista(n.data);
      setPapelera(p.data);
      setGrupos(g.data);
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setCargando(false);
    }
  }, [consulta, ambito, mostrar]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar, version]);

  const abrir = useCallback(
    async (id: number) => {
      try {
        const { data } = await llamar<NotaDto>(`/api/notas?id=${id}`);
        setAbierta(data);
        setPantalla("nota");
        fijarUltima(String(id));
      } catch (e) {
        mostrar(textoError(e), "error");
      }
    },
    [mostrar, fijarUltima],
  );

  // Al entrar se abre la última nota que se estaba viendo
  const yaAbierta = useRef(false);
  useEffect(() => {
    if (yaAbierta.current || cargando) return;
    yaAbierta.current = true;
    const id = Number(ultima);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id > 0 && lista.some((n) => n.id === id)) void abrir(id);
  }, [cargando, ultima, lista, abrir]);

  const etiquetas = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of lista)
      for (const t of n.etiquetas) m.set(t, (m.get(t) ?? 0) + 1);
    // Las etiquetas creadas a mano salen aunque todavía no tengan notas
    for (const c of catalogo)
      if (
        ![...m.keys()].some((k) => k.toLowerCase() === c.nombre.toLowerCase())
      )
        m.set(c.nombre, 0);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [lista, catalogo]);
  // Colores en uso, para los filtros
  const coloresNota = useMemo(
    () => [
      ...new Set(lista.map((n) => n.color).filter((c): c is string => !!c)),
    ],
    [lista],
  );
  const coloresEtiqueta = useMemo(
    () => [
      ...new Set(
        lista.flatMap((n) =>
          n.etiquetas
            .map((t) => aspectoDe(catalogo, t)?.color)
            .filter((c): c is string => !!c),
        ),
      ),
    ],
    [lista, catalogo],
  );

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const base = vista.clase === "papelera" ? papelera : lista;
    return base.filter((n) => {
      if (vista.clase === "grupo" && n.id_grupo !== vista.id) return false;
      if (
        vista.clase === "sin-grupo" &&
        (n.id_grupo !== null || n.permiso !== "propietario")
      )
        return false;
      if (vista.clase === "compartidas" && n.permiso === "propietario")
        return false;
      if (vista.clase === "fijadas" && !n.fijada) return false;
      if (
        vista.clase === "etiqueta" &&
        !n.etiquetas.some((t) => t.toLowerCase() === vista.texto.toLowerCase())
      )
        return false;
      if (colorNota && n.color !== colorNota) return false;
      if (
        colorEtiqueta &&
        !n.etiquetas.some(
          (t) => aspectoDe(catalogo, t)?.color === colorEtiqueta,
        )
      )
        return false;
      if (
        q &&
        !`${n.titulo} ${n.extracto} ${n.etiquetas.join(" ")}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [lista, papelera, vista, buscar, colorNota, colorEtiqueta, catalogo]);

  const cuenta = (f: (n: NotaResumenDto) => boolean) => lista.filter(f).length;

  /** Suelta una nota arrastrada sobre un grupo (o sobre «Sin grupo»). */
  const moverAGrupo = async (idNota: number, idGrupo: number | null) => {
    const n = lista.find((x) => x.id === idNota);
    if (!n) return;
    if (n.permiso !== "propietario") {
      mostrar("Solo quien creó la nota puede moverla de grupo.", "error");
      return;
    }
    if (n.id_grupo === idGrupo) return;
    try {
      await llamar(`/api/notas?id=${idNota}`, {
        method: "PUT",
        cuerpo: { id_grupo: idGrupo },
      });
      mostrar(
        idGrupo === null
          ? "Nota sin grupo."
          : `Movida a «${grupos.find((g) => g.id === idGrupo)?.nombre ?? "grupo"}».`,
      );
      await cargar();
      if (abierta?.id === idNota) setAbierta({ ...abierta, id_grupo: idGrupo });
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };

  const nueva = async () => {
    try {
      const { data } = await llamar<NotaDto>("/api/notas", {
        method: "POST",
        cuerpo: {
          tipo: tipos[0],
          titulo: "",
          id_grupo: vista.clase === "grupo" ? vista.id : null,
        },
      });
      await cargar();
      setAbierta(data);
      setPantalla("nota");
      fijarUltima(String(data.id));
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };
  const nuevoGrupo = async () => {
    const nombre = window.prompt("Nombre del grupo:");
    if (!nombre?.trim()) return;
    try {
      await llamar("/api/notas/grupos", {
        method: "POST",
        cuerpo: {
          ambito,
          nombre: nombre.trim(),
          color: COLORES_GRUPO[grupos.length % COLORES_GRUPO.length],
        },
      });
      await cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };
  const editarGrupo = async (g: GrupoDto) => {
    const nombre = window.prompt("Nuevo nombre del grupo:", g.nombre);
    if (nombre === null) return;
    const color =
      COLORES_GRUPO[
        (COLORES_GRUPO.indexOf(g.color) + 1) % COLORES_GRUPO.length
      ] ?? g.color;
    const cambiarColor =
      nombre.trim() === g.nombre &&
      window.confirm("¿Cambiar solo el color del grupo?");
    try {
      await llamar(`/api/notas/grupos?id=${g.id}`, {
        method: "PUT",
        cuerpo: {
          nombre: nombre.trim() || g.nombre,
          color: cambiarColor ? color : g.color,
        },
      });
      await cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };
  const borrarGrupo = async (g: GrupoDto) => {
    if (
      !(await confirmar({
        titulo: "Quitar el grupo",
        texto: `¿Quitar el grupo «${g.nombre}»? Sus notas no se borran: quedan sin grupo.`,
        aceptar: "Quitar",
        peligro: true,
      }))
    )
      return;
    try {
      await llamar(`/api/notas/grupos?id=${g.id}`, { method: "DELETE" });
      if (vista.clase === "grupo" && vista.id === g.id)
        setVista({ clase: "todas" });
      await cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };
  const aPapelera = async () => {
    if (!abierta) return;
    try {
      await llamar(`/api/notas?id=${abierta.id}`, { method: "DELETE" });
      mostrar("Enviada a la papelera.");
      setAbierta(null);
      setPantalla("lista");
      await cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };
  const duplicar = async () => {
    if (!abierta) return;
    try {
      const { data } = await llamar<NotaDto>(
        `/api/notas?accion=duplicar&id=${abierta.id}`,
        { method: "POST", cuerpo: {} },
      );
      mostrar("Copia creada.");
      await cargar();
      setAbierta(data);
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };
  const restaurar = async (n: NotaResumenDto) => {
    try {
      await llamar(`/api/notas?accion=restaurar&id=${n.id}`, {
        method: "POST",
        cuerpo: {},
      });
      mostrar("Recuperada.");
      await cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };
  const borrarYa = async (n: NotaResumenDto) => {
    if (
      !(await confirmar({
        titulo: "Borrar para siempre",
        texto: `¿Borrar «${n.titulo || "Sin título"}» para siempre, con sus adjuntos? No se puede deshacer.`,
        aceptar: "Borrar",
        peligro: true,
      }))
    )
      return;
    try {
      await llamar(`/api/notas?id=${n.id}&definitivo=1`, { method: "DELETE" });
      await cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };
  const vaciar = async () => {
    if (
      !(await confirmar({
        titulo: "Vaciar la papelera",
        texto: `¿Borrar para siempre las ${papelera.length} de la papelera? No se puede deshacer.`,
        aceptar: "Vaciar",
        peligro: true,
      }))
    )
      return;
    try {
      await llamar("/api/notas?accion=vaciar-papelera", {
        method: "POST",
        cuerpo: { tipos },
      });
      await cargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    }
  };
  const importar = async (archivo: File) => {
    try {
      const texto = await archivo.text();
      const { data } = await llamar<{
        notas: number;
        grupos: number;
        ficheros: number;
      }>("/api/notas/importar", {
        method: "POST",
        cuerpo: JSON.parse(texto) as unknown,
      });
      mostrar(
        `Importadas ${data.notas} nota${data.notas === 1 ? "" : "s"}, ${data.grupos} grupo${data.grupos === 1 ? "" : "s"} nuevo${data.grupos === 1 ? "" : "s"} y ${data.ficheros} adjunto${data.ficheros === 1 ? "" : "s"}.`,
      );
      await cargar();
    } catch (e) {
      mostrar(
        e instanceof SyntaxError
          ? "El archivo no es un JSON válido"
          : textoError(e),
        "error",
      );
    }
  };

  const itemSide = (
    v: Vista,
    etiqueta: string,
    n?: number,
    extra?: {
      color?: string;
      acciones?: React.ReactNode;
      soltar?: (idNota: number) => void;
    },
  ) => {
    const activo = claveVista(vista) === claveVista(v);
    return (
      <div
        key={claveVista(v)}
        onDragOver={
          extra?.soltar
            ? (e) => {
                e.preventDefault();
                setSobre(claveVista(v));
              }
            : undefined
        }
        onDragLeave={
          extra?.soltar
            ? () => setSobre((x) => (x === claveVista(v) ? null : x))
            : undefined
        }
        onDrop={
          extra?.soltar
            ? (e) => {
                e.preventDefault();
                setSobre(null);
                const id = Number(
                  (e.dataTransfer.getData("text/plain") || "").replace(
                    "nota:",
                    "",
                  ),
                );
                if (id > 0) extra.soltar?.(id);
              }
            : undefined
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          borderRadius: "var(--radius-sm)",
          outline:
            sobre === claveVista(v) ? "2px dashed var(--primary)" : "none",
          background:
            sobre === claveVista(v)
              ? "rgba(var(--primary-rgb), 0.12)"
              : undefined,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setVista(v);
            setPantalla("lista");
          }}
          aria-pressed={activo}
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "5px 8px",
            textAlign: "left",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            background: activo
              ? "rgba(var(--primary-rgb), 0.18)"
              : "transparent",
            color: "var(--text-primary)",
            fontSize: "0.88rem",
          }}
        >
          {extra?.color && (
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: extra.color,
                flex: "0 0 auto",
              }}
            />
          )}
          <span
            style={{
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {etiqueta}
          </span>
          {n !== undefined && (
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              {n}
            </span>
          )}
        </button>
        {extra?.acciones}
      </div>
    );
  };

  const nombreSeccion = tipos[0] === "nota" ? "nota" : "flujo";
  return (
    <div className="notas-rejilla" data-pantalla={pantalla}>
      <aside
        className="notas-lateral"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          padding: "8px",
          overflowY: "auto",
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-card)",
        }}
      >
        {itemSide(
          { clase: "todas" },
          `📚 Todas las ${nombreSeccion === "nota" ? "notas" : "flujos"}`,
          lista.length,
        )}
        {itemSide(
          { clase: "fijadas" },
          "📌 Fijadas",
          cuenta((n) => n.fijada),
        )}
        {itemSide(
          { clase: "compartidas" },
          "👥 Compartidas conmigo",
          cuenta((n) => n.permiso !== "propietario"),
        )}
        <div
          style={{
            margin: "8px 4px 2px",
            fontSize: "0.7rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--text-muted)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          Grupos
          <button
            type="button"
            onClick={() => void nuevoGrupo()}
            title="Nuevo grupo"
            aria-label="Nuevo grupo"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--primary)",
              fontSize: "1rem",
            }}
          >
            ＋
          </button>
        </div>
        {grupos.map((g) =>
          itemSide(
            { clase: "grupo", id: g.id },
            g.nombre,
            cuenta((n) => n.id_grupo === g.id),
            {
              color: g.color,
              soltar: (id: number) => void moverAGrupo(id, g.id),
              acciones: (
                <span style={{ display: "flex" }}>
                  <button
                    type="button"
                    onClick={() => void editarGrupo(g)}
                    title="Cambiar el nombre o el color"
                    aria-label={`Editar el grupo ${g.nombre}`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      opacity: 0.6,
                    }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => void borrarGrupo(g)}
                    title="Quitar el grupo"
                    aria-label={`Quitar el grupo ${g.nombre}`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      opacity: 0.6,
                    }}
                  >
                    ✕
                  </button>
                </span>
              ),
            },
          ),
        )}
        {grupos.length === 0 && (
          <span
            style={{
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              padding: "2px 8px",
            }}
          >
            Crea grupos para ordenar tus{" "}
            {nombreSeccion === "nota" ? "notas" : "flujos"}.
          </span>
        )}
        {itemSide(
          { clase: "sin-grupo" },
          "Sin grupo",
          cuenta((n) => n.id_grupo === null && n.permiso === "propietario"),
          { soltar: (id: number) => void moverAGrupo(id, null) },
        )}
        <div
          style={{
            margin: "8px 4px 2px",
            fontSize: "0.7rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--text-muted)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          Etiquetas
          <button
            type="button"
            onClick={() => setEditandoEtiqueta({ inicial: null })}
            title="Nueva etiqueta, con color y emoticono"
            aria-label="Nueva etiqueta"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--primary)",
              fontSize: "1rem",
            }}
          >
            ＋
          </button>
        </div>
        {etiquetas.length === 0 && (
          <span
            style={{
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              padding: "2px 8px",
            }}
          >
            Crea etiquetas con color y emoticono, o añádelas desde cada nota.
          </span>
        )}
        {etiquetas.map(([t, n]) => {
          const asp = aspectoDe(catalogo, t);
          return itemSide(
            { clase: "etiqueta", texto: t },
            `${asp?.emoji || "🏷"} ${t}`,
            n,
            {
              color: asp?.color ?? undefined,
              acciones: (
                <button
                  type="button"
                  onClick={() =>
                    setEditandoEtiqueta({
                      inicial: asp ?? { nombre: t, color: null, emoji: null },
                    })
                  }
                  title="Cambiar el color, el emoticono o el nombre"
                  aria-label={`Editar la etiqueta ${t}`}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    opacity: 0.6,
                  }}
                >
                  ✎
                </button>
              ),
            },
          );
        })}
        <div
          style={{
            marginTop: "8px",
            borderTop: "1px solid var(--border-light)",
            paddingTop: "6px",
          }}
        >
          {itemSide({ clase: "papelera" }, "🗑 Papelera", papelera.length)}
        </div>
        <div
          style={{
            marginTop: "8px",
            display: "flex",
            gap: "6px",
            flexWrap: "wrap",
          }}
        >
          <a
            className="btn btn-secondary"
            href={`/api/notas/exportar?tipos=${consulta}`}
            title={`Descarga todas tus ${nombreSeccion === "nota" ? "notas" : "flujos"} con sus adjuntos en un archivo`}
            style={{ padding: "3px 10px", fontSize: "0.78rem" }}
          >
            ⬇ Exportar
          </a>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => refImportar.current?.click()}
            title="Importa un archivo exportado antes: crea copias nuevas, no pisa nada"
            style={{ padding: "3px 10px", fontSize: "0.78rem" }}
          >
            ⬆ Importar
          </button>
          <input
            ref={refImportar}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importar(f);
            }}
          />
        </div>
      </aside>

      <section
        className="notas-lista"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          minHeight: 0,
        }}
      >
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            className="btn btn-secondary notas-volver"
            onClick={() => setPantalla("grupos")}
            style={{ padding: "4px 10px" }}
            aria-label="Ver los grupos"
          >
            ☰
          </button>
          <input
            className="form-input"
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="🔎 Buscar…"
            aria-label="Buscar"
            style={{ flex: 1, padding: "5px 10px" }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void nueva()}
            style={{ padding: "4px 12px", fontSize: "0.85rem" }}
          >
            ＋ Nueva
          </button>
        </div>
        {(coloresNota.length > 0 ||
          coloresEtiqueta.length > 0 ||
          colorNota ||
          colorEtiqueta) && (
          <div
            style={{
              display: "flex",
              gap: "6px 14px",
              flexWrap: "wrap",
              alignItems: "center",
              fontSize: "0.72rem",
              color: "var(--text-muted)",
            }}
          >
            {coloresNota.length > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title="Filtrar por el color de la nota"
              >
                Nota
                {coloresNota.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Notas de color ${c}`}
                    aria-pressed={colorNota === c}
                    onClick={() => setColorNota(colorNota === c ? null : c)}
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      background: c,
                      cursor: "pointer",
                      border: `2px solid ${colorNota === c ? "var(--text-primary)" : "transparent"}`,
                    }}
                  />
                ))}
              </span>
            )}
            {coloresEtiqueta.length > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title="Filtrar por el color de las etiquetas"
              >
                Etiqueta
                {coloresEtiqueta.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Etiquetas de color ${c}`}
                    aria-pressed={colorEtiqueta === c}
                    onClick={() =>
                      setColorEtiqueta(colorEtiqueta === c ? null : c)
                    }
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "4px",
                      background: c,
                      cursor: "pointer",
                      border: `2px solid ${colorEtiqueta === c ? "var(--text-primary)" : "transparent"}`,
                    }}
                  />
                ))}
              </span>
            )}
            {(colorNota || colorEtiqueta) && (
              <button
                type="button"
                onClick={() => {
                  setColorNota(null);
                  setColorEtiqueta(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--primary)",
                  fontSize: "0.72rem",
                }}
              >
                ✕ Quitar filtros
              </button>
            )}
          </div>
        )}
        {vista.clase === "papelera" && papelera.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void vaciar()}
            style={{
              padding: "3px 10px",
              fontSize: "0.78rem",
              alignSelf: "flex-start",
            }}
          >
            🗑 Vaciar la papelera
          </button>
        )}
        <div
          style={{
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flex: 1,
            minHeight: 0,
          }}
        >
          {cargando && (
            <span style={{ color: "var(--text-muted)", padding: "10px" }}>
              Cargando…
            </span>
          )}
          {!cargando && visibles.length === 0 && (
            <span
              style={{
                color: "var(--text-muted)",
                padding: "10px",
                fontSize: "0.9rem",
              }}
            >
              {buscar
                ? "No hay nada que coincida con la búsqueda."
                : vista.clase === "papelera"
                  ? "La papelera está vacía."
                  : `Todavía no hay ${nombreSeccion === "nota" ? "notas" : "flujos"} aquí. Pulsa «＋ Nueva».`}
            </span>
          )}
          {visibles.map((n) => {
            const activa = abierta?.id === n.id;
            const grupo = grupos.find((g) => g.id === n.id_grupo);
            return (
              <div
                key={n.id}
                style={{ display: "flex", flexDirection: "column", gap: "2px" }}
              >
                <button
                  type="button"
                  draggable={
                    vista.clase !== "papelera" && n.permiso === "propietario"
                  }
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", `nota:${n.id}`);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  title={
                    n.permiso === "propietario" && vista.clase !== "papelera"
                      ? "Arrástrala a un grupo de la izquierda"
                      : undefined
                  }
                  onClick={() =>
                    vista.clase === "papelera" ? undefined : void abrir(n.id)
                  }
                  aria-current={activa}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "1px solid var(--border-light)",
                    borderLeft: `4px solid ${n.color ?? "var(--border-light)"}`,
                    borderRadius: "var(--radius-sm)",
                    background: activa
                      ? "rgba(var(--primary-rgb), 0.16)"
                      : "var(--bg-card)",
                    color: "var(--text-primary)",
                    cursor: vista.clase === "papelera" ? "default" : "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "6px",
                    }}
                  >
                    <strong
                      style={{
                        fontSize: "0.92rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.fijada ? "📌 " : ""}
                      {n.titulo || "Sin título"}
                    </strong>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                        flex: "0 0 auto",
                      }}
                    >
                      {fechaRelativa(n.actualizado_en)}
                    </span>
                  </span>
                  {n.extracto && (
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-secondary)",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {n.extracto}
                    </span>
                  )}
                  <span
                    style={{
                      display: "flex",
                      gap: "6px",
                      flexWrap: "wrap",
                      fontSize: "0.7rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    {grupo && (
                      <span style={{ color: grupo.color }}>
                        ● {grupo.nombre}
                      </span>
                    )}
                    {n.etiquetas.slice(0, 3).map((t) => (
                      <ChipEtiqueta
                        key={t}
                        nombre={t}
                        aspecto={aspectoDe(catalogo, t)}
                        pequeno
                      />
                    ))}
                    {n.n_ficheros > 0 && <span>📎 {n.n_ficheros}</span>}
                    {n.compartida && <span>👥</span>}
                    {n.permiso !== "propietario" && (
                      <span>
                        👥 {n.autor}
                        {n.permiso === "lectura" ? " · solo lectura" : ""}
                      </span>
                    )}
                    {n.id_expediente && (
                      <span>
                        🔗 #EXP-{String(n.id_expediente).padStart(4, "0")}
                      </span>
                    )}
                  </span>
                </button>
                {vista.clase === "papelera" && (
                  <span style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void restaurar(n)}
                      style={{ padding: "2px 10px", fontSize: "0.75rem" }}
                    >
                      ↩ Recuperar
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void borrarYa(n)}
                      style={{
                        padding: "2px 10px",
                        fontSize: "0.75rem",
                        color: "var(--danger)",
                      }}
                    >
                      Borrar para siempre
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="notas-detalle" style={{ minWidth: 0, minHeight: 0 }}>
        <button
          type="button"
          className="btn btn-secondary notas-volver"
          onClick={() => setPantalla("lista")}
          style={{ padding: "4px 10px", marginBottom: "6px" }}
        >
          ◀ Volver a la lista
        </button>
        {abierta ? (
          <EditorNota
            key={abierta.id}
            catalogo={catalogo}
            nota={abierta}
            grupos={grupos}
            alCambiar={() => void cargar()}
            alBorrar={() => void aPapelera()}
            alDuplicar={() => void duplicar()}
            alRecargar={() => void abrir(abierta.id)}
          />
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              border: "1px dashed var(--border-light)",
              borderRadius: "var(--radius-sm)",
              padding: "30px",
              textAlign: "center",
            }}
          >
            Elige una {nombreSeccion} de la lista o crea una nueva con «＋
            Nueva».
          </div>
        )}
      </section>
      {editandoEtiqueta && (
        <ModalEtiqueta
          inicial={editandoEtiqueta.inicial}
          alCerrar={() => setEditandoEtiqueta(null)}
          alGuardar={() => void cargar()}
        />
      )}
    </div>
  );
}
