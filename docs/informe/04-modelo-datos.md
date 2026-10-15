> Parte del informe completo (`docs/INFORME-COMPLETO.md`). **Leyenda de marcas** [V-código] [V-reglas] [V-Prompts] [V-web] [D] [I] [P]: ver `00-leyenda-vision-entorno.md` (sección 0.1). Regla: no conviertas una [I] o [P] en hecho sin comprobarlo; aplica el valor por defecto y anótalo en `DECISIONES.md`.

## 4. Modelo de datos (PostgreSQL)

### 4.1 Criterios generales

- Nombres de tablas y columnas **en español y snake_case**, como el original. [V-código]
- Claves primarias `serial` (`integer` autoincremental) como el original. [V-código]
- Fechas de negocio: tipo **`date`** (sin hora). Marcas de tiempo técnicas: `timestamptz`.
- Los importes/puntos de comisiones **nuevos** se guardan como **enteros**: importes en **céntimos** y puntos en **centésimas** (150 = 1,50 puntos), para evitar errores de redondeo. [V-reglas: Fase 0]. Las tablas de negocio antiguas (expedientes, etc.) se mantienen con los tipos del original salvo los cambios indicados.
- Borrados en cascada y claves foráneas **como el original** (Anexo B).

### 4.2 Tablas que se CONSERVAN igual que el original

Ver **Anexo B** (esquema extraído automáticamente). Se conservan: `tiendas`, `usuarios_tiendas`, `emails_usuarios`, `telefonos_usuarios`, `clientes`, `emails_clientes`, `telefonos_clientes`, `marcas`, `modelos`, `importaciones_bloques`, `importaciones_registros`, `ajustes`.

### 4.3 Tablas que se MODIFICAN

#### `usuarios` (cambia por quitar Clerk)

| Columna | Tipo | Cambio |
|---|---|---|
| `id_usuario` | serial PK | igual |
| ~~`clerk_id`~~ | — | **se elimina** |
| `login_email` | varchar(255) NOT NULL UNIQUE (guardado en minúsculas) | **nuevo**: identifica al usuario al iniciar sesión |
| `password_hash` | text NOT NULL | **nuevo** (Argon2id/bcrypt) |
| `debe_cambiar_password` | boolean NOT NULL DEFAULT true | **nuevo**: true al crear usuario con contraseña temporal |
| `totp_secreto_cifrado` | text NULL | **nuevo**: secreto TOTP cifrado con AES-256-GCM usando `APP_SECRET` |
| `totp_activo` | boolean NOT NULL DEFAULT false | **nuevo** |
| `intentos_fallidos` | integer NOT NULL DEFAULT 0 | **nuevo** |
| `bloqueado_hasta` | timestamptz NULL | **nuevo**: bloqueo temporal por intentos |
| `ultimo_acceso` | timestamptz NULL | **nuevo** |
| `creado_en` | timestamptz NOT NULL DEFAULT now() | **nuevo** |
| `nombre`, `rol`, `fecha_de_registro`, `bloqueado`, `tipo_vendedor`, `patron_vo`, `tienda_predeterminada_id` | — | **iguales** (Anexo B) |

Notas:
- `rol` ∈ {`administrador`, `director`, `jefe_zona`, `jefe_tienda`, `vendedor`, `invitado`}. [V-código]
- `bloqueado` = cuenta **suspendida** por un administrador (muestra la pantalla “Cuenta Suspendida”). Es distinto de `bloqueado_hasta` (bloqueo temporal por intentos fallidos). [V-código para el primero; D para el segundo]
- `tipo_vendedor` ∈ {`VN`, `VO`}; `patron_vo` = nombre del patrón de comisionamiento VO que le aplica. [V-código]

#### `estado_vehiculo` (se amplía para que la lógica no dependa del nombre)

| Columna | Tipo | Cambio |
|---|---|---|
| `id_estado_vehiculo`, `nombre_estado_vehiculo`, `predeterminado` | — | iguales |
| `clase` | varchar(2) NOT NULL DEFAULT 'VN' (`VN`/`VO`) | **nuevo** [D] |
| `subtipo_vo` | varchar(30) NULL (`USADO`,`KM0`,`DEMO`,`BUYBACK`, …) | **nuevo** [D] |

**Por qué**: el original decide VN/VO **comparando el texto del nombre** del estado (`"nuevo"`, `"demo"`, `"km0"`, `"buyback"`, `"bb"`, `"seminuevo"`, `"vo"`). [V-código] Eso es frágil. Las reglas del propietario dicen que **Usado, KM0, Demo y Buyback son VO**. [V-reglas ✅] Se configuran en *Configuración → Estados*.
Valores iniciales sugeridos: Nuevo→VN; Demo→VO/DEMO; KM0→VO/KM0; Buyback→VO/BUYBACK; Usado→VO/USADO. [D][P: confirmar si existe un estado “Seminuevo”]

