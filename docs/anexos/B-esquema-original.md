## Anexo B — Esquema de base de datos ORIGINAL (extraído automáticamente de `src/db/schema.ts`)

> Referencia de **las tablas y columnas del original**. Se conservan las tablas de negocio y se modifican/añaden las indicadas en la sección 4. Las tablas `commission_*` del original se sustituyen por el diseño de 4.6 (se muestran aquí para saber qué existía). Extracción automática: las restricciones compuestas o de índice no listadas deben consultarse en `referencia/gestorVentas-original/src/db/schema.ts`.

#### `tiendas`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_tienda` | serial | PK |
| `nombre` | text | NOT NULL |
| `ciudad` | varchar(255) |  |

#### `usuarios`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_usuario` | serial | PK |
| `clerk_id` | varchar(255) | NOT NULL; UNIQUE |
| `nombre` | varchar(255) |  |
| `rol` | varchar(50) | administrador, director, jefe_zona, jefe_tienda, vendedor, invitado |
| `fecha_de_registro` | date |  |
| `bloqueado` | boolean | DEFAULT false |
| `tipo_vendedor` | varchar(50) | NOT NULL; DEFAULT 'VN'; VN, VO |
| `patron_vo` | varchar(100) | DEFAULT 'Estándar VO' |
| `tienda_predeterminada_id` | integer | FK → tiendas.id_tienda (ON DELETE SET NULL) |

#### `usuarios_tiendas`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_usuario_tienda` | serial | PK |
| `id_usuario` | integer | NOT NULL; FK → usuarios.id_usuario (ON DELETE CASCADE) |
| `id_tienda` | integer | NOT NULL; FK → tiendas.id_tienda (ON DELETE CASCADE) |

#### `emails_usuarios`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_email_usuario` | serial | PK |
| `id_usuario` | integer | FK → usuarios.id_usuario (ON DELETE CASCADE) |
| `email` | varchar(255) | NOT NULL |
| `tipo_email` | varchar(100) |  |

#### `telefonos_usuarios`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_telefono_usuario` | serial | PK |
| `id_usuario` | integer | FK → usuarios.id_usuario (ON DELETE CASCADE) |
| `telefono` | varchar(50) | NOT NULL |
| `tipo_telefono` | varchar(100) |  |

#### `clientes`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id` | serial | PK |
| `cliente_id` | varchar(255) | NOT NULL; UNIQUE |
| `dni` | varchar(50) |  |
| `nombre` | varchar(255) |  |
| `fecha_de_nacimiento` | date |  |
| `tienda_id` | integer | FK → tiendas.id_tienda |

#### `emails_clientes`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_email_cliente` | serial | PK |
| `id_cliente` | integer | FK → clientes.id (ON DELETE CASCADE) |
| `email` | varchar(255) | NOT NULL |
| `tipo_email` | varchar(100) |  |

#### `telefonos_clientes`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_telefono_cliente` | serial | PK |
| `id_cliente` | integer | FK → clientes.id (ON DELETE CASCADE) |
| `telefono` | varchar(50) | NOT NULL |
| `tipo_telefono` | varchar(100) |  |

#### `marcas`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_marca` | serial | PK |
| `nombre` | text | NOT NULL |
| `activo` | boolean | DEFAULT true |
| `acceso_rapido` | boolean | DEFAULT false |
| `sistema_comisiones` | boolean | NOT NULL; DEFAULT false |

#### `modelos`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_modelo` | serial | PK |
| `marca_id` | integer | FK → marcas.id_marca (ON DELETE CASCADE) |
| `nombre_modelo` | text | NOT NULL |
| `acceso_rapido` | boolean | DEFAULT false |
| `orden_acceso_rapido` | integer | DEFAULT 0 |

#### `tipo_de_venta`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_tipo_de_venta` | serial | PK |
| `nombre_tipo_venta` | text | NOT NULL |
| `color` | varchar(50) | DEFAULT '#3b82f6' |
| `orden` | integer | NOT NULL; DEFAULT 0 |

#### `estado_vehiculo`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_estado_vehiculo` | serial | PK |
| `nombre_estado_vehiculo` | text | NOT NULL |
| `predeterminado` | boolean | DEFAULT false |

