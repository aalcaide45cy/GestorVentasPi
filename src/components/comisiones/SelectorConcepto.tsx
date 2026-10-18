"use client";

type Defecto = "financiacion" | "preference";

const PROPIOS: { v: string; t: string }[] = [
  { v: "financiacion", t: "Financiación" },
  { v: "preference", t: "Preference" },
];

/** Nombre legible de una columna de comisiones: «financiacion», «preference» o el nombre propio tras «extra:». */
export function etiquetaConcepto(c: string): string {
  if (c === "financiacion") return "Financiación";
  if (c === "preference") return "Preference";
  return c.replace(/^extra:/, "");
}

/** Nombres de las columnas propias que ya usa el plan (para sugerirlas al crear otras líneas). */
export function conceptosPropiosDelPlan(lineas: { concepto: string }[]): string[] {
  const nombres = new Set<string>();
  for (const l of lineas) if (l.concepto.startsWith("extra:") && l.concepto.length > 6) nombres.add(l.concepto.slice(6));
  return [...nombres].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Columna de comisiones a la que va el importe de una línea: la habitual (según el tipo de pago), Financiación, Preference u otra propia
 * con el nombre que se quiera (sale como una columna más en las tablas de comisiones).
 */
export default function SelectorConcepto({ valor, defecto, sugerencias, alCambiar }: { valor: string; defecto: Defecto; sugerencias: string[]; alCambiar: (v: string) => void }) {
  const propio = valor.startsWith("extra:");
  const lista = `columnas-propias-${defecto}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "150px" }}>
      <select className="form-input" value={propio ? "otro" : valor} onChange={(e) => alCambiar(e.target.value === "otro" ? "extra:" : e.target.value)} title="Columna de las tablas de comisiones en la que se anota este importe">
        <option value="">Por defecto ({etiquetaConcepto(defecto)})</option>
        {PROPIOS.map((p) => (
          <option key={p.v} value={p.v}>
            {p.t}
          </option>
        ))}
        <option value="otro">Otra columna…</option>
      </select>
      {propio && (
        <>
          <datalist id={lista}>
            {sugerencias.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <input className="form-input" list={lista} placeholder="Nombre de la columna" maxLength={60} value={valor.slice(6)} onChange={(e) => alCambiar(`extra:${e.target.value}`)} style={{ borderColor: valor.slice(6).trim() === "" ? "var(--danger)" : undefined }} />
        </>
      )}
    </div>
  );
}
