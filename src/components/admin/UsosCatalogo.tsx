"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { llamar, textoError } from "@/components/comisiones/api";
import { rutaExpediente } from "@/components/Enlaces";
import type { ExpedienteDeCatalogo, UsosCatalogo } from "@/lib/servicios/usos-catalogo";

/** Cuántos expedientes usa cada marca y cada modelo; se vuelve a pedir cuando cambian los datos (`version`). */
export function useUsosCatalogo(version: unknown): UsosCatalogo | null {
  const [usos, setUsos] = useState<UsosCatalogo | null>(null);
  useEffect(() => {
    let vivo = true;
    llamar<UsosCatalogo>("/api/admin/catalogos/usos")
      .then((r) => vivo && setUsos(r.data))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [version]);
  return usos;
}

/** La celda «Expedientes» de una marca o un modelo: cuántos lo usan y un botón para verlos. */
export function CeldaUsos({ tipo, id, nombre, usos }: { tipo: "marca" | "modelo"; id: number; nombre: string; usos: { activos: number; papelera: number } | undefined }) {
  const [abierta, setAbierta] = useState(false);
  const activos = usos?.activos ?? 0;
  const papelera = usos?.papelera ?? 0;
  if (!usos || activos + papelera === 0) return <span style={{ color: "var(--text-muted)" }} title="Ningún expediente lo usa: se puede borrar sin más">0</span>;
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setAbierta(true)} title={`Ver los expedientes que usan ${nombre}`} style={{ padding: "4px 10px", fontSize: "0.82rem", fontWeight: 700 }}>
        📄 {activos}
        {papelera > 0 ? <span style={{ fontWeight: 500, color: "var(--text-muted)" }}> + {papelera} en la Papelera</span> : null}
      </button>
      {abierta && <ModalUsos tipo={tipo} id={id} nombre={nombre} alCerrar={() => setAbierta(false)} />}
    </>
  );
}

function ModalUsos({ tipo, id, nombre, alCerrar }: { tipo: "marca" | "modelo"; id: number; nombre: string; alCerrar: () => void }) {
  const [datos, setDatos] = useState<{ total: number; filas: ExpedienteDeCatalogo[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    try {
      setDatos((await llamar<{ total: number; filas: ExpedienteDeCatalogo[] }>(`/api/admin/catalogos/usos?${tipo}=${id}`)).data);
    } catch (e) {
      setError(textoError(e));
    }
  }, [tipo, id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  return (
    <Modal
      titulo={`Expedientes de ${tipo === "marca" ? "la marca" : "el modelo"} ${nombre}`}
      ancho="min(calc(96 * var(--uvw)), 1100px)"
      pie={
        <button type="button" className="btn btn-secondary" onClick={alCerrar}>
          Cerrar
        </button>
      }
    >
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!datos && !error && <p style={{ color: "var(--text-muted)" }}>Cargando…</p>}
      {datos && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)" }}>
            {datos.total} expediente{datos.total === 1 ? "" : "s"}
            {datos.total > datos.filas.length ? ` (se ven los ${datos.filas.length} más recientes)` : ""}. Pulsa el cliente para abrir el expediente. Los de la Papelera siguen apuntando a {tipo === "marca" ? "esta marca" : "este modelo"}, por eso cuentan al borrarl{tipo === "marca" ? "a" : "o"}.
          </p>
          <div style={{ overflowX: "auto", maxHeight: "60vh" }}>
            <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
                  <th style={{ padding: "4px 8px" }}>Cliente</th>
                  {tipo === "marca" && <th style={{ padding: "4px 8px" }}>Modelo</th>}
                  <th style={{ padding: "4px 8px" }}>Matrícula</th>
                  <th style={{ padding: "4px 8px" }}>Tipo de pago</th>
                  <th style={{ padding: "4px 8px" }}>Estado</th>
                  <th style={{ padding: "4px 8px" }}>Vendedor</th>
                  <th style={{ padding: "4px 8px" }}>F. pedido</th>
                </tr>
              </thead>
              <tbody>
                {datos.filas.map((e) => (
                  <tr key={e.id} style={{ borderTop: "1px solid var(--border-light)", opacity: e.eliminado ? 0.6 : 1 }}>
                    <td style={{ padding: "4px 8px" }}>
                      {e.eliminado ? (
                        <span title="Está en la Papelera: se recupera desde Herramientas › Papelera">🗑️ {e.cliente ?? "Sin cliente"}</span>
                      ) : (
                        <Link href={rutaExpediente(e.id)} style={{ color: "inherit", fontWeight: 600 }}>
                          {e.cliente ?? "Sin cliente"}
                        </Link>
                      )}
                    </td>
                    {tipo === "marca" && <td style={{ padding: "4px 8px" }}>{e.modelo ?? "—"}</td>}
                    <td style={{ padding: "4px 8px" }}>{e.matricula ?? "—"}</td>
                    <td style={{ padding: "4px 8px" }}>{e.tipoVenta ?? "—"}</td>
                    <td style={{ padding: "4px 8px" }}>{e.estado ?? "—"}</td>
                    <td style={{ padding: "4px 8px" }}>{e.vendedor ?? "—"}</td>
                    <td style={{ padding: "4px 8px" }}>{e.fechaPedido ? e.fechaPedido.split("-").reverse().join("/") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