#### `tipo_de_venta` (se amplía con categoría explícita)

| Columna | Tipo | Cambio |
|---|---|---|
| `id_tipo_de_venta`, `nombre_tipo_venta`, `color` (default `#3b82f6`), `orden` | — | iguales |
| `categoria` | varchar(20) NOT NULL (`CONTADO`,`CREDITO`,`PREFERENCE`,`RENTING`) | **nuevo** [D] |

**Por qué**: el original detecta la categoría buscando palabras dentro del nombre (“preference”, “crédito”, “credito”, “financiado”, “renting”, “contado”). [V-código] Las reglas del propietario hablan de “tipo de venta (con su categoría: Contado, Crédito, Preference, Renting)”. [V-reglas]

#### `expedientes` (cambios para el nuevo motor)

Se conservan **todas** las columnas del original (Anexo B), incluidas `valor_objetivo` (puntos del coche), `min_coches_multiplicador`, `cobrado_otra_fecha`, `fecha_cobrado`, `fecha_rci`, `fecha_facturacion`, los indicadores `comision_*_cobrada`, `comision_coche_real`, `comision_financiacion_real` y `conceptos_adicionales`. [V-código] Y se añade/ajusta:

| Columna | Tipo | Cambio |
|---|---|---|
| `puntos` | integer NULL (centésimas) | **nuevo**: puntos propios del coche. NULL = usar valor por defecto del plan. **0 es válido** (no se convierte en 1). Sustituye a `valor_objetivo` (que era `double precision`). [V-reglas ✅] |
| `id_promocion` | integer NULL FK → `promociones_puntos` (ON DELETE RESTRICT) | **nuevo**: sustituye al “cupo” numérico `min_coches_multiplicador`. [V-reglas ✅] |
| `comision_coche_manual` / `comision_financiacion_manual` | integer NULL (céntimos) | sustituyen a `comision_coche_real` / `comision_financiacion_real` (que eran euros `double`). NULL = autocalcular. [V-reglas ✅] |
| `conceptos_especiales` | jsonb NOT NULL DEFAULT '[]' | sustituye a `conceptos_adicionales` (texto JSON). Cada elemento: `{titulo, importe_centimos (±), descripcion, evento ('afectacion'|'matriculacion'|'cobro'), cobrado:boolean}` [V-reglas Fase 7.5] |
| `min_coches_multiplicador`, `valor_objetivo`, `comision_coche_real`, `comision_financiacion_real`, `conceptos_adicionales` | — | se **mantienen como columnas heredadas** (solo lectura, para importar copias antiguas) y se retiran cuando la importación esté validada. [D] |

### 4.4 Tablas NUEVAS: autenticación y seguridad (sin Clerk) [D]

```
sesiones            (id uuid PK, id_usuario FK→usuarios ON DELETE CASCADE, token_hash text UNIQUE NOT NULL,
                     creada_en timestamptz, ultimo_uso timestamptz, caduca_en timestamptz,
                     ip inet, user_agent text, mfa_verificado boolean NOT NULL DEFAULT false, revocada_en timestamptz NULL)
codigos_recuperacion(id serial PK, id_usuario FK ON DELETE CASCADE, codigo_hash text NOT NULL, usado_en timestamptz NULL)
login_intentos      (id bigserial PK, clave text NOT NULL /* hash de ip|email */, en timestamptz NOT NULL DEFAULT now(), exito boolean NOT NULL)
auditoria           (id bigserial PK, en timestamptz DEFAULT now(), id_usuario FK ON DELETE SET NULL, accion text NOT NULL,
                     entidad text, entidad_id text, detalle jsonb, ip inet)
```

### 4.5 Tablas NUEVAS: copias de seguridad y Google Drive [D]

```
copias_seguridad (id serial PK, nombre_archivo text UNIQUE NOT NULL, tamano_bytes bigint, sha256 text,
                  creada_en timestamptz DEFAULT now(), id_usuario FK ON DELETE SET NULL NULL,
                  tipo text NOT NULL /* 'manual' | 'automatica' | 'previa_restauracion' */,
                  subida_drive boolean NOT NULL DEFAULT false, drive_file_id text NULL, notas text NULL)
conexion_drive   (id serial PK, id_usuario FK ON DELETE CASCADE, email_google text,
                  refresh_token_cifrado text NOT NULL, carpeta_id text NULL,
                  copia_automatica_a_drive boolean NOT NULL DEFAULT false, conectada_en timestamptz DEFAULT now())
```

