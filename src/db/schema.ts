import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Catálogos                                                           */
/* ------------------------------------------------------------------ */

export const tiendas = pgTable("tiendas", {
  idTienda: serial("id_tienda").primaryKey(),
  nombre: text("nombre").notNull(),
  ciudad: varchar("ciudad", { length: 255 }),
});

export const marcas = pgTable("marcas", {
  idMarca: serial("id_marca").primaryKey(),
  nombre: text("nombre").notNull(),
  activo: boolean("activo").default(true),
  accesoRapido: boolean("acceso_rapido").default(false),
  sistemaComisiones: boolean("sistema_comisiones").notNull().default(false),
});

export const modelos = pgTable(
  "modelos",
  {
    idModelo: serial("id_modelo").primaryKey(),
    marcaId: integer("marca_id").references(() => marcas.idMarca, { onDelete: "cascade" }),
    nombreModelo: text("nombre_modelo").notNull(),
    accesoRapido: boolean("acceso_rapido").default(false),
    ordenAccesoRapido: integer("orden_acceso_rapido").default(0),
  },
  (t) => [index("modelos_marca_idx").on(t.marcaId)],
);

export const tipoDeVenta = pgTable("tipo_de_venta", {
  idTipoDeVenta: serial("id_tipo_de_venta").primaryKey(),
  nombreTipoVenta: text("nombre_tipo_venta").notNull(),
  color: varchar("color", { length: 50 }).default("#3b82f6"),
  orden: integer("orden").notNull().default(0),
  /** CONTADO | CREDITO | PREFERENCE | RENTING */
  categoria: varchar("categoria", { length: 20 }).notNull().default("CONTADO"),
});

export const estadoVehiculo = pgTable("estado_vehiculo", {
  idEstadoVehiculo: serial("id_estado_vehiculo").primaryKey(),
  nombreEstadoVehiculo: text("nombre_estado_vehiculo").notNull(),
  predeterminado: boolean("predeterminado").default(false),
  /** VN | VO */
  clase: varchar("clase", { length: 2 }).notNull().default("VN"),
  /** USADO | KM0 | DEMO | BUYBACK … */
  subtipoVo: varchar("subtipo_vo", { length: 30 }),
});

export const ajustes = pgTable("ajustes", {
  clave: varchar("clave", { length: 255 }).primaryKey(),
  valor: text("valor").notNull(),
});

/* ------------------------------------------------------------------ */
/* Usuarios                                                            */
/* ------------------------------------------------------------------ */

