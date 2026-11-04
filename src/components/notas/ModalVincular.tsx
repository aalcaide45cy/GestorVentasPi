"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { llamar } from "@/components/comisiones/api";
import {
  NOMBRE_VINCULO,
  TIPOS_VINCULO,
  type TipoVinculo,
  type VinculoDto,
} from "@/lib/notas";

interface Opcion {
  tipo: TipoVinculo;
  id: number;
  texto: string;
}

/** Elegir a qué se asigna la nota: expedientes, clientes, planes de comisiones, marcas, modelos, tiendas o vendedores (varios a la vez). */
export default function ModalVincular({
  actuales,
  alCambiar,
  alCerrar,
}: {
  actuales: VinculoDto[];
  alCambiar: (nuevos: { tipo: TipoVinculo; id: number }[]) => void;
  alCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoVinculo>("expediente");
  const [q, setQ] = useState("");
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [buscando, setBuscando] = useState(false);
  const marcado = (t: TipoVinculo, id: number) =>
    actuales.some((a) => a.tipo === t && a.id === id);

  useEffect(() => {
    let vivo = true;
    const espera = setTimeout(() => {
      setBuscando(true);
      llamar<Opcion[]>(
        `/api/notas/vinculos?tipo=${tipo}&q=${encodeURIComponent(q)}`,
      )
        .then((r) => vivo && setOpciones(r.data))
        .catch(() => vivo && setOpciones([]))
        .finally(() => vivo && setBuscando(false));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [tipo, q]);

  const alternar = (o: Opcion) => {
    const lista = actuales.map((a) => ({ tipo: a.tipo, id: a.id }));
    alCambiar(
      marcado(o.tipo, o.id)
        ? lista.filter((a) => !(a.tipo === o.tipo && a.id === o.id))
        : [...lista, { tipo: o.tipo, id: o.id }],
    );
  };

  return (
    <Modal
      titulo="🔗 Asignar la nota"
      ancho="min(calc(96 * var(--uvw)), 640px)"
      pie={
        <button type="button" className="btn btn-primary" onClick={alCerrar}>
          Listo
        </button>
      }
    >
      <p
        style={{
          margin: 0,
          fontSize: "0.9rem",
          color: "var(--text-secondary)",
        }}
      >
        Elige el tipo, busca y pulsa para asignar o quitar. Puedes asignarla a
        varias cosas.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {TIPOS_VINCULO.map((t) => (
          <button
            key={t}
            type="button"
            className={tipo === t ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => setTipo(t)}
            style={{ padding: "3px 10px", fontSize: "0.8rem" }}
          >
            {NOMBRE_VINCULO[t].icono} {NOMBRE_VINCULO[t].singular}
          </button>
        ))}
      </div>
      <input
        className="form-input"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={
          tipo === "expediente"
            ? "Número, cliente, matrícula, modelo…"
            : tipo === "cliente"
              ? "Nombre o DNI…"
              : "Buscar…"
        }
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          maxHeight: "40vh",
          overflowY: "auto",
        }}
      >
        {buscando && (
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Buscando…
          </span>
        )}
        {!buscando && opciones.length === 0 && (
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            {(tipo === "expediente" || tipo === "cliente") && !q.trim()
              ? "Escribe para buscar."
              : "No hay resultados."}
          </span>
        )}
        {opciones.map((o) => (
          <button
            key={`${o.tipo}:${o.id}`}
            type="button"
            className="glass-panel-interactive"
            onClick={() => alternar(o)}
            style={{
              textAlign: "left",
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-light)",
              cursor: "pointer",
              color: "var(--text-primary)",
              background: marcado(o.tipo, o.id)
                ? "rgba(59,130,246,0.18)"
                : "transparent",
            }}
          >
            {marcado(o.tipo, o.id) ? "✓ " : ""}
            {o.texto}
          </button>
        ))}
      </div>
      {actuales.length > 0 && (
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Asignada a:{" "}
          {actuales
            .map((a) => `${NOMBRE_VINCULO[a.tipo].icono} ${a.texto}`)
            .join(" · ")}
        </div>
      )}
    </Modal>
  );
}
