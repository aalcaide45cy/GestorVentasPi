> Parte del informe completo (`docs/INFORME-COMPLETO.md`). **Leyenda de marcas** [V-código] [V-reglas] [V-Prompts] [V-web] [D] [I] [P]: ver `00-leyenda-vision-entorno.md` (sección 0.1). Regla: no conviertas una [I] o [P] en hecho sin comprobarlo; aplica el valor por defecto y anótalo en `DECISIONES.md`.

## 12. Sistema de comisiones, puntos y cobros (motor nuevo)

> **Fuente normativa:** `SISTEMA-DE-COMISIONES.md` (Anexo A, íntegro). Esta sección lo convierte en un **diseño ejecutable**: tipos, algoritmo paso a paso, casos límite, persistencia y pruebas. Si hay contradicción, **manda el Anexo A** (reglas ✅ confirmadas por el propietario). El propietario delegó el diseño del motor en el autor de este informe (R11) siempre que cumpla esas reglas y “funcione sin problemas”.

### 12.1 Decisiones de diseño del motor [D]

| Decisión | Razón |
|---|---|
| **Un único módulo puro y determinista** `src/lib/comisiones/` (sin BD, sin red, sin fecha del sistema, sin aleatoriedad). Entrada = datos; salida = resultado. | El original tenía **dos copias** de la lógica (simulador 850 líneas y liquidación 1.029) que se desviaban entre sí [V-código]. Un solo motor da el mismo resultado en el simulador, la liquidación, los informes y el desglose del expediente. |
| **Aritmética entera**: puntos en **centésimas**, dinero en **céntimos**. Prohibido `number` con decimales en el cálculo. | Evita errores de redondeo (el original usaba `double` y fallaba con decimales) [V-código][V-reglas Fase 0]. |
| El cálculo se ejecuta **en el servidor (Node)** para guardar y **también en el navegador** para el simulador en vivo (mismo código importado por ambos). | En la Pi no existe el límite de 10 ms de CPU que obligaba a calcular en el navegador en la V2 [V-reglas]. |
| El motor trabaja **por vendedor y mes** (`calcularMes`). | El original recalculaba con todos los expedientes de la base de datos en cada llamada [V-código]. |
| **Idempotente**: calcular dos veces con los mismos datos da exactamente el mismo resultado y no duplica nada. | Necesario para recalcular tras cada cambio y para la migración repetible. |
| **Nunca lanza excepción por un dato malo**: un importe no numérico o una tarifa ausente produce **línea de aviso + 0 €**. | [V-reglas 7.6] |
| Cada importe de salida lleva su **concepto de origen** (trazabilidad). | [V-reglas 7.6] |

### 12.2 Tipos de datos (contrato del módulo) [D]

```ts
type Centesimas = number;   // entero: 150 = 1,50 puntos
type Centimos   = number;   // entero: 15000 = 150,00 €
type Mes        = string;   // 'AAAA-MM'
type Fecha      = string;   // 'AAAA-MM-DD'

type Clase = 'VN' | 'VO';
type EventoRegla = 'pedido'|'afectacion'|'matriculacion'|'cobro'|'credito'|'preference';
type CategoriaVenta = 'CONTADO'|'CREDITO'|'PREFERENCE'|'RENTING';

interface ExpedienteMotor {
  id: number; idVendedor: number;
  clase: Clase; subtipoVO: string | null;            // de estado_vehiculo.clase / subtipo_vo
  idMarca: number | null; idModelo: number | null;
  categoriaVenta: CategoriaVenta | null;             // de tipo_de_venta.categoria
  fechaExpediente: Fecha | null; fechaAfectacion: Fecha | null; fechaRci: Fecha | null;
  fechaMatriculacion: Fecha | null; fechaCobro: Fecha | null;   // fechaCobro = fecha_cobrado
  cobradoOtraFecha: boolean;
  puntos: Centesimas | null;                         // null = usar por defecto; 0 es válido
  idPromocion: number | null;
  comisionCocheManual: Centimos | null; comisionFinanciacionManual: Centimos | null;
  conceptosEspeciales: { titulo:string; importe:Centimos; descripcion?:string;
                         evento?: 'afectacion'|'matriculacion'|'cobro'; cobrado?:boolean }[];
}

interface PlanMotor { /* cabecera, tramoMin, tramoMax, puntosPorPedido, penalizacion,
   objetivoVendedor{base,arrastre}, puntosPorDefectoModelo/Marca, promociones[],
   tarifasVN[], tarifasUsadosPorSubtipo[], patronesVO[], financiacionPorMarcaTipo[],
   reglasPreference[], reglasYBonus[], tasaIntervencionPorMarca[] */ }

interface ResultadoMes {
  mes: Mes; idVendedor: number; idPlan: number;
  objetivoX: Centesimas; puntosMes: Centesimas; tramo: number;      // tramo final ya limitado
  tasaIntervencion: { idMarca:number; porcentaje:number|null; unidades:number; cumplida:boolean }[];
  lineas: LineaExpediente[];      // por expediente, con 'conceptos[]' (concepto, importe, puntos, evento, aviso?)
  bruto: Centimos; penalizacion: Centimos; neto: Centimos; mesPago: Mes;
  apuntesPuntos: ApuntePuntos[];  // lo que debería haber en el libro de puntos para este vendedor y mes
  avisos: string[];
}
```

