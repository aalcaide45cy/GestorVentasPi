import { z } from "zod";

/** Ajustes de los proveedores habituales: solo hay que poner el correo y la contraseña. */
export const PROVEEDORES = {
  gmail: {
    nombre: "Gmail",
    host: "smtp.gmail.com",
    puerto: 465,
    seguro: true,
    ayuda:
      "Hace falta una «contraseña de aplicación» (Cuenta de Google → Seguridad → Verificación en dos pasos → Contraseñas de aplicaciones). La contraseña normal no vale.",
  },
  ionos: {
    nombre: "IONOS",
    host: "smtp.ionos.es",
    puerto: 587,
    seguro: false,
    ayuda: "Usa el correo completo y su contraseña de IONOS.",
  },
  outlook: {
    nombre: "Outlook / Microsoft 365",
    host: "smtp-mail.outlook.com",
    puerto: 587,
    seguro: false,
    ayuda:
      "Si tienes verificación en dos pasos, crea una contraseña de aplicación.",
  },
  otro: {
    nombre: "Otro proveedor",
    host: "",
    puerto: 587,
    seguro: false,
    ayuda:
      "Pide a tu proveedor el servidor de correo saliente (SMTP) y su puerto.",
  },
} as const;
export type Proveedor = keyof typeof PROVEEDORES;

export const esquemaCuenta = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(80),
  email: z.string().trim().email("El correo no es válido").max(255),
  proveedor: z.enum(["gmail", "ionos", "outlook", "otro"]),
  host: z.string().trim().min(1, "Falta el servidor").max(255),
  puerto: z.number().int().min(1).max(65535),
  seguro: z.boolean(),
  usuario_smtp: z.string().trim().min(1, "Falta el usuario").max(255),
  /** Vacía al editar = se conserva la que ya había. */
  password: z.string().max(500).default(""),
  firma: z.string().max(3_000_000).default(""),
  limite_diario: z.number().int().min(0).max(100000).default(200),
  activa: z.boolean().default(true),
});
export type EntradaCuenta = z.infer<typeof esquemaCuenta>;

export interface CuentaDto {
  id: number;
  id_usuario: number;
  nombre: string;
  email: string;
  proveedor: Proveedor;
  host: string;
  puerto: number;
  seguro: boolean;
  usuario_smtp: string;
  /** Si hay contraseña guardada (nunca se devuelve). */
  con_password: boolean;
  firma: string;
  limite_diario: number;
  activa: boolean;
  /** Correos enviados hoy desde esta cuenta. */
  enviados_hoy: number;
}

export const esquemaPlantilla = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(80),
  asunto: z.string().trim().max(300).default(""),
  /** Destinatarios opcionales (varios separados por comas; admiten campos como {email_cliente}). */
  para: z.string().trim().max(1000).default(""),
  /** Añade al final la firma de la cuenta desde la que se envía. */
  con_firma: z.boolean().default(true),
  cuerpo: z.string().max(200_000).default(""),
});
export type EntradaPlantilla = z.input<typeof esquemaPlantilla>;
export interface PlantillaDto {
  id: number;
  nombre: string;
  asunto: string;
  para: string;
  con_firma: boolean;
  cuerpo: string;
}

export const ESTADOS_CORREO = [
  "borrador",
  "programado",
  "enviando",
  "enviado",
  "error",
  "cancelado",
] as const;
export type EstadoCorreo = (typeof ESTADOS_CORREO)[number];

export const esquemaCorreo = z.object({
  id_cuenta: z.number().int().positive().nullable().optional(),
  id_plantilla: z.number().int().positive().nullable().optional(),
  id_expediente: z.number().int().positive().nullable().optional(),
  id_cliente: z.number().int().positive().nullable().optional(),
  para: z.string().max(1000).default(""),
  asunto: z.string().max(300).default(""),
  cuerpo: z.string().max(5_000_000).default(""),
  adjuntos: z.array(z.number().int().positive()).max(20).default([]),
  /** Si se pide una plantilla, se rellena con los datos del expediente (y lo escrito aquí la sustituye). */
  rellenar: z.boolean().default(false),
});
export type EntradaCorreo = z.input<typeof esquemaCorreo>;

/** Los cambios de un correo: solo se tocan los campos que vienen. */
export const esquemaCambioCorreo = z.object({
  id_cuenta: z.number().int().positive().nullable().optional(),
  para: z.string().max(1000).optional(),
  asunto: z.string().max(300).optional(),
  cuerpo: z.string().max(5_000_000).optional(),
  adjuntos: z.array(z.number().int().positive()).max(20).optional(),
});
export type EntradaCambioCorreo = z.infer<typeof esquemaCambioCorreo>;

export interface CorreoDto {
  id: number;
  id_usuario: number;
  id_cuenta: number | null;
  cuenta: string | null;
  id_plantilla: number | null;
  id_expediente: number | null;
  id_cliente: number | null;
  cliente: string | null;
  para: string;
  asunto: string;
  cuerpo: string;
  adjuntos: number[];
  estado: EstadoCorreo;
  origen: string;
  regla: string | null;
  error: string | null;
  intentos: number;
  creado_en: string;
  enviado_en: string | null;
}

export interface AjustesCorreoDto {
  envio_automatico: boolean;
  pausa_segundos: number;
}
export const esquemaAjustesCorreo = z.object({
  envio_automatico: z.boolean(),
  pausa_segundos: z.number().int().min(1).max(600),
});

