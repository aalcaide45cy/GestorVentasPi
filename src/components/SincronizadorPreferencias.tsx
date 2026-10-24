"use client";

import { useEffect } from "react";
import { esPreferenciaSincronizada } from "@/lib/preferencias-sincronizadas";
import { activarSincronizacion, guardarPreferencia } from "@/lib/preferencias";

const MARCADOR_USUARIO = "gv-prefs-usuario";

const clavesLocalesSincronizadas = (): string[] => {
  const claves: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const c = localStorage.key(i);
    if (c && esPreferenciaSincronizada(c)) claves.push(c);
  }
  return claves;
};

/**
 * Mantiene las preferencias de pantalla de la persona que ha entrado iguales en cualquier equipo: al abrir la app trae las guardadas en el servidor (y
 * las pone en este navegador), y lo que este navegador tenía y el servidor no (los ajustes de antes de que se guardaran en la base de datos) lo
 * sube una sola vez. Si en este navegador entra otro usuario, se quitan antes las del anterior para no mezclarlas.
 */
export default function SincronizadorPreferencias({ idUsuario }: { idUsuario: number }) {
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/preferencias", { credentials: "same-origin", cache: "no-store" });
        if (!r.ok || !vivo) return;
        const servidor = ((await r.json()) as { data?: { valores?: Record<string, string> } }).data?.valores ?? {};
        const marcador = localStorage.getItem(MARCADOR_USUARIO);
        // Otro usuario usó antes este navegador: sus ajustes no son de esta persona
        if (marcador !== null && marcador !== String(idUsuario)) for (const c of clavesLocalesSincronizadas()) localStorage.removeItem(c);
        // Lo que el navegador tiene y el servidor no: se sube (la primera vez, los ajustes de siempre)
        const aSubir: Record<string, string> = {};
        for (const c of clavesLocalesSincronizadas()) {
          const v = localStorage.getItem(c);
          if (v !== null && !(c in servidor)) aSubir[c] = v;
        }
        if (Object.keys(aSubir).length > 0) {
          await fetch("/api/preferencias", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ valores: aSubir }) }).catch(() => undefined);
        }
        // Lo del servidor manda en este navegador
        for (const [c, v] of Object.entries(servidor)) {
          if (esPreferenciaSincronizada(c) && localStorage.getItem(c) !== v) guardarPreferencia(c, v, { soloLocal: true });
        }
        localStorage.setItem(MARCADOR_USUARIO, String(idUsuario));
        activarSincronizacion();
      } catch {
        /* sin servidor o sin almacenamiento: se siguen usando las preferencias de este navegador */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [idUsuario]);
  return null;
}
