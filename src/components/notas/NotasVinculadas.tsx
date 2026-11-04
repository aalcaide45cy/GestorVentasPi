"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import type { TipoVinculo } from "@/lib/notas";
import { guardarPreferencia } from "@/lib/preferencias";

interface NotaVinculada {
  id: number;
  tipo: string;
  titulo: string;
  extracto: string;
  color: string | null;
  actualizado_en: string;
}

/** Las notas y flujos asignados a este expediente, cliente, etc. (sale en su ficha; si no hay ninguna, no se enseña nada). */
export default function NotasVinculadas({
  tipo,
  id,
}: {
  tipo: TipoVinculo;
  id: number;
}) {
  const { mostrar } = useToast();
  const [lista, setLista] = useState<NotaVinculada[]>([]);
  const [abierto, setAbierto] = useState(true);

  useEffect(() => {
    llamar<NotaVinculada[]>(`/api/notas/vinculos?tipo=${tipo}&id=${id}`)
      .then((r) => setLista(r.data))
      .catch((e: unknown) => mostrar(textoError(e), "error"));
  }, [tipo, id, mostrar]);

  if (lista.length === 0) return null;
  const alAbrir = (n: NotaVinculada) => {
    guardarPreferencia(
      "exp-notas-seccion",
      n.tipo === "nota" ? "notas" : "flujos",
    );
    guardarPreferencia("exp-notas-ultima", String(n.id));
  };
  return (
    <section
      className="glass-panel"
      style={{
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-primary)",
          fontWeight: 700,
          textAlign: "left",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {abierto ? "▾" : "▸"} 📝 Notas asignadas ({lista.length})
      </button>
      {abierto &&
        lista.map((n) => (
          <Link
            key={n.id}
            href="/dashboard/notas"
            onClick={() => alAbrir(n)}
            style={{
              display: "block",
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-light)",
              borderLeft: `4px solid ${n.color ?? "var(--border-light)"}`,
              color: "var(--text-primary)",
              textDecoration: "none",
            }}
          >
            <strong>{n.titulo || "Sin título"}</strong>
            {n.extracto && (
              <div
                style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}
              >
                {n.extracto}
              </div>
            )}
          </Link>
        ))}
    </section>
  );
}
