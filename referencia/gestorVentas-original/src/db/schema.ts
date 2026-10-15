import { pgTable, serial, varchar, date, integer, boolean, text, doublePrecision } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// TABLA: TIENDAS
export const tiendas = pgTable('tiendas', {
  id_tienda: serial('id_tienda').primaryKey(),
  nombre: text('nombre').notNull(),
  ciudad: varchar('ciudad', { length: 255 }),
});

// TABLA: USUARIOS
export const usuarios = pgTable('usuarios', {
  id_usuario: serial('id_usuario').primaryKey(),
  clerk_id: varchar('clerk_id', { length: 255 }).notNull().unique(),
  nombre: varchar('nombre', { length: 255 }),
  rol: varchar('rol', { length: 50 }), // administrador, director, jefe_zona, jefe_tienda, vendedor, invitado
  fecha_de_registro: date('fecha_de_registro'),
  bloqueado: boolean('bloqueado').default(false),
  tipo_vendedor: varchar('tipo_vendedor', { length: 50 }).notNull().default('VN'), // VN, VO
  patron_vo: varchar('patron_vo', { length: 100 }).default('Estándar VO'),
  tienda_predeterminada_id: integer('tienda_predeterminada_id').references(() => tiendas.id_tienda, { onDelete: 'set null' }),
});

// TABLA: USUARIOS_TIENDAS (Relación Muchos a Muchos N-a-N)
export const usuariosTiendas = pgTable('usuarios_tiendas', {
  id_usuario_tienda: serial('id_usuario_tienda').primaryKey(),
  id_usuario: integer('id_usuario').references(() => usuarios.id_usuario, { onDelete: 'cascade' }).notNull(),
  id_tienda: integer('id_tienda').references(() => tiendas.id_tienda, { onDelete: 'cascade' }).notNull(),
});