#### `expedientes`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_expediente` | serial | PK |
| `id_usuario` | integer | FK → usuarios.id_usuario |
| `id_cliente` | integer | FK → clientes.id |
| `id_modelo` | integer | FK → modelos.id_modelo |
| `id_tienda` | integer | FK → tiendas.id_tienda |
| `fecha_expediente` | date |  |
| `fecha_afectacion` | date |  |
| `fecha_matriculacion` | date |  |
| `fecha_entrega` | date |  |
| `fecha_rci` | date |  |
| `fecha_facturacion` | date |  |
| `matricula` | varchar(50) |  |
| `id_tipo_de_venta` | integer | FK → tipoDeVenta.id_tipo_de_venta |
| `id_estado_vehiculo` | integer | FK → estadoVehiculo.id_estado_vehiculo |
| `vin` | varchar(100) |  |
| `valor_objetivo` | doublePrecision |  |
| `min_coches_multiplicador` | integer | NOT NULL; DEFAULT 0 |
| `cobrado_otra_fecha` | boolean | NOT NULL; DEFAULT false |
| `fecha_cobrado` | date |  |
| `comision_cobrada` | boolean | NOT NULL; DEFAULT false |
| `comision_coche_cobrada` | boolean | NOT NULL; DEFAULT false |
| `comision_usado_cobrada` | boolean | NOT NULL; DEFAULT false |
| `comision_financiacion_cobrada` | boolean | NOT NULL; DEFAULT false |
| `comision_preference_cobrada` | boolean | NOT NULL; DEFAULT false |
| `comision_bonus_cobrada` | boolean | NOT NULL; DEFAULT false |
| `comision_coche_real` | doublePrecision |  |
| `comision_financiacion_real` | doublePrecision |  |
| `conceptos_adicionales` | text |  |

#### `commission_plans`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_plan` | serial | PK |
| `nombre` | text | NOT NULL |
| `fecha_inicio` | date | NOT NULL |
| `fecha_fin` | date | NOT NULL |
| `estado` | varchar(50) | NOT NULL; DEFAULT 'activo'; borrador, activo, cerrado |
| `objetivo_base` | integer | NOT NULL; DEFAULT 0 |
| `arrastre` | integer | NOT NULL; DEFAULT 0 |
| `min_matriculaciones` | integer | NOT NULL; DEFAULT 6 |
| `min_coches_multiplicador` | integer | NOT NULL; DEFAULT 0 |
| `penalizacion_importe` | integer | NOT NULL; DEFAULT 0 |
| `penalizacion_titulo` | text |  |
| `penalizacion_descripcion` | text |  |
| `notas_adicionales` | text |  |

#### `commission_plan_model_rates`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_rate` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `id_modelo` | integer | NOT NULL; FK → modelos.id_modelo (ON DELETE CASCADE) |
| `tasa_intervencion_cumplida` | boolean | NOT NULL; DEFAULT false; false = inferior, true = superior/igual |
| `rate_x_minus_4` | integer | NOT NULL; DEFAULT 0 |
| `rate_x_minus_3` | integer | NOT NULL; DEFAULT 0 |
| `rate_x_minus_2` | integer | NOT NULL; DEFAULT 0 |
| `rate_x_minus_1` | integer | NOT NULL; DEFAULT 0 |
| `rate_x` | integer | NOT NULL; DEFAULT 0 |
| `rate_x_plus_1` | integer | NOT NULL; DEFAULT 0 |
| `rate_x_plus_2` | integer | NOT NULL; DEFAULT 0 |
| `rate_x_plus_3` | integer | NOT NULL; DEFAULT 0 |
| `valor_objetivo` | doublePrecision | NOT NULL; DEFAULT 1; valor computable objetivo (ej. 1 o 2) - Conservado para evitar conflictos interactivos de migración |
| `activo` | boolean | NOT NULL; DEFAULT true |

#### `commission_rules`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_rule` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `nombre` | text | NOT NULL |
| `tipo_evento` | varchar(50) | NOT NULL; pedido, afectacion, matriculacion, financiacion, preference, manual |
| `id_marca` | integer | FK → marcas.id_marca (ON DELETE SET NULL) |
| `id_modelo` | integer | FK → modelos.id_modelo (ON DELETE SET NULL) |
| `afecta_objetivo` | boolean | NOT NULL; DEFAULT false |
| `valor_objetivo` | integer | NOT NULL; DEFAULT 0 |
| `afecta_comision` | boolean | NOT NULL; DEFAULT false |
| `importe` | integer | NOT NULL; DEFAULT 0 |
| `activa` | boolean | NOT NULL; DEFAULT true |
| `tasa_intervencion_cumplida` | boolean | null = siempre, true = >= target, false = < target |
| `ligar_a_credito` | boolean | NOT NULL; DEFAULT false |