export const usuarios = pgTable(
  "usuarios",
  {
    idUsuario: serial("id_usuario").primaryKey(),
    loginEmail: varchar("login_email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    debeCambiarPassword: boolean("debe_cambiar_password").notNull().default(true),
    totpSecretoCifrado: text("totp_secreto_cifrado"),
    totpActivo: boolean("totp_activo").notNull().default(false),
    intentosFallidos: integer("intentos_fallidos").notNull().default(0),
    bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
    ultimoAcceso: timestamp("ultimo_acceso", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    nombre: varchar("nombre", { length: 255 }),
    /** administrador | director | jefe_zona | jefe_tienda | vendedor | invitado */
    rol: varchar("rol", { length: 50 }),
    fechaDeRegistro: date("fecha_de_registro"),
    /** Cuenta suspendida por un administrador. */
    bloqueado: boolean("bloqueado").default(false),
    /** VN | VO */
    tipoVendedor: varchar("tipo_vendedor", { length: 50 }).notNull().default("VN"),
    patronVo: varchar("patron_vo", { length: 100 }).default("Estándar VO"),
    tiendaPredeterminadaId: integer("tienda_predeterminada_id").references(() => tiendas.idTienda, {
      onDelete: "set null",
    }),
  },
);

export const usuariosTiendas = pgTable(
  "usuarios_tiendas",
  {
    idUsuarioTienda: serial("id_usuario_tienda").primaryKey(),
    idUsuario: integer("id_usuario")
      .notNull()
      .references(() => usuarios.idUsuario, { onDelete: "cascade" }),
    idTienda: integer("id_tienda")
      .notNull()
      .references(() => tiendas.idTienda, { onDelete: "cascade" }),
  },
  (t) => [index("usuarios_tiendas_usuario_idx").on(t.idUsuario)],
);

export const emailsUsuarios = pgTable("emails_usuarios", {
  idEmailUsuario: serial("id_email_usuario").primaryKey(),
  idUsuario: integer("id_usuario").references(() => usuarios.idUsuario, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  tipoEmail: varchar("tipo_email", { length: 100 }),
});

export const telefonosUsuarios = pgTable("telefonos_usuarios", {
  idTelefonoUsuario: serial("id_telefono_usuario").primaryKey(),
  idUsuario: integer("id_usuario").references(() => usuarios.idUsuario, { onDelete: "cascade" }),
  telefono: varchar("telefono", { length: 50 }).notNull(),
  tipoTelefono: varchar("tipo_telefono", { length: 100 }),
});

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

export const clientes = pgTable(
  "clientes",
  {
    id: serial("id").primaryKey(),
    clienteId: varchar("cliente_id", { length: 255 }).notNull().unique(),
    dni: varchar("dni", { length: 50 }),
    nombre: varchar("nombre", { length: 255 }),
    fechaDeNacimiento: date("fecha_de_nacimiento"),
    tiendaId: integer("tienda_id").references(() => tiendas.idTienda),
  },
  (t) => [index("clientes_dni_idx").on(t.dni), index("clientes_nombre_lower_idx").on(sql`lower(${t.nombre})`)],
);

export const emailsClientes = pgTable(
  "emails_clientes",
  {
    idEmailCliente: serial("id_email_cliente").primaryKey(),
    idCliente: integer("id_cliente").references(() => clientes.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    tipoEmail: varchar("tipo_email", { length: 100 }),
  },
  (t) => [index("emails_clientes_cliente_idx").on(t.idCliente)],
);

export const telefonosClientes = pgTable(
  "telefonos_clientes",
  {
    idTelefonoCliente: serial("id_telefono_cliente").primaryKey(),
    idCliente: integer("id_cliente").references(() => clientes.id, { onDelete: "cascade" }),
    telefono: varchar("telefono", { length: 50 }).notNull(),
    tipoTelefono: varchar("tipo_telefono", { length: 100 }),
  },
  (t) => [index("telefonos_clientes_cliente_idx").on(t.idCliente)],
);

/* ------------------------------------------------------------------ */
/* Expedientes                                                         */
/* ------------------------------------------------------------------ */

export interface ConceptoEspecial {
  titulo: string;
  importe_centimos: number;
  descripcion: string;
  evento: "afectacion" | "matriculacion" | "cobro";
  cobrado: boolean;
}

export const expedientes = pgTable(
  "expedientes",
  {
    idExpediente: serial("id_expediente").primaryKey(),
    idUsuario: integer("id_usuario").references(() => usuarios.idUsuario),
    idCliente: integer("id_cliente").references(() => clientes.id),
    idModelo: integer("id_modelo").references(() => modelos.idModelo),
    idTienda: integer("id_tienda").references(() => tiendas.idTienda),
    fechaExpediente: date("fecha_expediente"),
    fechaAfectacion: date("fecha_afectacion"),
    fechaMatriculacion: date("fecha_matriculacion"),
    fechaEntrega: date("fecha_entrega"),
    fechaRci: date("fecha_rci"),
    fechaFacturacion: date("fecha_facturacion"),
    matricula: varchar("matricula", { length: 50 }),
    idTipoDeVenta: integer("id_tipo_de_venta").references(() => tipoDeVenta.idTipoDeVenta),
    idEstadoVehiculo: integer("id_estado_vehiculo").references(() => estadoVehiculo.idEstadoVehiculo),
    vin: varchar("vin", { length: 100 }),
    cobradoOtraFecha: boolean("cobrado_otra_fecha").notNull().default(false),
    fechaCobrado: date("fecha_cobrado"),
    comisionCobrada: boolean("comision_cobrada").notNull().default(false),
    comisionCocheCobrada: boolean("comision_coche_cobrada").notNull().default(false),
    comisionUsadoCobrada: boolean("comision_usado_cobrada").notNull().default(false),
    comisionFinanciacionCobrada: boolean("comision_financiacion_cobrada").notNull().default(false),
    comisionPreferenceCobrada: boolean("comision_preference_cobrada").notNull().default(false),
    comisionBonusCobrada: boolean("comision_bonus_cobrada").notNull().default(false),

    /* Motor nuevo (centésimas de punto / céntimos). Se usan a partir de F3. */
    puntos: integer("puntos"),
    /** FK a promociones_puntos: se añade en la migración de F3. */
    idPromocion: integer("id_promocion"),
    comisionCocheManual: integer("comision_coche_manual"),
    comisionFinanciacionManual: integer("comision_financiacion_manual"),
    conceptosEspeciales: jsonb("conceptos_especiales").$type<ConceptoEspecial[]>().notNull().default([]),

    /* Columnas heredadas (solo lectura, para importar copias antiguas) */
    valorObjetivo: doublePrecision("valor_objetivo"),
    minCochesMultiplicador: integer("min_coches_multiplicador").notNull().default(0),
    comisionCocheReal: doublePrecision("comision_coche_real"),
    comisionFinanciacionReal: doublePrecision("comision_financiacion_real"),
    conceptosAdicionales: text("conceptos_adicionales"),
  },
  (t) => [
    index("expedientes_usuario_idx").on(t.idUsuario),
    index("expedientes_cliente_idx").on(t.idCliente),
    index("expedientes_modelo_idx").on(t.idModelo),
    index("expedientes_tienda_idx").on(t.idTienda),
    index("expedientes_fecha_exp_idx").on(t.fechaExpediente),
    index("expedientes_fecha_mat_idx").on(t.fechaMatriculacion),
    index("expedientes_fecha_rci_idx").on(t.fechaRci),
    index("expedientes_fecha_cobrado_idx").on(t.fechaCobrado),
    index("expedientes_vin_idx").on(t.vin),
    index("expedientes_matricula_idx").on(t.matricula),
    index("expedientes_estado_idx").on(t.idEstadoVehiculo),
  ],
);

/* ------------------------------------------------------------------ */
/* Importaciones                                                       */
/* ------------------------------------------------------------------ */

export const importacionesBloques = pgTable("importaciones_bloques", {
  id: serial("id").primaryKey(),
  fecha: varchar("fecha", { length: 100 }).notNull(),
  nombreArchivo: varchar("nombre_archivo", { length: 255 }).notNull(),
  tipoArchivo: varchar("tipo_archivo", { length: 50 }).notNull(),
  usuarioId: integer("usuario_id").references(() => usuarios.idUsuario, { onDelete: "set null" }),
  creados: integer("creados").notNull().default(0),
  modificados: integer("modificados").notNull().default(0),
  omitidos: integer("omitidos").notNull().default(0),
});

export const importacionesRegistros = pgTable("importaciones_registros", {
  id: serial("id").primaryKey(),
  bloqueId: integer("bloque_id")
    .notNull()
    .references(() => importacionesBloques.id, { onDelete: "cascade" }),
  idExpediente: integer("id_expediente").references(() => expedientes.idExpediente, { onDelete: "set null" }),
  tipoAccion: varchar("tipo_accion", { length: 50 }).notNull(),
  clienteNombre: varchar("cliente_nombre", { length: 255 }).notNull(),
  matricula: varchar("matricula", { length: 50 }),
  bastidor: varchar("bastidor", { length: 100 }),
  cambios: text("cambios"),
});

/* ------------------------------------------------------------------ */
/* Sesiones y auditoría (la autenticación completa llega en F2)         */
/* ------------------------------------------------------------------ */

export const sesiones = pgTable(
  "sesiones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idUsuario: integer("id_usuario")
      .notNull()
      .references(() => usuarios.idUsuario, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
    ultimoUso: timestamp("ultimo_uso", { withTimezone: true }).notNull().defaultNow(),
    caducaEn: timestamp("caduca_en", { withTimezone: true }).notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    mfaVerificado: boolean("mfa_verificado").notNull().default(false),
    revocadaEn: timestamp("revocada_en", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("sesiones_token_hash_uq").on(t.tokenHash),
    index("sesiones_usuario_idx").on(t.idUsuario),
    index("sesiones_caduca_idx").on(t.caducaEn),
  ],
);

export const loginIntentos = pgTable(
  "login_intentos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Hash de ip|email */
    clave: text("clave").notNull(),
    en: timestamp("en", { withTimezone: true }).notNull().defaultNow(),
    exito: boolean("exito").notNull(),
  },
  (t) => [index("login_intentos_clave_idx").on(t.clave, t.en)],
);

export const auditoria = pgTable("auditoria", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  en: timestamp("en", { withTimezone: true }).notNull().defaultNow(),
  idUsuario: integer("id_usuario").references(() => usuarios.idUsuario, { onDelete: "set null" }),
  accion: text("accion").notNull(),
  entidad: text("entidad"),
  entidadId: text("entidad_id"),
  detalle: jsonb("detalle"),
  ip: inet("ip"),
});
