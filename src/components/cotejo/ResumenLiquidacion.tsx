"use client";

import { useCarga } from "@/components/comisiones/useCarga";
import TablaDatos, { type ColumnaTabla } from "@/components/TablaDatos";
import { etiquetaTramo, euros, nombreMes, puntos } from "@/lib/formato";
import type { ResumenLiquidacionMes } from "@/lib/servicios/rejillas-visor";

type Coche = ResumenLiquidacionMes["porCoche"][number];
type Bonus = ResumenLiquidacionMes["bonus"][number];

const colCoche: ColumnaTabla<Coche>[] = [
  { clave: "matricula", etiqueta: "Matrícula", valor: (c) => c.matricula ?? "", celda: (c) => <b>{c.matricula ?? "—"}</b> },
  { clave: "cliente", etiqueta: "Cliente", valor: (c) => c.cliente },
  { clave: "vehiculo", etiqueta: "Vehículo", valor: (c) => c.vehiculo },
  { clave: "tipo", etiqueta: "Tipo", valor: (c) => (c.clase === "VO" ? "Usado" : "Nuevo") },
  { clave: "cuenta", etiqueta: "Cuenta este mes", valor: (c) => (c.cuenta ? "Sí" : "No"), oculta: true },
  { clave: "puntos", etiqueta: "Puntos", valor: (c) => c.puntos, celda: (c) => puntos(c.puntos), alinear: "right" },
  { clave: "importe", etiqueta: "Comisión del coche", valor: (c) => c.importeCoche, celda: (c) => <b>{euros(c.importeCoche)}</b>, alinear: "right", ayuda: "Solo la comisión del coche, sin financiación, Preference ni bonus" },
];

const colBonus: ColumnaTabla<Bonus>[] = [
  { clave: "concepto", etiqueta: "Por qué (regla o concepto)", valor: (b) => b.concepto },
  { clave: "matricula", etiqueta: "Matrícula", valor: (b) => b.matricula ?? "", celda: (b) => b.matricula ?? "—" },
  { clave: "cliente", etiqueta: "Cliente", valor: (b) => b.cliente },
  { clave: "vehiculo", etiqueta: "Vehículo", valor: (b) => b.vehiculo },
  { clave: "puntos", etiqueta: "Puntos", valor: (b) => b.puntos, celda: (b) => (b.puntos ? puntos(b.puntos) : "—"), alinear: "right" },
  { clave: "importe", etiqueta: "Importe", valor: (b) => b.importe, celda: (b) => (b.importe ? euros(b.importe) : "—"), alinear: "right" },
];

function Cifra({ etiqueta, children, ayuda }: { etiqueta: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <div title={ayuda} style={{ border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)", padding: "8px 12px", display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
      <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{etiqueta}</span>
      <span style={{ fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.25 }}>{children}</span>
    </div>
  );
}

/**
 * Lo que dice TU liquidación de un mes, con las cifras que hay que cotejar con la rejilla de la empresa: créditos, Preference,
 * tramo, objetivo, puntos, coches, bonus con su motivo y la comisión de cada coche (sin financiación).
 */
export default function ResumenLiquidacion({ usuario, mes }: { usuario: number; mes: string }) {
  const { datos: r } = useCarga<ResumenLiquidacionMes | null>(`/api/comisiones/rejillas/resumen?usuario=${usuario}&mes=${mes}`, null);
  if (r === null) return <p style={{ color: "var(--text-secondary)" }}>Calculando tu liquidación de {nombreMes(mes)}…</p>;
  if (!r.hayPlan) {
    return <p style={{ color: "var(--warning)" }}>⚠️ No hay plan de comisionamiento para {nombreMes(mes)}: la app no tiene cifras que comparar con la hoja.</p>;
  }
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <h4 style={{ margin: 0 }}>🧮 Tu liquidación de {nombreMes(mes)} (para cotejar con la rejilla)</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px" }}>
        <Cifra etiqueta="Tramo del mes" ayuda="Según los puntos que has sumado frente al objetivo">
          {etiquetaTramo(r.tramo)}
        </Cifra>
        <Cifra etiqueta="Objetivo">{puntos(r.objetivoX)} pts</Cifra>
        <Cifra etiqueta="Puntos obtenidos">{puntos(r.puntosMes)} pts</Cifra>
        <Cifra etiqueta="Coches que cuentan" ayuda="Nuevos y usados que cuentan en este mes">
          {r.coches.total} <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>({r.coches.nuevos} VN · {r.coches.usados} VO)</span>
        </Cifra>
        <Cifra etiqueta="Créditos" ayuda="Ventas financiadas (crédito o renting) con incentivo de financiación en el mes de su fecha RCI">
          {r.creditos.numero} · {euros(r.creditos.importe)}
        </Cifra>
        <Cifra etiqueta="Preference" ayuda="Ventas Preference con su incentivo">
          {r.preference.numero} · {euros(r.preference.importe)}
        </Cifra>
        {r.box3.numero > 0 && (
          <Cifra etiqueta="Reglas Preference / BOX3">
            {r.box3.numero} · {euros(r.box3.importe)}
          </Cifra>
        )}
        <Cifra etiqueta="Bruto">{euros(r.totales.bruto)}</Cifra>
        {r.totales.penalizacion > 0 && <Cifra etiqueta="Penalización">{euros(r.totales.penalizacion)}</Cifra>}
        <Cifra etiqueta="Neto a cobrar">{euros(r.totales.neto)}</Cifra>
      </div>

      <div>
        <h5 style={{ margin: "0 0 6px 0" }}>🚗 Comisión de cada coche (solo el coche, sin financiación)</h5>
        <TablaDatos<Coche>
          id="resumen-coches"
          columnas={colCoche}
          filas={r.porCoche}
          clave={(c) => c.idExpediente}
          placeholder="Buscar por matrícula, cliente, vehículo…"
          vacio="Ningún coche cuenta en este mes."
          pie={(fs) => ({ matricula: `${fs.length} coche${fs.length === 1 ? "" : "s"}`, importe: euros(fs.reduce((t, c) => t + c.importeCoche, 0)) })}
        />
      </div>

      <div>
        <h5 style={{ margin: "0 0 6px 0" }}>🎁 Bonus y por qué se aplican</h5>
        <TablaDatos<Bonus>
          id="resumen-bonus"
          columnas={colBonus}
          filas={r.bonus}
          clave={(b) => `${b.idExpediente}|${b.concepto}|${b.importe}|${b.puntos}`}
          placeholder="Buscar por regla, matrícula, cliente…"
          vacio="Este mes no hay bonus, reglas ni conceptos especiales."
          pie={(fs) => ({ concepto: `${fs.length} concepto${fs.length === 1 ? "" : "s"}`, importe: euros(fs.reduce((t, b) => t + b.importe, 0)) })}
        />
      </div>
    </section>
  );
}