#### `commission_bonus_rules`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_bonus` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `nombre` | text | NOT NULL |
| `descripcion` | text |  |
| `tipo_evento` | varchar(50) | NOT NULL; pedido, afectacion, matriculacion, financiacion, preference, manual |
| `id_marca` | integer | FK → marcas.id_marca (ON DELETE SET NULL) |
| `id_modelo` | integer | FK → modelos.id_modelo (ON DELETE SET NULL) |
| `importe` | integer | NOT NULL; DEFAULT 0 |
| `afecta_objetivo` | boolean | NOT NULL; DEFAULT false |
| `valor_objetivo` | integer | NOT NULL; DEFAULT 0 |
| `fecha_inicio` | date |  |
| `fecha_fin` | date |  |
| `activo` | boolean | NOT NULL; DEFAULT true |
| `tipo_vehiculo` | varchar(50) | NOT NULL; DEFAULT 'cualquiera'; nuevo, usado, cualquiera |
| `es_penalizacion` | boolean | NOT NULL; DEFAULT false |

#### `commission_finance_rules`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_finance` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `importe_normal` | integer | NOT NULL; DEFAULT 0 |
| `importe_preference` | integer | NOT NULL; DEFAULT 0 |

#### `commission_used_rates`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_used_rate` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `tipo_usado` | varchar(50) | NOT NULL; VO, KM0, BB, Usado |
| `importe_primera` | integer | NOT NULL; DEFAULT 0 |
| `importe_resto` | integer | NOT NULL; DEFAULT 0 |
| `valor_objetivo` | integer | NOT NULL; DEFAULT 1 |
| `min_aplicar` | integer | NOT NULL; DEFAULT 1 |
| `activo` | boolean | NOT NULL; DEFAULT true |

#### `commission_finance_rates`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_finance_rate` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `id_marca` | integer | NOT NULL; FK → marcas.id_marca (ON DELETE CASCADE) |
| `tipo_financiacion` | varchar(50) | NOT NULL; Crédito, Preference, Renting, Contado |
| `importe` | integer | NOT NULL; DEFAULT 0 |

#### `commission_preference_rules`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_pref_rule` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `nombre` | text | NOT NULL |
| `id_marca` | integer | FK → marcas.id_marca (ON DELETE SET NULL) |
| `id_modelo` | integer | FK → modelos.id_modelo (ON DELETE SET NULL) |
| `tipo_financiacion` | varchar(50) | RCI, BOX3, Preference, etc. |
| `importe` | integer | NOT NULL; DEFAULT 0 |
| `activa` | boolean | NOT NULL; DEFAULT true |

#### `commission_vo_patterns`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_vo_pattern` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `nombre` | text | NOT NULL |
| `aplica_a_vn` | boolean | NOT NULL; DEFAULT false |
| `activo` | boolean | NOT NULL; DEFAULT true |
| `tiers` | text | NOT NULL; DEFAULT '[]'; JSON string: [{ unidad: 1, importe: 150, valor_objetivo: 1 }] |

#### `commission_brand_intervention_rates`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_intervention_rate` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `id_marca` | integer | NOT NULL; FK → marcas.id_marca (ON DELETE CASCADE) |
| `tasa_intervencion` | integer | NOT NULL; DEFAULT 70; e.g. 70 para 70% |
| `valor_objetivo_defecto` | doublePrecision | NOT NULL; DEFAULT 1.0 |
| `tipo_tasa` | varchar(50) | NOT NULL; DEFAULT 'porcentaje' |

