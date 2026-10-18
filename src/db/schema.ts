import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
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
  /** Borrado lógico: fecha en que se «eliminó». Nunca se borra la fila, así el histórico y las estadísticas se conservan. */
  eliminadoEn: timestamp("eliminado_en", { withTimezone: true }),
});

export const marcas = pgTable("marcas", {
  idMarca: serial("id_marca").primaryKey(),
  nombre: text("nombre").notNull(),
  activo: boolean("activo").default(true),
  accesoRapido: boolean("acceso_rapido").default(false),
  sistemaComisiones: boolean("sistema_comisiones").notNull().default(false),
  /** Color de la marca (#RRGGBB): marca y modelo se enseñan en una cápsula de este color. Sin color, texto normal. */
  color: varchar("color", { length: 50 }),
  /** Símbolo de la columna del punto (un punto, una coma, un emoticono…); sin símbolo pero con color, un punto «●». */
  punto: varchar("punto", { length: 8 }),
  /** Color del símbolo de la columna del punto (#RRGGBB). */
  puntoColor: varchar("punto_color", { length: 50 }),
  /** Borrado lógico: fecha en que se «eliminó». Nunca se borra la fila, así el histórico y las estadísticas se conservan. */
  eliminadoEn: timestamp("eliminado_en", { withTimezone: true }),
});

export const modelos = pgTable(
  "modelos",
  {
    idModelo: serial("id_modelo").primaryKey(),
    marcaId: integer("marca_id").references(() => marcas.idMarca, { onDelete: "cascade" }),
    nombreModelo: text("nombre_modelo").notNull(),
    accesoRapido: boolean("acceso_rapido").default(false),
    ordenAccesoRapido: integer("orden_acceso_rapido").default(0),
    /** Borrado lógico: fecha en que se «eliminó». Nunca se borra la fila, así el histórico y las estadísticas se conservan. */
    eliminadoEn: timestamp("eliminado_en", { withTimezone: true }),
  },
  (t) => [index("modelos_marca_idx").on(t.marcaId)],
);

