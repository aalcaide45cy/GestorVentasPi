# Sistema de comisiones y puntos — Documentación completa

Documento de referencia de **cómo funciona el cálculo de puntos, tramos y comisiones** en GestorVentasV2: qué se configura, qué datos se usan, en qué mes cuenta cada cosa, cómo se calcula cada importe, cómo se cierra y se corrige una liquidación y cuándo se cobra.

## Cómo leer este documento

| Marca | Significado |
|---|---|
| ✅ **Regla confirmada** | La ha dicho o decidido Alfonso. Es la regla de negocio |
| 🔧 **Implementado** | Lo he visto en el código del motor (`src/shared/comisiones/motor-puntos.ts` y `motor-comisiones.ts`, versión del zip posterior a CORRECCIÓN 8) |
| ❓ **[Inferencia]** | Deducción mía o detalle que no he podido comprobar en el código actual. Hay que confirmarlo |

**Alcance de la verificación:** el documento describe el sistema **según las reglas acordadas y el motor tal como estaba en el último zip que he revisado**. Los cambios posteriores de Antigravity (por ejemplo, CORRECCIÓN 9, que solo toca la interfaz) no los he vuelto a comprobar. Si el código cambia, este documento hay que actualizarlo.

**Índice de fases**

0. Principios y unidades
1. Configuración: el plan de comisionamiento
2. Datos que aporta cada expediente
3. ¿En qué mes cuenta cada cosa? (calendario de eventos)
4. Puntos
5. Objetivo X y tramo
6. Tasa de intervención por marca
7. Importes: los seis conceptos de comisión
8. Total del mes: bruto, penalización y neto
9. La liquidación: estados, cierre, versiones y correcciones
10. Libro de puntos y sincronización automática
11. Cobro: cotejo, pendientes de cobro y previsión de nómina
12. Migración desde la app antigua
13. Validación: comparar con las liquidaciones antiguas
Anexos: A) Ejemplos numéricos · B) Diferencias con la app antigua · C) Reglas confirmadas por Alfonso · D) Dónde se ve cada cosa · E) Pendiente de confirmar · F) Glosario

---

## Fase 0 — Principios y unidades

1. ✅ **El objetivo mensual va por puntos, no por unidades.** Cada vendedor tiene **su propio objetivo X** (habitual: unos 13 puntos).
2. ✅ **Una venta no da puntos por sí sola.** Los puntos llegan con los **eventos** del coche (matriculación o cobro) y, si el plan lo dice, con el **pedido**.
3. ✅ **Los puntos ayudan a llegar al objetivo; la comisión se cobra una sola vez por coche.** Un coche de 2 puntos suma 2 al objetivo, pero **nunca se cobra doble**.
4. ✅ **Todo se configura en el plan de comisionamiento**, porque la empresa cambia las reglas cuando quiere. Cada plan tiene un rango de fechas.
5. ✅ **No hay mínimo** de matriculaciones ni de cobros. (La app antigua tenía uno que ponía la comisión a 0; en la nueva no existe.)
6. ✅ **Las comisiones se cobran a mes vencido:** lo generado en el mes M se cobra en la nómina de fin del mes M+1.

### Unidades (🔧)

| Dato | Se guarda como | Ejemplo | Cómo se muestra |
|---|---|---|---|
| Puntos | Entero en **centésimas** | 150 = 1,50 puntos | `1,50 puntos` |
| Importes | Entero en **céntimos** | 15000 = 150,00 € | `150,00 €` |
| Fechas de negocio | Texto `AAAA-MM-DD` | `2026-06-10` | `10/06/2026` |
| Mes de cómputo | Texto `AAAA-MM` | `2026-06` | Junio 2026 |

Importes y puntos siempre con **al menos 2 decimales** y formato español. Se usan enteros para que no haya errores de redondeo.

### Dónde se calcula (🔧)

El cálculo se hace en el **navegador** con el mismo motor compartido que usa el servidor. El servidor (Worker de Cloudflare) solo valida y guarda, por el límite de 10 ms de CPU del plan gratuito.

---

## Fase 1 — Configuración: el plan de comisionamiento

Un **plan** cubre un periodo (normalmente un mes) y contiene todo lo que hace falta para calcular. Se edita en *Comisiones → Abrir plan*, con 9 pestañas.

### 1.1 Datos generales del plan
- Nombre, **fecha de inicio** y **fecha de fin**.
- **Rango de tramos** respecto a X (por defecto −4 a +3, configurable).
- **Puntos por pedido** (por defecto 0; puede ser 1,00 u otro valor).
- **Penalización global** del plan (importe fijo que se resta del total del mes).
- Notas y comisiones pendientes del plan.

### 1.2 Objetivo por vendedor (pestaña *Objetivo*)
- Cada vendedor asignado al plan tiene **su objetivo X** y su **arrastre** (unidades adicionales de meses anteriores). 🔧 Objetivo resultante = base + arrastre.
- **Puntos por defecto** de un coche según modelo o marca, si el expediente no trae puntos propios.
- **Tasa de intervención objetiva por marca** (porcentaje o unidades; ver Fase 6).
- **Promociones de puntos** (ver 1.3).

