"use client";

import { useToast } from "@/components/Toast";
import {
  CLAVE_CLIENTES_COLUMNAS_OCULTAS,
  CLAVE_CLIENTES_ORDEN,
  CLAVE_CLIENTES_POR_PANTALLA,
  CLAVE_CLIENTES_SOLO_CON_VENTAS,
  COLUMNAS_CLIENTES,
  OPCIONES_POR_PANTALLA,
  ORDENES_CLIENTES,
  clientesPorPantalla,
  columnasOcultasClientes,
  ordenClientes,
  type ColumnaCliente,
} from "@/lib/clientes-ajustes";
import { usePreferencia } from "@/lib/preferencias";
import { estiloPanel } from "./utilidades";

const estiloOpcion = (activa: boolean) =>
  ({
    padding: "10px 18px",
    fontSize: "0.92rem",
    fontWeight: activa ? 800 : 500,
    border: `2px solid ${activa ? "var(--primary)" : "var(--border-light)"}`,
    borderRadius: "var(--radius-md)",
    background: activa ? "rgba(var(--primary-rgb), 0.15)" : "rgba(255, 255, 255, 0.02)",
    color: activa ? "var(--primary)" : "var(--text-secondary)",
    cursor: "pointer",
  }) as const;

const estiloCaja = { padding: "24px", display: "flex", flexDirection: "column", gap: "14px", borderLeft: "3px solid var(--primary)" } as const;

/** Pestaña «Clientes»: cómo se abre la lista de clientes (orden, columnas, cuántos y si solo salen los que tienen ventas). Se guarda en el navegador. */
export default function PestanaClientes() {
  const { mostrar } = useToast();
  const [ordenGuardado, guardarOrden] = usePreferencia(CLAVE_CLIENTES_ORDEN);
  const [ocultasGuardado, guardarOcultas] = usePreferencia(CLAVE_CLIENTES_COLUMNAS_OCULTAS);
  const [porPantallaGuardado, guardarPorPantalla] = usePreferencia(CLAVE_CLIENTES_POR_PANTALLA);
  const [soloVentasGuardado, guardarSoloVentas] = usePreferencia(CLAVE_CLIENTES_SOLO_CON_VENTAS);
  const orden = ordenClientes(ordenGuardado);
  const claveOrden = ORDENES_CLIENTES.find((o) => o.campo === orden.campo && o.asc === orden.asc)?.clave ?? ORDENES_CLIENTES[0].clave;
  const ocultas = columnasOcultasClientes(ocultasGuardado);
  const porPantalla = clientesPorPantalla(porPantallaGuardado);

  const alternarColumna = (id: ColumnaCliente, ver: boolean) => guardarOcultas(JSON.stringify(ver ? ocultas.filter((x) => x !== id) : [...ocultas, id]));
  const restaurar = () => {
    guardarOrden(ORDENES_CLIENTES[0].clave);
    guardarOcultas("[]");
    guardarPorPantalla("0");
    guardarSoloVentas("false");
    mostrar("Lista de clientes restaurada: más recientes primero, todas las columnas y todos los clientes.");
  };

  return (
    <div className="glass-panel" style={{ ...estiloPanel, gap: "20px" }}>
      <div>
        <h3 style={{ fontSize: "1.15rem", marginBottom: "8px" }}>👤 Ajustes de Clientes</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
          Cómo se abre la lista de clientes. Estos ajustes se guardan en tu navegador y se aplican al abrir la pantalla «Clientes»; lo que pulses en la propia lista (una cabecera, una casilla) manda mientras la tengas abierta.
        </p>
      </div>

      <div className="glass-panel" style={estiloCaja}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0" }}>↕️ Orden al abrir la lista</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>Cómo salen los clientes al entrar. Se guarda solo.</p>
        </div>
        <select className="form-input" value={claveOrden} onChange={(e) => guardarOrden(e.target.value)} style={{ width: "auto", maxWidth: "380px" }}>
          {ORDENES_CLIENTES.map((o) => (
            <option key={o.clave} value={o.clave}>
              {o.texto}
            </option>
          ))}
        </select>
      </div>

      <div className="glass-panel" style={estiloCaja}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0" }}>👁️ Columnas que se ven</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>Quita las que no uses para que la tabla respire. Nombre, DNI y acciones siempre salen.</p>
        </div>
        <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
          {COLUMNAS_CLIENTES.map((c) => (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input type="checkbox" checked={!ocultas.includes(c.id)} onChange={(e) => alternarColumna(c.id, e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
              {c.etiqueta}
            </label>
          ))}
        </div>
      </div>

      <div className="glass-panel" style={estiloCaja}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0" }}>📄 Cuántos clientes se ven de entrada</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>Con muchos clientes la lista pesa menos si solo salen los primeros; debajo de la tabla hay un botón para ver más. La búsqueda y los filtros siempre miran todos. Se guarda sola.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {OPCIONES_POR_PANTALLA.map((n) => (
            <button key={n} type="button" style={estiloOpcion(porPantalla === n)} onClick={() => guardarPorPantalla(String(n))}>
              {n === 0 ? "Todos" : n}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-panel" style={estiloCaja}>
        <div>
          <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 6px 0" }}>🧾 Clientes sin ventas</h4>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>Si lo marcas, la lista solo enseña los clientes que ya tienen algún expediente. Es la misma casilla que hay encima de la tabla.</p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
          <input type="checkbox" checked={soloVentasGuardado === "true"} onChange={(e) => guardarSoloVentas(e.target.checked ? "true" : "false")} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} />
          Ocultar los clientes que no tienen ventas
        </label>
      </div>

      <div>
        <button type="button" className="btn btn-secondary" onClick={restaurar} title="Vuelve al orden, las columnas y la cantidad de siempre">
          ↺ Restaurar la lista de clientes
        </button>
      </div>
    </div>
  );
}
