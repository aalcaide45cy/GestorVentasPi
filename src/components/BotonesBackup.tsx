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
  const { mostrar, confirmar } = useToast();
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
    const ok = await confirmar({ texto: 
      "¡ATENCIÓN! Estás a punto de importar una copia de DATOS BÁSICOS en JSON.\n\n" +
        "Esto SUSTITUIRÁ tiendas, usuarios, clientes, expedientes y catálogos por los del archivo " + archivo.name + ".\n\n" +
        "Y además BORRARÁ lo que este archivo NO contiene y no se recupera con él: planes de comisionamiento, liquidaciones, libro de puntos, documentos adjuntos (DNI, pedidos), rejillas del cotejo, plantillas y copias internas.\n\n" +
        "Antes de empezar se hará automáticamente una copia de seguridad COMPLETA (.dump) del estado actual, con la que podrás volver atrás desde Configuración › BBDD.\n" +
        "Si lo que quieres es recuperarlo TODO, usa mejor «Restaurar» una copia completa (.dump).\n\n" +
        "¿Seguro que quieres continuar?"
    , peligro: true });
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
      // Sin recargar la página: los datos nuevos llegan con el refresco suave
      router.refresh();
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
        title="Descarga un archivo .json con los datos básicos: tiendas, usuarios, clientes, expedientes, catálogos y ajustes. NO incluye planes de comisionamiento, liquidaciones, puntos, documentos adjuntos, rejillas ni plantillas: para una copia de TODO usa la copia completa (.dump) de Configuración › BBDD. Incluye contraseñas cifradas y secretos del doble factor: guárdalo en un sitio seguro (y guarda también el .env). No borra nada."
      >
        💾 Exportar SOLO datos básicos (JSON, no es copia total)
      </button>
      <label
        className="btn"
        title="Sustituye los datos básicos (tiendas, usuarios, clientes, expedientes, catálogos) por los de un archivo .json y BORRA planes, liquidaciones, puntos y documentos, que el archivo no trae. Es lo más delicado: antes se hace una copia completa (.dump) automática y te pide confirmar. Para recuperar solo una parte usa la importación de cada sección; para recuperarlo todo, restaura una copia .dump."
        style={{ padding: "8px 14px", fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", color: "var(--success)", fontWeight: 500 }}
      >
        🔄 Importar datos básicos (JSON, sustituye)
        <input type="file" accept=".json" onChange={restaurar} style={{ display: "none" }} disabled={ocupado || deshabilitado} />
      </label>
    </>
  );
}