### 1.3 Promociones de puntos (los "coches de doble puntuación")
✅ La empresa elige **coches concretos** (normalmente stock atascado) y les da puntos especiales si el vendedor llega a un **mínimo de unidades** de esa promoción en el mes.

| Campo | Significado | Ejemplo |
|---|---|---|
| Nombre | Identifica la promoción | "Stock atascado junio" |
| Puntos especiales | Lo que vale cada coche si se cumple el mínimo | 2,00 |
| Mínimo de unidades | Cuántos coches de la promoción hay que contar en el mes | 2 |
| Puntos si no cumple | Lo que vale cada coche si no se llega | 1,00 (por defecto) |

- ✅ **Da igual el modelo:** todos los coches de la misma promoción cuentan juntos.
- ✅ Cada expediente indica a qué promoción pertenece (campo "Promoción de puntos").

### 1.4 Tarifas de comisión del coche VN (pestaña *VN*)
Por **modelo** y por **tramo** (X−4 … X+3), dos importes:
- **Tasa cumplida** (la marca llega a su tasa de intervención objetiva).
- **Tasa no cumplida**.

La pantalla muestra una tabla por marca (por ejemplo, "MODELOS DE RENAULT") con dos filas por modelo (Tasa ≥ objetivo / Tasa < objetivo), orden, copiar/pegar y "aplicar a los de abajo".

### 1.5 Comisión de usados / VO (pestaña *Usados / VO*)
Dos sistemas, según el tipo de vendedor:
1. **Vendedor VN que vende VO:** tarifa **por subtipo** (USADO, KM0, DEMO, BUYBACK…): importe de la **primera unidad**, importe del **resto** y un **mínimo de unidades** (`min_aplicar`, por defecto **0 = sin mínimo**).
2. **Vendedor VO** (o patrón con "aplica a VN"): **escala progresiva** por número de unidad (unidad 1 → X €, unidad 2 → Y €…). Si no hay escala, **150 € por unidad**.

### 1.6 Financiación y Preference (pestaña *Financ/Reglas*)
- **Incentivo de financiación** por **marca** y **tipo** (Crédito, Preference, Renting, Contado).
- **Reglas Preference / BOX3** por marca, modelo y tipo de financiación.
- **Reglas especiales** adicionales.

### 1.7 Bonus (pestaña *Bonus*) y Penalizaciones (pestaña *Penalizaciones*)
Cada regla o bonus tiene:
- **Evento** que lo dispara: pedido, afectación, matriculación, cobro, crédito/financiación o Preference.
- **Filtros:** tipo de vehículo (nuevo, usado, cualquiera), fechas de validez, marca, modelo, tasa de intervención (cumplida / no cumplida / indiferente).
- **Efecto:** suma **importe**, suma **puntos al objetivo**, o ambas. Si es penalización, el importe resta.
- **Ligar a crédito** (solo reglas Preference): se aplica solo si también se aplicaría una regla de crédito.

### 1.8 Liquidación y Notas (pestañas *Liquidación* y *Notas*)
La liquidación se calcula y se consulta aquí (Fase 9). *Notas* contiene las notas del plan y las **comisiones pendientes** (Fase 11).

---

## Fase 2 — Datos que aporta cada expediente

| Dato del expediente | Para qué se usa |
|---|---|
| **Clase del vehículo: VN o VO** | Decide cuándo cuenta y cómo se comisiona. ✅ **Usado, KM0, demo y buyback son VO** (coches que ya tienen matrícula antes de venderse) |
| **Vendedor** | A quién se le cuenta. ✅ Por defecto "Mi vendedor"; se puede reasignar |
| **Fecha de expediente (pedido)** | Mes del pedido |
| **Fecha de afectación** | Fecha en que se asigna un bastidor a un VN |
| **Fecha RCI** | Mes de la financiación y de Preference |
| **Fecha de matriculación** | Cuenta en VN. En VO es **solo un dato del coche** |
| **Casilla "Expediente cobrado en otra fecha" + fecha de cobro** | En VN, si está marcada, **manda la fecha de cobro**. En VO la fecha de cobro es la que cuenta |
| **Tipo de venta** (con su categoría: Contado, Crédito, Preference, Renting) | Financiación y Preference |
| **Marca y modelo** | Tarifas y tasa de intervención |
| **Puntos del coche** | Puntos propios (puede ser 0). Vacío = valor por defecto del plan |
| **Promoción de puntos** | Agrupa coches de doble puntuación |
| **Comisión de coche fijada a mano** | Sustituye a la tarifa |
| **Comisión de financiación fijada a mano** | Sustituye a las tarifas y reglas de financiación |
| **Conceptos especiales** | Bonificaciones o penalizaciones sueltas (título, importe ±, descripción, evento, cobrado) |
| **Estado de cobro por concepto** | Qué partes de la comisión ya se han cobrado en nómina (cotejo) |

✅ **Un VN solo necesita dos fechas para los puntos: matriculación y, si procede, cobro.** La fecha de facturación **no influye** en ningún cálculo de puntos.

---

## Fase 3 — ¿En qué mes cuenta cada cosa? (calendario de eventos)

Este es el corazón del sistema: **cada concepto se genera en el mes de su propio evento**, y nunca dos veces el mismo concepto. Un mismo expediente puede generar cosas en meses distintos.

