"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import CasillaAnulados, { CasillaDeshabilitados, useMostrarAnulados, useMostrarDeshabilitados } from "@/components/CasillaAnulados";
import CamposCliente, { useCamposCliente } from "@/components/clientes/CamposCliente";
import { marcarDuplicadas, columnasVentas, type VentaConAviso } from "@/components/clientes/ventas-cliente";
import { BotonLeerDni, vincularAdjuntos } from "@/components/documentos/BotonLeerDocumento";
import VisorAdjuntos from "@/components/documentos/VisorAdjuntos";
import { mensajeDeError } from "@/components/expedientes/comun";
import TablaDatos from "@/components/TablaDatos";
import { useToast } from "@/components/Toast";
import { esAnulado } from "@/lib/anulados";
import { señalarCampo } from "@/lib/resaltar";
import type { ClienteDto, ExpedienteDto, TiendaDto } from "@/lib/dto";
import type { ResultadoDni } from "@/lib/servicios/documentos";

interface Props {
  cliente: ClienteDto;
  /** Todos los expedientes del cliente (también los anulados y los deshabilitados: se filtran aquí con sus casillas). */
  expedientes: ExpedienteDto[];
  tiendas: TiendaDto[];
}

/**
 * Ficha de un cliente (página entera, como «Editar expediente»): sus datos y documentos arriba y, debajo, la tabla de todos sus expedientes, con buscador,
 * orden y columnas a elegir. Los anulados y los deshabilitados no cuentan salvo que se activen sus casillas.
 */
export default function FichaCliente({ cliente, expedientes, tiendas }: Props) {
  const router = useRouter();
  const { mostrar } = useToast();
  const campos = useCamposCliente(cliente);
  const [guardando, setGuardando] = useState(false);
  const [refrescoAdjuntos, setRefrescoAdjuntos] = useState(0);

  const [mostrarAnulados, fijarMostrarAnulados] = useMostrarAnulados("clientes");
  const [mostrarDeshabilitados, fijarMostrarDeshabilitados] = useMostrarDeshabilitados("clientes");
  const nAnulados = useMemo(() => expedientes.filter((v) => esAnulado(v.estado_intranet)).length, [expedientes]);
  const nDeshabilitados = useMemo(() => expedientes.filter((v) => v.deshabilitado).length, [expedientes]);
  const filas = useMemo(() => marcarDuplicadas(expedientes.filter((v) => (mostrarAnulados || !esAnulado(v.estado_intranet)) && (mostrarDeshabilitados || !v.deshabilitado))), [expedientes, mostrarAnulados, mostrarDeshabilitados]);
  const nDuplicados = filas.filter((v) => v.__duplicado).length;

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!campos.nombre.trim()) {
      mostrar("Falta el nombre del cliente: escríbelo para poder guardarlo.", "aviso");
      señalarCampo("nombreCliente");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/clientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cliente.id,
          dni: campos.dni.trim() || null,
          nombre: campos.nombre,
          fecha_de_nacimiento: campos.fechaNacimiento || null,
          domicilio: campos.domicilio.trim() || null,
          poblacion: campos.poblacion.trim() || null,
          codigo_postal: campos.codigoPostal.trim() || null,
          comentarios: campos.comentarios.trim() || null,
          tienda_id: campos.tiendaId ? Number(campos.tiendaId) : null,
          emails: campos.emails.filter((e) => e.valor.trim()).map((e) => ({ email: e.valor.trim(), tipo: e.tipo })),
          telefonos: campos.telefonos.filter((t) => t.valor.trim()).map((t) => ({ telefono: t.valor.trim(), tipo: t.tipo })),
        }),
      });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al guardar cliente."));
      mostrar("Cliente actualizado correctamente.");
      router.refresh();
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al guardar cliente.", "error");
    } finally {
      setGuardando(false);
    }
  };

  /** Un DNI leído se guarda al momento con este cliente. */
  const alLeerDni = (r: ResultadoDni) => {
    void vincularAdjuntos(r.adjuntos.map((a) => a.id), { idCliente: cliente.id })
      .then(() => {
        setRefrescoAdjuntos((n) => n + 1);
        mostrar(r.fotoId ? "DNI guardado y foto del cliente detectada." : "DNI guardado. No se ha podido detectar la foto del cliente.");
        router.refresh();
      })
      .catch((e: unknown) => mostrar(e instanceof Error ? e.message : "No se han podido guardar los documentos.", "error"));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <Link href="/dashboard/clientes" style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            ← Volver a Clientes
          </Link>
          <h1 style={{ fontSize: "1.85rem", margin: "6px 0 4px" }}>{cliente.nombre ?? "Cliente sin nombre"}</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            {cliente.dni ? `${cliente.dni} · ` : ""}
            {expedientes.length} {expedientes.length === 1 ? "expediente" : "expedientes"} en total
          </p>
        </div>
        <a href="#expedientes" className="btn btn-secondary" style={{ padding: "8px 16px" }}>
          ⬇ Ir a sus expedientes
        </a>
      </div>

      <form onSubmit={guardar} className="glass-panel" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <h2 style={{ fontSize: "1.2rem", margin: 0 }}>Datos del cliente</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <BotonLeerDni disabled={guardando} alLeer={alLeerDni} />
          </div>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Los documentos que subas aquí se guardan al momento con este cliente.</span>
        </div>
        <CamposCliente f={campos} tiendas={tiendas} />
        <VisorAdjuntos key={refrescoAdjuntos} idCliente={cliente.id} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <Link href="/dashboard/clientes" className="btn btn-secondary">
            Volver
          </Link>
          <button type="submit" className="btn btn-primary" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </form>

      <section id="expedientes" className="glass-panel" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "16px", scrollMarginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <h2 style={{ fontSize: "1.2rem", margin: 0 }}>
            Expedientes de {cliente.nombre ?? "este cliente"} · {filas.length} {filas.length === 1 ? "expediente" : "expedientes"}
            {nDuplicados > 0 && <span style={{ color: "var(--danger)", fontSize: "0.9rem" }}> · ⚠️ {nDuplicados} posibles duplicados</span>}
          </h2>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <CasillaAnulados activa={mostrarAnulados} alCambiar={fijarMostrarAnulados} anulados={nAnulados} />
            <CasillaDeshabilitados activa={mostrarDeshabilitados} alCambiar={fijarMostrarDeshabilitados} deshabilitados={nDeshabilitados} />
          </div>
        </div>
        <TablaDatos<VentaConAviso>
          id="cliente-ventas"
          columnas={columnasVentas}
          filas={filas}
          clave={(e) => e.id_expediente}
          estiloFila={(e) => (e.__duplicado ? { background: "rgba(239, 68, 68, 0.08)" } : {})}
          placeholder="Buscar por código, vehículo, matrícula, bastidor, vendedor…"
          vacio="No hay expedientes asociados a este cliente."
          alto="min(calc(70 * var(--uvh)), 720px)"
        />
      </section>
    </div>
  );
}
