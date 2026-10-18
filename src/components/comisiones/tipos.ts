import type { PlanEditable } from "@/lib/servicios/planes";

export type Plan = PlanEditable;

export interface CatalogosComisiones {
  marcas: { id: number; nombre: string }[];
  modelos: { id: number; nombre: string; marcaId: number | null }[];
  vendedores: { id: number; nombre: string; tipo: string }[];
}

export interface PropsPestana {
  plan: Plan;
  setPlan: (cambio: (p: Plan) => Plan) => void;
  cat: CatalogosComisiones;
}

export type Regla = Plan["bonus"][number];

/** Clave nueva para una regla (en conexiones sin contexto seguro no existe `crypto.randomUUID`, así que hay un plan B). */
export const nuevaClave = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export const reglaNueva = (esPenalizacion: boolean): Regla => ({
  nombre: "",
  evento: "matriculacion",
  tipoVehiculo: "cualquiera",
  fechaInicio: null,
  fechaFin: null,
  idMarca: null,
  idModelo: null,
  tasaIntervencion: "indiferente",
  puntos: 0,
  importe: 0,
  esPenalizacion,
  ligarACredito: false,
  clave: nuevaClave(),
  activa: true,
});

/** Lista el rango de tramos del plan: [-4,…,3]. */
export function tramosDe(plan: Plan): number[] {
  const res: number[] = [];
  for (let t = plan.tramoMin; t <= plan.tramoMax; t++) res.push(t);
  return res;
}