### 12.3 Pipeline de cálculo de un mes (algoritmo exacto)

`calcularMes(plan, vendedor, mes, expedientes) → ResultadoMes`

**Paso 0 — Plan aplicable.** Plan cuyo rango `[fecha_inicio, fecha_fin]` contiene algún día del mes. Si hay varios, el de estado `activo` y mayor `fecha_inicio`; si ninguno → resultado vacío con aviso “No hay plan para {mes}”. Si el vendedor no tiene fila en `commission_plan_vendedores` → objetivo X = 0 y aviso. [D]

**Paso 1 — Clasificar cada expediente** del vendedor:
- `clase` y `subtipoVO` salen del **estado del vehículo** (`estado_vehiculo.clase/subtipo_vo`); `categoriaVenta` del **tipo de venta**. ✅ Usado, KM0, Demo y Buyback son **VO**. [V-reglas Fase 2]
- **Evento principal (mes de cómputo del coche)** [V-reglas 3.1]:
  - VN: `fechaCobro` si `cobradoOtraFecha = true` (si falta la fecha → **no cuenta**), si no `fechaMatriculacion`.
  - VO: `fechaCobro`.
  - Si falta la fecha necesaria → el coche **no cuenta en ningún mes** (se registra aviso “falta fecha …”).
- `mesComputo = mes(eventoPrincipal)`.

**Paso 2 — Conjunto de expedientes que cuentan en el mes M:** `cuentan = { e : mesComputo(e) = M }`.

**Paso 3 — Puntos de cada coche** [V-reglas 4.1]:
1. `p = e.puntos` si no es `null` (**0 es válido**).
2. Si `null`: puntos por defecto del **modelo** en el plan; si no hay, de la **marca**; si no, **100** (1,00).
3. Si `e.idPromocion ≠ null`: `n` = nº de coches de **cualquier modelo** de esa promoción que **cuentan en M** (contados por su evento principal). Si `n ≥ minimo_unidades` → `p = puntos_especiales`; si no → `p = puntos_si_no_cumple` (por defecto 100). Los puntos propios del expediente **no** se aplican si pertenece a una promoción [I: el Anexo A solo dice “o puntos propios, o por defecto, o promoción”; si un expediente tiene `puntos` propios **y** promoción, prevalece la **promoción**; confirmar][P].
4. Cada coche que cuenta aporta **1 unidad comisionable** (aunque valga 2 puntos). [V-reglas 4.2]

**Paso 4 — Puntos de pedidos** [V-reglas 4.3, 3.4]: por cada expediente con `mes(fechaExpediente) = M` **cuyo mes de cómputo ≠ M** (o que no cuenta aún) → suma `plan.puntosPorPedido`. Si pedido y cómputo caen en el mismo mes → **no** se suma el de pedido (cuenta solo el del coche).

**Paso 5 — Puntos de reglas y bonus** [V-reglas 4.4]: los que tengan efecto “afecta al objetivo” y pasen sus filtros (paso 9) suman **sus puntos en el mes de su evento**.

