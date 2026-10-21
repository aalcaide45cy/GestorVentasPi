"use client";

import { Suspense, useEffect, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import ColaPedidos from "@/components/ColaPedidos";
import type { MarcaConModelos } from "@/components/QuickExpedienteCreator";
import ControlesLectura from "@/components/documentos/ControlesLectura";
import { ZonaPedidos } from "@/components/documentos/leerPedidos";
import PanelPapelera from "@/components/admin/PanelPapelera";
import BotonAyuda from "@/components/BotonAyuda";
import TarjetaZona from "@/components/herramientas/TarjetaZona";
import ZonaPagosRci from "@/components/pagos-rci/ZonaPagosRci";
import type { TipoVentaDto, VendedorDto } from "@/lib/dto";
import { colaVacia, leerCola, suscribirCola } from "@/lib/pedidos-cola";
import { guardarPreferencia, usePreferencia } from "@/lib/preferencias";
import { useState } from "react";
import BibliotecaClient from "../biblioteca/BibliotecaClient";
import LogLecturasClient from "../log-lecturas/LogLecturasClient";

const PESTANAS = [
  { id: "docs", icono: "📥", titulo: "Subir pedidos y pagos", ayuda: "Arrastra aquí los pedidos de clientes y los pagos de la financiera (RCI): se leen con el OCR y los pedidos pasan a la cola." },
  { id: "cola", icono: "📋", titulo: "Cola de pedidos", ayuda: "Los pedidos ya leídos que esperan para crearse como expedientes, lo que se está leyendo y lo ignorado." },
  { id: "biblioteca", icono: "📚", titulo: "Biblioteca", ayuda: "Tus archivos de trabajo guardados una vez (pedidos, pagos de RCI, rejillas, Excel) para usarlos cuando quieras sin volver a buscarlos." },
  { id: "historial", icono: "📜", titulo: "Historial de lecturas", ayuda: "Qué ha pasado con cada PDF o foto que has subido para leer: si se leyó, se ignoró o falló." },
  { id: "papelera", icono: "🗑️", titulo: "Papelera", ayuda: "Todo lo eliminado que sigue guardado (expedientes, clientes, documentos…): verlo, recuperarlo, descargarlo y purgarlo de verdad. Solo para administradores.", soloAdmin: true },
] as const;
type IdPestana = (typeof PESTANAS)[number]["id"];

interface Props {
  marcas: MarcaConModelos[];
  tiposVenta: TipoVentaDto[];
  vendedores: VendedorDto[];
  idUsuario: number;
  esAdmin: boolean;
}

/** Atiende el enlace `?p=cola` (desde otras pantallas): deja abierta esa pestaña. */
function PestanaDelEnlace() {
  const p = useSearchParams().get("p");
  useEffect(() => {
    if (p && PESTANAS.some((x) => x.id === p)) guardarPreferencia("herramientas-pestana", p);
  }, [p]);
  return null;
}

/**
 * «Herramientas»: todo lo que lee, guarda o prepara documentos, en un solo sitio y con pestañas (antes estaba en el Dashboard y en dos pantallas
 * sueltas): subir pedidos y pagos de RCI, la cola de pedidos leídos, la biblioteca de archivos y el historial de lecturas.
 */
export default function HerramientasClient({ marcas, tiposVenta, vendedores, idUsuario, esAdmin }: Props) {
  const [guardada, guardar] = usePreferencia("herramientas-pestana");
  const visibles = PESTANAS.filter((p) => esAdmin || !("soloAdmin" in p));
  const activa: IdPestana = visibles.some((p) => p.id === guardada) ? (guardada as IdPestana) : "docs";
  const pestana = visibles.find((p) => p.id === activa) ?? visibles[0];
  const enCola = useSyncExternalStore(suscribirCola, leerCola, colaVacia).items.length;
  const [vendedorId, setVendedorId] = useState(idUsuario);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Suspense fallback={null}>
        <PestanaDelEnlace />
      </Suspense>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Herramientas</h1>
        <p style={{ color: "var(--text-secondary)" }}>Lectura de pedidos y pagos de la financiera, cola de pedidos, biblioteca de archivos, historial de lecturas y papelera, todo en un solo sitio.</p>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }} role="tablist">
        {visibles.map((p) => {
          const seleccionada = p.id === activa;
          return (
            <button key={p.id} type="button" role="tab" aria-selected={seleccionada} className={seleccionada ? "btn btn-primary" : "btn btn-secondary"} onClick={() => guardar(p.id)} title={p.ayuda}>
              {p.icono} {p.titulo}
              {p.id === "cola" && enCola > 0 && <span style={{ marginLeft: "8px", background: "var(--danger, #ef4444)", color: "#fff", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700, padding: "1px 7px" }}>{enCola}</span>}
            </button>
          );
        })}
      </div>
      {activa !== "biblioteca" && <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.85rem" }}>{pestana.ayuda}{activa === "papelera" && <> <BotonAyuda guia="herramientas.papelera" /></>}</p>}

      {activa === "docs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "14px" }}>
            <TarjetaZona titulo="📄 Pedidos de clientes" ayuda="Arrastra los pedidos (PDF o foto): se leen y crean expedientes en la cola de pedidos. Lo que no sea un pedido se ignora.">
              <ZonaPedidos compacta />
            </TarjetaZona>
            <TarjetaZona titulo="💳 Pagos de la financiera (RCI)" ayuda="Arrastra los pagos de RCI (PDF o foto): la fecha de pago fija la fecha RCI de su expediente. Lo que no sea un pago se ignora.">
              <ZonaPagosRci />
            </TarjetaZona>
          </div>
          <div style={{ padding: "8px 12px", border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", background: "rgba(255, 255, 255, 0.02)" }}>
            <ControlesLectura parte="motor" />
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>📚 Lo que se lee aquí (pedidos, pagos de RCI y rejillas) se guarda también en la biblioteca, con el nombre «Pedido - Cliente - Fecha», «Pago RCI - Cliente - Fecha» o «Rejilla - Mes Año».</div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            {enCola > 0 ? (
              <>
                Hay <b>{enCola}</b> pedido{enCola === 1 ? "" : "s"} leído{enCola === 1 ? "" : "s"} esperando en la{" "}
                <button type="button" onClick={() => guardar("cola")} style={{ all: "unset", cursor: "pointer", color: "var(--primary)", fontWeight: 600 }}>
                  cola de pedidos
                </button>
                .
              </>
            ) : (
              "Los pedidos que se lean aparecerán en la pestaña «Cola de pedidos»."
            )}
          </div>
        </div>
      )}

      {activa === "cola" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {esAdmin && vendedores.length > 1 && (
            <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.88rem" }} title="Vendedor al que se asignan los expedientes que se creen desde la cola">
              Crear los expedientes a nombre de
              <select className="form-input" value={vendedorId} onChange={(e) => setVendedorId(Number(e.target.value))} style={{ width: "auto", padding: "5px 10px" }}>
                {vendedores.map((v) => (
                  <option key={v.id_usuario} value={v.id_usuario}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ColaPedidos marcas={marcas} tiposVenta={tiposVenta} vendedorId={vendedorId} />
          {enCola === 0 && <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>No hay pedidos leídos esperando en la cola. Sube pedidos en la pestaña «Subir pedidos y pagos» (o desde la biblioteca) y aparecerán aquí según se vayan leyendo.</p>}
        </div>
      )}

      {activa === "biblioteca" && <BibliotecaClient incrustada />}
      {activa === "historial" && <LogLecturasClient incrustada />}
      {activa === "papelera" && esAdmin && (
        <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <PanelPapelera />
        </div>
      )}
    </div>
  );
}
