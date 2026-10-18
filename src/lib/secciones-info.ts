/**
 * Qué secciones de datos se pueden exportar e importar y qué contiene cada una. Sin dependencias del servidor, para poder usarlo también
 * en el navegador (las cajitas de Configuración › Base de datos salen al instante con esto, antes de que lleguen los números).
 */

export const SECCIONES = ["clientes", "expedientes", "clientes_expedientes", "marcas_modelos", "tipos_venta", "estados", "tiendas", "planes", "plantillas_tarifas", "plantillas_plan", "rejillas", "ajustes", "usuarios"] as const;
export type Seccion = (typeof SECCIONES)[number];
export type Modo = "anadir" | "actualizar" | "sustituir";

export interface InfoSeccion {
  titulo: string;
  /** Qué contiene, en lenguaje sencillo. */
  descripcion: string;
  /** Singular/plural para los mensajes («clientes»). */
  plural: string;
  importable: boolean;
  modos: Modo[];
  /** Aviso sobre datos sensibles que incluye el archivo exportado (null si no hay). */
  aviso: string | null;
}

export const INFO_SECCIONES: Record<Seccion, InfoSeccion> = {
  clientes: { titulo: "Clientes", plural: "clientes", descripcion: "Datos de cada cliente: DNI, nombre, fecha de nacimiento, dirección, tienda, correos y teléfonos.", importable: true, modos: ["anadir", "actualizar", "sustituir"], aviso: "Contiene datos personales de tus clientes (DNI, dirección, teléfonos): guarda el archivo en un sitio seguro." },
  expedientes: { titulo: "Expedientes", plural: "expedientes", descripcion: "Todos los expedientes con su cliente, vehículo, tipo de venta, vendedor, fechas y comisiones a mano.", importable: true, modos: ["anadir", "actualizar", "sustituir"], aviso: "Contiene datos personales (nombre y DNI del cliente) y datos de ventas: guarda el archivo en un sitio seguro." },
  clientes_expedientes: { titulo: "Clientes y expedientes", plural: "clientes y expedientes", descripcion: "Los clientes con todos sus datos y los expedientes enlazados con ellos, en un solo archivo: al importarlo se recomponen solos los clientes y sus expedientes. Es la forma recomendada de llevar tus ventas a otro equipo.", importable: true, modos: ["anadir", "actualizar"], aviso: "Contiene datos personales de tus clientes (DNI, dirección, teléfonos) y datos de ventas: guarda el archivo en un sitio seguro." },
  marcas_modelos: { titulo: "Marcas y modelos", plural: "marcas y modelos", descripcion: "Las marcas con sus modelos y opciones (acceso rápido, sistema de comisiones).", importable: true, modos: ["anadir", "actualizar", "sustituir"], aviso: null },
  tipos_venta: { titulo: "Tipos de venta (formas de pago)", plural: "tipos de venta", descripcion: "Contado, crédito, preference…, con su color, orden y si exigen fecha RCI.", importable: true, modos: ["anadir", "actualizar", "sustituir"], aviso: null },
  estados: { titulo: "Estados de vehículo", plural: "estados de vehículo", descripcion: "Nuevo, usado, KM0, demo…, con su clase (VN o VO).", importable: true, modos: ["anadir", "actualizar", "sustituir"], aviso: null },
  tiendas: { titulo: "Tiendas", plural: "tiendas", descripcion: "Las tiendas o concesiones y su ciudad.", importable: true, modos: ["anadir", "actualizar", "sustituir"], aviso: null },
  planes: { titulo: "Planes de comisionamiento", plural: "planes de comisionamiento", descripcion: "Planes completos (objetivos, tarifas, reglas, bonus…). Se pueden exportar uno, varios o todos; las marcas, modelos y vendedores se identifican por su nombre o correo.", importable: true, modos: ["anadir", "actualizar"], aviso: "Contiene importes de comisiones y objetivos de los vendedores: es información confidencial." },
  plantillas_tarifas: { titulo: "Plantillas de tarifas VN", plural: "plantillas de tarifas", descripcion: "Las plantillas de «Tarifas de modelos VN por tramo» (marcas y modelos por nombre e importes). Sirven para recomponer las tarifas de cualquier plan.", importable: true, modos: ["anadir", "actualizar"], aviso: "Contiene importes de comisiones: es información confidencial." },
  plantillas_plan: { titulo: "Plantillas de planes", plural: "plantillas de planes", descripcion: "Las plantillas de partes de un plan (objetivo, usados, reglas, bonus, penalizaciones, notas…) y del plan completo. Marcas, modelos y vendedores por nombre.", importable: true, modos: ["anadir", "actualizar"], aviso: "Contiene importes de comisiones y objetivos de los vendedores: es información confidencial." },
  rejillas: { titulo: "Cotejo de pagos (rejillas)", plural: "rejillas", descripcion: "Las hojas de comisiones de la empresa que has guardado para cotejar los pagos de cada mes.", importable: true, modos: ["anadir", "actualizar"], aviso: "Contiene importes de comisiones de los vendedores." },
  ajustes: { titulo: "Ajustes de la aplicación", plural: "ajustes", descripcion: "Ajustes generales guardados en la base de datos (se excluyen las claves, tokens y contraseñas).", importable: true, modos: ["anadir", "actualizar"], aviso: null },
  usuarios: { titulo: "Usuarios y vendedores", plural: "usuarios", descripcion: "Nombre, correo, rol, tipo de vendedor y tiendas de cada usuario. Sin contraseñas ni datos de doble factor. Solo se exporta, para consulta: los usuarios se crean desde Configuración › Usuarios.", importable: false, modos: [], aviso: "Contiene correos y datos de los usuarios (nunca contraseñas ni secretos)." },
};