**Paso 6 — Puntos del mes y objetivo.**
```
puntosMes = Σ puntos(coches que cuentan) + Σ puntos de pedido + Σ puntos de reglas + ajustes manuales
objetivoX = objetivo_base + arrastre          // centésimas, puede ser no entero en puntos
diferencia = puntosMes − objetivoX             // centésimas
tramo = floorDiv(diferencia, 100)              // división entera hacia −∞ (¡también para negativos!)
tramo = clamp(tramo, plan.tramoMin, plan.tramoMax)
```
`floorDiv(-50,100) = -1` (no `0`). Casos de prueba en 12.16. ✅ **Siempre redondeo hacia abajo.** [V-reglas 5.1]

**Paso 7 — Tasa de intervención por marca** [V-reglas Fase 6; V-código: se calcula con los expedientes **del vendedor**]:
```
Para cada marca B con algún VN en M o con fecha RCI en M:
  denominador = nº de VN de la marca B cuyo mesComputo = M            (los VO NO cuentan)
  numerador   = nº de VN de la marca B con mes(fechaRci) = M y categoriaVenta ∈ {CREDITO, PREFERENCE, RENTING}
  si denominador = 0           → cumplida = true      ✅ (sin VN de esa marca, se considera cumplida)
  si tipo_tasa = 'porcentaje'  → cumplida = (numerador*100 / denominador) >= objetivo   (comparar en enteros: numerador*100 >= objetivo*denominador)
  si tipo_tasa = 'unidades'    → cumplida = (numerador >= objetivo)
  si el expediente no tiene marca → cumplida = false (como el original)
```
Numerador y denominador usan **fechas distintas** (RCI y cómputo): puede ser **no coincidente**; es el comportamiento antiguo conservado. [V-reglas Fase 6 ❓ Anexo E-6]

**Paso 8 — Importes: seis conceptos** (se evalúan **en el mes de su propio evento**; ningún concepto se genera dos veces):

| # | Concepto | Mes en que se genera | Algoritmo |
|---|---|---|---|
| 1 | **Comisión del coche VN** | `mesComputo` | Si `clase=VN` y cuenta en M: **(a)** vendedor `tipo_vendedor='VO'` → 0 (aviso “omitida: vendedor de VO”); **(b)** `comisionCocheManual ≠ null` → ese importe; **(c)** tarifa del plan para (modelo, `tramo`, `tasaCumplida(marca)`) → `importes[tramo]`; **(d)** sin tarifa → 0 + aviso “Sin tarifa para el modelo X en el tramo Y” |
| 2 | **Comisión VO** | mes de `fechaCobro` | Ver 12.4 |
| 3 | **Incentivo de financiación** | mes de `fechaRci` | Si `comisionFinanciacionManual ≠ null` → ese importe y se **ignoran** 3, 4 y las reglas de financiación; si no y `categoriaVenta ∈ {CREDITO, PREFERENCE, RENTING}` → importe de `commission_finance_rates(marca, tipo)`; **CONTADO no genera** (✅ confirmar con la empresa [P: Anexo E-2]) |
| 4 | **Preference / BOX3** | mes de `fechaRci` | Si `categoriaVenta = PREFERENCE` (y no hay importe manual): **regla más específica**: (marca+modelo) > (solo marca) > (general); se suma **solo esa** |
| 5 | **Reglas y bonus** | según su evento | Ver 12.5 |
| 6 | **Conceptos especiales del expediente** | mes de su `evento` (por defecto el evento principal del coche) | Cada concepto con su importe (±). Si el expediente aún no tiene esa fecha → **pendiente** (no se genera) |

**Paso 9 — Totales** [V-reglas Fase 8]:
```
bruto        = Σ(1 a 6)
penalizacion = plan.penalizacion_importe  (+ las reglas de penalización dinámicas, ya incluidas en 5 con signo negativo)
neto         = max(0, bruto − penalizacion_global)
mesPago      = mes(M) + 1
```
✅ Lo generado en el mes M se cobra en la **nómina de fin del mes M+1**. La suma de neto **nunca es negativa**.

### 12.4 Comisión VO (detalle) [V-reglas 7.2]

