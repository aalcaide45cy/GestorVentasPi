"use client";

import Link from "next/link";
import { useState } from "react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { NOMBRE_VINCULO, type TipoVinculo } from "@/lib/notas";
import { guardarPreferencia } from "@/lib/preferencias";

interface NotaVinculada {
  id: number;
  tipo: string;
  titulo: string;
  extracto: string;
  color: string | null;
}

/** Botón 📝 que enseña las notas asignadas a una marca, modelo, tienda, vendedor o plan (se cargan al pulsarlo). */
export default function BotonNotasDe({
  tipo,
  id,
  nombre,
}: {
  tipo: TipoVinculo;
  id: number;
  nombre: string;
}) {
  const { mostrar } = useToast();
  const [lista, setLista] = useState<NotaVinculada[] | null>(null);
  const abrir = () => {
    setLista([]);
    llamar<NotaVinculada[]>(`/api/notas/vinculos?tipo=${tipo}&id=${id}`)
      .then((r) => setLista(r.data))
      .catch((e: unknown) => {
        mostrar(textoError(e), "error");
        setLista(null);
      });
  };
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={abrir}
        title={`Notas asignadas a ${nombre}`}
        style={{ padding: "4px 10px", fontSize: "0.82rem" }}
      >
        📝
      </button>
      {lista && (
        <Modal
          titulo={`📝 Notas de ${NOMBRE_VINCULO[tipo].singular.toLowerCase()} «${nombre}»`}
          ancho="min(calc(96 * var(--uvw)), 560px)"
          pie={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setLista(null)}
            >
              Cerrar
            </button>
          }
        >
          {lista.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>
              No hay ninguna nota asignada. Se asignan desde Notas, con el botón
              «🔗 Asignar».
            </p>
          ) : (
            lista.map((n) => (
              <Link
                key={n.id}
                href="/dashboard/notas"
                onClick={() => {
                  guardarPreferencia(
                    "exp-notas-seccion",
                    n.tipo === "nota" ? "notas" : "flujos",
                  );
                  guardarPreferencia("exp-notas-ultima", String(n.id));
                }}
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
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {n.extracto}
                  </div>
                )}
              </Link>
            ))
          )}
        </Modal>
      )}
    </>
  );
}