Las **copias en sí** son archivos en `./backups/` (no se guardan en la base de datos).

### 4.6 Tablas NUEVAS: sistema de comisiones (motor nuevo)

Sustituyen a las tablas `commission_*` originales (Anexo B) porque las reglas confirmadas por el propietario exigen: **objetivo por vendedor**, **promociones de puntos**, **tarifas con rango de tramos configurable**, **libro de puntos**, **versiones de liquidación**, **cobros pendientes**. Se mantienen los **nombres de las tablas originales** cuando el concepto es el mismo, para que el aspecto de las pantallas no cambie. [D]

> Unidades: **céntimos** (importes) y **centésimas** (puntos). Mes de cómputo: texto `AAAA-MM`.

**`commission_plans`** (plan de comisionamiento; normalmente un mes)
`id_plan` PK · `nombre` · `fecha_inicio` date · `fecha_fin` date · `estado` (`borrador`/`activo`/`cerrado`) · `tramo_min` int DEFAULT −4 · `tramo_max` int DEFAULT 3 · `puntos_por_pedido` int (centésimas) DEFAULT 0 · `penalizacion_importe` int · `penalizacion_titulo` · `penalizacion_descripcion` · `notas` text. (Se eliminan `min_matriculaciones`, `min_coches_multiplicador`, `objetivo_base`, `arrastre` del plan; el objetivo pasa a ser **por vendedor**.) [V-reglas ✅]

**`commission_plan_vendedores`** (objetivo X por vendedor y plan)
`id` PK · `id_plan` FK CASCADE · `id_usuario` FK · `objetivo_base` int (centésimas; habitual 1300) · `arrastre` int (centésimas) DEFAULT 0 · UNIQUE(`id_plan`,`id_usuario`). Objetivo X resultante = `objetivo_base + arrastre`. [V-reglas Fase 1.2]

**`promociones_puntos`** (coches de doble puntuación)
`id` PK · `id_plan` FK CASCADE · `nombre` · `puntos_especiales` int (centésimas, p.ej. 200) · `minimo_unidades` int · `puntos_si_no_cumple` int DEFAULT 100. [V-reglas Fase 1.3]

**`commission_plan_model_rates`** (tarifas VN por modelo/tramo/tasa)
`id_rate` PK · `id_plan` FK CASCADE · `id_modelo` FK CASCADE · `tasa_cumplida` boolean · `importes` jsonb (mapa `{"-4":15000,"-3":…,"0":…,"3":…}`; claves = tramos entre `tramo_min` y `tramo_max`) · `activo` boolean · `orden` int. Se pasa de 8 columnas fijas `rate_x_minus_4…rate_x_plus_3` a un **mapa** para que el rango de tramos sea configurable. [V-reglas Fase 1.4]

**`commission_used_rates`** (VO de vendedor VN, por subtipo)
`id_used_rate` PK · `id_plan` FK CASCADE · `subtipo` (`USADO`,`KM0`,`DEMO`,`BUYBACK`…) · `importe_primera` int · `importe_resto` int · `min_aplicar` int DEFAULT **0** · `activo`. [V-reglas Fase 1.5]

**`commission_vo_patterns`** (escala progresiva VO)
`id_vo_pattern` PK · `id_plan` FK CASCADE · `nombre` · `aplica_a_vn` boolean · `activo` · `tiers` jsonb (`[{unidad:1,importe:15000},…]`). [V-reglas Fase 1.5]

**`commission_finance_rates`** (incentivo de financiación por marca y tipo)
`id_finance_rate` PK · `id_plan` FK CASCADE · `id_marca` FK CASCADE · `tipo_financiacion` (`CREDITO`,`PREFERENCE`,`RENTING`,`CONTADO`) · `importe` int. [V-código + V-reglas 1.6]

**`commission_preference_rules`** (reglas Preference / BOX3)
`id_pref_rule` PK · `id_plan` FK CASCADE · `nombre` · `id_marca` NULL · `id_modelo` NULL · `tipo_financiacion` NULL · `importe` int · `activa`. [V-reglas 1.6, 7.3]

**`commission_rules`** y **`commission_bonus_rules`** (reglas y bonus; penalizaciones = bonus con `es_penalizacion`)
Mismos campos que el original (Anexo B) **más**: `evento` ∈ {`pedido`,`afectacion`,`matriculacion`,`cobro`,`credito`,`preference`} (se añade `cobro`), `tipo_vehiculo` ∈ {`nuevo`,`usado`,`cualquiera`}, `fecha_inicio`/`fecha_fin` de validez, `tasa_intervencion` ∈ {`cumplida`,`no_cumplida`,`indiferente`}, `puntos` int (centésimas) y `importe` int (céntimos), `ligar_a_credito` boolean (solo Preference). [V-reglas 1.7]