Entrada: expedientes **VO** con `mes(fechaCobro) = M`, ordenados por **`fechaCobro` ascendente y después `id` ascendente** (orden estable y determinista) [P: confirmar el criterio con una liquidación real, Anexo E-7].

**A) Vendedor de tipo VN que vende VO** (y patrón sin “aplica a VN”): **contador independiente por subtipo**:
1. Para cada subtipo `S` agrupa sus unidades del mes. `total = nº de unidades`.
2. Si `total ≥ min_aplicar` (por defecto **0 = sin mínimo**) → se pagan **todas**; si no, **ninguna**.
3. Unidad 1 → `importe_primera`; unidades 2…n → `importe_resto`.
4. Si no hay tarifa para `S` → 0 € (sin tarifa de respaldo) + aviso.
5. `comisionCocheManual ≠ null` sustituye a todo lo anterior para esa unidad.

**B) Vendedor de tipo VO** (o patrón con `aplica_a_vn`): escala progresiva `tiers`:
1. Unidad *k* cobra `tiers[k]`; si *k* supera el último escalón, **se repite el último**.
2. **Sin escala definida → 15000 céntimos (150 €) por unidad.**

Los **puntos** de un VO son los de su expediente/promoción (no los del escalón). [V-reglas 7.2]

### 12.5 Reglas y bonus (detalle) [V-reglas 1.7, 3.3, 7.4]

Para **cada** regla/bonus activo y **cada** expediente del vendedor, en este orden (si un paso falla, no se aplica):
1. **Evento y fecha del evento** (cada evento mira **solo su fecha**):

| Evento | Entra en M si… | Fecha usada para la validez |
|---|---|---|
| `pedido` | `mes(fechaExpediente) = M` | `fechaExpediente` |
| `afectacion` | `mes(fechaAfectacion) = M` | `fechaAfectacion` |
| `matriculacion` | `mesComputo = M` (en VO equivale a **cobro**; con casilla “cobrado en otra fecha”, a cobro) | evento principal |
| `cobro` | `mes(fechaCobro) = M` | `fechaCobro` |
| `credito` | `mes(fechaRci) = M` y categoría CREDITO o RENTING | `fechaRci` |
| `preference` | `mes(fechaRci) = M` y categoría PREFERENCE | `fechaRci` |

2. **Tipo de vehículo**: `nuevo` = solo VN · `usado` = solo VO · `cualquiera`.
3. **Fechas de validez** de la regla (`fecha_inicio`..`fecha_fin`) comparadas con la fecha del evento.
4. **Marca y modelo**, si la regla los indica.
5. **Tasa de intervención**: `cumplida` / `no_cumplida` / `indiferente` (con la tasa de la **marca del expediente**; si no hay marca y la regla exige tasa → no aplica).
6. **Ligar a crédito** (solo reglas Preference): se aplica solo si **también** se aplicaría una regla de crédito para ese expediente.
7. **Efecto**: suma `importe` (**resta** si es penalización) y/o suma `puntos` al objetivo (paso 5 del pipeline).

> **Diferencia con el original [V-código]:** el original aplica **todas** las reglas Preference que coinciden (suma acumulada) y deja que un bonus de `pedido` también se active por la **afectación**. En el motor nuevo: Preference = **solo la más específica** y cada evento mira **solo su fecha**. [V-reglas ✅]

### 12.6 Simulador de un expediente (“Desglose Estimado de Comisión”) [D]
Es `calcularMes` aplicado al mes de cómputo del expediente con **una copia en memoria** del expediente (tal como está en el formulario, aunque no esté guardado). Devuelve el desglose de **ese expediente** (no cambia nada en la BD). Muestra también el tramo y los puntos del mes del vendedor “con” el cambio, y los avisos. Si el mes está **cerrado**, muestra el aviso de impacto (12.9).

### 12.7 Valores por defecto al crear un expediente [D]
Al crear: `puntos = NULL` (el motor usa los por defecto del plan; no se copian al expediente), `idPromocion = NULL`. El campo del formulario muestra el valor efectivo calculado como texto de ayuda (“por defecto: 1,00”).

### 12.8 Estados de la liquidación y reglas de persistencia [V-reglas Fase 9]

`borrador` → `calculada` → `revisada` → `cerrada`