// TABLA: EMAILS_USUARIOS
export const emailsUsuarios = pgTable('emails_usuarios', {
  id_email_usuario: serial('id_email_usuario').primaryKey(),
  id_usuario: integer('id_usuario').references(() => usuarios.id_usuario, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  tipo_email: varchar('tipo_email', { length: 100 }),
});

// TABLA: TELEFONOS_USUARIOS
export const telefonosUsuarios = pgTable('telefonos_usuarios', {
  id_telefono_usuario: serial('id_telefono_usuario').primaryKey(),
  id_usuario: integer('id_usuario').references(() => usuarios.id_usuario, { onDelete: 'cascade' }),
  telefono: varchar('telefono', { length: 50 }).notNull(),
  tipo_telefono: varchar('tipo_telefono', { length: 100 }),
});

// TABLA: CLIENTES
export const clientes = pgTable('clientes', {
  id: serial('id').primaryKey(),
  cliente_id: varchar('cliente_id', { length: 255 }).notNull().unique(),
  dni: varchar('dni', { length: 50 }),
  nombre: varchar('nombre', { length: 255 }),
  fecha_de_nacimiento: date('fecha_de_nacimiento'),
  tienda_id: integer('tienda_id').references(() => tiendas.id_tienda),
});

// TABLA: EMAILS_CLIENTES
export const emailsClientes = pgTable('emails_clientes', {
  id_email_cliente: serial('id_email_cliente').primaryKey(),
  id_cliente: integer('id_cliente').references(() => clientes.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  tipo_email: varchar('tipo_email', { length: 100 }),
});

// TABLA: TELEFONOS_CLIENTES
export const telefonosClientes = pgTable('telefonos_clientes', {
  id_telefono_cliente: serial('id_telefono_cliente').primaryKey(),
  id_cliente: integer('id_cliente').references(() => clientes.id, { onDelete: 'cascade' }),
  telefono: varchar('telefono', { length: 50 }).notNull(),
  tipo_telefono: varchar('tipo_telefono', { length: 100 }),
});

// TABLA: MARCAS
export const marcas = pgTable('marcas', {
  id_marca: serial('id_marca').primaryKey(),
  nombre: text('nombre').notNull(),
  activo: boolean('activo').default(true),
  acceso_rapido: boolean('acceso_rapido').default(false),
  sistema_comisiones: boolean('sistema_comisiones').default(false).notNull(),
});

// TABLA: MODELOS
export const modelos = pgTable('modelos', {
  id_modelo: serial('id_modelo').primaryKey(),
  marca_id: integer('marca_id').references(() => marcas.id_marca, { onDelete: 'cascade' }),
  nombre_modelo: text('nombre_modelo').notNull(),
  acceso_rapido: boolean('acceso_rapido').default(false),
  orden_acceso_rapido: integer('orden_acceso_rapido').default(0),
});

// TABLA: TIPO_DE_VENTA
export const tipoDeVenta = pgTable('tipo_de_venta', {
  id_tipo_de_venta: serial('id_tipo_de_venta').primaryKey(),
  nombre_tipo_venta: text('nombre_tipo_venta').notNull(),
  color: varchar('color', { length: 50 }).default('#3b82f6'),
  orden: integer('orden').default(0).notNull(),
});

// TABLA: ESTADO_VEHICULO
export const estadoVehiculo = pgTable('estado_vehiculo', {
  id_estado_vehiculo: serial('id_estado_vehiculo').primaryKey(),
  nombre_estado_vehiculo: text('nombre_estado_vehiculo').notNull(),
  predeterminado: boolean('predeterminado').default(false),
});

// TABLA: EXPEDIENTES
export const expedientes = pgTable('expedientes', {
  id_expediente: serial('id_expediente').primaryKey(),
  id_usuario: integer('id_usuario').references(() => usuarios.id_usuario),
  id_cliente: integer('id_cliente').references(() => clientes.id),
  id_modelo: integer('id_modelo').references(() => modelos.id_modelo),
  id_tienda: integer('id_tienda').references(() => tiendas.id_tienda),
  fecha_expediente: date('fecha_expediente'),
  fecha_afectacion: date('fecha_afectacion'),
  fecha_matriculacion: date('fecha_matriculacion'),
  fecha_entrega: date('fecha_entrega'),
  fecha_rci: date('fecha_rci'),
  fecha_facturacion: date('fecha_facturacion'),
  matricula: varchar('matricula', { length: 50 }),
  id_tipo_de_venta: integer('id_tipo_de_venta').references(() => tipoDeVenta.id_tipo_de_venta),
  id_estado_vehiculo: integer('id_estado_vehiculo').references(() => estadoVehiculo.id_estado_vehiculo),
  vin: varchar('vin', { length: 100 }),
  valor_objetivo: doublePrecision('valor_objetivo'),
  min_coches_multiplicador: integer('min_coches_multiplicador').notNull().default(0),
  cobrado_otra_fecha: boolean('cobrado_otra_fecha').notNull().default(false),
  fecha_cobrado: date('fecha_cobrado'),
  comision_cobrada: boolean('comision_cobrada').notNull().default(false),
  comision_coche_cobrada: boolean('comision_coche_cobrada').notNull().default(false),
  comision_usado_cobrada: boolean('comision_usado_cobrada').notNull().default(false),
  comision_financiacion_cobrada: boolean('comision_financiacion_cobrada').notNull().default(false),
  comision_preference_cobrada: boolean('comision_preference_cobrada').notNull().default(false),
  comision_bonus_cobrada: boolean('comision_bonus_cobrada').notNull().default(false),
  comision_coche_real: doublePrecision('comision_coche_real'),
  comision_financiacion_real: doublePrecision('comision_financiacion_real'),
  conceptos_adicionales: text('conceptos_adicionales'),
});

// === RELACIONES DRIZZLE (Para facilitar consultas y joins de TypeScript) ===

export const tiendasRelations = relations(tiendas, ({ many }) => ({
  usuariosTiendas: many(usuariosTiendas),
  clientes: many(clientes),
  expedientes: many(expedientes),
}));

export const usuariosRelations = relations(usuarios, ({ many }) => ({
  emails: many(emailsUsuarios),
  telefonos: many(telefonosUsuarios),
  expedientes: many(expedientes),
  tiendas: many(usuariosTiendas),
}));

export const usuariosTiendasRelations = relations(usuariosTiendas, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [usuariosTiendas.id_usuario],
    references: [usuarios.id_usuario],
  }),
  tienda: one(tiendas, {
    fields: [usuariosTiendas.id_tienda],
    references: [tiendas.id_tienda],
  }),
}));

