import Link from "next/link";

export interface InfoExpedienteAviso {
  cliente: string;
  vehiculo: string;
  matricula?: string | null;
}

/** Traduce los avisos técnicos del motor de comisiones a frases que se entienden sin saber qué es «el expediente 34». */
function explicar(detalle: string): string {
  const fin = /^Sin incentivo de financiación (\S+) para la marca (.+)$/.exec(detalle);
  if (fin) return `El plan no tiene incentivo de financiación (${fin[1].toLowerCase()}) para ${fin[2]}: este expediente no suma importe por financiar.`;
  const tarifa = /^Sin tarifa para (.+)$/.exec(detalle);
  if (tarifa) return `No hay tarifa en el plan para ${tarifa[1]}: ese coche cuenta 0 €.`;
  return detalle;
}

/**
 * Un aviso del motor de comisiones. Si empieza por «Expediente N: …» muestra quién es (cliente, vehículo y matrícula) con un
 * enlace al expediente en lugar del número suelto.
 */
export default function AvisoComision({ texto, expedientes }: { texto: string; expedientes?: Record<string, InfoExpedienteAviso> }) {
  const m = /^Expediente (\d+):\s*(.*)$/.exec(texto);
  if (!m) return <span style={{ color: "var(--warning)", fontSize: "0.8rem" }}>⚠ {explicar(texto)}</span>;
  const [, id, detalle] = m;
  const info = expedientes?.[id];
  return (
    <span style={{ color: "var(--warning)", fontSize: "0.8rem", lineHeight: 1.4 }}>
      ⚠{" "}
      <Link href={`/dashboard/expedientes/editar/${id}`} style={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }} title="Abrir el expediente">
        {info ? `${info.cliente} · ${info.vehiculo}${info.matricula ? ` (${info.matricula})` : ""}` : `Expediente ${id}`}
      </Link>
      : {explicar(detalle)}
    </span>
  );
}