### 3.1 Evento principal del coche (el que lo hace "contar")

| Clase | Regla | Mes de cómputo |
|---|---|---|
| **VN** | ✅🔧 Cuenta por **fecha de matriculación**, **salvo** si está marcada "cobrado en otra fecha": entonces manda la **fecha de cobro** (obligatoria) | Mes de esa fecha |
| **VO** | ✅🔧 Cuenta **solo por fecha de cobro** (se factura el mismo día) | Mes de cobro |

- Si falta la fecha necesaria, el coche **no cuenta en ningún mes** hasta que se rellene.
- Un VN con la casilla marcada pero sin fecha de cobro tampoco cuenta.

### 3.2 Calendario de todos los conceptos

| Concepto | Mes en que se genera | Fecha que lo decide |
|---|---|---|
| **Puntos del coche** | Mes de cómputo del coche | Matriculación (VN) o cobro (VN con casilla, VO) |
| **Puntos del pedido** | Mes del pedido | `fecha_expediente`, si el plan da puntos por pedido |
| **Comisión del coche VN** | Mes de cómputo del coche | Igual que sus puntos |
| **Comisión VO** | Mes de cobro | `fecha_cobro` |
| **Incentivo de financiación** | Mes de la fecha RCI | `fecha_rci` |
| **Preference / BOX3** | Mes de la fecha RCI | `fecha_rci` |
| **Bonus / reglas** | Según su evento | Ver 3.3 |
| **Conceptos especiales** | Según su evento | Por defecto el evento principal del coche |
| **Penalización del plan** | Mes del plan | Se resta del total del mes |

### 3.3 Evento de cada bonus o regla

| Evento | Entra en el mes si… | Fecha usada para las fechas de validez |
|---|---|---|
| `pedido` | `fecha_expediente` cae en el mes | `fecha_expediente` |
| `afectacion` | `fecha_afectacion` cae en el mes | `fecha_afectacion` |
| `matriculacion` | El mes de cómputo del coche es el mes | Matriculación (o cobro con la casilla). ✅ **En VO, "matriculación" equivale a cobro** |
| `cobro` | `fecha_cobro` cae en el mes | `fecha_cobro` |
| `credito` / `financiacion` | `fecha_rci` en el mes y tipo Crédito o Renting | `fecha_rci` |
| `preference` | `fecha_rci` en el mes y tipo Preference | `fecha_rci` |

✅ **Cada evento mira solo su fecha:** un bonus de *pedido* no se mueve por la afectación, y uno de *afectación* no se mueve por el pedido.

### 3.4 El pedido: cuenta en su mes, y otra vez al matricular (✅)
- Pedido y matriculación (o cobro) en el **mismo mes** → cuenta **una sola vez** (los puntos del coche, no los del pedido).
- En **meses distintos** → cuenta en **los dos**: los puntos de pedido en el mes del pedido, y los del coche en el mes de matriculación/cobro.

---

## Fase 4 — Puntos

### 4.1 Puntos de un coche (🔧)
1. **Puntos propios del expediente**, si los tiene. ✅ **0 es un valor válido** (no se convierte en 1).
2. Si está vacío: puntos por defecto del **modelo**, luego de la **marca**, luego **1,00**.
3. Si el coche pertenece a una **promoción**:
   - Se cuentan **todos los coches de esa promoción que cuentan en el mes** (cualquier modelo; contados por su evento principal, no por la venta).
   - Si el total **≥ mínimo** → cada coche vale los **puntos especiales**.
   - Si no → cada coche vale **puntos si no cumple** (por defecto 1,00).

### 4.2 Unidad comisionable (🔧)
Cada coche que cuenta aporta **1 unidad comisionable**, valga 1 o 2 puntos. Por eso un coche de 2 puntos suma 2 al objetivo pero se cobra **una sola vez**.

### 4.3 Puntos de pedidos (🔧)
Cada expediente con **pedido en el mes** y cuyo evento principal **no** cae en ese mismo mes suma los **puntos por pedido del plan** (0 por defecto).

### 4.4 Puntos de reglas y bonus (🔧)
Las reglas y bonus con "afecta al objetivo" suman sus puntos **en el mes de su evento**, tras aplicar todos sus filtros (Fase 1.7). Entran en el total del mes y en el libro de puntos.

### 4.5 Puntos totales del mes
```
Puntos del mes = puntos de los coches que cuentan en el mes
               + puntos de los pedidos del mes
               + puntos de reglas y bonus
               + ajustes manuales (si los hay)
```

---

## Fase 5 — Objetivo X y tramo

### 5.1 Fórmula (🔧)
```
Diferencia   = puntos del mes − objetivo X
Tramo        = redondeo hacia abajo de la diferencia (en puntos enteros)
Tramo final  = el tramo, limitado al rango del plan (por defecto −4 a +3)
```
✅ **Siempre se redondea hacia abajo.** El objetivo X puede tener decimales (por el arrastre).

