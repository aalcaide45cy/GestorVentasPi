"use client";

import { useState } from "react";
import type { ClienteDto, TiendaDto } from "@/lib/dto";
import ListaContactos, { contactoVacio, emailsDeCliente, telefonosDeCliente, type ContactoEdicion } from "@/components/expedientes/ListaContactos";

/** Los datos que se escriben en la ficha de un cliente (la ventana de alta y la página de edición usan los mismos campos). */
export function useCamposCliente(inicial: ClienteDto | null = null, tiendaPorDefecto = "") {
  const [dni, setDni] = useState(inicial?.dni ?? "");
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [fechaNacimiento, setFechaNacimiento] = useState(inicial?.fecha_de_nacimiento ?? "");
  const [domicilio, setDomicilio] = useState(inicial?.domicilio ?? "");
  const [poblacion, setPoblacion] = useState(inicial?.poblacion ?? "");
  const [codigoPostal, setCodigoPostal] = useState(inicial?.codigo_postal ?? "");
  const [comentarios, setComentarios] = useState(inicial?.comentarios ?? "");
  const [tiendaId, setTiendaId] = useState(inicial ? (inicial.tienda_id ? String(inicial.tienda_id) : "") : tiendaPorDefecto);
  const [emails, setEmails] = useState<ContactoEdicion[]>(inicial ? emailsDeCliente(inicial) : [contactoVacio()]);
  const [telefonos, setTelefonos] = useState<ContactoEdicion[]>(inicial ? telefonosDeCliente(inicial) : [contactoVacio()]);

  /** Rellena los campos con un cliente (o los vacía, con la tienda por defecto, si no se da ninguno). */
  const cargar = (c: ClienteDto | null, tiendaVacia = "") => {
    setDni(c?.dni ?? "");
    setNombre(c?.nombre ?? "");
    setFechaNacimiento(c?.fecha_de_nacimiento ?? "");
    setDomicilio(c?.domicilio ?? "");
    setPoblacion(c?.poblacion ?? "");
    setCodigoPostal(c?.codigo_postal ?? "");
    setComentarios(c?.comentarios ?? "");
    setTiendaId(c ? (c.tienda_id ? String(c.tienda_id) : "") : tiendaVacia);
    setEmails(c ? emailsDeCliente(c) : [contactoVacio()]);
    setTelefonos(c ? telefonosDeCliente(c) : [contactoVacio()]);
  };

  return { dni, setDni, nombre, setNombre, fechaNacimiento, setFechaNacimiento, domicilio, setDomicilio, poblacion, setPoblacion, codigoPostal, setCodigoPostal, comentarios, setComentarios, tiendaId, setTiendaId, emails, setEmails, telefonos, setTelefonos, cargar };
}

export type CamposDeCliente = ReturnType<typeof useCamposCliente>;

/** Cuerpo del formulario de un cliente: DNI, nombre, domicilio, población, nacimiento, tienda, correos, teléfonos y comentarios. */
export default function CamposCliente({ f, tiendas }: { f: CamposDeCliente; tiendas: TiendaDto[] }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">DNI / NIE</label>
          <input type="text" className="form-input" placeholder="Ej. 12345678Z" value={f.dni} onChange={(e) => f.setDni(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Nombre Completo *</label>
          <input type="text" className="form-input" placeholder="Ej. María López" value={f.nombre} onChange={(e) => f.setNombre(e.target.value)} data-campo="nombreCliente" />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Domicilio</label>
        <input type="text" className="form-input" maxLength={255} value={f.domicilio} onChange={(e) => f.setDomicilio(e.target.value)} placeholder="Calle, número, piso…" autoComplete="off" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Población</label>
          <input type="text" className="form-input" maxLength={120} value={f.poblacion} onChange={(e) => f.setPoblacion(e.target.value)} autoComplete="off" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Código postal</label>
          <input type="text" className="form-input" inputMode="numeric" maxLength={10} value={f.codigoPostal} onChange={(e) => f.setCodigoPostal(e.target.value)} autoComplete="off" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Fecha de Nacimiento</label>
          <input type="date" className="form-input" value={f.fechaNacimiento} onChange={(e) => f.setFechaNacimiento(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Tienda de Registro</label>
          <select className="form-select" value={f.tiendaId} onChange={(e) => f.setTiendaId(e.target.value)}>
            <option value="">Selecciona Tienda (Opcional)</option>
            {tiendas.map((t) => (
              <option key={t.id_tienda} value={t.id_tienda}>
                {t.nombre} {t.ciudad ? `(${t.ciudad})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "start" }}>
        <ListaContactos clase="email" contactos={f.emails} alCambiar={f.setEmails} />
        <ListaContactos clase="telefono" contactos={f.telefonos} alCambiar={f.setTelefonos} />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Comentarios</label>
        <textarea className="form-input" rows={4} maxLength={5000} value={f.comentarios} onChange={(e) => f.setComentarios(e.target.value)} placeholder="Notas internas sobre el cliente…" style={{ resize: "vertical", minHeight: "90px" }} />
      </div>
    </>
  );
}