export const emailsUsuariosRelations = relations(emailsUsuarios, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [emailsUsuarios.id_usuario],
    references: [usuarios.id_usuario],
  }),
}));

export const telefonosUsuariosRelations = relations(telefonosUsuarios, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [telefonosUsuarios.id_usuario],
    references: [usuarios.id_usuario],
  }),
}));

export const clientesRelations = relations(clientes, ({ one, many }) => ({
  emails: many(emailsClientes),
  telefonos: many(telefonosClientes),
  expedientes: many(expedientes),
  tienda: one(tiendas, {
    fields: [clientes.tienda_id],
    references: [tiendas.id_tienda],
  }),
}));

export const emailsClientesRelations = relations(emailsClientes, ({ one }) => ({
  cliente: one(clientes, {
    fields: [emailsClientes.id_cliente],
    references: [clientes.id],
  }),
}));

export const telefonosClientesRelations = relations(telefonosClientes, ({ one }) => ({
  cliente: one(clientes, {
    fields: [telefonosClientes.id_cliente],
    references: [clientes.id],
  }),
}));

export const marcasRelations = relations(marcas, ({ many }) => ({
  modelos: many(modelos),
}));

export const modelosRelations = relations(modelos, ({ one, many }) => ({
  marca: one(marcas, {
    fields: [modelos.marca_id],
    references: [marcas.id_marca],
  }),
  expedientes: many(expedientes),
}));

export const expedientesRelations = relations(expedientes, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [expedientes.id_usuario],
    references: [usuarios.id_usuario],
  }),
  cliente: one(clientes, {
    fields: [expedientes.id_cliente],
    references: [clientes.id],
  }),
  modelo: one(modelos, {
    fields: [expedientes.id_modelo],
    references: [modelos.id_modelo],
  }),
  tienda: one(tiendas, {
    fields: [expedientes.id_tienda],
    references: [tiendas.id_tienda],
  }),
  tipoDeVenta: one(tipoDeVenta, {
    fields: [expedientes.id_tipo_de_venta],
    references: [tipoDeVenta.id_tipo_de_venta],
  }),
  estadoVehiculo: one(estadoVehiculo, {
    fields: [expedientes.id_estado_vehiculo],
    references: [estadoVehiculo.id_estado_vehiculo],
  }),
}));

// === NUEVAS TABLAS PARA EL SISTEMA DE COMISIONES ===

// 1. TABLA: COMMISSION_PLANS
export const commissionPlans = pgTable('commission_plans', {
  id_plan: serial('id_plan').primaryKey(),
  nombre: text('nombre').notNull(),
  fecha_inicio: date('fecha_inicio').notNull(),
  fecha_fin: date('fecha_fin').notNull(),
  estado: varchar('estado', { length: 50 }).notNull().default('activo'), // borrador, activo, cerrado
  objetivo_base: integer('objetivo_base').notNull().default(0),
  arrastre: integer('arrastre').notNull().default(0),
  min_matriculaciones: integer('min_matriculaciones').notNull().default(6),
  min_coches_multiplicador: integer('min_coches_multiplicador').notNull().default(0),
  penalizacion_importe: integer('penalizacion_importe').notNull().default(0),
  penalizacion_titulo: text('penalizacion_titulo'),
  penalizacion_descripcion: text('penalizacion_descripcion'),
  notas_adicionales: text('notas_adicionales'),
});

