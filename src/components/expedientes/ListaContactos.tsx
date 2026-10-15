"use client";

import type { ClienteDto } from "@/lib/dto";

export interface ContactoEdicion {
  valor: string;
  tipo: string;
}

const TIPOS_EMAIL = ["Principal", "Trabajo", "Personal", "Otro"];
const TIPOS_TELEFONO = ["Principal", "Móvil", "Fijo", "Trabajo"];

export const contactoVacio = (): ContactoEdicion => ({ valor: "", tipo: "Principal" });

export function emailsDeCliente(c: ClienteDto | null): ContactoEdicion[] {
  return c && c.emails.length > 0 ? c.emails.map((e) => ({ valor: e.email, tipo: e.tipo_email || "Principal" })) : [contactoVacio()];
}

export function telefonosDeCliente(c: ClienteDto | null): ContactoEdicion[] {
  return c && c.telefonos.length > 0 ? c.telefonos.map((t) => ({ valor: t.telefono, tipo: t.tipo_telefono || "Principal" })) : [contactoVacio()];
}

interface Props {
  clase: "email" | "telefono";
  contactos: ContactoEdicion[];
  alCambiar: (contactos: ContactoEdicion[]) => void;
}

/** Subformulario dinámico de correos o teléfonos del cliente. */
export default function ListaContactos({ clase, contactos, alCambiar }: Props) {
  const esEmail = clase === "email";
  const tipos = esEmail ? TIPOS_EMAIL : TIPOS_TELEFONO;
  const actualizar = (i: number, cambio: Partial<ContactoEdicion>) => alCambiar(contactos.map((c, j) => (j === i ? { ...c, ...cambio } : c)));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span className="form-label" style={{ marginBottom: 0 }}>
          {esEmail ? "Correos Electrónicos" : "Teléfonos de Contacto"}
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => alCambiar([...contactos, { valor: "", tipo: "Alternativo" }])}
          style={{ padding: "6px 12px", fontSize: "0.8rem", borderRadius: "var(--radius-sm)" }}
        >
          + Añadir
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {contactos.map((item, idx) => (
          <div key={idx} style={{ display: "flex", gap: "10px" }}>
            <input
              type={esEmail ? "email" : "text"}
              className="form-input"
              placeholder={esEmail ? "correo@ejemplo.com" : "Ej. 600123456"}
              value={item.valor}
              onChange={(e) => actualizar(idx, { valor: e.target.value })}
              style={{ flex: 2 }}
            />
            <select className="form-select" value={item.tipo} onChange={(e) => actualizar(idx, { tipo: e.target.value })} style={{ flex: 1 }}>
              {!tipos.includes(item.tipo) && <option value={item.tipo}>{item.tipo}</option>}
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {contactos.length > 1 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => alCambiar(contactos.filter((_, j) => j !== idx))}
                style={{ padding: "10px", color: "var(--danger)", border: "1px solid var(--border-light)" }}
              >
                🗑️
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
