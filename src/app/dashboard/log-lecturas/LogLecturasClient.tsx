"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import TablaDatos, { PANTALLA_COMPLETA, type ColumnaTabla } from "@/components/TablaDatos";
import { useToast } from "@/components/Toast";
import { llamar, textoError } from "@/components/comisiones/api";
import { useCarga } from "@/components/comisiones/useCarga";
import { accionSobreLecturas } from "@/lib/lecturas-pedidos-cliente";
import type { RegistroLectura } from "@/lib/servicios/lecturas-pedidos";

type Filtro = "todas" | "problemas" | "pedido" | "descartado" | "error";

const ETIQUETA: Record<string, { texto: string; color: string }> = {
  subiendo: { texto: "Subido, esperando a leerse", color: "var(--text-muted)" },
  pendiente: { texto: "En espera", color: "var(--text-muted)" },
  leyendo: { texto: "Leyéndose", color: "var(--primary)" },
  pedido: { texto: "Pedido leído", color: "var(--success)" },
  descartado: { texto: "Ignorado (no es pedido)", color: "var(--warning)" },
  error: { texto: "Error de lectura", color: "var(--danger)" },
  cancelado: { texto: "Cancelado", color: "var(--text-muted)" },
};
const QUE_SE_HIZO: Record<string, string> = { creado: "Expediente creado", completado: "Expediente completado", quitado: "Quitado de la cola sin crear" };

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });

/**
 * Registro de lecturas de pedidos (últimos tres meses): qué pasó con cada PDF o foto que se subió. Sirve para localizar fallos
 * de lectura, ver si algún expediente no se creó o si un documento no llegó a la cola, y rescatar a la cola lo ignorado.
 */