**`commission_brand_intervention_rates`** (tasa de intervención objetiva por marca y plan)
`id_intervention_rate` PK · `id_plan` · `id_marca` · `tipo_tasa` (`porcentaje`/`unidades`) · `objetivo` int (70 = 70 % o nº de unidades) DEFAULT 70 · `puntos_defecto` int (centésimas; puntos por defecto de un coche de esa marca) DEFAULT 100. Los **puntos por defecto por modelo** van en `commission_model_points(id_plan, id_modelo, puntos)`. [V-reglas 1.2, 4.1]

**`commission_liquidations`**, **`commission_liquidation_lines`**, **`commission_liquidation_line_items`**
Mismo concepto que el original (Anexo B) pero **por vendedor y mes**: `commission_liquidations(id_liquidation, id_plan, id_usuario, mes 'AAAA-MM', estado ('borrador','calculada','revisada','cerrada'), version int, objetivo_x int, puntos_mes int, tramo int, tasa_intervencion jsonb, bruto int, penalizacion int, neto int, mes_pago 'AAAA-MM', calculada_en timestamptz, origen ('motor'|'importada_antigua'))`, UNIQUE(`id_plan`,`id_usuario`,`mes`). Las líneas guardan **cada importe con su concepto de origen** (`concepto`, `importe`, `puntos`, `id_expediente`, `evento`, `mes_evento`). [V-reglas Fase 9]

**`commission_liquidation_versions`** (historial inmutable)
`id` PK · `id_liquidation` FK · `version` · `motivo` text · `creada_en` · `snapshot` jsonb (cabecera + líneas + conceptos completos) · `neto_anterior` int · `neto_nuevo` int. Sin UPDATE ni DELETE (disparador). [V-reglas 9.3, 9.4]

**`libro_puntos`** (registro de **solo inserción**)
`id` bigserial PK · `id_usuario` · `id_expediente` NULL · `evento` (`PEDIDO`,`MATRICULACION`,`COBRO`,`REGLA`,`AJUSTE`) · `fecha` date · `mes` 'AAAA-MM' · `puntos` int (centésimas, puede ser negativo) · `regla` text NULL · `creado_en`. **Nunca se modifica ni se borra**: las correcciones son apuntes negativos. [V-reglas Fase 10]

**`pendientes_cobro`** (lo que “me deben”)
`id` PK · `id_usuario` · `concepto` · `importe` int · `fecha` date · `mes_nomina_previsto` 'AAAA-MM' · `cobrado` boolean · `fecha_cobro` date NULL · `notas` text. [V-reglas 11.3]

**`commission_plan_pending`** (comisiones pendientes del plan, de meses anteriores)
`id` PK · `id_plan` FK · `concepto` · `importe` int · `mes_origen`. [V-reglas 11.2]

**`cobro_conceptos`** (cotejo de nómina por concepto)
Se mantienen las casillas por concepto de `expedientes` (`comision_coche_cobrada`, `comision_usado_cobrada`, `comision_financiacion_cobrada`, `comision_preference_cobrada`, `comision_bonus_cobrada`, `comision_cobrada`) tal como en el original. [V-código]

### 4.7 Índices obligatorios (rendimiento en la Pi) [D]

```
expedientes(id_usuario), expedientes(id_cliente), expedientes(id_modelo), expedientes(id_tienda),
expedientes(fecha_expediente), expedientes(fecha_matriculacion), expedientes(fecha_rci),
expedientes(fecha_cobrado), expedientes(vin), expedientes(matricula), expedientes(id_estado_vehiculo),
clientes(dni), clientes(lower(nombre)), emails_clientes(id_cliente), telefonos_clientes(id_cliente),
modelos(marca_id), usuarios_tiendas(id_usuario), sesiones(id_usuario), sesiones(caduca_en),
login_intentos(clave, en), libro_puntos(id_usuario, mes), commission_liquidations(id_plan, id_usuario, mes)
```

### 4.8 Datos iniciales (semilla) [D]

Una migración de “semilla” crea (idempotente): estados de vehículo (Nuevo, Demo, KM0, Buyback, Usado) con su `clase`/`subtipo_vo`; tipos de venta (Contado, Crédito, Preference, Renting) con `categoria` y color; ajuste `mostrar_botones_csv`. **No** se crean usuarios en la semilla: el primer administrador se crea con `scripts/crear-admin.sh` (sección 5.2).


---