/** Correcciones enseñadas al leer pedidos: texto del pedido (normalizado) → modelo del catálogo. */
export const aliasModelos = pgTable(
  "alias_modelos",
  {
    id: serial("id").primaryKey(),
    alias: text("alias").notNull(),
    idModelo: integer("id_modelo")
      .notNull()
      .references(() => modelos.idModelo, { onDelete: "cascade" }),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alias_modelos_alias_uq").on(t.alias)],
);

export const tipoDeVenta = pgTable("tipo_de_venta", {
  idTipoDeVenta: serial("id_tipo_de_venta").primaryKey(),
  nombreTipoVenta: text("nombre_tipo_venta").notNull(),
  color: varchar("color", { length: 50 }).default("#3b82f6"),
  orden: integer("orden").notNull().default(0),
  /** CONTADO | CREDITO | PREFERENCE | RENTING */
  categoria: varchar("categoria", { length: 20 }).notNull().default("CONTADO"),
  /** Si es true, un expediente de este tipo no puede matricularse sin fecha RCI (fecha de contratación de la financiera). */
  requiereRciAlMatricular: boolean("requiere_rci_al_matricular").notNull().default(false),
  /** Si es true, los expedientes de este tipo suman al numerador de la tasa de intervención financiera (cuando su fecha RCI cae en el mes). */
  cuentaParaTasa: boolean("cuenta_para_tasa").notNull().default(false),
  /** Borrado lógico: fecha en que se «eliminó». Nunca se borra la fila, así el histórico y las estadísticas se conservan. */
  eliminadoEn: timestamp("eliminado_en", { withTimezone: true }),
});

export const estadoVehiculo = pgTable("estado_vehiculo", {
  idEstadoVehiculo: serial("id_estado_vehiculo").primaryKey(),
  nombreEstadoVehiculo: text("nombre_estado_vehiculo").notNull(),
  predeterminado: boolean("predeterminado").default(false),
  /** VN | VO */
  clase: varchar("clase", { length: 2 }).notNull().default("VN"),
  /** USADO | KM0 | DEMO | BUYBACK … */
  subtipoVo: varchar("subtipo_vo", { length: 30 }),
  /** Color de la etiqueta en las listas (#RRGGBB); sin color se usa el de siempre. */
  color: varchar("color", { length: 7 }),
  /** Borde de la cápsula de marca y modelo para los coches de este estado (#RRGGBB o #RRGGBBAA). */
  capsulaColor: varchar("capsula_color", { length: 50 }),
  /** Símbolo y color del punto de los coches de este estado (como en las marcas). */
  punto: varchar("punto", { length: 8 }),
  puntoColor: varchar("punto_color", { length: 50 }),
  /** Qué manda cuando la marca y el estado tienen color: «marca» (la de la marca) o «estado» (la de este estado). */
  prevalece: varchar("prevalece", { length: 10 }).notNull().default("marca"),
  /** Borrado lógico: fecha en que se «eliminó». Nunca se borra la fila, así el histórico y las estadísticas se conservan. */
  eliminadoEn: timestamp("eliminado_en", { withTimezone: true }),
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
    /** Último contador TOTP aceptado: impide reutilizar el mismo código (5.4). */
    totpUltimoContador: bigint("totp_ultimo_contador", { mode: "number" }),
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
    /** Dirección postal (para informes por zona): calle y número, población y código postal. */
    domicilio: varchar("domicilio", { length: 255 }),
    poblacion: varchar("poblacion", { length: 120 }),
    codigoPostal: varchar("codigo_postal", { length: 10 }),
    tiendaId: integer("tienda_id").references(() => tiendas.idTienda),
    /** Adjunto (miniatura) con la cara del cliente, tomada del DNI. */
    fotoAdjuntoId: integer("foto_adjunto_id"),
    /** Notas libres sobre el cliente. */
    comentarios: text("comentarios"),
    /** Borrado lógico: fecha en que se «eliminó». Nunca se borra la fila, así el histórico y las estadísticas se conservan. */
    eliminadoEn: timestamp("eliminado_en", { withTimezone: true }),
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
  evento: "pedido" | "afectacion" | "rci" | "matriculacion" | "fecha_matriculacion" | "facturacion" | "entrega" | "cobro";
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
    /** Notas libres sobre el expediente. */
    comentarios: text("comentarios"),
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
    idPromocion: integer("id_promocion").references(() => promocionesPuntos.id, { onDelete: "restrict" }),
    comisionCocheManual: integer("comision_coche_manual"),
    comisionFinanciacionManual: integer("comision_financiacion_manual"),
    conceptosEspeciales: jsonb("conceptos_especiales").$type<ConceptoEspecial[]>().notNull().default([]),
    /** Bonus del plan con evento «Manual» que se aplican a este expediente (claves de las reglas). */
    bonusManuales: jsonb("bonus_manuales").$type<string[]>().notNull().default([]),

    /* Columnas heredadas (solo lectura, para importar copias antiguas) */
    valorObjetivo: doublePrecision("valor_objetivo"),
    minCochesMultiplicador: integer("min_coches_multiplicador").notNull().default(0),
    comisionCocheReal: doublePrecision("comision_coche_real"),
    comisionFinanciacionReal: doublePrecision("comision_financiacion_real"),
    conceptosAdicionales: text("conceptos_adicionales"),
    /** Borrado lógico: fecha en que se «eliminó». Nunca se borra la fila, así el histórico y las estadísticas se conservan. */
    eliminadoEn: timestamp("eliminado_en", { withTimezone: true }),
    /** Si el expediente es un duplicado hecho con «Duplicar» (para pruebas), id del expediente del que se copió. */
    copiaDe: integer("copia_de"),
    /** Si la copia lleva la etiqueta visible «COPIA» en la tabla (se decide al duplicar; la marca interna `copia_de` se guarda siempre). */
    copiaEtiqueta: boolean("copia_etiqueta").notNull().default(false),
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

/** Códigos de recuperación del segundo factor: de un solo uso y guardados solo como hash. */
export const codigosRecuperacion = pgTable(
  "codigos_recuperacion",
  {
    id: serial("id").primaryKey(),
    idUsuario: integer("id_usuario")
      .notNull()
      .references(() => usuarios.idUsuario, { onDelete: "cascade" }),
    codigoHash: text("codigo_hash").notNull(),
    usadoEn: timestamp("usado_en", { withTimezone: true }),
  },
  (t) => [index("codigos_recuperacion_usuario_idx").on(t.idUsuario)],
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

/**
 * Historial de cambios para deshacer y rehacer. Lo rellenan unos disparadores de la base de datos (ver la migración del historial):
 * cada fila cambiada guarda cómo estaba antes y cómo quedó, agrupada por petición (`grupo`) y por usuario.
 */
export const historialCambios = pgTable(
  "historial_cambios",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    grupo: uuid("grupo").notNull(),
    en: timestamp("en", { withTimezone: true }).notNull().defaultNow(),
    idUsuario: integer("id_usuario").references(() => usuarios.idUsuario, { onDelete: "set null" }),
    /** Texto legible de lo que hizo la petición («Editar expediente»…). */
    accion: text("accion").notNull(),
    tabla: text("tabla").notNull(),
    /** I (alta), U (modificación) o D (borrado). */
    operacion: varchar("operacion", { length: 1 }).notNull(),
    pk: jsonb("pk").notNull(),
    antes: jsonb("antes"),
    despues: jsonb("despues"),
    /** aplicado | deshecho | descartado (un cambio nuevo descarta lo que se podía rehacer). */
    estado: varchar("estado", { length: 12 }).notNull().default("aplicado"),
  },
  (t) => [index("historial_cambios_usuario_idx").on(t.idUsuario, t.estado, t.id), index("historial_cambios_grupo_idx").on(t.grupo)],
);

/* ------------------------------------------------------------------ */
/* Sistema de comisiones (F3). Importes en céntimos, puntos en centésimas */
/* ------------------------------------------------------------------ */

export const commissionPlans = pgTable("commission_plans", {
  idPlan: serial("id_plan").primaryKey(),
  nombre: text("nombre").notNull(),
  fechaInicio: date("fecha_inicio").notNull(),
  fechaFin: date("fecha_fin").notNull(),
  /** borrador | activo | cerrado */
  estado: varchar("estado", { length: 20 }).notNull().default("borrador"),
  tramoMin: integer("tramo_min").notNull().default(-4),
  tramoMax: integer("tramo_max").notNull().default(3),
  puntosPorPedido: integer("puntos_por_pedido").notNull().default(0),
  /** Fecha que hace contar a un usado: «cobro» (la de siempre) o «facturacion». */
  voFecha: varchar("vo_fecha", { length: 12 }).notNull().default("facturacion"),
  /** Puntos de los usados: «cuentan» (suman puntos al objetivo) o «no» (solo comisión). */
  voPuntosModo: varchar("vo_puntos_modo", { length: 10 }).notNull().default("cuentan"),
  /** Puntos por usado (centésimas); sin valor se usan los del modelo, la marca o el predeterminado. */
  voPuntos: integer("vo_puntos"),
  /** Objetivo de la tasa de intervención financiera GLOBAL (todos los coches nuevos): 70 = 70 % o nº de unidades; sin valor = sin objetivo. */
  tasaGlobalTipo: varchar("tasa_global_tipo", { length: 20 }).notNull().default("porcentaje"),
  tasaGlobalObjetivo: integer("tasa_global_objetivo"),
  /** Lo mismo para los usados (VO). */
  tasaVoTipo: varchar("tasa_vo_tipo", { length: 20 }).notNull().default("porcentaje"),
  tasaVoObjetivo: integer("tasa_vo_objetivo"),
  /** Los usados financiados cuentan también en la tasa global y en la de cada marca (por defecto, sí). */
  tasaIncluyeVo: boolean("tasa_incluye_vo").notNull().default(true),
  penalizacionImporte: integer("penalizacion_importe").notNull().default(0),
  penalizacionTitulo: text("penalizacion_titulo"),
  penalizacionDescripcion: text("penalizacion_descripcion"),
  notas: text("notas"),
});

export const commissionPlanVendedores = pgTable(
  "commission_plan_vendedores",
  {
    id: serial("id").primaryKey(),
    idPlan: integer("id_plan")
      .notNull()
      .references(() => commissionPlans.idPlan, { onDelete: "cascade" }),
    idUsuario: integer("id_usuario")
      .notNull()
      .references(() => usuarios.idUsuario),
    objetivoBase: integer("objetivo_base").notNull().default(1300),
    arrastre: integer("arrastre").notNull().default(0),
  },
  (t) => [uniqueIndex("commission_plan_vendedores_uq").on(t.idPlan, t.idUsuario)],
);

export const promocionesPuntos = pgTable("promociones_puntos", {
  id: serial("id").primaryKey(),
  idPlan: integer("id_plan")
    .notNull()
    .references(() => commissionPlans.idPlan, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  puntosEspeciales: integer("puntos_especiales").notNull(),
  minimoUnidades: integer("minimo_unidades").notNull(),
  puntosSiNoCumple: integer("puntos_si_no_cumple").notNull().default(100),
});

const refPlan = () =>
  integer("id_plan")
    .notNull()
    .references(() => commissionPlans.idPlan, { onDelete: "cascade" });

export const commissionPlanModelRates = pgTable(
  "commission_plan_model_rates",
  {
    idRate: serial("id_rate").primaryKey(),
    idPlan: refPlan(),
    idModelo: integer("id_modelo")
      .notNull()
      .references(() => modelos.idModelo, { onDelete: "cascade" }),
    tasaCumplida: boolean("tasa_cumplida").notNull(),
    /** Mapa tramo → céntimos, p. ej. {"-4":15000,"0":20000}. */
    importes: jsonb("importes").$type<Record<string, number>>().notNull().default({}),
    activo: boolean("activo").notNull().default(true),
    orden: integer("orden").notNull().default(0),
  },
  (t) => [uniqueIndex("commission_plan_model_rates_uq").on(t.idPlan, t.idModelo, t.tasaCumplida)],
);

export const commissionModelPoints = pgTable(
  "commission_model_points",
  {
    id: serial("id").primaryKey(),
    idPlan: refPlan(),
    idModelo: integer("id_modelo")
      .notNull()
      .references(() => modelos.idModelo, { onDelete: "cascade" }),
    puntos: integer("puntos").notNull(),
  },
  (t) => [uniqueIndex("commission_model_points_uq").on(t.idPlan, t.idModelo)],
);

export const commissionUsedRates = pgTable("commission_used_rates", {
  idUsedRate: serial("id_used_rate").primaryKey(),
  idPlan: refPlan(),
  subtipo: varchar("subtipo", { length: 30 }).notNull(),
  importePrimera: integer("importe_primera").notNull().default(0),
  importeResto: integer("importe_resto").notNull().default(0),
  minAplicar: integer("min_aplicar").notNull().default(0),
  activo: boolean("activo").notNull().default(true),
});

export const commissionVoPatterns = pgTable("commission_vo_patterns", {
  idVoPattern: serial("id_vo_pattern").primaryKey(),
  idPlan: refPlan(),
  nombre: text("nombre").notNull(),
  aplicaAVn: boolean("aplica_a_vn").notNull().default(false),
  /** Rotativo: tras el último escalón se vuelve a empezar por el primero (si no, se repite el último). */
  rotativo: boolean("rotativo").notNull().default(false),
  activo: boolean("activo").notNull().default(true),
  tiers: jsonb("tiers").$type<{ unidad: number; importe: number }[]>().notNull().default([]),
});

export const commissionFinanceRates = pgTable(
  "commission_finance_rates",
  {
    idFinanceRate: serial("id_finance_rate").primaryKey(),
    idPlan: refPlan(),
    idMarca: integer("id_marca")
      .notNull()
      .references(() => marcas.idMarca, { onDelete: "cascade" }),
    /** CREDITO | PREFERENCE | RENTING | CONTADO */
    tipoFinanciacion: varchar("tipo_financiacion", { length: 20 }).notNull(),
    /** A qué coches se aplica: VN (nuevos), VO (usados), VO:SUBTIPO o TODOS. */
    aplicaA: varchar("aplica_a", { length: 40 }).notNull().default("VN"),
    importe: integer("importe").notNull().default(0),
    /** Solo se cobra si la tasa de intervención está cumplida / no cumplida (indiferente = siempre). */
    tasaIntervencion: varchar("tasa_intervencion", { length: 20 }).notNull().default("indiferente"),
    /** Qué tasa se mira: la de la marca del coche, la global (todos los nuevos) o la de usados. */
    tasaAmbito: varchar("tasa_ambito", { length: 10 }).notNull().default("marca"),
    /** Columna de comisiones a la que va el importe: «financiacion», «preference» o «extra:Nombre». Vacío = la habitual (Preference en ventas Preference, Financiación en las demás). */
    concepto: varchar("concepto", { length: 80 }).notNull().default(""),
    /** Si tiene valor, la condición de la tasa compara la tasa real con este % en lugar de con el objetivo del plan. */
    tasaUmbral: integer("tasa_umbral"),
  },
  (t) => [uniqueIndex("commission_finance_rates_uq").on(t.idPlan, t.idMarca, t.tipoFinanciacion, t.aplicaA, t.tasaIntervencion, t.tasaAmbito, t.concepto, sql`coalesce(${t.tasaUmbral}, -1)`)],
);

export const commissionPreferenceRules = pgTable("commission_preference_rules", {
  idPrefRule: serial("id_pref_rule").primaryKey(),
  idPlan: refPlan(),
  nombre: text("nombre"),
  idMarca: integer("id_marca").references(() => marcas.idMarca, { onDelete: "cascade" }),
  idModelo: integer("id_modelo").references(() => modelos.idModelo, { onDelete: "cascade" }),
  tipoFinanciacion: varchar("tipo_financiacion", { length: 20 }),
  /** A qué coches se aplica: VN (nuevos), VO (usados), VO:SUBTIPO o TODOS. */
  aplicaA: varchar("aplica_a", { length: 40 }).notNull().default("VN"),
  importe: integer("importe").notNull().default(0),
  activa: boolean("activa").notNull().default(true),
  /** Solo se cobra si la tasa de intervención está cumplida / no cumplida (indiferente = siempre). */
  tasaIntervencion: varchar("tasa_intervencion", { length: 20 }).notNull().default("indiferente"),
  /** Qué tasa se mira: la de la marca del coche, la global (todos los nuevos) o la de usados. */
  tasaAmbito: varchar("tasa_ambito", { length: 10 }).notNull().default("marca"),
  /** Columna de comisiones a la que va el importe: «financiacion», «preference» o «extra:Nombre». Vacío = la habitual (Preference en ventas Preference, Financiación en las demás). */
  concepto: varchar("concepto", { length: 80 }).notNull().default(""),
  /** Si tiene valor, la condición de la tasa compara la tasa real con este % en lugar de con el objetivo del plan. */
  tasaUmbral: integer("tasa_umbral"),
});

/** Columnas comunes de reglas y bonus (las penalizaciones son bonus con `es_penalizacion`). */
const columnasRegla = () => ({
  idPlan: refPlan(),
  nombre: text("nombre").notNull(),
  /** pedido | afectacion | matriculacion | cobro | credito | preference */
  evento: varchar("evento", { length: 20 }).notNull(),
  /** nuevo | usado | usado:SUBTIPO | cualquiera */
  tipoVehiculo: varchar("tipo_vehiculo", { length: 40 }).notNull().default("cualquiera"),
  fechaInicio: date("fecha_inicio"),
  fechaFin: date("fecha_fin"),
  idMarca: integer("id_marca").references(() => marcas.idMarca, { onDelete: "cascade" }),
  idModelo: integer("id_modelo").references(() => modelos.idModelo, { onDelete: "cascade" }),
  /** cumplida | no_cumplida | indiferente */
  tasaIntervencion: varchar("tasa_intervencion", { length: 20 }).notNull().default("indiferente"),
  puntos: integer("puntos").notNull().default(0),
  importe: integer("importe").notNull().default(0),
  esPenalizacion: boolean("es_penalizacion").notNull().default(false),
  ligarACredito: boolean("ligar_a_credito").notNull().default(false),
  activa: boolean("activa").notNull().default(true),
  /** Identificador estable de la regla dentro del plan: los expedientes lo guardan para elegir un bonus «manual» (los ids cambian al guardar el plan). */
  clave: varchar("clave", { length: 60 }).notNull().default(""),
});

export const commissionRules = pgTable("commission_rules", { idRule: serial("id_rule").primaryKey(), ...columnasRegla() });
export const commissionBonusRules = pgTable("commission_bonus_rules", {
  idBonusRule: serial("id_bonus_rule").primaryKey(),
  ...columnasRegla(),
});

export const commissionBrandInterventionRates = pgTable(
  "commission_brand_intervention_rates",
  {
    idInterventionRate: serial("id_intervention_rate").primaryKey(),
    idPlan: refPlan(),
    idMarca: integer("id_marca")
      .notNull()
      .references(() => marcas.idMarca, { onDelete: "cascade" }),
    /** porcentaje | unidades */
    tipoTasa: varchar("tipo_tasa", { length: 20 }).notNull().default("porcentaje"),
    objetivo: integer("objetivo").notNull().default(70),
    puntosDefecto: integer("puntos_defecto").notNull().default(100),
  },
  (t) => [uniqueIndex("commission_brand_intervention_rates_uq").on(t.idPlan, t.idMarca)],
);

export const commissionLiquidations = pgTable(
  "commission_liquidations",
  {
    idLiquidation: serial("id_liquidation").primaryKey(),
    idPlan: integer("id_plan")
      .notNull()
      .references(() => commissionPlans.idPlan, { onDelete: "restrict" }),
    idUsuario: integer("id_usuario")
      .notNull()
      .references(() => usuarios.idUsuario),
    mes: varchar("mes", { length: 7 }).notNull(),
    /** borrador | calculada | revisada | cerrada */
    estado: varchar("estado", { length: 20 }).notNull().default("calculada"),
    version: integer("version").notNull().default(1),
    objetivoX: integer("objetivo_x").notNull().default(0),
    puntosMes: integer("puntos_mes").notNull().default(0),
    tramo: integer("tramo").notNull().default(0),
    tasaIntervencion: jsonb("tasa_intervencion").$type<unknown[]>().notNull().default([]),
    avisos: jsonb("avisos").$type<string[]>().notNull().default([]),
    bruto: integer("bruto").notNull().default(0),
    penalizacion: integer("penalizacion").notNull().default(0),
    neto: integer("neto").notNull().default(0),
    mesPago: varchar("mes_pago", { length: 7 }).notNull(),
    calculadaEn: timestamp("calculada_en", { withTimezone: true }).notNull().defaultNow(),
    /** motor | importada_antigua */
    origen: varchar("origen", { length: 30 }).notNull().default("motor"),
  },
  (t) => [uniqueIndex("commission_liquidations_uq").on(t.idPlan, t.idUsuario, t.mes)],
);

export const commissionLiquidationLines = pgTable(
  "commission_liquidation_lines",
  {
    idLine: serial("id_line").primaryKey(),
    idLiquidation: integer("id_liquidation")
      .notNull()
      .references(() => commissionLiquidations.idLiquidation, { onDelete: "cascade" }),
    idExpediente: integer("id_expediente"),
    clase: varchar("clase", { length: 2 }).notNull(),
    mesComputo: varchar("mes_computo", { length: 7 }),
    cuenta: boolean("cuenta").notNull().default(false),
    unidades: integer("unidades").notNull().default(0),
    puntos: integer("puntos").notNull().default(0),
    importe: integer("importe").notNull().default(0),
  },
  (t) => [index("commission_liquidation_lines_liq_idx").on(t.idLiquidation)],
);

export const commissionLiquidationLineItems = pgTable(
  "commission_liquidation_line_items",
  {
    idItem: serial("id_item").primaryKey(),
    idLine: integer("id_line")
      .notNull()
      .references(() => commissionLiquidationLines.idLine, { onDelete: "cascade" }),
    orden: integer("orden").notNull().default(0),
    concepto: varchar("concepto", { length: 80 }).notNull(),
    descripcion: text("descripcion").notNull(),
    importe: integer("importe").notNull().default(0),
    puntos: integer("puntos").notNull().default(0),
    evento: varchar("evento", { length: 30 }),
    mesEvento: varchar("mes_evento", { length: 7 }),
    aviso: text("aviso"),
  },
  (t) => [index("commission_liquidation_line_items_line_idx").on(t.idLine)],
);

export const commissionLiquidationVersions = pgTable(
  "commission_liquidation_versions",
  {
    id: serial("id").primaryKey(),
    idLiquidation: integer("id_liquidation")
      .notNull()
      .references(() => commissionLiquidations.idLiquidation, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    motivo: text("motivo").notNull(),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
    snapshot: jsonb("snapshot").notNull(),
    netoAnterior: integer("neto_anterior").notNull(),
    netoNuevo: integer("neto_nuevo").notNull(),
  },
  (t) => [index("commission_liquidation_versions_liq_idx").on(t.idLiquidation)],
);

/** Registro de solo inserción: las correcciones son apuntes negativos. */
export const libroPuntos = pgTable(
  "libro_puntos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    idUsuario: integer("id_usuario")
      .notNull()
      .references(() => usuarios.idUsuario),
    idExpediente: integer("id_expediente"),
    /** PEDIDO | MATRICULACION | COBRO | REGLA | AJUSTE */
    evento: varchar("evento", { length: 20 }).notNull(),
    fecha: date("fecha").notNull(),
    mes: varchar("mes", { length: 7 }).notNull(),
    puntos: integer("puntos").notNull(),
    regla: text("regla"),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("libro_puntos_usuario_mes_idx").on(t.idUsuario, t.mes)],
);

export const pendientesCobro = pgTable("pendientes_cobro", {
  id: serial("id").primaryKey(),
  idUsuario: integer("id_usuario")
    .notNull()
    .references(() => usuarios.idUsuario, { onDelete: "cascade" }),
  concepto: text("concepto").notNull(),
  importe: integer("importe").notNull(),
  fecha: date("fecha"),
  mesNominaPrevisto: varchar("mes_nomina_previsto", { length: 7 }),
  cobrado: boolean("cobrado").notNull().default(false),
  fechaCobro: date("fecha_cobro"),
  notas: text("notas"),
});

export const commissionPlanPending = pgTable("commission_plan_pending", {
  id: serial("id").primaryKey(),
  idPlan: refPlan(),
  concepto: text("concepto").notNull(),
  importe: integer("importe").notNull(),
  mesOrigen: varchar("mes_origen", { length: 7 }),
});

/* ------------------------------------------------------------------ */
/* Copias de seguridad y Google Drive (F5)                              */
/* ------------------------------------------------------------------ */

export const copiasSeguridad = pgTable(
  "copias_seguridad",
  {
    id: serial("id").primaryKey(),
    /** Nombre del fichero dentro de la carpeta de copias. */
    nombre: text("nombre").notNull(),
    /** manual | auto | previa */
    tipo: varchar("tipo", { length: 10 }).notNull(),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
    tamano: bigint("tamano", { mode: "number" }).notNull().default(0),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    creadaPor: integer("creada_por").references(() => usuarios.idUsuario, { onDelete: "set null" }),
    /** Identificador del fichero en Google Drive, si se ha subido. */
    driveFileId: text("drive_file_id"),
    subidaDriveEn: timestamp("subida_drive_en", { withTimezone: true }),
    /** ok | error */
    estado: varchar("estado", { length: 10 }).notNull().default("ok"),
    error: text("error"),
    /** Nota libre del administrador sobre esta copia («antes de importar…», «mes cerrado»…). */
    notas: text("notas"),
  },
  (t) => [uniqueIndex("copias_seguridad_nombre_uq").on(t.nombre), index("copias_seguridad_creada_idx").on(t.creadaEn)],
);

/** Copias «internas» de una sección de datos (clientes, planes…): se guardan dentro de la propia aplicación para restaurar esa sección sola. */
export const copiasSeccion = pgTable(
  "copias_seccion",
  {
    id: serial("id").primaryKey(),
    /** Sección (clientes, expedientes, planes…). */
    seccion: varchar("seccion", { length: 30 }).notNull(),
    nombre: text("nombre").notNull(),
    nota: text("nota"),
    /** manual | automatica (la que se hace sola antes de importar o sustituir) */
    origen: varchar("origen", { length: 12 }).notNull().default("manual"),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
    creadaPor: integer("creada_por").references(() => usuarios.idUsuario, { onDelete: "set null" }),
    registros: integer("registros").notNull(),
    /** Tamaño del contenido en bytes. */
    tamano: integer("tamano").notNull(),
    /** El mismo paquete JSON que se descarga al exportar la sección. */
    datos: jsonb("datos").$type<unknown>().notNull(),
  },
  (t) => [index("copias_seccion_seccion_idx").on(t.seccion, t.creadaEn)],
);

/** Plantillas de «Tarifas de modelos VN por tramo»: marcas y modelos por nombre, para aplicarlas a cualquier plan. */
export const plantillasTarifasVn = pgTable(
  "plantillas_tarifas_vn",
  {
    id: serial("id").primaryKey(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion"),
    /** Plantilla incluida con la aplicación (no se puede borrar ni modificar). */
    sistema: boolean("sistema").notNull().default(false),
    datos: jsonb("datos").$type<unknown>().notNull(),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
    actualizadaEn: timestamp("actualizada_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plantillas_tarifas_vn_nombre_uq").on(t.nombre)],
);

/**
 * Plantillas de partes de un plan de comisionamiento. `ambito` es la pestaña (resumen, objetivo, usados, reglas, bonus,
 * penalizaciones, notas) o «global» para el plan entero. Marcas, modelos y vendedores se guardan por nombre.
 */
export const plantillasPlan = pgTable(
  "plantillas_plan",
  {
    id: serial("id").primaryKey(),
    ambito: text("ambito").notNull(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion"),
    datos: jsonb("datos").$type<unknown>().notNull(),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
    actualizadaEn: timestamp("actualizada_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plantillas_plan_ambito_nombre_uq").on(t.ambito, t.nombre)],
);

/** Conexión con Google Drive: solo se guarda el refresh token, cifrado. */
export const conexionDrive = pgTable("conexion_drive", {
  id: integer("id").primaryKey().default(1),
  refreshTokenCifrado: text("refresh_token_cifrado").notNull(),
  email: text("email"),
  carpetaId: text("carpeta_id"),
  conectadaEn: timestamp("conectada_en", { withTimezone: true }).notNull().defaultNow(),
  /** El último intento falló por token caducado o revocado. */
  requiereReconexion: boolean("requiere_reconexion").notNull().default(false),
});

/* ------------------------------------------------------------------ */
/* Validación de comisiones con la «rejilla» de la empresa              */
/* ------------------------------------------------------------------ */

/** Hoja de comisiones que entrega la empresa a un vendedor para un mes de liquidación. Una por vendedor y mes. */
export const rejillas = pgTable(
  "rejillas",
  {
    id: serial("id").primaryKey(),
    idUsuario: integer("id_usuario")
      .notNull()
      .references(() => usuarios.idUsuario),
    /** Mes de la liquidación que se valida (AAAA-MM). */
    mes: varchar("mes", { length: 7 }).notNull(),
    /** excel | csv | pdf | imagen | manual */
    origen: varchar("origen", { length: 20 }).notNull(),
    nombreArchivo: text("nombre_archivo"),
    /** Total que indica la hoja (céntimos), si lo trae. */
    totalHoja: integer("total_hoja"),
    notas: text("notas"),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
    creadaPor: integer("creada_por").references(() => usuarios.idUsuario, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("rejillas_usuario_mes_uq").on(t.idUsuario, t.mes)],
);

export const rejillaFilas = pgTable(
  "rejilla_filas",
  {
    id: serial("id").primaryKey(),
    idRejilla: integer("id_rejilla")
      .notNull()
      .references(() => rejillas.id, { onDelete: "cascade" }),
    /** Matrícula tal y como aparece en la hoja. */
    matricula: varchar("matricula", { length: 50 }).notNull(),
    cliente: text("cliente"),
    financiacion: text("financiacion"),
    concepto: text("concepto"),
    /** Céntimos; null si la hoja no trae importe legible. */
    importe: integer("importe"),
    /** Línea original (OCR) para poder revisar lo leído. */
    textoOriginal: text("texto_original"),
    /** Confianza del OCR (0-100), si procede. */
    confianza: integer("confianza"),
  },
  (t) => [index("rejilla_filas_rejilla_idx").on(t.idRejilla)],
);

/** Estado que el vendedor da a cada coche de un mes: pagado, pendiente o reclamado a la empresa. */
export const validacionesComision = pgTable(
  "validaciones_comision",
  {
    id: serial("id").primaryKey(),
    idUsuario: integer("id_usuario")
      .notNull()
      .references(() => usuarios.idUsuario),
    mes: varchar("mes", { length: 7 }).notNull(),
    idExpediente: integer("id_expediente")
      .notNull()
      .references(() => expedientes.idExpediente),
    /** pagado | pendiente | reclamado */
    estado: varchar("estado", { length: 12 }).notNull(),
    nota: text("nota"),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("validaciones_comision_uq").on(t.idUsuario, t.mes, t.idExpediente)],
);

/* ------------------------------------------------------------------ */
/* Adjuntos (DNI, pedidos, PDF…) con vista previa                       */
/* ------------------------------------------------------------------ */

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

/** Metadatos de un fichero adjunto. El contenido (cifrado) vive aparte, en `adjuntos_datos`, para no cargarlo nunca por error. */
export const adjuntos = pgTable(
  "adjuntos",
  {
    id: serial("id").primaryKey(),
    /** cliente | expediente | pendiente (subido pero aún no vinculado a un registro guardado) */
    ambito: varchar("ambito", { length: 12 }).notNull(),
    idCliente: integer("id_cliente").references(() => clientes.id),
    idExpediente: integer("id_expediente").references(() => expedientes.idExpediente),
    /** dni_frente | dni_reverso | pedido | foto_cliente | otro */
    tipo: varchar("tipo", { length: 20 }).notNull().default("otro"),
    nombre: text("nombre").notNull(),
    mime: varchar("mime", { length: 60 }).notNull(),
    tamano: integer("tamano").notNull(),
    tieneMiniatura: boolean("tiene_miniatura").notNull().default(false),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    creadoPor: integer("creado_por").references(() => usuarios.idUsuario, { onDelete: "set null" }),
    /** Borrado lógico: el fichero se conserva pero deja de mostrarse. */
    eliminadoEn: timestamp("eliminado_en", { withTimezone: true }),
  },
  (t) => [index("adjuntos_cliente_idx").on(t.idCliente), index("adjuntos_expediente_idx").on(t.idExpediente)],
);

export const adjuntosDatos = pgTable("adjuntos_datos", {
  idAdjunto: integer("id_adjunto")
    .primaryKey()
    .references(() => adjuntos.id, { onDelete: "cascade" }),
  /** Contenido cifrado con AES-256-GCM (clave derivada de APP_SECRET). */
  datos: bytea("datos").notNull(),
  miniatura: bytea("miniatura"),
});

/**
 * Lista persistente de pedidos subidos para leer con OCR. Cada PDF o foto se guarda (cifrado) nada más subirse y lo van
 * cogiendo los lectores en paralelo; si el servidor se reinicia, lo pendiente se retoma. `datos` se borra al terminar
 * (un pedido pasa a ser un adjunto; lo que no es un pedido no se conserva).
 */
export const lecturasPedidos = pgTable(
  "lecturas_pedidos",
  {
    id: serial("id").primaryKey(),
    idUsuario: integer("id_usuario").references(() => usuarios.idUsuario, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    tamano: integer("tamano").notNull(),
    /** SHA-256 del fichero: el mismo archivo subido otra vez no se vuelve a leer. */
    huella: varchar("huella", { length: 64 }).notNull(),
    datos: bytea("datos"),
    /** Dónde está el fichero (cifrado) mientras espera su lectura: en disco, no en la base, para no engordarla ni sus copias con miles de PDF. */
    ruta: text("ruta"),
    /** subiendo | pendiente | leyendo | pedido | descartado | error | cancelado */
    estado: varchar("estado", { length: 12 }).notNull().default("pendiente"),
    resultado: jsonb("resultado").$type<unknown>(),
    error: text("error"),
    intentos: integer("intentos").notNull().default(0),
    /** Modelo y pago elegidos al soltarlo sobre un acceso rápido, o expediente que se va a completar. */
    destino: jsonb("destino").$type<unknown>(),
    permitirDuplicados: boolean("permitir_duplicados").notNull().default(false),
    creadaEn: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
    empezadaEn: timestamp("empezada_en", { withTimezone: true }),
    terminadaEn: timestamp("terminada_en", { withTimezone: true }),
    /** Cuando el navegador ya ha recogido el pedido leído y lo ha puesto en la cola. */
    recogidaEn: timestamp("recogida_en", { withTimezone: true }),
    /** Qué se hizo después con un pedido leído: creado | completado | quitado (descartado a mano de la cola). */
    resolucion: varchar("resolucion", { length: 12 }),
    /** Expediente que se creó o completó con este pedido. */
    idExpediente: integer("id_expediente"),
  },
  (t) => [index("lecturas_pedidos_estado_idx").on(t.estado, t.id), index("lecturas_pedidos_usuario_idx").on(t.idUsuario, t.huella)],
);