export default function LogLecturasClient() {
  const { mostrar } = useToast();
  const { datos, recargar } = useCarga<RegistroLectura[]>("/api/documentos/lecturas?registro=1", []);
  const [filtro, setFiltro] = useState<Filtro>("problemas");
  const [ocupado, setOcupado] = useState(false);

  const filas = useMemo(
    () =>
      datos.filter((f) => {
        if (filtro === "todas") return true;
        if (filtro === "problemas") return f.estado === "error" || f.estado === "descartado" || f.estado === "cancelado" || f.avisos.some((a) => a.startsWith("No se pudo leer") || a.startsWith("El lector no lo reconoció")) || (f.estado === "pedido" && f.resolucion === null) || f.resolucion === "quitado";
        return f.estado === filtro;
      }),
    [datos, filtro],
  );

  const rescatar = async (f: RegistroLectura) => {
    setOcupado(true);
    try {
      await accionSobreLecturas("rescatar", [f.id]);
      mostrar("Pasado a la cola de pedidos: lo encontrarás en el panel de pedidos del Panel principal para rellenarlo a mano.");
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };
  const reintentar = async (f: RegistroLectura) => {
    setOcupado(true);
    try {
      await llamar("/api/documentos/lecturas", { method: "PATCH", cuerpo: { accion: "reintentar", ids: [f.id] } });
      mostrar("Se vuelve a leer: el resultado llegará a la cola de pedidos.");
      recargar();
    } catch (e) {
      mostrar(textoError(e), "error");
    } finally {
      setOcupado(false);
    }
  };

  const columnas: ColumnaTabla<RegistroLectura>[] = [
    { clave: "fecha", etiqueta: "Fecha", valor: (f) => f.creadaEn, celda: (f) => fechaHora(f.creadaEn) },
    { clave: "documento", etiqueta: "Documento", valor: (f) => f.nombre, celda: (f) => <b>{f.nombre}</b> },
    { clave: "usuario", etiqueta: "Usuario", valor: (f) => f.usuario ?? "", oculta: true },
    {
      clave: "estado",
      etiqueta: "Qué pasó",
      valor: (f) => ETIQUETA[f.estado]?.texto ?? f.estado,
      celda: (f) => <span style={{ color: ETIQUETA[f.estado]?.color, fontWeight: 600 }}>{ETIQUETA[f.estado]?.texto ?? f.estado}</span>,
    },
    { clave: "motivo", etiqueta: "Motivo / error", valor: (f) => f.error ?? "", celda: (f) => <span style={{ whiteSpace: "normal" }}>{f.error ?? "—"}</span> },
    { clave: "cliente", etiqueta: "Cliente leído", valor: (f) => f.cliente ?? "", celda: (f) => f.cliente ?? "—" },
    { clave: "pedido", etiqueta: "Nº pedido", valor: (f) => f.numeroPedido ?? "", celda: (f) => f.numeroPedido ?? "—" },
    { clave: "vehiculo", etiqueta: "Vehículo leído", valor: (f) => f.vehiculo ?? "", celda: (f) => f.vehiculo ?? "—" },
    {
      clave: "resultado",
      etiqueta: "Qué se hizo",
      valor: (f) => (f.resolucion ? QUE_SE_HIZO[f.resolucion] : f.estado === "pedido" ? "Pendiente en la cola" : ""),
      celda: (f) => {
        if (f.resolucion === null) return f.estado === "pedido" ? <span style={{ color: "var(--warning)" }}>Pendiente en la cola de pedidos</span> : "—";
        return (
          <span>
            {QUE_SE_HIZO[f.resolucion]}
            {f.idExpediente !== null && (f.expedienteActivo ? (
              <>
                {" "}
                · <Link href={`/dashboard/expedientes/editar/${f.idExpediente}`} style={{ color: "var(--primary)" }}>Exp. {f.idExpediente}</Link>
              </>
            ) : (
              <span style={{ color: "var(--danger)" }}> · el expediente {f.idExpediente} ya no existe</span>
            ))}
          </span>
        );
      },
    },
    { clave: "avisos", etiqueta: "Avisos de la lectura", valor: (f) => f.avisos.join(" · "), celda: (f) => <span style={{ whiteSpace: "normal", fontSize: "0.8rem" }}>{f.avisos.join(" · ") || "—"}</span>, oculta: true },
    {
      clave: "acciones",
      etiqueta: "Acciones",
      valor: () => "",
      celda: (f) => (
        <span style={{ display: "inline-flex", gap: "6px" }}>
          {f.estado === "error" && f.rescatable && (
            <>
              <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: "0.78rem" }} disabled={ocupado} onClick={() => void reintentar(f)}>
                🔁 Reintentar
              </button>
              <button type="button" className="btn btn-secondary" style={{ padding: "2px 10px", fontSize: "0.78rem" }} disabled={ocupado} onClick={() => void rescatar(f)}>
                ↩️ Pasar a la cola
              </button>
            </>
          )}
        </span>
      ),
    },
  ];

  const cuenta = (p: (f: RegistroLectura) => boolean) => datos.filter(p).length;
  const botones: [Filtro, string][] = [
    ["problemas", `A revisar (${cuenta((f) => f.estado === "error" || f.estado === "descartado" || f.estado === "cancelado" || (f.estado === "pedido" && f.resolucion === null) || f.resolucion === "quitado")})`],
    ["pedido", `Pedidos leídos (${cuenta((f) => f.estado === "pedido")})`],
    ["descartado", `Ignorados (${cuenta((f) => f.estado === "descartado")})`],
    ["error", `Con error (${cuenta((f) => f.estado === "error")})`],
    ["todas", `Todos (${datos.length})`],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "0 0 40px" }}>
      <div>
        <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Log de lecturas de pedidos</h1>
        <p style={{ color: "var(--text-secondary)" }} title="De lo ignorado no se guarda el fichero, solo el principio de lo que se leyó para ver por qué; si en realidad era un pedido, vuelve a cargarlo.">
          Qué ha pasado con cada PDF o foto que has subido para leer en los últimos tres meses: si se leyó, se ignoró o falló, y qué se hizo después. Sirve para localizar un pedido que no entró en la cola o un dato mal leído.
        </p>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {botones.map(([f, texto]) => (
          <button key={f} type="button" className={filtro === f ? "btn btn-primary" : "btn btn-secondary"} style={{ padding: "6px 14px" }} onClick={() => setFiltro(f)}>
            {texto}
          </button>
        ))}
      </div>
      <TablaDatos<RegistroLectura> id="log-lecturas" alto={PANTALLA_COMPLETA} columnas={columnas} filas={filas} clave={(f) => f.id} placeholder="Buscar por documento, cliente, nº de pedido, error…" vacio="No hay lecturas con este filtro." />
    </div>
  );
}