- **Calcular/Recalcular** (botón en la pestaña *Liquidación*): ejecuta `calcularMes` para el vendedor y mes, y guarda **cabecera + líneas + conceptos** dentro de **una transacción** `SET LOCAL app.recalculo = 'on'`.
- Una liquidación en `borrador`/`calculada` se **sustituye**; en `revisada`/`cerrada` se **versiona** (12.9).
- **Cerrar** (solo administrador): pasa a `cerrada`; ya no se edita directamente.
- **Importada de la app antigua**: se crea como `cerrada` con `origen='importada_antigua'`, **no se recalcula sola**. [V-reglas 9.5]

### 12.9 Corregir un mes cerrado: se actualiza todo, con historial [V-reglas 9.3, 9.4, Ejemplo 8]

1. Al **crear, editar o borrar** un expediente (o cambiar reglas del plan), el sistema calcula el **conjunto de meses afectados**: los meses de `fechaExpediente`, `fechaAfectacion`, `fechaRci` y `mesComputo` **antes y después** del cambio, de **cada vendedor implicado** (si se reasigna, **los dos**). [D: superconjunto de “hasta 4” del Anexo A, porque RCI y afectación también generan importes]
2. Se recalcula cada (vendedor, mes) afectado **incluidos los cerrados**.
3. Antes de sustituir una liquidación `revisada/cerrada`: se inserta en `commission_liquidation_versions` un `snapshot` completo con `motivo`, `neto_anterior`, `neto_nuevo`.
4. La interfaz **avisa antes de guardar** (“Este cambio modifica el mes cerrado Julio 2026: +150,00 €”) y muestra la diferencia “antes 1.600,00 € → ahora 1.750,00 €”.
5. **Protecciones de BD** (disparadores `BEFORE UPDATE/DELETE`): las tablas `commission_liquidations`, `…_lines`, `…_line_items`, `commission_liquidation_versions` y `libro_puntos` **rechazan** modificaciones salvo que la transacción tenga `app.recalculo='on'` o `app.restauracion='on'`; las **versiones** y el **libro de puntos** rechazan `UPDATE/DELETE` **siempre**. Las claves foráneas impiden borrar una promoción en uso o un plan con liquidaciones.

### 12.10 Libro de puntos y sincronización [V-reglas Fase 10]
- Tabla `libro_puntos`: **solo inserción**.
- **Sincronizar (vendedor, mes)**: calcular `apuntesPuntos` deseados con el motor; leer el **neto actual** del libro por clave `(id_expediente, evento, regla)`; insertar un apunte **por la diferencia** (positivo o negativo). Resultado: el libro suma siempre lo que dice el motor, y cada corrección es un apunte negativo visible.
- Se ejecuta automáticamente tras cada cambio que afecte (12.9.1) y al terminar una importación (en lotes, mes a mes).
- **Reasignar** un expediente: se sincronizan y recalculan los dos vendedores. [V-reglas 10.3]

### 12.11 Cotejo, pendientes y previsión de nómina [V-reglas Fase 11, V-código: casillas `comision_*_cobrada`]

- **Cotejo de cobros** (panel “Control y Verificación de Cobros de Comisiones”): por expediente, conceptos (coche, usado, financiación, Preference, bonus, especiales) con **casilla “cobrado”** y cantidades cobradas; totales **validado/cobrado**, **pendiente** y **ratio de validación**; filtro todos/pendientes/cobrados.
- **Comisiones pendientes del plan** (`commission_plan_pending`): se muestran **aparte** y se **suman a la previsión de nómina**.
- **Pendiente de cobro** (`pendientes_cobro`, lo que “me deben”): concepto, importe, fecha, mes de nómina previsto, cobrado sí/no, fecha de cobro, notas; si pasó el mes previsto sin cobrarse → **atrasado**.
- **Previsión de nómina (M+1)**: para cada **mes de pago P**: `neto(liquidación de P−1) + comisiones pendientes + pendiente de cobro previsto para P (no cobrado)`.

### 12.12 Informes y Dashboard
Cualquier cifra económica o de puntos de **Informes**, **Detalle y Resumen Estadístico** y alertas del Dashboard sale del **mismo módulo** (`calcularMes`). Prohibido recalcular por otra vía. [V-reglas: “Un único motor”]

