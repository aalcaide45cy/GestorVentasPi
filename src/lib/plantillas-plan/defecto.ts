import type { PlanEditable } from "@/lib/servicios/planes";
import { aplicar, type CatalogoNombres, type Componente, type Fragmento } from "./fragmentos";

/**
 * Ajustes con los que nace un plan de comisionamiento nuevo: son los de los planes que se usaban cuando se fijó este valor (tramos de X-4 a X+3,
 * tarifas VN por modelo y por tasa de intervención, y los usados puntuando como un coche más). No es un plan guardado ni se carga en la
 * base de datos: solo se usa al pulsar «Nuevo plan», y marcas y modelos se buscan por nombre (los que no existan se omiten). No incluye
 * vendedores, fechas ni nombre.
 */
const TARIFAS_VN: NonNullable<Fragmento["tarifasVN"]> = [
  { marca: "Dacia", modelo: "Sandero", tasaCumplida: true, importes: { "3": 6000, "2": 6000, "1": 5500, "0": 5000, "-1": 3000, "-2": 2000, "-3": 1000, "-4": 1000 }, activo: true, orden: 0 },
  { marca: "Dacia", modelo: "Sandero", tasaCumplida: false, importes: { "3": 3000, "2": 3000, "1": 2500, "0": 2000, "-1": 1000, "-2": 1000, "-3": 500, "-4": 500 }, activo: true, orden: 0 },
  { marca: "Renault", modelo: "Clio", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 0 },
  { marca: "Renault", modelo: "Clio", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 0 },
  { marca: "Dacia", modelo: "Sandero Stepway", tasaCumplida: true, importes: { "3": 6000, "2": 6000, "1": 5500, "0": 5000, "-1": 3000, "-2": 2000, "-3": 1000, "-4": 1000 }, activo: true, orden: 1 },
  { marca: "Dacia", modelo: "Sandero Stepway", tasaCumplida: false, importes: { "3": 3000, "2": 3000, "1": 2500, "0": 2000, "-1": 1000, "-2": 1000, "-3": 500, "-4": 500 }, activo: true, orden: 1 },
  { marca: "Renault", modelo: "Clio CL6", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 1 },
  { marca: "Renault", modelo: "Clio CL6", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 1 },
  { marca: "Dacia", modelo: "Duster", tasaCumplida: true, importes: { "3": 6000, "2": 6000, "1": 5500, "0": 5000, "-1": 3000, "-2": 2000, "-3": 1000, "-4": 1000 }, activo: true, orden: 2 },
  { marca: "Dacia", modelo: "Duster", tasaCumplida: false, importes: { "3": 3000, "2": 3000, "1": 2500, "0": 2000, "-1": 1000, "-2": 1000, "-3": 500, "-4": 500 }, activo: true, orden: 2 },
  { marca: "Renault", modelo: "Captur", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 2 },
  { marca: "Renault", modelo: "Captur", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 2 },
  { marca: "Dacia", modelo: "Jogger", tasaCumplida: true, importes: { "3": 6000, "2": 6000, "1": 5500, "0": 5000, "-1": 3000, "-2": 2000, "-3": 1000, "-4": 1000 }, activo: true, orden: 3 },
  { marca: "Dacia", modelo: "Jogger", tasaCumplida: false, importes: { "3": 3000, "2": 3000, "1": 2500, "0": 2000, "-1": 1000, "-2": 1000, "-3": 500, "-4": 500 }, activo: true, orden: 3 },
  { marca: "Renault", modelo: "Symbioz", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 3 },
  { marca: "Renault", modelo: "Symbioz", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 3 },
  { marca: "Dacia", modelo: "Bigster", tasaCumplida: true, importes: { "3": 6000, "2": 6000, "1": 5500, "0": 5000, "-1": 3000, "-2": 2000, "-3": 1000, "-4": 1000 }, activo: true, orden: 4 },
  { marca: "Dacia", modelo: "Bigster", tasaCumplida: false, importes: { "3": 3000, "2": 3000, "1": 2500, "0": 2000, "-1": 1000, "-2": 1000, "-3": 500, "-4": 500 }, activo: true, orden: 4 },
  { marca: "Renault", modelo: "Arkana", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 4 },
  { marca: "Renault", modelo: "Arkana", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 4 },
  { marca: "Dacia", modelo: "Striker", tasaCumplida: true, importes: { "3": 6000, "2": 6000, "1": 5500, "0": 5000, "-1": 3000, "-2": 2000, "-3": 1000, "-4": 1000 }, activo: true, orden: 5 },
  { marca: "Dacia", modelo: "Striker", tasaCumplida: false, importes: { "3": 3000, "2": 3000, "1": 2500, "0": 2000, "-1": 1000, "-2": 1000, "-3": 500, "-4": 500 }, activo: true, orden: 5 },
  { marca: "Renault", modelo: "Austral", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 5 },
  { marca: "Renault", modelo: "Austral", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 5 },
  { marca: "Dacia", modelo: "Spring", tasaCumplida: true, importes: { "3": 6000, "2": 6000, "1": 5500, "0": 5000, "-1": 3000, "-2": 2000, "-3": 1000, "-4": 1000 }, activo: true, orden: 6 },
  { marca: "Dacia", modelo: "Spring", tasaCumplida: false, importes: { "3": 3000, "2": 3000, "1": 2500, "0": 2000, "-1": 1000, "-2": 1000, "-3": 500, "-4": 500 }, activo: true, orden: 6 },
  { marca: "Renault", modelo: "Espace", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 6 },
  { marca: "Renault", modelo: "Espace", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 6 },
  { marca: "Renault", modelo: "Rafale", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 7 },
  { marca: "Renault", modelo: "Rafale", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 7 },
  { marca: "Renault", modelo: "R5", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 8 },
  { marca: "Renault", modelo: "R5", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 8 },
  { marca: "Renault", modelo: "R4", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 9 },
  { marca: "Renault", modelo: "R4", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 9 },
  { marca: "Renault", modelo: "Twingo", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 10 },
  { marca: "Renault", modelo: "Twingo", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 10 },
  { marca: "Renault", modelo: "Scenic", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 11 },
  { marca: "Renault", modelo: "Scenic", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 11 },
  { marca: "Renault", modelo: "Megane E-Tech", tasaCumplida: true, importes: { "3": 14000, "2": 12500, "1": 11000, "0": 10000, "-1": 8000, "-2": 6000, "-3": 4000, "-4": 3000 }, activo: true, orden: 12 },
  { marca: "Renault", modelo: "Megane E-Tech", tasaCumplida: false, importes: { "3": 8000, "2": 7000, "1": 6000, "0": 5000, "-1": 4000, "-2": 3000, "-3": 2000, "-4": 1000 }, activo: true, orden: 12 },
];