/** Los campos que se pueden poner en una plantilla (entre llaves). */
export const CAMPOS_CORREO: {
  clave: string;
  etiqueta: string;
  grupo: string;
}[] = [
  { clave: "cliente", etiqueta: "Nombre del cliente", grupo: "Cliente" },
  { clave: "dni", etiqueta: "DNI", grupo: "Cliente" },
  { clave: "email_cliente", etiqueta: "Correo del cliente", grupo: "Cliente" },
  {
    clave: "telefono_cliente",
    etiqueta: "Teléfono del cliente",
    grupo: "Cliente",
  },
  { clave: "domicilio", etiqueta: "Domicilio", grupo: "Cliente" },
  {
    clave: "expediente",
    etiqueta: "Número de expediente",
    grupo: "Expediente",
  },
  { clave: "matricula", etiqueta: "Matrícula", grupo: "Expediente" },
  { clave: "bastidor", etiqueta: "Bastidor", grupo: "Expediente" },
  { clave: "marca", etiqueta: "Marca", grupo: "Expediente" },
  { clave: "modelo", etiqueta: "Modelo", grupo: "Expediente" },
  { clave: "tipo_pago", etiqueta: "Tipo de pago", grupo: "Expediente" },
  { clave: "estado", etiqueta: "Estado", grupo: "Expediente" },
  {
    clave: "estado_intranet",
    etiqueta: "Estado en la intranet",
    grupo: "Expediente",
  },
  { clave: "vendedor", etiqueta: "Vendedor", grupo: "Expediente" },
  { clave: "tienda", etiqueta: "Tienda", grupo: "Expediente" },
  { clave: "comentarios", etiqueta: "Comentarios", grupo: "Expediente" },
  { clave: "fecha_pedido", etiqueta: "Fecha del pedido", grupo: "Fechas" },
  {
    clave: "fecha_afectacion",
    etiqueta: "Fecha de afectación",
    grupo: "Fechas",
  },
  { clave: "fecha_rci", etiqueta: "Fecha RCI", grupo: "Fechas" },
  {
    clave: "fecha_matriculacion",
    etiqueta: "Fecha de matriculación",
    grupo: "Fechas",
  },
  {
    clave: "fecha_facturacion",
    etiqueta: "Fecha de facturación",
    grupo: "Fechas",
  },
  { clave: "fecha_entrega", etiqueta: "Fecha de entrega", grupo: "Fechas" },
  { clave: "hora_entrega", etiqueta: "Hora de la entrega", grupo: "Fechas" },
  {
    clave: "fecha_entrega_hora",
    etiqueta: "Fecha y hora de la entrega",
    grupo: "Fechas",
  },
  { clave: "hoy", etiqueta: "Fecha de hoy", grupo: "Otros" },
  { clave: "firma", etiqueta: "Firma de la cuenta", grupo: "Otros" },
];

const escaparHtml = (t: string): string =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Sustituye {campo} por su valor (los desconocidos se dejan tal cual; los vacíos quedan en blanco). En HTML, el valor se escapa salvo {firma}. */
export function rellenarPlantilla(
  texto: string,
  datos: Record<string, string>,
  comoHtml: boolean,
): string {
  return texto.replace(/\{([a-z_]+)\}/g, (m, k: string) => {
    if (!(k in datos)) return m;
    const v = datos[k] ?? "";
    return comoHtml && k !== "firma" ? escaparHtml(v) : v;
  });
}

/** Direcciones separadas por comas, punto y coma o espacios; quita repetidas. */
export function separarDirecciones(texto: string): string[] {
  return [
    ...new Set(
      texto
        .split(/[,;\s]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
}
export const direccionValida = (d: string): boolean =>
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(d);

/** Preferencia (sincronizada) con el correo predefinido de cada fecha de las listas. */
export const CLAVE_CORREO_BOTONES = "exp-correo-botones";
export const FECHAS_CON_SOBRE = [
  { id: "fecha_afectacion", nombre: "F. Afectación" },
  { id: "fecha_rci", nombre: "F. RCI" },
  { id: "fecha_matriculacion", nombre: "F. Matriculación" },
  { id: "fecha_facturacion", nombre: "F. Facturación" },
  { id: "fecha_entrega", nombre: "F. Entrega" },
] as const;

export interface BotonFecha {
  /** Si la fecha lleva el botón ✉️. */
  activo: boolean;
  id_plantilla: number | null;
  id_cuenta: number | null;
  para: "cliente" | "fijo";
  para_fijo: string;
  /** Al pulsar: abrir el correo para revisarlo, dejarlo directamente en la cola o enviarlo sin preguntar. */
  modo: "revisar" | "cola" | "enviar";
}
export const botonNuevo = (activo: boolean): BotonFecha => ({
  activo,
  id_plantilla: null,
  id_cuenta: null,
  para: "cliente",
  para_fijo: "",
  modo: "revisar",
});

/** Lee la configuración guardada; también entiende el formato antiguo (ids separados por comas). Sin nada guardado, solo la fecha de entrega lleva el botón. */
export function leerBotonesFecha(
  guardado: string | null,
): Record<string, BotonFecha> {
  const res: Record<string, BotonFecha> = {};
  let json: Record<string, Partial<BotonFecha>> | null = null;
  if (guardado?.startsWith("{")) {
    try {
      json = JSON.parse(guardado) as Record<string, Partial<BotonFecha>>;
    } catch {
      json = null;
    }
  }
  const antiguos = json ? [] : (guardado ?? "fecha_entrega").split(",");
  for (const f of FECHAS_CON_SOBRE) {
    const j = json?.[f.id];
    res[f.id] = {
      ...botonNuevo(json ? false : antiguos.includes(f.id)),
      ...(j ?? {}),
    };
  }
  return res;
}