### 12.13 Migración desde copias de la app antigua (v1) [V-reglas Fase 12]

Pantalla de clasificación y conversión **repetible** (no duplica al ejecutarla dos veces). Equivalencias:

| App antigua | App nueva |
|---|---|
| Importes en **euros enteros** | × 100 → **céntimos** |
| `valor_objetivo` (1, 1,5, 2…) | `puntos` en **centésimas** (el **0 se conserva** como 0) |
| `min_coches_multiplicador` (cupo) | **Promoción**: se crea “Importada: N puntos, mínimo M” y se asigna a esos expedientes |
| `cobrado_otra_fecha` + `fecha_cobrado` | Casilla + `fecha_cobrado`; en **VO**, `fecha_cobrado` = `fecha_facturacion` si no estaba marcada |
| Estados “demo”, “KM0”, “usado”, “buyback” | `clase = VO` con su `subtipo_vo` (`DEMO` pasa a VO) |
| Objetivo único por plan | Se copia a **cada vendedor** del plan |
| `min_matriculaciones` | **No se usa**; se conserva como dato histórico |
| Liquidaciones antiguas | **Cerradas**, solo lectura, `origen='importada_antigua'` |
| `conceptos_adicionales` (euros) | `conceptos_especiales` (céntimos) con evento por defecto |
| `notas_adicionales` | Notas del plan + `commission_plan_pending` en céntimos |
| Expedientes sin vendedor válido | Se asignan al **administrador** con aviso, reasignables en la clasificación [D: en la V2 era “Mi vendedor”] |
| Tarifas `rate_x_minus_4 … rate_x_plus_3` (euros) | `importes` jsonb `{"-4":…,"3":…}` en céntimos |

### 12.14 Validación: “Comparar con liquidación antigua” [V-reglas Fase 13]
Calcula un mes con el motor nuevo y lo pone junto a la liquidación antigua importada: total, puntos, tramo y, por expediente, puntos, tramo e importe, con la diferencia. **Las diferencias solo pueden explicarse por**: demo/KM0/usado ahora VO · el 0 ya no se convierte en 1 · VO cuenta solo por cobro · ya no hay mínimo de matriculaciones · promociones agrupadas por promoción · financiación y bonus una sola vez en el mes de su evento. Cualquier otra diferencia es un **fallo a investigar** (del motor nuevo o del antiguo). Pendiente de hacer con las **4 liquidaciones antiguas** del propietario (al final del proyecto, R13).

### 12.15 Dónde se ve cada cosa (mapa de pantallas) [V-reglas Anexo D]

| Qué | Pantalla |
|---|---|
| Puntos, tramo y comisiones estimadas del mes | *Expedientes* → “Detalle y Resumen Estadístico” |
| Objetivo del mes, alertas | *Dashboard* (tarjeta nueva: objetivo X, puntos, tramo del mes) [D] |
| Crear/editar planes | *Comisiones* → Abrir plan |
| Cotejo de cobros | *Comisiones* → panel inferior |
| Liquidación, previsión de nómina, libro de puntos, versiones, comparar con la antigua | *Comisiones* → plan → pestaña *Liquidación* |
| Notas, comisiones pendientes, pendiente de cobro | *Comisiones* → plan → pestaña *Notas* |
| Fechas, puntos, promoción, importes a mano, conceptos especiales | *Expedientes* → formulario |
| Convertir comisiones antiguas, copias | *Configuración* → pestaña *BBDD* |

### 12.16 Casos de prueba obligatorios del motor (tests unitarios) [V-reglas Anexo A + D]

El módulo debe tener **tests automáticos** (Vitest) que reproduzcan **como mínimo** estos casos:

