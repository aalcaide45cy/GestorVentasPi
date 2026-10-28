"use client";

import FechaRapida from "@/components/FechaRapida";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { llamar, textoError } from "@/components/comisiones/api";
import type { PredefinidoDto } from "@/lib/servicios/apuntes";

interface Catalogos {
  marcas: { id: number; nombre: string }[];
  modelosPorMarca: Record<number, { id: number; nombre: string }[]>;
  tiposVenta: { id: number; nombre: string }[];
  vendedores: { id: number; nombre: string }[];
}

export interface CambiosMasivos {
  id_modelo?: number;
  id_tipo_de_venta?: number;
  id_usuario?: number;
  fecha_expediente?: string;
  fecha_afectacion?: string;
  fecha_rci?: string;
  fecha_matriculacion?: string;
  fecha_entrega?: string;
  fecha_facturacion?: string;
}

interface Props {
  seleccionados: number;
  /** Los expedientes seleccionados (para cambiar a la vez su semáforo). */
  idsSeleccionados: number[];
  esAdministrador: boolean;
  ocupado: boolean;
  alGuardar: (cambios: CambiosMasivos) => void;
  alCancelar: () => void;
  alAvisar: (mensaje: string) => void;
}

const numeroOVacio = (valor: string): number | "" => (valor ? Number(valor) : "");

