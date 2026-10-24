"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Plegable } from "@/components/admin/estructura";
import ColaPedidos from "@/components/ColaPedidos";
import type { MarcaConModelos } from "@/components/QuickExpedienteCreator";
import { ZonaPedidos } from "@/components/documentos/leerPedidos";
import ZonaPagosRci from "@/components/pagos-rci/ZonaPagosRci";
import TarjetaZona from "@/components/herramientas/TarjetaZona";
import type { TipoVentaDto, VendedorDto } from "@/lib/dto";
import { colaVacia, leerCola, suscribirCola } from "@/lib/pedidos-cola";
import { usePreferencia } from "@/lib/preferencias";

interface Props {
  marcas: MarcaConModelos[];
  tiposVenta: TipoVentaDto[];
  vendedores: VendedorDto[];
  idUsuario: number;
  esAdmin: boolean;
}

/**
 * Versión simplificada de «Herramientas» para el Dashboard: solo las dos cajas de arrastre (pedidos de clientes y pagos de RCI) y la cola de pedidos,
 * en un bloque que se pliega como los demás. La biblioteca, el historial, el contraste de rejillas, la papelera y los ajustes de lectura siguen en Herramientas.
 */
export default function DocumentosDashboard({ marcas, tiposVenta, vendedores, idUsuario, esAdmin }: Props) {
  const [guardada, guardar] = usePreferencia("dash-docs-pestana");
  const activa = guardada === "cola" ? "cola" : "subir";
  const enCola = useSyncExternalStore(suscribirCola, leerCola, colaVacia).items.length;
  const [vendedorId, setVendedorId] = useState(idUsuario);
  const pestana = (id: "subir" | "cola", texto: string) => (
    <button type="button" role="tab" aria-selected={activa === id} className={activa === id ? "btn btn-primary" : "btn btn-secondary"} onClick={() => guardar(id)} style={{ padding: "5px 14px", fontSize: "0.88rem" }}>
      {texto}
      {id === "cola" && enCola > 0 && <span style={{ marginLeft: "8px", background: "var(--danger, #ef4444)", color: "#fff", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 700, padding: "1px 7px" }}>{enCola}</span>}
    </button>
  );

  return (
    <Plegable
      id="dash-documentos"
      titulo="📥 Pedidos y pagos"
      resumen={enCola > 0 ? `📋 ${enCola} pedido${enCola === 1 ? "" : "s"} esperando en la cola` : "Arrastra aquí los pedidos de clientes y los pagos de RCI"}
      acciones={
        <Link href="/dashboard/herramientas" style={{ fontSize: "0.9rem", fontWeight: 600 }} title="Biblioteca, historial de lecturas, contraste de rejillas, papelera y ajustes de lectura">
          Más herramientas
        </Link>
      }
    >
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }} role="tablist">
        {pestana("subir", "📥 Subir documentos")}
        {pestana("cola", "📋 Cola de pedidos")}
      </div>
      {activa === "subir" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px" }}>
          <TarjetaZona titulo="📄 Pedidos de clientes" ayuda="Arrastra los pedidos (PDF o foto): se leen y pasan a la cola de pedidos. Lo que no sea un pedido se ignora.">
            <ZonaPedidos compacta sinOpciones />
          </TarjetaZona>
          <TarjetaZona titulo="💳 Pagos de la financiera (RCI)" ayuda="Arrastra los pagos de RCI (PDF o foto): la fecha de pago fija la fecha RCI de su expediente. Lo que no sea un pago se ignora.">
            <ZonaPagosRci />
          </TarjetaZona>
        </div>
      ) : (
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
          {enCola === 0 && <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.85rem" }}>No hay pedidos esperando. Los que subas en «Subir documentos» aparecerán aquí según se vayan leyendo.</p>}
        </div>
      )}
    </Plegable>
  );
}