| Puntos | Objetivo X | Diferencia | Tramo |
|---|---|---|---|
| 13,00 | 13,00 | 0,00 | **X** |
| 13,50 | 13,00 | +0,50 | **X** |
| 12,50 | 13,00 | −0,50 | **X−1** |
| 13,00 | 12,50 | +0,50 | **X** |
| 10,00 | 13,00 | −3,00 | **X−3** |
| 17,40 | 13,00 | +4,40 → 4 | **X+3** (limitado al máximo) |
| 5,00 | 13,00 | −8,00 | **X−4** (limitado al mínimo) |

### 5.2 Para qué sirve el tramo
El tramo del **vendedor en el mes** decide **qué columna de tarifas** se usa para la comisión del coche VN (Fase 7.1). Es **un único tramo por vendedor y mes**.

---

## Fase 6 — Tasa de intervención por marca

Mide cuántos coches nuevos de una marca se financian. Se calcula **por marca y por mes** (🔧).

| Parte | Qué cuenta |
|---|---|
| **Denominador** | Coches de **clase VN** de esa marca cuyo **mes de cómputo** es el mes. Los **VO no cuentan**. Un VN con la casilla de cobro cuenta en el mes del cobro |
| **Numerador** | Coches de **clase VN** de esa marca con **fecha RCI en el mes** y tipo Crédito, Preference o Renting |

- **Objetivo:** un porcentaje (por defecto 70 %) o un número de unidades, según el plan.
- **Cumple** si el porcentaje alcanza el objetivo, o si el número de financiados alcanza las unidades pedidas.
- ✅🔧 **Sin VN de esa marca en el mes → se considera cumplida.**
- ❓ **[Inferencia]** Numerador y denominador se calculan con fechas distintas (RCI y cómputo); por eso pueden ser coches diferentes. Es el comportamiento de la app antigua, que se ha mantenido.

El resultado (cumplida / no cumplida) elige entre las dos filas de tarifas del coche VN y alimenta los filtros de reglas y bonus.

---

## Fase 7 — Importes: los seis conceptos de comisión

El motor recorre **todos los expedientes del vendedor** y, para cada uno, evalúa cada concepto **en el mes de su propio evento** (Fase 3). Los importes son enteros en céntimos.

### 7.1 Concepto 1 — Comisión del coche VN (🔧)
Solo si el coche es **VN** y **cuenta en este mes**. Por orden de prioridad:
1. **Vendedor de tipo VO** → la base VN es **0** (se muestra "omitida: vendedor de VO").
2. **Comisión de coche fijada a mano en el expediente** → se usa ese importe y se ignora la tarifa.
3. **Tarifa del plan** para ese **modelo**, el **tramo** del vendedor y la **tasa** (cumplida o no).
4. Si **no hay tarifa** → **0 €** y una **línea de aviso visible**: "Sin tarifa para el modelo X en el tramo Y".

### 7.2 Concepto 2 — Comisión VO (🔧)
Solo si el coche es **VO** y su **fecha de cobro** es de este mes.

**Vendedor VN que vende VO** (por subtipo, contador independiente en cada subtipo):
1. Se cuentan **todas** las unidades del subtipo cobradas en el mes, ordenadas por fecha de cobro y luego por número de expediente.
2. Si el total es **≥ mínimo** (`min_aplicar`, por defecto 0), se pagan **todas**; si no, **ninguna**.
3. La **primera** unidad cobra el importe de "primera"; las demás, el de "resto".
4. Si no existe tarifa para ese subtipo → 0 € (no se usa ninguna tarifa de respaldo).
5. Una comisión fijada a mano en el expediente sustituye a lo anterior.

**Vendedor VO (o patrón con "aplica a VN")** — escala progresiva:
1. Las unidades del mes se ordenan por fecha de cobro y número de expediente.
2. Cada unidad cobra el escalón con su número; **si se pasa del último escalón, se repite el último**.
3. Sin escala definida → **150 € por unidad**.

Los **puntos** de un VO son los de su expediente o promoción, como cualquier coche; **no** los del escalón.

### 7.3 Conceptos 3 y 4 — Financiación y Preference / BOX3 (🔧)
Solo en el **mes de la fecha RCI**:
1. Si hay **comisión de financiación fijada a mano** → se usa ese importe y **se ignoran** las tarifas y reglas de financiación y Preference.
2. Si no, y el tipo de venta es **Crédito, Preference o Renting** → **incentivo de financiación** de la tarifa de esa marca y tipo. ✅ El **Contado no genera incentivo de financiación**. ❓ [Inferencia: según el código leído]
3. Si el tipo es **Preference** → se busca la **regla Preference / BOX3** más específica (✅ marca + modelo, después solo marca, después general) y se suma su importe.

### 7.4 Concepto 5 — Reglas y bonus (🔧)
Para cada regla o bonus activo, en este orden (si falla un paso, no se aplica):
1. **Evento** (Fase 3.3).
2. **Tipo de vehículo:** nuevo = solo VN; usado = solo VO; cualquiera.
3. **Fechas de validez** del bonus, con la fecha de su evento.
4. **Marca y modelo**, si los indica.
5. **Tasa de intervención:** cumplida / no cumplida / indiferente.
6. **Ligar a crédito** (Preference): solo si también se aplicaría una regla de crédito para ese expediente.
7. **Efecto:** suma el importe (resta si es penalización) y/o suma puntos al objetivo.