// 2. TABLA: COMMISSION_PLAN_MODEL_RATES (Tramos de comisión por modelo)
export const commissionPlanModelRates = pgTable('commission_plan_model_rates', {
  id_rate: serial('id_rate').primaryKey(),
  id_plan: integer('id_plan').references(() => commissionPlans.id_plan, { onDelete: 'cascade' }).notNull(),
  id_modelo: integer('id_modelo').references(() => modelos.id_modelo, { onDelete: 'cascade' }).notNull(),
  tasa_intervencion_cumplida: boolean('tasa_intervencion_cumplida').notNull().default(false), // false = inferior, true = superior/igual
  rate_x_minus_4: integer('rate_x_minus_4').notNull().default(0),
  rate_x_minus_3: integer('rate_x_minus_3').notNull().default(0),
  rate_x_minus_2: integer('rate_x_minus_2').notNull().default(0),
  rate_x_minus_1: integer('rate_x_minus_1').notNull().default(0),
  rate_x: integer('rate_x').notNull().default(0),
  rate_x_plus_1: integer('rate_x_plus_1').notNull().default(0),
  rate_x_plus_2: integer('rate_x_plus_2').notNull().default(0),
  rate_x_plus_3: integer('rate_x_plus_3').notNull().default(0),
  valor_objetivo: doublePrecision('valor_objetivo').notNull().default(1), // valor computable objetivo (ej. 1 o 2) - Conservado para evitar conflictos interactivos de migración
  activo: boolean('activo').notNull().default(true),
});

// 3. TABLA: COMMISSION_RULES (Reglas de comisión del plan)
export const commissionRules = pgTable('commission_rules', {
  id_rule: serial('id_rule').primaryKey(),
  id_plan: integer('id_plan').references(() => commissionPlans.id_plan, { onDelete: 'cascade' }).notNull(),
  nombre: text('nombre').notNull(),
  tipo_evento: varchar('tipo_evento', { length: 50 }).notNull(), // pedido, afectacion, matriculacion, financiacion, preference, manual
  id_marca: integer('id_marca').references(() => marcas.id_marca, { onDelete: 'set null' }),
  id_modelo: integer('id_modelo').references(() => modelos.id_modelo, { onDelete: 'set null' }),
  afecta_objetivo: boolean('afecta_objetivo').notNull().default(false),
  valor_objetivo: integer('valor_objetivo').notNull().default(0),
  afecta_comision: boolean('afecta_comision').notNull().default(false),
  importe: integer('importe').notNull().default(0),
  activa: boolean('activa').notNull().default(true),
  tasa_intervencion_cumplida: boolean('tasa_intervencion_cumplida'), // null = siempre, true = >= target, false = < target
  ligar_a_credito: boolean('ligar_a_credito').notNull().default(false),
});

