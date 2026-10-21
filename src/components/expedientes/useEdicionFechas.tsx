"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { ExpedienteDto } from "@/lib/dto";
import { hoyIsoCliente } from "@/lib/date-utils";
import VisorAdjuntos from "@/components/documentos/VisorAdjuntos";
import FechaRapida from "@/components/FechaRapida";
import { mensajeDeError, type CampoFecha } from "./comun";

interface Pendiente {
  expediente: ExpedienteDto;
  campo: CampoFecha;
  nombre: string;
}

type Cambios = Partial<Pick<ExpedienteDto, CampoFecha | "matricula" | "vin">>;

/**
 * Edición y borrado inline de fechas con sus modales (lápiz y papelera).
 * `alCambiar` recibe los cambios aplicados para actualizar la lista local sin recargar.
 */
export function useEdicionFechas(alCambiar: (id: number, cambios: Cambios) => void): {
  abrirEditar: (exp: ExpedienteDto, campo: CampoFecha, nombre: string) => void;
  abrirBorrar: (exp: ExpedienteDto, campo: CampoFecha, nombre: string) => void;
  modales: ReactNode;
} {
  const router = useRouter();
  const { mostrar } = useToast();
  const [editando, setEditando] = useState<Pendiente | null>(null);
  const [borrando, setBorrando] = useState<Pendiente | null>(null);
  const [fecha, setFecha] = useState("");
  const [matricula, setMatricula] = useState("");
  const [vin, setVin] = useState("");
  /** Fecha RCI que se pide al matricular cuando el tipo de pago la exige y el expediente aún no la tiene. */
  const [fechaRciObligatoria, setFechaRciObligatoria] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const abrirEditar = (expediente: ExpedienteDto, campo: CampoFecha, nombre: string) => {
    // La facturación no se propone con la fecha de hoy (un Enter despistado la dejaría puesta): se parte de la de matriculación o se deja vacía
    setFecha(expediente[campo] || (campo === "fecha_facturacion" ? (expediente.fecha_matriculacion ?? "") : hoyIsoCliente()));
    setMatricula(expediente.matricula || "");
    setVin(expediente.vin || "");
    setFechaRciObligatoria("");
    setEditando({ expediente, campo, nombre });
  };

  const exigeRci = (e: ExpedienteDto): boolean => !!e.tipoDeVenta?.requiere_rci_al_matricular && !e.fecha_rci;

  const abrirBorrar = (expediente: ExpedienteDto, campo: CampoFecha, nombre: string) => {
    setBorrando({ expediente, campo, nombre });
  };

  /** Guarda la fecha; devuelve lo que falta pero no ha impedido guardar (por ejemplo, la fecha RCI). */
  async function enviar(id: number, cambios: Cambios): Promise<string[]> {
    const res = await fetch("/api/expedientes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_expediente: id, expediente: cambios }),
    });
    if (!res.ok) throw new Error(await mensajeDeError(res, "Error al actualizar la fecha"));
    const r = (await res.json().catch(() => ({}))) as { avisos?: { mensaje: string }[] };
    return (r.avisos ?? []).map((a) => a.mensaje);
  }

  const guardar = async () => {
    if (!editando) return;
    const { expediente, campo, nombre } = editando;
    const cambios: Cambios = { [campo]: fecha || null };
    if (campo === "fecha_afectacion") {
      // El bastidor es opcional: solo se envía si se ha escrito algo distinto
      const nuevo = vin.trim().toUpperCase();
      if (nuevo && nuevo !== (expediente.vin ?? "")) cambios.vin = nuevo;
    }
    if (campo === "fecha_matriculacion") {
      cambios.matricula = matricula || null;
      // Los pagos marcados «Requerido al matricular» (crédito, preference...) piden la fecha RCI; si no se indica, se guarda igualmente y se avisa
      if (fecha && exigeRci(expediente) && fechaRciObligatoria) cambios.fecha_rci = fechaRciObligatoria;
    }
    if (campo === "fecha_facturacion" && fecha && exigeRci(expediente) && fechaRciObligatoria) cambios.fecha_rci = fechaRciObligatoria;
    setOcupado(true);
    try {
      const avisos = await enviar(expediente.id_expediente, cambios);
      alCambiar(expediente.id_expediente, cambios);
      mostrar(`Fecha de ${nombre} actualizada correctamente.`);
      if (avisos.length > 0) mostrar(avisos[0], "aviso", 9000);
      setEditando(null);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Ocurrió un error al guardar la fecha.", "error");
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async () => {
    if (!borrando) return;
    const { expediente, campo, nombre } = borrando;
    setOcupado(true);
    try {
      await enviar(expediente.id_expediente, { [campo]: null });
      alCambiar(expediente.id_expediente, { [campo]: null });
      mostrar(`Fecha de ${nombre} eliminada correctamente.`);
      setBorrando(null);
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Ocurrió un error al eliminar la fecha.", "error");
    } finally {
      setOcupado(false);
    }
  };

  const modales = (
    <>
      {editando && (
        <Modal
          titulo={`Establecer fecha de ${editando.nombre}`}
          ancho="540px"
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)} disabled={ocupado}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={guardar} disabled={ocupado}>
                {ocupado ? "Guardando..." : "Aceptar"}
              </button>
            </>
          }
        >
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Selecciona Fecha</label>
            <FechaRapida valor={fecha} alCambiar={setFecha} />
          </div>
          {editando.campo === "fecha_afectacion" && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Número de bastidor (VIN) (Opcional)</label>
              <input type="text" className="form-input" value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="17 caracteres, ej. VF1RJA00000000000" maxLength={17} style={{ fontFamily: "monospace" }} />
            </div>
          )}
          {editando.campo === "fecha_rci" && (
            <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "12px" }}>
              <VisorAdjuntos idExpediente={editando.expediente.id_expediente} titulo="📎 Documentos de la financiación (RCI)" />
            </div>
          )}
          {(editando.campo === "fecha_matriculacion" || editando.campo === "fecha_facturacion") && exigeRci(editando.expediente) && (
            <div className="form-group" style={{ marginBottom: 0, padding: "12px", border: "1px solid var(--warning)", borderRadius: "var(--radius-sm)" }}>
              <label className="form-label">Fecha RCI (la pide el pago «{editando.expediente.tipoDeVenta?.nombre_tipo_venta}»; si no la sabes, se guarda igualmente y se avisa)</label>
              <FechaRapida valor={fechaRciObligatoria} alCambiar={setFechaRciObligatoria} />
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Fecha de contratación de la financiera. Se tiene en cuenta para la tasa de intervención y las comisiones.</span>
            </div>
          )}
          {editando.campo === "fecha_matriculacion" && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Matrícula (Opcional)</label>
              <input
                type="text"
                className="form-input"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                placeholder="Ej. 1234ABC"
              />
            </div>
          )}
        </Modal>
      )}
      {borrando && (
        <Modal
          titulo={`¿Eliminar fecha de ${borrando.nombre}?`}
          pie={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setBorrando(null)} disabled={ocupado}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={borrar}
                disabled={ocupado}
                style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
              >
                {ocupado ? "Eliminando..." : "Eliminar"}
              </button>
            </>
          }
        >
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
            Esta acción borrará la fecha registrada para este expediente. ¿Deseas continuar?
          </p>
        </Modal>
      )}
    </>
  );

  return { abrirEditar, abrirBorrar, modales };
}