### 7.5 Concepto 6 — Conceptos especiales del expediente (🔧)
Bonificaciones o penalizaciones sueltas de un expediente (por ejemplo, "Bonus Rappel +100 €").
- Importe positivo o negativo, con descripción.
- Tienen un **evento** a elegir (afectación, matriculación o cobro). ✅ **Por defecto:** el evento principal del coche (matriculación en VN; cobro en VN con casilla y en VO).
- Se generan en el mes de su evento. Si el expediente aún no tiene esa fecha, el concepto queda **pendiente**.

### 7.6 Importes fijados a mano y avisos
- Comisión de coche y de financiación pueden **fijarse a mano** en el expediente (dejar en blanco = autocalcular).
- 🔧 Si algún importe no es un número válido, **nunca se propaga un error**: la línea muestra un aviso y suma 0 €.
- 🔧 Cada línea de la liquidación indica **de qué concepto sale** cada importe, para poder revisarlo.

---

## Fase 8 — Total del mes: bruto, penalización y neto

```
Comisión bruta del mes = comisión coche VN
                       + comisión VO
                       + incentivo de financiación
                       + Preference / BOX3
                       + bonus y reglas
                       + conceptos especiales

Penalización del plan  = importe fijo del plan (si lo hay)

Comisión neta          = comisión bruta − penalización   (nunca baja de 0)

Mes de pago            = mes siguiente al de liquidación
```

✅ La comisión de un mes se cobra en la **nómina de fin del mes siguiente**. Ejemplo: lo generado en enero se cobra en la nómina de fin de febrero.

---

## Fase 9 — La liquidación: estados, cierre, versiones y correcciones

### 9.1 Qué es
Una **liquidación** es el resultado guardado del cálculo de un vendedor en un mes: puntos, tramo, cada línea de expediente con sus conceptos, totales y mes de pago.

### 9.2 Estados (🔧)
`borrador` → `calculada` → `revisada` → `cerrada`

### 9.3 Cierre y correcciones: se actualiza todo (✅)
Alfonso decidió que, si cambia algo de un expediente de un **mes ya cerrado**, **se actualice todo**: puntos, tramo, tablas y liquidación.

1. Al crear, editar o borrar un expediente, se recalculan **todos los meses afectados**, también los cerrados.
2. La **versión anterior completa** (cabecera, líneas y conceptos) se guarda en un **historial de versiones**, con fecha y motivo, y se muestra la diferencia ("antes 1.200 €, ahora 1.350 €").
3. Las **versiones guardadas** no se pueden modificar ni borrar.
4. La interfaz **avisa** cuando un cambio modifica un mes cerrado, con el importe de la diferencia.

### 9.4 Protecciones de la base de datos (🔧)
- Disparadores que impiden modificar o borrar liquidaciones cerradas, sus líneas, sus conceptos, las versiones y el libro de puntos, **salvo** durante un recálculo autorizado o la restauración de una copia de seguridad (indicadores internos).
- Las claves foráneas impiden borrar una promoción en uso o un plan con liquidaciones.

### 9.5 Liquidaciones importadas de la app antigua (✅)
Se importan como **cerradas** y **no se recalculan** solas. Solo se recalculan (con nueva versión y diferencia) cuando Alfonso cambia un expediente de ese mes. Son la **referencia de lo que de verdad se cobró** (Fase 13).

---

## Fase 10 — Libro de puntos y sincronización automática

### 10.1 El libro de puntos (🔧)
Es el registro de **solo inserción** de todos los apuntes de puntos: vendedor, expediente, evento (`PEDIDO`, `MATRICULACION`, `COBRO`, `REGLA`, `AJUSTE`), fecha, mes, puntos y regla aplicada.
- **Nunca se borra ni se modifica.** Las correcciones se hacen con **apuntes negativos**.
- Sirve para auditar de dónde sale cada punto.

### 10.2 Cuándo se actualiza (🔧)
Automáticamente, al:
- Crear, editar o borrar un expediente (se sincronizan **todos los meses afectados antes y después** del cambio: hasta 4, según pedido y matriculación/cobro).
- Cambiar fechas, tipo de venta, marca, modelo o vendedor.
- Cambiar las reglas del plan o terminar una importación (en bloque, desde el navegador, mes a mes).

### 10.3 Reasignar un expediente (✅)
Se puede pasar un expediente a otro vendedor. Se recalculan los puntos y las liquidaciones **de los dos vendedores** en los meses afectados.

---

## Fase 11 — Cobro: cotejo, pendientes de cobro y previsión de nómina

### 11.1 Cotejo de cobros (✅)
Para comprobar la nómina contra la liquidación:
- Cada expediente muestra sus conceptos (coche, usado, financiación, Preference, bonus y especiales) con una **casilla de "cobrado"**.
- Totales: **validado/cobrado**, **pendiente de cobro** y **ratio de validación**.
- Filtro: todos / solo pendientes / solo cobrados.
- Vive en la pantalla de **lista de planes** (panel "Control y Verificación de Cobros de Comisiones").

### 11.2 Comisiones pendientes del plan (✅)
Importes de meses anteriores que la empresa debe y se suman a la liquidación. Se muestran **aparte** del total y **se suman a la previsión de nómina**. Vienen de las notas del plan antiguo cuando se migra.

