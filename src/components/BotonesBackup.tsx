"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { descargarTexto } from "@/lib/csv-expedientes";
import { mensajeDeError } from "./expedientes/comun";

const leerLocal = (clave: string): string | null => {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
};
const guardarLocal = (clave: string, valor: string) => {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: la preferencia no se recuerda */
  }
};

/** «Exportar Backup (JSON)» y «Restaurar Backup (JSON)»: solo se muestran al administrador. */
export default function BotonesBackup({ deshabilitado = false }: { deshabilitado?: boolean }) {
  const router = useRouter();
  const { mostrar } = useToast();
  const [ocupado, setOcupado] = useState(false);

  const exportar = async () => {
    setOcupado(true);
    try {
      const res = await fetch("/api/admin/backup");
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al generar la copia de seguridad."));
      const copia = (await res.json()) as Record<string, unknown>;
      const conPreferencias = {
        ...copia,
        preferences: {
          expDefaultPageSize: Number(leerLocal("exp-default-page-size") || "20"),
          sidebarCollapsed: leerLocal("sidebar-collapsed") === "true",
        },
      };
      descargarTexto(`backup_completo_${new Date().toISOString().split("T")[0]}.json`, JSON.stringify(conPreferencias, null, 2), "application/json");
      mostrar("Copia de seguridad JSON exportada correctamente.");
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al exportar copia de seguridad.", "error");
    } finally {
      setOcupado(false);
    }
  };

  const restaurar = async (ev: ChangeEvent<HTMLInputElement>) => {
    const entrada = ev.target;
    const archivo = entrada.files?.[0];
    if (!archivo) return;
    const ok = window.confirm(
      "¡ATENCIÓN! Estás a punto de restaurar una copia COMPLETA en JSON.\n\n" +
        "Esto SUSTITUIRÁ todos los datos actuales (tiendas, usuarios, clientes, expedientes…) por los del archivo " + archivo.name + ".\n" +
        "Antes de empezar se hará automáticamente una copia de seguridad del estado actual, con la que podrás volver atrás.\n\n" +
        "¿Seguro que quieres continuar?",
    );
    if (!ok) {
      entrada.value = "";
      return;
    }
    setOcupado(true);
    try {
      const texto = await archivo.text();
      if (!texto) throw new Error("Archivo vacío");
      const copia = JSON.parse(texto) as { preferences?: { expDefaultPageSize?: unknown; sidebarCollapsed?: unknown } };
      if (copia.preferences) {
        if (typeof copia.preferences.expDefaultPageSize === "number") guardarLocal("exp-default-page-size", String(copia.preferences.expDefaultPageSize));
        if (typeof copia.preferences.sidebarCollapsed === "boolean") guardarLocal("sidebar-collapsed", String(copia.preferences.sidebarCollapsed));
      }
      const res = await fetch("/api/admin/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: texto });
      if (!res.ok) throw new Error(await mensajeDeError(res, "Error al restaurar la copia de seguridad."));
      const r = (await res.json()) as { message?: string };
      mostrar(r.message ?? "Copia restaurada.");
      router.refresh();
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      mostrar(e instanceof Error ? e.message : "Error al procesar el archivo de copia de seguridad JSON.", "error");
    } finally {
      setOcupado(false);
      entrada.value = "";
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={exportar}
        style={{ padding: "8px 14px", fontSize: "0.85rem", backgroundColor: "rgba(124, 58, 237, 0.08)", border: "1px solid rgba(124, 58, 237, 0.2)", color: "var(--primary)", fontWeight: 500 }}
        disabled={ocupado || deshabilitado}
        title="Descarga un archivo .json con TODOS los datos de la aplicación (tiendas, usuarios, clientes, expedientes, catálogos…). Úsalo para guardar o llevar los datos a otro equipo. Ojo: incluye las contraseñas cifradas y los secretos del doble factor, así que guárdalo en un sitio seguro (y guarda también el .env). No borra nada."
      >
        💾 Exportar todo (JSON)
      </button>
      <label
        className="btn"
        title="Sustituye TODOS los datos actuales por los de un archivo .json de «Exportar todo». Es lo más delicado: antes se hace una copia de seguridad automática y te pide confirmar. Para recuperar solo una parte (clientes, planes…) usa la importación de cada sección."
        style={{ padding: "8px 14px", fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", color: "var(--success)", fontWeight: 500 }}
      >
        🔄 Importar todo (JSON, sustituye todo)
        <input type="file" accept=".json" onChange={restaurar} style={{ display: "none" }} disabled={ocupado || deshabilitado} />
      </label>
    </>
  );
}
