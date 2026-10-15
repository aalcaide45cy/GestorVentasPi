/** Partes de una copia de la aplicación antigua que se pueden elegir al convertirla (código común a servidor y navegador). */
export const SECCIONES_V1 = ["catalogos", "clientes", "comisiones", "expedientes", "liquidaciones", "historial"] as const;
export type SeccionV1 = (typeof SECCIONES_V1)[number];

export interface InfoSeccionV1 {
  clave: SeccionV1;
  titulo: string;
  ayuda: string;
  /** Tablas de la copia antigua que alimentan esta parte (para mostrar cuántos registros trae). */
  tablas: string[];
  /** Partes que deben cargarse también (porque esta hace referencia a ellas). */
  requiere: SeccionV1[];
}

export const SECCIONES_INFO: InfoSeccionV1[] = [
  {
    clave: "catalogos",
    titulo: "Catálogos",
    ayuda: "Tiendas, marcas, modelos, formas de pago y estados del vehículo. Los expedientes y los planes de comisiones los necesitan.",
    tablas: ["tiendas", "usuariosTiendas", "marcas", "modelos", "tipoDeVenta", "estadoVehiculo"],
    requiere: [],
  },
  {
    clave: "clientes",
    titulo: "Clientes",
    ayuda: "Clientes con sus teléfonos y correos. Si no los eliges, los expedientes se cargan sin cliente asignado.",
    tablas: ["clientes", "emailsClientes", "telefonosClientes"],
    requiere: [],
  },
  {
    clave: "comisiones",
    titulo: "Planes de comisiones",
    ayuda: "Planes, tarifas por modelo, reglas, bonus, objetivos y promociones de puntos. Si no los eliges, los expedientes pierden la promoción asignada.",
    tablas: [
      "commissionPlans", "commissionPlanModelRates", "commissionRules", "commissionBonusRules", "commissionFinanceRules", "commissionUsedRates",
      "commissionFinanceRates", "commissionPreferenceRules", "commissionVoPatterns", "commissionBrandInterventionRates",
    ],
    requiere: ["catalogos"],
  },
  {
    clave: "expedientes",
    titulo: "Expedientes",
    ayuda: "Todos los expedientes de venta con sus fechas, importes y conceptos.",
    tablas: ["expedientes"],
    requiere: ["catalogos"],
  },
  {
    clave: "liquidaciones",
    titulo: "Liquidaciones antiguas",
    ayuda: "Liquidaciones de comisiones ya cerradas en la aplicación antigua (solo lectura). Sirven para compararlas con el cálculo nuevo.",
    tablas: ["commissionLiquidations", "commissionLiquidationLines", "commissionLiquidationLineItems"],
    requiere: ["catalogos", "comisiones"],
  },
  {
    clave: "historial",
    titulo: "Historial de importaciones",
    ayuda: "Registro de las importaciones de Excel hechas en la aplicación antigua (pantalla «Log importación»).",
    tablas: ["importacionesBloques", "importacionesRegistros"],
    requiere: [],
  },
];