### 11.3 Pendiente de cobro: lo que me deben (✅)
Lista que Alfonso rellena a mano: **concepto, importe, fecha, mes de nómina previsto, cobrado sí/no, fecha de cobro y notas**.
- Totales de pendiente y cobrado; filtro todos/pendientes/cobrados.
- Si pasó el mes previsto sin cobrarse, se marca **atrasado**.
- Lo no cobrado entra en la **previsión de nómina**.

### 11.4 Previsión de nómina (M+1) (✅)
Muestra, para cada **mes de pago**, cuánto se cobrará: comisión neta de la liquidación del mes anterior + comisiones pendientes + lo pendiente de cobro previsto para ese mes.

---

## Fase 12 — Migración desde la app antigua

La copia de seguridad v1 se importa con una pantalla de clasificación y la conversión de comisiones. Equivalencias principales:

| App antigua | App nueva |
|---|---|
| Importes en **euros enteros** | Se multiplican por 100 → **céntimos** |
| `valor_objetivo` (1, 1,5, 2…) | `puntos` en **centésimas**. ✅ El 0 se conserva como 0 (antes se convertía en 1) |
| `min_coches_multiplicador` (cupo) | **Promociones de puntos**: se crea "Importada: N puntos, mínimo M" y se asigna a esos expedientes |
| `cobrado_otra_fecha` + `fecha_cobrado` | Casilla + `fecha_cobro`. En VO, `fecha_cobro` = fecha de facturación si no estaba marcada (se cobraba y facturaba el mismo día) |
| Estados "demo", "KM0", "usado", "buyback" | Clase **VO** con su subtipo |
| Un objetivo único por plan | Se copia a **cada vendedor** del plan |
| `min_matriculaciones` | **No se usa**; se guarda solo como dato histórico |
| Liquidaciones antiguas | Se importan como **cerradas** y de solo lectura |
| `conceptos_adicionales` (euros) | Conceptos especiales en céntimos, con evento por defecto |
| `notas_adicionales` (notas y comisiones pendientes) | Notas del plan y lista de pendientes en céntimos |
| Expedientes sin vendedor válido | Se asignan a "Mi vendedor" con aviso; se puede cambiar en la clasificación |

La conversión de comisiones es **repetible**: ejecutarla dos veces no duplica nada.

---

## Fase 13 — Validación: comparar con las liquidaciones antiguas

La función **"Comparar con liquidación antigua"** calcula un mes con el motor nuevo y lo pone al lado de la liquidación importada de la app antigua: total, puntos, tramo y, por expediente, puntos, tramo e importe, con la diferencia.

**Las diferencias deben explicarse por cambios decididos a propósito:**
- Demo, KM0 y usados ahora son VO (antes la app antigua trataba "demo" como VN).
- Los coches de 0 puntos ya no se convierten en 1.
- Un VO cuenta solo por fecha de cobro.
- Ya no hay mínimo de matriculaciones (si un mes no se llegaba, la antigua daba 0).
- Las promociones se agrupan por promoción, no por número de cupo.
- Financiación y bonus se pagan una sola vez, en el mes de su evento.

Cualquier diferencia que no encaje con esa lista puede ser un fallo del motor nuevo **o** de la app antigua, y hay que revisarla.

---

# Anexo A — Ejemplos numéricos

### Ejemplo 1 — Puntos, pedidos y tramo
Plan de junio, X = 13,00, rango −4 a +3.

| Concepto | Puntos |
|---|---|
| 10 VN matriculados en junio (1,00 cada uno) | 10,00 |
| 3 pedidos de junio que se matriculan en **julio** (puntos por pedido = 1,00) | +3,00 |
| **Total junio** | **13,00 → tramo X** |

- Con **puntos por pedido = 0**: total 10,00 → diferencia −3 → **X−3**.
- En **julio**, esos 3 coches se matriculan y **vuelven a contar** (+3,00 por su matriculación).
- Si el pedido y la matriculación fueran de junio, contarían **una sola vez**.

### Ejemplo 2 — Promoción de doble puntuación
Promoción "Stock atascado junio": especiales 2,00, mínimo 2, si no cumple 1,00.

| Situación | Resultado |
|---|---|
| En junio se matriculan 1 Clio y 1 Captur de la promoción | 2 ≥ 2 → 2,00 + 2,00 = **4,00 puntos**. Se cobra comisión de 1 Clio y 1 Captur (una vez cada uno) |
| Se venden 2 en junio, uno se matricula en junio y otro en julio | Junio: 1/2 → **1,00**. Julio: 1/2 → **1,00** |
| Promoción con mínimo 3 y se matriculan 3 | 3 ≥ 3 → 3 × 2,00 = **6,00 puntos** |

### Ejemplo 3 — VN "cobrado en otra fecha"
Un VN matriculado el 12/02 y cobrado el 20/01.
- **Con la casilla marcada** y fecha de cobro 20/01: puntos y comisión del coche en **enero**; se cobra en la nómina de **febrero**.
- **Sin la casilla:** cuenta en **febrero**; se cobra en la nómina de **marzo**.

### Ejemplo 4 — Cada concepto en su mes
Expediente VN, Renault Clio, tipo **Preference**:
pedido 20/05 · afectación 28/05 · RCI 10/06 · matriculación 05/07.