/** «Editar Expedientes en Masa»: solo se modifican los campos rellenados. */
export default function ModalEdicionMasiva({ seleccionados, idsSeleccionados, esAdministrador, ocupado, alGuardar, alCancelar, alAvisar }: Props) {
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [marca, setMarca] = useState<number | "">("");
  const [modelo, setModelo] = useState<number | "">("");
  const [tipoVenta, setTipoVenta] = useState<number | "">("");
  const [vendedor, setVendedor] = useState<number | "">("");
  const [fExp, setFExp] = useState("");
  const [fAfect, setFAfect] = useState("");
  const [fRci, setFRci] = useState("");
  const [fFactura, setFFactura] = useState("");
  const [fMat, setFMat] = useState("");
  const [fEntrega, setFEntrega] = useState("");
  // Semáforos (como el del Seguro): el estado que se pondrá a todos los seleccionados, por predefinido (vacío = no modificar)
  const [semaforos, setSemaforos] = useState<PredefinidoDto[]>([]);
  const [estadosSemaforo, setEstadosSemaforo] = useState<Record<number, number | "anadir" | "quitar" | "">>({});
  const [guardandoSemaforo, setGuardandoSemaforo] = useState(false);

  useEffect(() => {
    llamar<PredefinidoDto[]>("/api/admin/apuntes-predefinidos")
      .then((r) => setSemaforos(r.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let activo = true;
    fetch("/api/admin/catalogos")
      .then((r) => r.json())
      .then((r: { success?: boolean; data?: Catalogos }) => {
        if (activo && r.success && r.data) setCatalogos(r.data);
      })
      .catch(() => alAvisar("Error al cargar catálogos para edición masiva."));
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = async () => {
    const cambios: CambiosMasivos = {};
    if (modelo !== "") cambios.id_modelo = modelo;
    if (tipoVenta !== "") cambios.id_tipo_de_venta = tipoVenta;
    if (esAdministrador && vendedor !== "") cambios.id_usuario = vendedor;
    if (fExp) cambios.fecha_expediente = fExp;
    if (fAfect) cambios.fecha_afectacion = fAfect;
    if (fRci) cambios.fecha_rci = fRci;
    if (fFactura) cambios.fecha_facturacion = fFactura;
    if (fMat) cambios.fecha_matriculacion = fMat;
    if (fEntrega) cambios.fecha_entrega = fEntrega;
    const semaforosElegidos = Object.entries(estadosSemaforo).filter(([, v]) => v !== "") as [string, number | "anadir" | "quitar"][];
    if (Object.keys(cambios).length === 0 && semaforosElegidos.length === 0) {
      alAvisar("Por favor, rellene al menos un campo para modificar.");
      return;
    }
    if (semaforosElegidos.length > 0) {
      setGuardandoSemaforo(true);
      try {
        for (const [id, valor] of semaforosElegidos) {
          const cuerpo = typeof valor === "number" ? { accion: "estado_masivo", ids: idsSeleccionados, id_predefinido: Number(id), estado_semaforo: valor } : { accion: "apunte_masivo", ids: idsSeleccionados, id_predefinido: Number(id), operacion: valor };
          await llamar("/api/expedientes/apuntes", { method: "POST", cuerpo });
        }
      } catch (e) {
        alAvisar(textoError(e));
        setGuardandoSemaforo(false);
        return;
      }
      setGuardandoSemaforo(false);
    }
    if (Object.keys(cambios).length > 0) alGuardar(cambios);
    else alCancelar();
  };

  const grupo = (etiqueta: string, ancho: string, control: React.ReactNode) => (
    <div className="form-group" style={{ flex: 1, minWidth: ancho, marginBottom: 0 }}>
      <label className="form-label">{etiqueta}</label>
      {control}
    </div>
  );

  const fecha = (valor: string, fijar: (v: string) => void) => (
    <FechaRapida valor={valor} alCambiar={fijar} />
  );

  return (
    <Modal
      titulo={
        <div>
          <div>Editar Expedientes en Masa ({seleccionados} seleccionados)</div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "4px", fontWeight: 400 }}>
            Rellene únicamente los campos que desea modificar. Los campos vacíos no se alterarán.
          </p>
        </div>
      }
      ancho="1000px"
      tamanoTitulo="1.25rem"
      pie={
        catalogos ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={alCancelar} disabled={ocupado}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void guardar()}
              disabled={ocupado || guardandoSemaforo}
              style={{ backgroundColor: "#2e7d32", color: "white", border: "none", borderRadius: "var(--radius-sm)", padding: "8px 16px", cursor: "pointer", fontWeight: 600 }}
            >
              {ocupado || guardandoSemaforo ? "Guardando..." : "Guardar Cambios"}
            </button>
          </>
        ) : undefined
      }
    >
      {!catalogos ? (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)" }}>Cargando catálogos...</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {grupo(
              "Marca",
              "200px",
              <select
                className="form-select"
                value={marca}
                onChange={(e) => {
                  setMarca(numeroOVacio(e.target.value));
                  setModelo("");
                }}
              >
                <option value="">(No modificar)</option>
                {catalogos.marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>,
            )}
            {grupo(
              "Modelo",
              "200px",
              <select className="form-select" value={modelo} onChange={(e) => setModelo(numeroOVacio(e.target.value))} disabled={marca === ""}>
                <option value="">(No modificar)</option>
                {marca !== "" &&
                  catalogos.modelosPorMarca[marca]?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
              </select>,
            )}
          </div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {grupo(
              "Tipo de Venta",
              "200px",
              <select className="form-select" value={tipoVenta} onChange={(e) => setTipoVenta(numeroOVacio(e.target.value))}>
                <option value="">(No modificar)</option>
                {catalogos.tiposVenta.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>,
            )}
            {esAdministrador &&
              grupo(
                "Vendedor",
                "200px",
                <select className="form-select" value={vendedor} onChange={(e) => setVendedor(numeroOVacio(e.target.value))}>
                  <option value="">(No modificar)</option>
                  {catalogos.vendedores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
                </select>,
              )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "20px 24px" }}>
            {grupo("Fecha Exp.", "0", fecha(fExp, setFExp))}
            {grupo("Fecha Afect.", "0", fecha(fAfect, setFAfect))}
            {grupo("Fecha RCI", "0", fecha(fRci, setFRci))}
            {grupo("Fecha Mat.", "0", fecha(fMat, setFMat))}
            {grupo("Fecha Facturación", "0", fecha(fFactura, setFFactura))}
            {grupo("Fecha Entrega", "0", fecha(fEntrega, setFEntrega))}
          </div>
          {semaforos.length > 0 && (
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {semaforos.map((s) =>
                grupo(
                  s.semaforo ? `🚦 ${s.titulo} (semáforo)` : `📝 ${s.titulo}`,
                  "240px",
                  <select
                    className="form-select"
                    value={estadosSemaforo[s.id] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEstadosSemaforo((x) => ({ ...x, [s.id]: v === "" ? "" : v === "anadir" || v === "quitar" ? v : Number(v) }));
                    }}
                  >
                    <option value="">(No modificar)</option>
                    {s.semaforo ? (
                      s.semaforo_estados.map((e, i) => (
                        <option key={i} value={i}>
                          {e.texto}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="anadir">Añadir a todos los que no lo tengan</option>
                        <option value="quitar">Quitar de todos (va a la Papelera)</option>
                      </>
                    )}
                  </select>,
                ),
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
