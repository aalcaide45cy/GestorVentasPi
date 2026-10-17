"use client";

import { useEffect, useState } from "react";

/** Subtipos de usados (Configuración › Estados), pedidos una sola vez y compartidos por todos los selectores. */
let subtiposCargados: string[] | null = null;
let peticion: Promise<string[]> | null = null;

function pedirSubtipos(): Promise<string[]> {
  peticion ??= fetch("/api/admin/subtipos-vo")
    .then(async (r) => (r.ok ? ((await r.json()) as { data: { nombre: string }[] }).data.map((s) => s.nombre) : []))
    .catch(() => [])
    .then((l) => {
      subtiposCargados = l.length > 0 ? l : ["USADO", "KM0", "DEMO", "BUYBACK"];
      return subtiposCargados;
    });
  return peticion;
}

export function useSubtiposVo(): string[] {
  const [lista, setLista] = useState<string[]>(subtiposCargados ?? ["USADO", "KM0", "DEMO", "BUYBACK"]);
  useEffect(() => {
    let vigente = true;
    void pedirSubtipos().then((l) => {
      if (vigente) setLista(l);
    });
    return () => {
      vigente = false;
    };
  }, []);
  return lista;
}

/**
 * A qué coches se aplica una regla: nuevos (VN), usados (VO) de cualquier subtipo, o de un subtipo concreto (KM0, DEMO…).
 * `estilo` «regla» guarda cualquiera | nuevo | usado | usado:SUBTIPO; `estilo` «financiacion» guarda TODOS | VN | VO | VO:SUBTIPO.
 */
export default function SelectorVehiculo({ valor, alCambiar, estilo, ancho = "150px", titulo }: { valor: string; alCambiar: (v: string) => void; estilo: "regla" | "financiacion"; ancho?: string; titulo?: string }) {
  const subtipos = useSubtiposVo();
  const reg = estilo === "regla";
  const todos = reg ? "cualquiera" : "TODOS";
  const nuevo = reg ? "nuevo" : "VN";
  const usado = reg ? "usado" : "VO";
  const opciones = [
    { v: todos, t: reg ? "Cualquiera" : "Nuevos y usados" },
    { v: nuevo, t: "Nuevos (VN)" },
    { v: usado, t: "Usados (VO), todos" },
    ...subtipos.map((s) => ({ v: `${usado}:${s}`, t: `Usados · ${s}` })),
  ];
  const lista = opciones.some((o) => o.v === valor) ? opciones : [...opciones, { v: valor, t: valor }];
  return (
    <select className="form-input" style={{ minWidth: ancho }} value={valor} onChange={(e) => alCambiar(e.target.value)} title={titulo ?? "A qué coches se aplica: nuevos, usados o solo un subtipo de usado (KM0, DEMO…). Los subtipos se gestionan en Configuración › Estados"}>
      {lista.map((o) => (
        <option key={o.v} value={o.v}>
          {o.t}
        </option>
      ))}
    </select>
  );
}
