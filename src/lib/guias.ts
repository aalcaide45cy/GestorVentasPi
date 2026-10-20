/**
 * Guías de uso de cada pestaña de la aplicación: lo que se ve al pulsar la «i» que hay junto al nombre de la pestaña. Cada guía dice
 * para qué sirve la pestaña, los pasos para usarla y lo que conviene tener en cuenta. Texto llano, sin jerga.
 */

export interface Guia {
  titulo: string;
  /** Para qué sirve la pestaña, en una o dos frases. */
  queEs: string;
  /** Cómo se usa, paso a paso. */
  pasos: string[];
  /** Cosas que conviene saber (límites, consecuencias, atajos). */
  ojo?: string[];
}

export const GUIAS: Record<string, Guia> = {
  /* ---------------- Configuración ---------------- */
  "config.marcas": {
    titulo: "Marcas",
    queEs: "Las marcas de coches con las que trabajas. De ellas cuelgan los modelos, y desde aquí eliges cuáles tienen sistema de comisiones y cuáles salen en el acceso rápido al crear expedientes.",
    pasos: [
      "Escribe el nombre de la marca nueva y pulsa «Añadir».",
      "Activa «Acceso rápido» para que la marca salga como botón al crear un expediente.",
      "Activa «Sistema de comisiones» en las marcas que cuentan en tu plan de comisionamiento (Renault y Dacia, por ejemplo).",
      "Puedes poner un símbolo propio (un punto, una coma, un emoticono) para reconocer la marca en las listas.",
    ],
    ojo: ["Si borras una marca, también se borran sus modelos; van a la papelera y se pueden recuperar desde Configuración › BBDD › Papelera.", "Con los botones de arriba de la sección puedes exportar o importar las marcas y modelos."],
  },
  "config.modelos": {
    titulo: "Modelos",
    queEs: "Los modelos de cada marca. Son los que eliges al crear un expediente y los que llevan tarifa en el plan de comisiones.",
    pasos: [
      "Despliega la marca (o todas a la vez) y añade sus modelos con el nombre exacto con el que quieres verlos.",
      "Marca «Acceso rápido» en los modelos que más vendes para tenerlos a un toque al crear expedientes.",
      "Si renombras un modelo, cambia en todos sus expedientes: es el mismo modelo, no uno nuevo.",
    ],
    ojo: ["Si un modelo tiene expedientes, al borrarlo eliges a qué modelo pasan.", "Un modelo sin tarifa en el plan se cuenta como coche sin comisión: revisa la pestaña «VN» del plan cuando añadas modelos nuevos."],
  },
  "config.tiendas": {
    titulo: "Tiendas",
    queEs: "Los puntos de venta físicos. Cada expediente pertenece a una tienda, y una de ellas es la predeterminada.",
    pasos: ["Añade cada tienda con su nombre.", "Marca como predeterminada la que usas casi siempre: saldrá ya elegida al crear expedientes.", "Edita o borra con los botones de cada fila."],
    ojo: ["Una tienda borrada va a la papelera y se puede recuperar desde Configuración › BBDD › Papelera."],
  },
  "config.pagos": {
    titulo: "Pagos (tipos de venta)",
    queEs: "Las formas de pago: Contado, Crédito, Preference… Cada una tiene un color y dos reglas que afectan a las comisiones.",
    pasos: [
      "Elige el color con el que se verá cada tipo de pago en las listas.",
      "«Exige fecha RCI al matricular»: si está en Sí, un expediente de ese pago no se puede matricular sin la fecha de la financiera.",
      "«Suma a la tasa de intervención»: si está en Sí, los expedientes de ese pago cuentan para la tasa de intervención financiera del mes (en el mes de su fecha RCI).",
    ],
    ojo: ["Cambiar estas reglas cambia el cálculo de las comisiones de los meses abiertos."],
  },
  "config.estados": {
    titulo: "Estados del vehículo",
    queEs: "Los estados por los que pasa un coche (Nuevo, Demo, KM0, Buyback, Usado…) y si cuentan como nuevo (VN) o usado (VO).",
    pasos: [
      "Para cada estado elige si es Nuevo (VN) o Usado (VO): con eso la aplicación separa nuevos y usados en comisiones y puntos.",
      "En los usados, elige el subtipo (USADO, KM0, DEMO, BUYBACK…). Los estados con el mismo subtipo comparten tarifa en la pestaña «Usados / VO» del plan.",
      "Puedes darle a cada estado un color y un borde para reconocerlo en las listas.",
    ],
    ojo: ["Los subtipos de usados se crean en el bloque «Subtipos de usados» de esta misma pestaña."],
  },
  "config.expedientes": {
    titulo: "Expedientes (preferencias)",
    queEs: "Cómo se comporta la lista de expedientes: cuántos se ven por página, qué se ve al abrirla y cómo funcionan los modos de selección y eliminación.",
    pasos: ["Entra en cada subpestaña, cambia el valor y se guarda solo.", "«Lista»: expedientes por página y filtros que se recuerdan.", "«Selección y eliminación»: cuánto tiempo se quedan activos esos modos.", "«Foto del cliente»: segundos que hay que esperar con el ratón sobre el cliente para ver su foto."],
  },
  "config.bbdd": {
    titulo: "BBDD (base de datos y sistema)",
    queEs: "El mantenimiento de la aplicación: revisar la base de datos, la papelera, las copias de seguridad, las actualizaciones y el estado del equipo. Solo para administradores.",
    pasos: ["Elige una subpestaña según lo que necesites; cada una tiene su propia «i» con la guía.", "Antes de borrar o restaurar algo importante, haz una copia de seguridad en «Copias de seguridad»."],
    ojo: ["Lo que hagas aquí afecta a todos los usuarios."],
  },
  "config.temas": {
    titulo: "Tema",
    queEs: "El aspecto de la aplicación: colores y fondo, en claro u oscuro.",
    pasos: ["Elige un tema en «Oscuros», «Claros» u «Originales» (los dos de la aplicación antigua).", "El cambio se aplica al momento y se recuerda en este navegador."],
  },
  "config.temas.oscuros": { titulo: "Temas oscuros", queEs: "Temas de fondo oscuro, agrupados por intensidad.", pasos: ["Pulsa el tema que quieras: se aplica al momento.", "Se recuerda en este navegador; en otro equipo se elige de nuevo."] },
  "config.temas.claros": { titulo: "Temas claros", queEs: "Temas de fondo claro, agrupados por intensidad.", pasos: ["Pulsa el tema que quieras: se aplica al momento.", "Se recuerda en este navegador; en otro equipo se elige de nuevo."] },
  "config.temas.originales": { titulo: "Temas originales", queEs: "Los dos temas de la aplicación antigua, tal como eran.", pasos: ["Pulsa el que prefieras: se aplica al momento."] },
  "config.expedientes.lista": { titulo: "Lista de expedientes", queEs: "Cuántos expedientes se ven por página y qué se recuerda al volver a la lista.", pasos: ["Elige el número de expedientes por página por defecto (se puede cambiar luego desde la propia tabla).", "Decide si la lista recuerda el último filtro que usaste."] },
  "config.expedientes.modos": { titulo: "Selección y eliminación", queEs: "Los modos que activan la selección múltiple y la eliminación en la lista de expedientes. Están bloqueados para evitar borrar sin querer.", pasos: ["Elige cuánto tiempo se queda activo cada modo antes de volver a bloquearse.", "En la lista, pulsa el candado del modo para activarlo."] },
  "config.expedientes.foto": { titulo: "Foto del cliente", queEs: "La foto del cliente, tomada de su DNI, que aparece al dejar el ratón sobre su nombre en la lista de clientes o de expedientes.", pasos: ["Elige los segundos que hay que esperar con el ratón encima antes de que salga la foto."] },

  /* ---------------- Configuración › BBDD ---------------- */
  "config.bbdd.analisis": {
    titulo: "Análisis y limpieza",
    queEs: "Revisa la base de datos en busca de registros huérfanos (sin cliente, sin modelo…) y de cosas raras a revisar.",
    pasos: ["Pulsa «Analizar» y espera el resultado.", "Revisa cada grupo: la aplicación explica qué ha encontrado y qué se puede hacer.", "Usa «Limpiar» solo en lo que estés seguro de querer quitar."],
    ojo: ["La limpieza guarda antes una copia de seguridad. Los cambios grandes se hacen como tarea en segundo plano, con barra de progreso arriba."],
  },
  "config.bbdd.papelera": {
    titulo: "Papelera y purga",
    queEs: "Todo lo que has eliminado sigue guardado aquí hasta que lo purgues de verdad. Puedes verlo, descargarlo y recuperarlo.",
    pasos: ["Elige la sección (expedientes, clientes, documentos…) y mira lo eliminado.", "Restaura lo que borraste por error.", "«Purgar» borra de verdad y libera espacio; en cantidades grandes se hace por lotes y en segundo plano.", "«Compactar» devuelve al disco el espacio que dejaron los registros purgados."],
    ojo: ["Lo purgado no se puede recuperar. Haz una copia de seguridad antes de purgar a fondo."],
  },
  "config.bbdd.datos": {
    titulo: "Exportar e importar",
    queEs: "Sacar los datos de cada sección en un archivo, traerlos de otro equipo y guardar copias internas de cada sección.",
    pasos: ["Elige la sección (marcas, tiendas, planes de comisiones…).", "«Exportar» genera el archivo; «Importar» lo lee y te muestra qué va a cambiar antes de aplicarlo.", "Al importar un plan puedes elegir si se crean los modelos y marcas que falten."],
    ojo: ["Importar siempre enseña un resumen con aceptar y cancelar: puedes editar el archivo a mano antes de aplicarlo."],
  },
  "config.bbdd.copias": {
    titulo: "Copias de seguridad",
    queEs: "Copias completas de la base de datos (.dump): crearlas, descargarlas, restaurarlas y subirlas a Google Drive.",
    pasos: [
      "«Crear copia» hace una copia ahora, en segundo plano.",
      "Descarga la copia a tu equipo con el botón de descarga; para restaurar en otro equipo, súbela allí.",
      "«Restaurar» pone la base como estaba en la copia. Antes se guarda una copia previa por si algo sale mal.",
      "Si la copia viene de otra instalación y no tienes su clave, marca «No tengo la clave»: se restaura todo menos los documentos y el doble factor.",
    ],
    ojo: ["Las copias portables llevan dentro la clave de los documentos, así que se restauran en otro equipo sin pedir nada (se puede desactivar).", "Mientras se restaura, la aplicación está en mantenimiento y tendrás que volver a iniciar sesión."],
  },
  "config.bbdd.sistema": {
    titulo: "Sistema",
    queEs: "Actualizar la aplicación, elegir el motor de lectura (OCR) y otras opciones del equipo.",
    pasos: ["En «Actualizar» ves la versión instalada y si hay otra disponible.", "El motor de OCR se elige aquí o junto a las zonas de subida de pedidos y pagos.", "Ajusta cuántas lecturas se hacen a la vez si el equipo va justo."],
  },
  "config.bbdd.rendimiento": {
    titulo: "Rendimiento",
    queEs: "Por qué va lenta la aplicación: procesador, memoria, temperatura, disco, base de datos, lecturas y peticiones lentas.",
    pasos: ["Mira los indicadores: en rojo o amarillo hay algo que revisar.", "Las peticiones y consultas lentas te dicen qué pantalla o acción tarda más.", "En la Raspberry, vigila la temperatura y el disco."],
  },
  "config.bbdd.registro": {
    titulo: "Registro del servidor",
    queEs: "Lo que anota el programa: errores, avisos y restauraciones. Es lo primero que hay que mirar cuando algo falla.",
    pasos: ["Filtra por nivel (errores, avisos…) o busca un texto.", "Copia o descarga el registro para enseñárselo a quien te ayude."],
    ojo: ["El registro no guarda contraseñas ni códigos."],
  },
  "config.bbdd.peligro": {
    titulo: "Migración y borrado",
    queEs: "Traer los datos de la aplicación antigua o borrar todos los datos de esta. Son acciones grandes.",
    pasos: ["Para migrar, sigue los pasos que indica el panel.", "Para borrar, elige qué se borra y confirma con doble clic; antes se crea una copia previa."],
    ojo: ["Borrar todo no se puede deshacer salvo restaurando una copia."],
  },

  /* ---------------- Cotejo de pagos ---------------- */
  "cotejo.mes": {
    titulo: "Mi mes",
    queEs: "Comprueba, mes a mes, que la empresa te ha pagado todos los coches que vendiste. Subes la hoja de comisiones (rejilla) del mes y la aplicación te dice qué coches no aparecen.",
    pasos: [
      "Elige el mes arriba. En el carril de meses ves de un vistazo cuáles tienen rejilla y cuántos coches están sin pagar o dudosos.",
      "Pulsa «Subir la rejilla» (PDF o foto) o arrástrala. La aplicación lee las matrículas de la hoja.",
      "Revisa las matrículas leídas: las marcadas en amarillo o rojo se han leído con dudas. ✔ es un coche tuyo; ? no coincide con ninguno. Corrige a mano lo que haga falta.",
      "Mientras no la guardes, el resultado de la derecha ya la usa como vista previa. Cuando esté bien, pulsa «Guardar rejilla».",
      "Los contadores (No pagados, Dudosos, Pagados…) filtran la tabla de coches del mes. Lo que sale en rojo es lo que hay que reclamar.",
    ],
    ojo: ["Si el OCR lee mal, cambia de motor en el selector de debajo del botón.", "Un coche cuenta en el mes de su matriculación (en usados, del mes de afectación al de entrega).", "El desplegable «Con la hoja delante» sirve para marcar a mano cada coche y ver cuánto te corresponde por cada uno."],
  },
  "cotejo.historico": {
    titulo: "Histórico",
    queEs: "Todas las matrículas de tus expedientes frente a todas las matrículas leídas de las rejillas que has guardado, en una sola tabla y con un color por fila.",
    pasos: [
      "Mira los contadores de arriba: cuántas coinciden, cuántos coches no figuran en ninguna rejilla y cuántas matrículas de rejilla no tienen expediente.",
      "Pulsa un contador para filtrar la tabla. 🟢 coincide, 🔴 el coche no figura en la rejilla de su mes, 🟡 dudoso (otro mes, repetida o parecida), 🟣 está en una rejilla pero no hay expediente con esa matrícula, ⚪ todavía no has subido la rejilla de su mes.",
      "Cada fila dice en qué mes le tocaba cobrarse y en la rejilla de qué mes figura.",
      "Usa el buscador para encontrar una matrícula, un cliente o un mes.",
    ],
    ojo: ["El histórico crece solo: cada rejilla que guardas en «Mi mes» aporta sus matrículas.", "Las correcciones de matrículas mal leídas se hacen en «Mi mes» o en «Mis rejillas»."],
  },
  "cotejo.importes": {
    titulo: "¿Cuadran los importes?",
    queEs: "Cruza la hoja de la empresa con tu liquidación de un mes, por matrícula e importe: te dice qué falta, qué sobra, qué es distinto y qué está duplicado.",
    pasos: ["Elige el mes y el vendedor.", "Sube la hoja de la empresa con sus importes (o usa la guardada).", "Revisa las diferencias: cada línea explica si falta, sobra, el importe no coincide o está repetida.", "Corrige lo mal leído y vuelve a comparar."],
    ojo: ["Esta pestaña compara importes; para saber solo si te han pagado cada coche, usa «Mi mes»."],
  },
  "cotejo.rejillas": {
    titulo: "Mis rejillas",
    queEs: "Todas las rejillas que has guardado, por mes, para revisarlas cuando haga falta.",
    pasos: ["Pulsa una rejilla para ver sus filas, buscar en ellas y ordenarlas.", "Puedes corregir una fila, añadir otra, quitar una o cambiar el mes de la rejilla.", "«Borrar» quita la rejilla entera."],
    ojo: ["Cambiar una rejilla cambia el cotejo de ese mes."],
  },
  "cotejo.nomina": {
    titulo: "Mi nómina",
    queEs: "Compara tu nómina con la liquidación, concepto a concepto, para ver si te han pagado todo.",
    pasos: ["Elige el mes de la nómina.", "Anota o sube lo que figura en tu nómina por cada concepto.", "Marca cada concepto cuando lo veas cobrado: lo que quede sin marcar es lo que falta."],
    ojo: ["Lo generado en el mes M se cobra en la nómina del final del mes M+1."],
  },

  /* ---------------- Plan de comisionamiento ---------------- */
  "plan.resumen": {
    titulo: "Resumen del plan",
    queEs: "Los datos generales del plan: nombre, fechas y vendedores a los que se aplica.",
    pasos: ["Pon un nombre claro (por ejemplo, «Plan 2026»).", "Indica «F. inicio» y «F. fin»: el plan vale para los meses entre ambas fechas.", "Elige los vendedores a los que aplica.", "Guarda con «Guardar cambios»."],
    ojo: ["Cada coche cuenta en el mes de su fecha de facturación; sin ella, en el de su matriculación.", "Las fechas están bloqueadas por el candado para evitar cambios sin querer."],
  },
  "plan.objetivo": {
    titulo: "Objetivo del plan",
    queEs: "Los puntos que debe sumar cada vendedor al mes. Con los puntos reales se calcula el tramo del mes (de −4 a +3), que decide cuánto se cobra por cada coche nuevo.",
    pasos: ["Fija el objetivo de puntos (base + arrastre).", "Define los puntos por defecto de cada marca y modelo.", "Configura la tasa de intervención y las promociones de puntos.", "Usa las plantillas para copiar la configuración de otro plan."],
  },
  "plan.modelos": {
    titulo: "Tarifas de coches nuevos (VN)",
    queEs: "Lo que cobra el vendedor por cada coche nuevo, según el modelo, el tramo del mes y si se cumple la tasa de intervención.",
    pasos: ["Para cada modelo, escribe los importes de cada tramo (con y sin tasa cumplida).", "Puedes cargar una plantilla de tarifas (por ejemplo, la genérica de Renault y Dacia) y retocarla.", "Guarda el plan."],
    ojo: ["No afecta a los usados: para ellos, mira «Usados / VO»."],
  },
  "plan.usados": {
    titulo: "Usados / VO",
    queEs: "Todo lo de los coches de ocasión: si suman puntos, cuánto se paga por cada uno y en qué orden se decide.",
    pasos: ["Elige el subtipo (Usado, KM0, Demo, Buyback) y define su tarifa y sus puntos.", "Ajusta el orden en que se aplican las reglas si hay varias."],
    ojo: ["Los subtipos y qué estados son usados se gestionan en Configuración › Estados."],
  },
  "plan.reglas": {
    titulo: "Financiación y reglas",
    queEs: "El dinero por financiar y las reglas especiales de cálculo.",
    pasos: ["«Incentivo de financiación»: importe por marca y tipo de pago en el mes de la fecha RCI.", "«Reglas Preference / BOX3»: extra por modelo o marca.", "En cada línea elige «Se aplica a»: nuevos, usados o un subtipo de usado.", "«Reglas especiales»: sumas de importe o puntos con condiciones."],
  },
  "plan.bonus": {
    titulo: "Bonus",
    queEs: "Premios de campaña: importe o puntos extra cuando un coche cumple las condiciones de la regla.",
    pasos: ["Crea un bonus y ponle nombre.", "Define sus condiciones: evento, marca, modelo, fechas, tipo de vehículo, tasa de intervención…", "Indica el importe o los puntos que da."],
    ojo: ["Cada bonus se genera en el mes de su propio evento."],
  },
  "plan.penalizaciones": {
    titulo: "Penalizaciones",
    queEs: "Lo que se resta de la comisión.",
    pasos: ["La penalización única global se descuenta del total del mes.", "Las reglas dinámicas restan su importe cuando el coche cumple los filtros."],
    ojo: ["La comisión neta nunca baja de 0."],
  },
  "plan.liquidacion": {
    titulo: "Liquidación",
    queEs: "El resultado del plan mes a mes y vendedor por vendedor.",
    pasos: ["Genera la liquidación del mes.", "Revisa coche por coche cómo se ha calculado cada importe.", "Cierra la liquidación cuando esté correcta."],
    ojo: ["Lo generado en el mes M se cobra en la nómina de fin del mes M+1.", "Si cambias un expediente de un mes cerrado, se recalcula y se guarda la versión anterior."],
  },
  "plan.notas": {
    titulo: "Notas del plan",
    queEs: "Notas libres y control del dinero pendiente: lo que la empresa te debe de meses anteriores y lo que aún no has cobrado.",
    pasos: ["Escribe tus notas.", "Anota el dinero pendiente de meses anteriores: se suma a la previsión de nómina."],
    ojo: ["No cambia el cálculo de comisiones."],
  },
};
