"use client";

import { useRef, useState } from "react";
import type { ResultadoCarga } from "@/lib/servicios/potenciales";

interface Linea {
  id: number;
  nombre: string;
  estado: "leyendo" | "nuevo" | "repetido" | "descartado" | "error";
  texto: string;
}

/** Suelta aquí los presupuestos (PDF o foto): se leen uno a uno, se guardan con su cliente y todo lo que no sea un presupuesto se descarta. */
export default function CargarPresupuestos({
  alTerminar,
}: {
  alTerminar: () => void;
}) {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const contador = useRef(0);
  const entrada = useRef<HTMLInputElement>(null);

  const subir = async (archivos: File[]) => {
    if (archivos.length === 0) return;
    setOcupado(true);
    const nuevas: Linea[] = archivos.map((f) => ({
      id: ++contador.current,
      nombre: f.name,
      estado: "leyendo",
      texto: "Leyendo…",
    }));
    setLineas((l) => [...nuevas, ...l]);
    const poner = (id: number, cambio: Partial<Linea>) =>
      setLineas((l) => l.map((x) => (x.id === id ? { ...x, ...cambio } : x)));
    for (const [i, f] of archivos.entries()) {
      const id = nuevas[i].id;
      try {
        const r = await fetch(
          `/api/potenciales/cargar?nombre=${encodeURIComponent(f.name)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: f,
          },
        );
        const j = (await r.json().catch(() => ({}))) as {
          data?: ResultadoCarga;
          message?: string;
        };
        if (r.ok && j.data) {
          const d = j.data;
          poner(
            id,
            d.resultado === "repetido"
              ? {
                  estado: "repetido",
                  texto: `${d.cliente}: el presupuesto ${d.numero} ya estaba cargado.`,
                }
              : {
                  estado: "nuevo",
                  texto: `${d.cliente} · presupuesto ${d.numero}${d.nuevoPotencial ? " (cliente nuevo)" : " (se suma a su ficha)"}${d.aviso ? ` · ⚠️ ${d.aviso}` : ""}`,
                },
          );
        } else if (r.status === 422 || r.status === 415)
          poner(id, {
            estado: "descartado",
            texto: j.message ?? "No es un presupuesto: descartado.",
          });
        else
          poner(id, {
            estado: "error",
            texto: j.message ?? "No se pudo leer el documento.",
          });
      } catch {
        poner(id, {
          estado: "error",
          texto: "No se pudo enviar el documento.",
        });
      }
    }
    setOcupado(false);
    alTerminar();
  };

  const icono = {
    leyendo: "⏳",
    nuevo: "✅",
    repetido: "♻️",
    descartado: "🚫",
    error: "❌",
  } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          void subir(Array.from(e.dataTransfer.files));
        }}
        onClick={() => entrada.current?.click()}
        style={{
          border: `2px dashed ${arrastrando ? "var(--primary)" : "var(--border-light)"}`,
          borderRadius: "var(--radius-md)",
          padding: "34px 20px",
          textAlign: "center",
          cursor: "pointer",
          background: arrastrando ? "rgba(59,130,246,0.08)" : "transparent",
        }}
      >
        <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>
          📥 Arrastra aquí los presupuestos
        </div>
        <div
          style={{
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
            marginTop: "4px",
          }}
        >
          PDF «INFORMACIÓN DE VEHÍCULO NUEVO» (o una foto de uno). Se leen uno a
          uno; cualquier otro documento se descarta. También puedes pulsar para
          elegirlos.
        </div>
        <input
          ref={entrada}
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            void subir(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {ocupado && (
        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Leyendo presupuestos… puedes esperar aquí.
        </span>
      )}
      {lineas.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {lineas.map((l) => (
            <div
              key={l.id}
              className="glass-panel"
              style={{
                padding: "6px 12px",
                display: "flex",
                gap: "10px",
                alignItems: "baseline",
                fontSize: "0.85rem",
              }}
            >
              <span aria-hidden="true">{icono[l.estado]}</span>
              <strong
                style={{
                  minWidth: "180px",
                  maxWidth: "260px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={l.nombre}
              >
                {l.nombre}
              </strong>
              <span
                style={{
                  color:
                    l.estado === "error"
                      ? "var(--danger)"
                      : l.estado === "descartado"
                        ? "var(--warning)"
                        : "var(--text-secondary)",
                }}
              >
                {l.texto}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