// 4. TABLA: COMMISSION_BONUS_RULES (Bonus personalizados)
export const commissionBonusRules = pgTable('commission_bonus_rules', {
  id_bonus: serial('id_bonus').primaryKey(),
  id_plan: integer('id_plan').references(() => commissionPlans.id_plan, { onDelete: 'cascade' }).notNull(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  tipo_evento: varchar('tipo_evento', { length: 50 }).notNull(), // pedido, afectacion, matriculacion, financiacion, preference, manual
  id_marca: integer('id_marca').references(() => marcas.id_marca, { onDelete: 'set null' }),
  id_modelo: integer('id_modelo').references(() => modelos.id_modelo, { onDelete: 'set null' }),
  importe: integer('importe').notNull().default(0),
  afecta_objetivo: boolean('afecta_objetivo').notNull().default(false),
  valor_objetivo: integer('valor_objetivo').notNull().default(0),
  fecha_inicio: date('fecha_inicio'),
  fecha_fin: date('fecha_fin'),
  activo: boolean('activo').notNull().default(true),
  tipo_vehiculo: varchar('tipo_vehiculo', { length: 50 }).notNull().default('cualquiera'), // nuevo, usado, cualquiera
  es_penalizacion: boolean('es_penalizacion').notNull().default(false),
});

// 5. TABLA: COMMISSION_FINANCE_RULES (Reglas de financiación)
export const commissionFinanceRules = pgTable('commission_finance_rules', {
  id_finance: serial('id_finance').primaryKey(),
  id_plan: integer('id_plan').references(() => commissionPlans.id_plan, { onDelete: 'cascade' }).notNull(),
  importe_normal: integer('importe_normal').notNull().default(0),
  importe_preference: integer('importe_preference').notNull().default(0),
});

// 5b. TABLA: COMMISSION_USED_RATES (Tarifas de vehículos usados)
export const commissionUsedRates = pgTable('commission_used_rates', {
  id_used_rate: serial('id_used_rate').primaryKey(),
  id_plan: integer('id_plan').references(() => commissionPlans.id_plan, { onDelete: 'cascade' }).notNull(),
  tipo_usado: varchar('tipo_usado', { length: 50 }).notNull(), // VO, KM0, BB, Usado
  importe_primera: integer('importe_primera').notNull().default(0),
  importe_resto: integer('importe_resto').notNull().default(0),
  valor_objetivo: integer('valor_objetivo').notNull().default(1),
  min_aplicar: integer('min_aplicar').notNull().default(1),
  activo: boolean('activo').notNull().default(true),
});

// 5c. TABLA: COMMISSION_FINANCE_RATES (Incentivos de financiación por marca)
export const commissionFinanceRates = pgTable('commission_finance_rates', {
  id_finance_rate: serial('id_finance_rate').primaryKey(),
  id_plan: integer('id_plan').references(() => commissionPlans.id_plan, { onDelete: 'cascade' }).notNull(),
  id_marca: integer('id_marca').references(() => marcas.id_marca, { onDelete: 'cascade' }).notNull(),
  tipo_financiacion: varchar('tipo_financiacion', { length: 50 }).notNull(), // Crédito, Preference, Renting, Contado
  importe: integer('importe').notNull().default(0),
});

// 5d. TABLA: COMMISSION_PREFERENCE_RULES (Reglas específicas de Preference / BOX3)
export const commissionPreferenceRules = pgTable('commission_preference_rules', {
  id_pref_rule: serial('id_pref_rule').primaryKey(),
  id_plan: integer('id_plan').references(() => commissionPlans.id_plan, { onDelete: 'cascade' }).notNull(),
  nombre: text('nombre').notNull(),
  id_marca: integer('id_marca').references(() => marcas.id_marca, { onDelete: 'set null' }),
  id_modelo: integer('id_modelo').references(() => modelos.id_modelo, { onDelete: 'set null' }),
  tipo_financiacion: varchar('tipo_financiacion', { length: 50 }), // RCI, BOX3, Preference, etc.
  importe: integer('importe').notNull().default(0),
  activa: boolean('activa').notNull().default(true),
});

// 5e. TABLA: COMMISSION_VO_PATTERNS (Patrones de comisionamiento de VO)
export const commissionVoPatterns = pgTable('commission_vo_patterns', {
  id_vo_pattern: serial('id_vo_pattern').primaryKey(),
  id_plan: integer('id_plan').references(() => commissionPlans.id_plan, { onDelete: 'cascade' }).notNull(),
  nombre: text('nombre').notNull(),
  aplica_a_vn: boolean('aplica_a_vn').default(false).notNull(),
  activo: boolean('activo').default(true).notNull(),
  tiers: text('tiers').notNull().default('[]'), // JSON string: [{ unidad: 1, importe: 150, valor_objetivo: 1 }]
});

// 5f. TABLA: COMMISSION_BRAND_INTERVENTION_RATES (Tasa de intervención objetiva por marca y plan)
export const commissionBrandInterventionRates = pgTable('commission_brand_intervention_rates', {
  id_intervention_rate: serial('id_intervention_rate').primaryKey(),
  id_plan: integer('id_plan').references(() => commissionPlans.id_plan, { onDelete: 'cascade' }).notNull(),
  id_marca: integer('id_marca').references(() => marcas.id_marca, { onDelete: 'cascade' }).notNull(),
  tasa_intervencion: integer('tasa_intervencion').notNull().default(70), // e.g. 70 para 70%
  valor_objetivo_defecto: doublePrecision('valor_objetivo_defecto').notNull().default(1.0),
  tipo_tasa: varchar('tipo_tasa', { length: 50 }).default('porcentaje').notNull(),
});

// 6. TABLA: COMMISSION_LIQUIDATIONS (Liquidación de un plan)
export const commissionLiquidations = pgTable('commission_liquidations', {
  id_liquidation: serial('id_liquidation').primaryKey(),
  id_plan: integer('id_plan').references(() => commissionPlans.id_plan, { onDelete: 'cascade' }).notNull(),
  estado: varchar('estado', { length: 50 }).notNull().default('borrador'), // borrador, calculada, revisada, cerrada
  fecha_calculo: date('fecha_calculo').notNull(),
  objetivo_base_snapshot: integer('objetivo_base_snapshot').notNull(),
  arrastre_snapshot: integer('arrastre_snapshot').notNull(),
  x_calculado_snapshot: integer('x_calculado_snapshot').notNull(),
  total_computables_snapshot: integer('total_computables_snapshot').notNull().default(0),
  tramo_alcanzado_snapshot: varchar('tramo_alcanzado_snapshot', { length: 20 }).notNull(), // X-3, X-2, X-1, X, X+1, X+2
  matriculaciones_reales_snapshot: integer('matriculaciones_reales_snapshot').notNull().default(0),
  cumple_minimo_snapshot: boolean('cumple_minimo_snapshot').notNull().default(false),
  total_comision_economica: integer('total_comision_economica').notNull().default(0),
  penalizacion_importe_snapshot: integer('penalizacion_importe_snapshot').notNull().default(0),
  penalizacion_titulo_snapshot: text('penalizacion_titulo_snapshot'),
  penalizacion_descripcion_snapshot: text('penalizacion_descripcion_snapshot'),
});

// 7. TABLA: COMMISSION_LIQUIDATION_LINES (Línea de desglose de liquidación por expediente)
export const commissionLiquidationLines = pgTable('commission_liquidation_lines', {
  id_line: serial('id_line').primaryKey(),
  id_liquidation: integer('id_liquidation').references(() => commissionLiquidations.id_liquidation, { onDelete: 'cascade' }).notNull(),
  id_expediente: integer('id_expediente').references(() => expedientes.id_expediente, { onDelete: 'set null' }),
  vendedor_nombre: text('vendedor_nombre').notNull(),
  cliente_nombre: text('cliente_nombre').notNull(),
  marca_nombre: text('marca_nombre').notNull(),
  modelo_nombre: text('modelo_nombre').notNull(),
  fecha_pedido: date('fecha_pedido'),
  fecha_afectacion: date('fecha_afectacion'),
  fecha_matriculacion: date('fecha_matriculacion'),
  entra_por_pedido: boolean('entra_por_pedido').notNull().default(false),
  entra_por_afectacion: boolean('entra_por_afectacion').notNull().default(false),
  entra_por_matriculacion: boolean('entra_por_matriculacion').notNull().default(false),
  valor_para_objetivo: integer('valor_para_objetivo').notNull().default(0),
  comision_base: integer('comision_base').notNull().default(0),
  comision_base_vn: integer('comision_base_vn').notNull().default(0),
  comision_usado: integer('comision_usado').notNull().default(0),
  comision_financiacion: integer('comision_financiacion').notNull().default(0),
  comision_preference: integer('comision_preference').notNull().default(0),
  bonus_acumulado: integer('bonus_acumulado').notNull().default(0),
  total_generado: integer('total_generado').notNull().default(0),
  mes_generacion: varchar('mes_generacion', { length: 50 }).notNull(),
  mes_pago_estimado: varchar('mes_pago_estimado', { length: 50 }).notNull(),
});

// 8. TABLA: COMMISSION_LIQUIDATION_LINE_ITEMS (Detalle granular de conceptos por expediente)
export const commissionLiquidationLineItems = pgTable('commission_liquidation_line_items', {
  id_line_item: serial('id_line_item').primaryKey(),
  id_line: integer('id_line').references(() => commissionLiquidationLines.id_line, { onDelete: 'cascade' }).notNull(),
  concepto: text('concepto').notNull(), // ej. "Comisión Base", "Preference", "Bonus HEV"
  importe: integer('importe').notNull().default(0),
  afecta_objetivo: boolean('afecta_objetivo').notNull().default(false),
  valor_objetivo: integer('valor_objetivo').notNull().default(0),
});

// === RELACIONES DRIZZLE PARA EL SISTEMA DE COMISIONES ===

export const commissionPlansRelations = relations(commissionPlans, ({ many, one }) => ({
  rates: many(commissionPlanModelRates),
  rules: many(commissionRules),
  bonusRules: many(commissionBonusRules),
  financeRules: one(commissionFinanceRules, {
    fields: [commissionPlans.id_plan],
    references: [commissionFinanceRules.id_plan]
  }),
  usedRates: many(commissionUsedRates),
  financeRates: many(commissionFinanceRates),
  preferenceRules: many(commissionPreferenceRules),
  voPatterns: many(commissionVoPatterns),
  brandInterventionRates: many(commissionBrandInterventionRates),
  liquidations: many(commissionLiquidations),
}));

export const commissionPlanModelRatesRelations = relations(commissionPlanModelRates, ({ one }) => ({
  plan: one(commissionPlans, {
    fields: [commissionPlanModelRates.id_plan],
    references: [commissionPlans.id_plan],
  }),
  modelo: one(modelos, {
    fields: [commissionPlanModelRates.id_modelo],
    references: [modelos.id_modelo],
  }),
}));

export const commissionRulesRelations = relations(commissionRules, ({ one }) => ({
  plan: one(commissionPlans, {
    fields: [commissionRules.id_plan],
    references: [commissionPlans.id_plan],
  }),
  marca: one(marcas, {
    fields: [commissionRules.id_marca],
    references: [marcas.id_marca],
  }),
  modelo: one(modelos, {
    fields: [commissionRules.id_modelo],
    references: [modelos.id_modelo],
  }),
}));

export const commissionBonusRulesRelations = relations(commissionBonusRules, ({ one }) => ({
  plan: one(commissionPlans, {
    fields: [commissionBonusRules.id_plan],
    references: [commissionPlans.id_plan],
  }),
  marca: one(marcas, {
    fields: [commissionBonusRules.id_marca],
    references: [marcas.id_marca],
  }),
  modelo: one(modelos, {
    fields: [commissionBonusRules.id_modelo],
    references: [modelos.id_modelo],
  }),
}));

export const commissionFinanceRulesRelations = relations(commissionFinanceRules, ({ one }) => ({
  plan: one(commissionPlans, {
    fields: [commissionFinanceRules.id_plan],
    references: [commissionPlans.id_plan],
  }),
}));

export const commissionLiquidationsRelations = relations(commissionLiquidations, ({ one, many }) => ({
  plan: one(commissionPlans, {
    fields: [commissionLiquidations.id_plan],
    references: [commissionPlans.id_plan],
  }),
  lines: many(commissionLiquidationLines),
}));

export const commissionLiquidationLinesRelations = relations(commissionLiquidationLines, ({ one, many }) => ({
  liquidation: one(commissionLiquidations, {
    fields: [commissionLiquidationLines.id_liquidation],
    references: [commissionLiquidations.id_liquidation],
  }),
  expediente: one(expedientes, {
    fields: [commissionLiquidationLines.id_expediente],
    references: [expedientes.id_expediente],
  }),
  items: many(commissionLiquidationLineItems),
}));

export const commissionLiquidationLineItemsRelations = relations(commissionLiquidationLineItems, ({ one }) => ({
  line: one(commissionLiquidationLines, {
    fields: [commissionLiquidationLineItems.id_line],
    references: [commissionLiquidationLines.id_line],
  }),
}));

export const commissionUsedRatesRelations = relations(commissionUsedRates, ({ one }) => ({
  plan: one(commissionPlans, {
    fields: [commissionUsedRates.id_plan],
    references: [commissionPlans.id_plan],
  }),
}));

export const commissionFinanceRatesRelations = relations(commissionFinanceRates, ({ one }) => ({
  plan: one(commissionPlans, {
    fields: [commissionFinanceRates.id_plan],
    references: [commissionPlans.id_plan],
  }),
  marca: one(marcas, {
    fields: [commissionFinanceRates.id_marca],
    references: [marcas.id_marca],
  }),
}));

export const commissionPreferenceRulesRelations = relations(commissionPreferenceRules, ({ one }) => ({
  plan: one(commissionPlans, {
    fields: [commissionPreferenceRules.id_plan],
    references: [commissionPlans.id_plan],
  }),
  marca: one(marcas, {
    fields: [commissionPreferenceRules.id_marca],
    references: [marcas.id_marca],
  }),
  modelo: one(modelos, {
    fields: [commissionPreferenceRules.id_modelo],
    references: [modelos.id_modelo],
  }),
}));

export const commissionVoPatternsRelations = relations(commissionVoPatterns, ({ one }) => ({
  plan: one(commissionPlans, {
    fields: [commissionVoPatterns.id_plan],
    references: [commissionPlans.id_plan],
  }),
}));

export const commissionBrandInterventionRatesRelations = relations(commissionBrandInterventionRates, ({ one }) => ({
  plan: one(commissionPlans, {
    fields: [commissionBrandInterventionRates.id_plan],
    references: [commissionPlans.id_plan],
  }),
  marca: one(marcas, {
    fields: [commissionBrandInterventionRates.id_marca],
    references: [marcas.id_marca],
  }),
}));

// TABLA: IMPORTACIONES_BLOQUES
export const importacionesBloques = pgTable('importaciones_bloques', {
  id: serial('id').primaryKey(),
  fecha: varchar('fecha', { length: 100 }).notNull(), // ISO timestamp
  nombre_archivo: varchar('nombre_archivo', { length: 255 }).notNull(),
  tipo_archivo: varchar('tipo_archivo', { length: 50 }).notNull(), // Excel, CSV
  usuario_id: integer('usuario_id').references(() => usuarios.id_usuario, { onDelete: 'set null' }),
  creados: integer('creados').default(0).notNull(),
  modificados: integer('modificados').default(0).notNull(),
  omitidos: integer('omitidos').default(0).notNull(),
});

// TABLA: IMPORTACIONES_REGISTROS
export const importacionesRegistros = pgTable('importaciones_registros', {
  id: serial('id').primaryKey(),
  bloque_id: integer('bloque_id').references(() => importacionesBloques.id, { onDelete: 'cascade' }).notNull(),
  id_expediente: integer('id_expediente').references(() => expedientes.id_expediente, { onDelete: 'set null' }),
  tipo_accion: varchar('tipo_accion', { length: 50 }).notNull(), // creado, modificado, omitido
  cliente_nombre: varchar('cliente_nombre', { length: 255 }).notNull(),
  matricula: varchar('matricula', { length: 50 }),
  bastidor: varchar('bastidor', { length: 100 }),
  cambios: text('cambios'), // JSON string of changes
});

// RELACIONES DE IMPORTACIONES
export const importacionesBloquesRelations = relations(importacionesBloques, ({ one, many }) => ({
  usuario: one(usuarios, {
    fields: [importacionesBloques.usuario_id],
    references: [usuarios.id_usuario],
  }),
  registros: many(importacionesRegistros),
}));

export const importacionesRegistrosRelations = relations(importacionesRegistros, ({ one }) => ({
  bloque: one(importacionesBloques, {
    fields: [importacionesRegistros.bloque_id],
    references: [importacionesBloques.id],
  }),
  expediente: one(expedientes, {
    fields: [importacionesRegistros.id_expediente],
    references: [expedientes.id_expediente],
  }),
}));

// TABLA: AJUSTES (Ajustes de la aplicación guardados en base de datos)
export const ajustes = pgTable('ajustes', {
  clave: varchar('clave', { length: 255 }).primaryKey(),
  valor: text('valor').notNull(),
});