| # | Caso | Resultado esperado |
|---|---|---|
| T1 | Tramo: puntos 13,00 / X 13,00 | tramo 0 (“X”) |
| T2 | 13,50 / 13,00 | tramo 0 |
| T3 | 12,50 / 13,00 | tramo −1 (**floorDiv(−50,100)**) |
| T4 | 13,00 / 12,50 | tramo 0 |
| T5 | 10,00 / 13,00 | tramo −3 |
| T6 | 17,40 / 13,00 | +4 → **limitado a +3** |
| T7 | 5,00 / 13,00 | −8 → **limitado a −4** |
| T8 | Ejemplo 1: 10 VN matriculados + 3 pedidos que se matriculan el mes siguiente (puntos por pedido 1,00) | junio = 13,00 → X; con pedido 0 → X−3; julio vuelve a contar +3 |
| T9 | Pedido y matriculación el mismo mes | cuenta **una vez** (puntos del coche) |
| T10 | Ejemplo 2: promoción 2,00 / mín 2 / sin cumplir 1,00: 2 coches en el mes | 4,00 puntos y **2 comisiones** (una por coche) |
| T11 | Misma promoción, 1 coche en junio y 1 en julio | 1,00 en cada mes |
| T12 | Promoción mín 3 con 3 coches | 6,00 |
| T13 | Coche con `puntos = 0` | aporta 0 (no 1) pero sigue siendo **1 unidad comisionable** |
| T14 | Ejemplo 3: VN matriculado 12/02 y cobrado 20/01 | con casilla → enero; sin casilla → febrero |
| T15 | VN con casilla y **sin** fecha de cobro | no cuenta en ningún mes (aviso) |
| T16 | Ejemplo 4: pedido 20/05, afectación 28/05, RCI 10/06, matriculación 05/07, Preference | mayo: pedido+bonus pedido/afectación; junio: financiación+Preference; julio: coche, puntos y bonus de matriculación |
| T17 | Ejemplo 5: 10 VN, 7 financiados (70 %), objetivo 65 % | cumplida → 250 €; con 6 financiados → 180 €; manual 300 € → 300 €; sin tarifa → 0 € + aviso |
| T18 | Sin VN de una marca en el mes | tasa **cumplida** |
| T19 | Ejemplo 6A: KM0 primera 120/resto 60, 3 unidades | 240 €; mín 2 y 1 unidad → 0 €; KM0 + Usado → cada uno con su “primera” |
| T20 | Ejemplo 6B: escala 150/170/190, 5 unidades | 890 €; sin escala → 750 € |
| T21 | Ejemplo 7: totales | bruto 1.795,00 € · penalización 150,00 € · neto 1.645,00 € |
| T22 | Neto negativo | se limita a 0 |
| T23 | Ejemplo 8: corregir un mes cerrado | se guarda versión (1.600 €), liquidación pasa a 1.750 €, diferencia +150 € |
| T24 | Idempotencia | calcular dos veces = mismo resultado; sincronizar libro dos veces = 0 apuntes nuevos |
| T25 | Importe no numérico | línea con aviso y 0 € (sin excepción) |
| T26 | Reasignar expediente | se recalculan los dos vendedores |
| T27 | Preference: regla (marca+modelo) vs (marca) vs (general) | se aplica **solo** la más específica |
| T28 | Bonus de `pedido` con afectación en el mes pero pedido en otro | **no** entra |

### 12.17 Comportamiento del motor ANTIGUO (referencia, **no** replicar) [V-código: `simular-comision/route.ts`]

| Tema | Comportamiento verificado en el código original |
|---|---|
| VN/VO | `isVN` = estado “nuevo” **o “demo”** (demo = VN); VO = lo demás |
| Fecha efectiva VO | `fecha_facturacion`, y si falta, matriculación |
| Mínimo | Si matriculaciones del mes < `plan.min_matriculaciones` (por defecto 6) → **todo el mes a 0** |
| Objetivo | `plan.objetivo_base + plan.arrastre` **único para todos**, entero |
| Tramo | Solo coincide con diferencias **enteras exactas** (3, 2, 1, 0, −1, −2, −3); con decimales **cae a X−4** |
| Cupo | Se cuenta por `min_coches_multiplicador` (número) con una fecha distinta a la de los puntos |
| Bonus de pedido | También entra por **afectación** |
| Preference | Se **suman todas** las reglas que coinciden |
| Estados/Tipos | Detectados por **texto del nombre** |
| Transacciones | Ninguna: la liquidación **borra y recrea** sin transacción |
| Duplicidad | Simulador y liquidación son **dos copias** del cálculo |


---