export const FRAGMENTO_POR_DEFECTO: Fragmento = {
  resumen: {"tramoMin": -4, "tramoMax": 3, "puntosPorPedido": 0},
  tasas: [],
  tasasPlan: {"tasaGlobalTipo": "porcentaje", "tasaGlobalObjetivo": null, "tasaVoTipo": "porcentaje", "tasaVoObjetivo": null, "tasaIncluyeVo": true},
  tarifasVN: TARIFAS_VN,
  opcionesUsados: {"voPuntosModo": "cuentan", "voPuntos": 100},
  penalizacion: {"importe": 0, "titulo": null, "descripcion": null},
};

export const COMPONENTES_POR_DEFECTO: Componente[] = ["resumen", "tasas", "tarifasVN", "opcionesUsados", "penalizacion"];

/** Pone en un plan recién creado los ajustes por defecto (nunca toca nombre, fechas, estado ni vendedores). Devuelve cuántas tarifas se han puesto. */
export function conAjustesPorDefecto<P extends PlanEditable>(plan: P, cat: CatalogoNombres): { plan: P; tarifas: number } {
  const r = aplicar(plan, FRAGMENTO_POR_DEFECTO, cat, COMPONENTES_POR_DEFECTO, {});
  const conservar = new Set(["idPlan", "nombre", "fechaInicio", "fechaFin", "estado", "pendientes", "vendedores"]);
  const nuevo = { ...plan, ...Object.fromEntries(Object.entries(r.plan).filter(([k]) => !conservar.has(k))) } as P;
  return { plan: nuevo, tarifas: r.resultados.find((x) => x.componente === "tarifasVN")?.aplicados ?? 0 };
}