#### `commission_liquidations`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_liquidation` | serial | PK |
| `id_plan` | integer | NOT NULL; FK → commissionPlans.id_plan (ON DELETE CASCADE) |
| `estado` | varchar(50) | NOT NULL; DEFAULT 'borrador'; borrador, calculada, revisada, cerrada |
| `fecha_calculo` | date | NOT NULL |
| `objetivo_base_snapshot` | integer | NOT NULL |
| `arrastre_snapshot` | integer | NOT NULL |
| `x_calculado_snapshot` | integer | NOT NULL |
| `total_computables_snapshot` | integer | NOT NULL; DEFAULT 0 |
| `tramo_alcanzado_snapshot` | varchar(20) | NOT NULL; X-3, X-2, X-1, X, X+1, X+2 |
| `matriculaciones_reales_snapshot` | integer | NOT NULL; DEFAULT 0 |
| `cumple_minimo_snapshot` | boolean | NOT NULL; DEFAULT false |
| `total_comision_economica` | integer | NOT NULL; DEFAULT 0 |
| `penalizacion_importe_snapshot` | integer | NOT NULL; DEFAULT 0 |
| `penalizacion_titulo_snapshot` | text |  |
| `penalizacion_descripcion_snapshot` | text |  |

#### `commission_liquidation_lines`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_line` | serial | PK |
| `id_liquidation` | integer | NOT NULL; FK → commissionLiquidations.id_liquidation (ON DELETE CASCADE) |
| `id_expediente` | integer | FK → expedientes.id_expediente (ON DELETE SET NULL) |
| `vendedor_nombre` | text | NOT NULL |
| `cliente_nombre` | text | NOT NULL |
| `marca_nombre` | text | NOT NULL |
| `modelo_nombre` | text | NOT NULL |
| `fecha_pedido` | date |  |
| `fecha_afectacion` | date |  |
| `fecha_matriculacion` | date |  |
| `entra_por_pedido` | boolean | NOT NULL; DEFAULT false |
| `entra_por_afectacion` | boolean | NOT NULL; DEFAULT false |
| `entra_por_matriculacion` | boolean | NOT NULL; DEFAULT false |
| `valor_para_objetivo` | integer | NOT NULL; DEFAULT 0 |
| `comision_base` | integer | NOT NULL; DEFAULT 0 |
| `comision_base_vn` | integer | NOT NULL; DEFAULT 0 |
| `comision_usado` | integer | NOT NULL; DEFAULT 0 |
| `comision_financiacion` | integer | NOT NULL; DEFAULT 0 |
| `comision_preference` | integer | NOT NULL; DEFAULT 0 |
| `bonus_acumulado` | integer | NOT NULL; DEFAULT 0 |
| `total_generado` | integer | NOT NULL; DEFAULT 0 |
| `mes_generacion` | varchar(50) | NOT NULL |
| `mes_pago_estimado` | varchar(50) | NOT NULL |

#### `commission_liquidation_line_items`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id_line_item` | serial | PK |
| `id_line` | integer | NOT NULL; FK → commissionLiquidationLines.id_line (ON DELETE CASCADE) |
| `concepto` | text | NOT NULL; ej. "Comisión Base", "Preference", "Bonus HEV" |
| `importe` | integer | NOT NULL; DEFAULT 0 |
| `afecta_objetivo` | boolean | NOT NULL; DEFAULT false |
| `valor_objetivo` | integer | NOT NULL; DEFAULT 0 |

#### `importaciones_bloques`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id` | serial | PK |
| `fecha` | varchar(100) | NOT NULL; ISO timestamp |
| `nombre_archivo` | varchar(255) | NOT NULL |
| `tipo_archivo` | varchar(50) | NOT NULL; Excel, CSV |
| `usuario_id` | integer | FK → usuarios.id_usuario (ON DELETE SET NULL) |
| `creados` | integer | NOT NULL; DEFAULT 0 |
| `modificados` | integer | NOT NULL; DEFAULT 0 |
| `omitidos` | integer | NOT NULL; DEFAULT 0 |

#### `importaciones_registros`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `id` | serial | PK |
| `bloque_id` | integer | NOT NULL; FK → importacionesBloques.id (ON DELETE CASCADE) |
| `id_expediente` | integer | FK → expedientes.id_expediente (ON DELETE SET NULL) |
| `tipo_accion` | varchar(50) | NOT NULL; creado, modificado, omitido |
| `cliente_nombre` | varchar(255) | NOT NULL |
| `matricula` | varchar(50) |  |
| `bastidor` | varchar(100) |  |
| `cambios` | text | JSON string of changes |

#### `ajustes`

| Columna | Tipo | Restricciones / notas |
|---|---|---|
| `clave` | varchar(255) | PK |
| `valor` | text | NOT NULL |

---