| Concepto | Mes en que se genera | Se cobra en la nómina de |
|---|---|---|
| Puntos del pedido (si el plan los da) | Mayo | Junio (puntos: solo cuentan para el tramo de mayo) |
| Bonus de tipo *pedido* o *afectación* | Mayo | Junio |
| Incentivo de financiación y Preference / BOX3 | **Junio** (fecha RCI) | Julio |
| Comisión del coche, puntos del coche, bonus de *matriculación*, conceptos especiales (evento por defecto) | **Julio** | Agosto |

Ningún concepto se genera dos veces.

### Ejemplo 5 — Tasa de intervención y comisión del coche
Renault, junio: **10 VN** con mes de cómputo junio; **7** de ellos con fecha RCI en junio y tipo Crédito/Preference/Renting → **70 %**. Objetivo de la marca: 65 % → **cumplida**.
- Tarifa del Clio, tramo X+1: **250 €** (tasa cumplida) / **180 €** (no cumplida) → se paga **250 €**.
- Si fueran 6 financiados → 60 % → **no cumplida** → 180 €.
- Si el expediente tiene comisión de coche fijada a mano de **300 €** → se paga **300 €**.
- Si no hay tarifa para ese modelo y tramo → **0 €** con el aviso "Sin tarifa para el modelo Clio en el tramo X+1".

### Ejemplo 6 — Comisión VO
**Vendedor VN que vende VO.** Tarifa KM0: primera unidad 120 €, resto 60 €, mínimo 0.
- 3 KM0 cobrados en el mes → 120 + 60 + 60 = **240 €**.
- Un KM0 y un Usado → cada subtipo tiene su propia "primera": 120 € + la primera del Usado.
- Con **mínimo 2** y solo 1 KM0 → **0 €**. Con mínimo 2 y 3 KM0 → 240 €.

**Vendedor VO con escala** (unidad 1 = 150 €, 2 = 170 €, 3 = 190 €):
- 5 unidades → 150 + 170 + 190 + 190 + 190 = **890 €**.
- Sin escala definida → 5 × 150 € = **750 €**.

### Ejemplo 7 — Total del mes (datos de la base de demostración)

| Concepto | Importe |
|---|---|
| Base VN | 890,00 € |
| Base VO | 120,00 € |
| Crédito / financiación | 360,00 € |
| Preference / BOX3 | 150,00 € |
| Bonus / reglas | 200,00 € |
| Conceptos especiales | 75,00 € |
| **Comisión bruta** | **1.795,00 €** |
| Penalización del plan | −150,00 € |
| **Comisión neta** | **1.645,00 €** |

Mes de pago: el mes siguiente al de liquidación.

### Ejemplo 8 — Corregir un mes cerrado
La liquidación de julio está **cerrada** con un neto de **1.600 €**. Alfonso corrige la fecha de matriculación de un coche y el recálculo da **1.750 €**.
- Se guarda la **versión anterior** (1.600 €) en el historial, con fecha y motivo.
- La liquidación actual pasa a 1.750 €, y se muestra "**+150 €**" de diferencia.
- El libro de puntos añade apuntes de corrección; no borra nada.

### Ejemplo 9 — Previsión de nómina
Nómina de **julio**: neto de la liquidación de **junio** + comisiones pendientes de meses anteriores + lo "pendiente de cobro" previsto para julio. Si un pendiente estaba previsto para junio y no se cobró, aparece **atrasado**.

---

# Anexo B — Diferencias con la app antigua

| Tema | App antigua | App nueva |
|---|---|---|
| Unidad de los objetivos | Mezcla de coches y puntos | **Puntos** |
| Tramo con decimales | Fallaba (caía a X−4) | **Redondeo hacia abajo** |
| Puntos | Enteros (podían redondearse mal) | **Centésimas exactas** |
| Coche con 0 puntos | Se convertía en 1 | **Se respeta el 0** |
| Demo | Contaba como VN | **VO** |
| VO | Fecha de facturación o matriculación | **Solo fecha de cobro** |
| Mínimo de matriculaciones | Si no llegabas, la comisión de todo el mes era 0 | **No existe** |
| Cupo de ventas multiplicadas | Por número de cupo, con fecha distinta de la de los puntos | **Promociones**, con la misma fecha que los puntos |
| Financiación y bonus | Podían contarse en el mes del pedido | **Una sola vez, en el mes de su evento** |
| VO de vendedor VN | Contador global | **Por subtipo** |
| Tasa de intervención | Incluía VO | **Solo VN** |
| Liquidación cerrada | Se podía borrar al recalcular | **Versiones con historial** |
| Recálculo | Todos los expedientes en memoria; sin transacciones | Por mes, por lotes, con protecciones |
| Duplicidad de lógica | Simulador y liquidación separados | **Un único motor** |
| Objetivo | Uno por plan | **Uno por vendedor** |
| Tramos | Columnas fijas X−4 … X+3 | **Rango configurable** |

---

# Anexo C — Reglas confirmadas por Alfonso (resumen)

1. Objetivos por puntos; cada vendedor tiene el suyo (habitual ≈ 13).
2. La venta no da puntos; los dan la **matriculación** (VN) y el **cobro** (VO, y VN con casilla).
3. VN: matriculación por defecto; con "cobrado en otra fecha", **manda el cobro**. La facturación no influye.
4. VO: solo cobro. Usado, KM0, demo y buyback son VO.
5. Pedido: según el plan, da puntos en el mes del pedido; si se matricula en otro mes, **cuenta en los dos**; en el mismo, **una vez**.
6. Coches de doble puntuación = **promociones**: mínimo de unidades de cualquier modelo; si no se llega, valen 1; **la comisión se cobra una sola vez**.
7. Tramo: **redondeo hacia abajo**. Sin mínimo de matriculaciones ni de cobros.
8. Todo configurable en el plan, que tiene rango de fechas.
9. Bonus del plan: se elige el evento (afectación, matriculación, cobro…). Cada evento usa **solo su fecha**.
10. Financiación, Preference/RCI, tasa de intervención, bonus, penalizaciones y VO: **como en la app antigua**.
11. Comisión de coche y de financiación **fijables a mano**.
12. Conceptos especiales por expediente, con evento a elegir.
13. Meses cerrados: **se actualiza todo**, con historial de versiones.
14. Vendedor por defecto: "Mi vendedor"; reasignable.
15. Cobro **a mes vencido**; control de lo que me deben, y previsión de nómina.
16. Importes en céntimos y puntos en centésimas; siempre 2 decimales en pantalla.

---

# Anexo D — Dónde se ve cada cosa

| Qué | Pantalla |
|---|---|
| Puntos, tramo y comisiones estimadas del mes | *Expedientes* → "Detalle y Resumen Estadístico" |
| Objetivo del mes, alertas | *Dashboard* |
| Crear y editar planes | *Comisiones* → lista de planes → Abrir |
| Cotejo de cobros | *Comisiones* → panel inferior de la lista de planes |
| Liquidación, previsión de nómina, libro de puntos, versiones, comparar con la antigua | *Comisiones* → plan → pestaña *Liquidación* |
| Notas, comisiones pendientes, pendiente de cobro | *Comisiones* → plan → pestaña *Notas* |
| Fechas, puntos, promoción, importes a mano, conceptos especiales | *Expedientes* → formulario de expediente |
| Convertir comisiones antiguas, copias | *Configuración* → pestaña *BBDD* |

---

# Anexo E — Pendiente de confirmar

| # | Tema | Estado |
|---|---|---|
| 1 | ❓ Si el **código actual** coincide con este documento tras CORRECCIÓN 9 (solo interfaz) | Revisar al recibir el nuevo zip |
| 2 | ❓ **Contado:** no genera incentivo de financiación. Es lo que hace el código leído y la app antigua; confirmar que es lo que quiere la empresa | Confirmar |
| 3 | ❓ **Renting** se trata como financiación (como Crédito) | Confirmar |
| 4 | ❓ Qué pasa si el **tramo del vendedor queda fuera de las tarifas** configuradas (poco probable con el rango por defecto) | Da 0 € con aviso; confirmar que es lo deseado |
| 5 | ❓ **Arrastre**: se suma al objetivo del vendedor. Confirmar cómo se calcula cada mes (a mano o automático) | Confirmar |
| 6 | ❓ **Numerador y denominador** de la tasa de intervención con fechas distintas | Es el comportamiento antiguo; confirmar |
| 7 | ❓ Que el **orden de las unidades VO** (por fecha de cobro y luego número de expediente) coincide con el criterio de la empresa | Validar con una liquidación real |
| 8 | ❓ Los **importes exactos** de una liquidación real, con la comparación de la Fase 13 | Pendiente de hacer con las 4 liquidaciones antiguas |

---

# Anexo F — Glosario

| Término | Significado |
|---|---|
| **VN / VO** | Vehículo nuevo / vehículo de ocasión (usado, KM0, demo, buyback) |
| **Pedido** | Fecha de creación del expediente |
| **Afectación** | Asignar un bastidor a un VN |
| **RCI** | Financiera de la marca; su fecha marca el mes de la financiación |
| **Matriculación** | Fecha de la matrícula; en VO es solo un dato |
| **Cobro** | Fecha en que se cobra el coche; en VN solo cuenta con la casilla "cobrado en otra fecha" |
| **Objetivo X** | Puntos que hay que hacer en el mes; cada vendedor tiene el suyo |
| **Arrastre** | Puntos o unidades que se suman al objetivo desde meses anteriores |
| **Tramo** | Posición respecto a X (X−4 … X+3), con redondeo hacia abajo |
| **Tasa de intervención** | Porcentaje (o número) de VN de una marca que se financian |
| **Promoción** | Grupo de coches con puntos especiales si se llega a un mínimo de unidades |
| **Unidad comisionable** | Cada coche que cuenta; se comisiona una sola vez |
| **Libro de puntos** | Registro de solo inserción de todos los apuntes de puntos |
| **Liquidación** | Resultado guardado de un vendedor en un mes |
| **Versión** | Copia guardada de una liquidación antes de recalcularla |
| **Cotejo** | Comprobación de lo cobrado en nómina contra lo liquidado |
| **Mes de pago** | Mes siguiente al de liquidación |
| **Mi vendedor** | El vendedor al que se asignan por defecto los expedientes |
