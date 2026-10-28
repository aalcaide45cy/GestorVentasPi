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
  /* ---------------- Menú lateral ---------------- */
  "menu.dashboard": {
    titulo: "Dashboard",
    queEs: "La pantalla de inicio: el resumen de tu actividad y los accesos rápidos para crear expedientes y subir documentos.",
    pasos: [
      "Arriba ves el objetivo del mes, los expedientes del mes y totales, los clientes registrados y el reparto por tipo de pago.",
      "«Últimos expedientes activos» lista los más recientes: pulsa uno para abrirlo, o arrastra el pedido de un cliente sobre un expediente para rellenarlo.",
      "«Acceso rápido a modelos»: pulsa el método de pago bajo un modelo para crear un expediente de venta al instante, o arrastra ahí el pedido del cliente.",
      "«Pedidos de clientes»: arrastra o sube los PDF o fotos de los pedidos; la aplicación lee los datos y los deja en una cola para revisarlos.",
      "«Pagos de la financiera (RCI)»: sube el PDF del pago y la aplicación fija la fecha RCI del expediente.",
    ],
    ojo: ["Si la lectura es manual, tras subir pedidos hay que pulsar «Iniciar lectura».", "El motor de lectura (OCR) se elige junto a las zonas de subida."],
  },
  "menu.expedientes": {
    titulo: "Expedientes",
    queEs: "El listado completo de ventas y su seguimiento: crear, buscar, filtrar, editar y exportar expedientes.",
    pasos: [
      "«Nuevo expediente» crea una venta; también se puede crear desde el Dashboard.",
      "Con «Filtrado y búsqueda avanzada» filtras por mes (los atajos «Se cobra en» y «Afectados en» van mes a mes), campo de fecha, vendedor, tipo de venta, estado del vehículo y estado de la intranet.",
      "Pulsa la cabecera de una columna para ordenar. «Columnas y vistas» elige qué columnas ver y su orden; pasa el ratón por una cabecera para ver qué significa.",
      "Pulsa un expediente para editarlo. Con doble clic sobre un valor se copia.",
      "«Selección» y «Eliminación» están bloqueadas por seguridad: pulsa el candado para activarlas un rato y poder actuar sobre varios expedientes.",
      "«Importar y exportar» saca los expedientes a un archivo, los trae de otro, y completa datos desde los Excel de la intranet.",
    ],
    ojo: ["Lo eliminado va a la papelera (Herramientas › Papelera) y se puede recuperar.", "Los cambios recientes se pueden deshacer con «Deshacer» de la barra lateral."],
  },
  "menu.clientes": {
    titulo: "Clientes",
    queEs: "La base de clientes: su ficha con datos de contacto (correos y teléfonos) y los documentos que hayas subido.",
    pasos: ["Busca un cliente por nombre, correo, teléfono o documento.", "Pulsa un cliente para ver o editar su ficha y sus expedientes.", "Al dejar el ratón sobre un nombre se ve su foto (tomada del DNI), si la hay."],
    ojo: ["Un cliente se crea al hacer un expediente o al leer su pedido; también se puede crear a mano."],
  },
  "menu.herramientas": {
    titulo: "Herramientas",
    queEs: "Todo lo que lee, guarda o prepara documentos, en un solo sitio y con pestañas: subir pedidos y pagos de RCI, la cola de pedidos leídos, la biblioteca de archivos y el historial de lecturas.",
    pasos: [
      "«Subir pedidos y pagos»: arrastra los PDF o fotos y elige el motor de lectura (OCR).",
      "«Cola de pedidos»: revisa los pedidos leídos y crea sus expedientes.",
      "«Biblioteca»: archivos guardados una vez (pedidos, pagos de RCI, rejillas, Excel). En cada zona de subida (pedidos y pagos, rejillas del Cotejo, Excel de Expedientes) pulsa «📚 Elegir de la biblioteca» y marca los que quieras.",
      "«Historial de lecturas»: qué pasó con cada PDF o foto que subiste.",
      "Con «Renombrar» o «Borrar» ordenas la biblioteca; «Descargar» te devuelve el archivo.",
    ],
    ojo: ["«Borrar todos los datos» no toca la biblioteca: sus archivos solo se quitan desde ella.", "Elegir un archivo de la biblioteca hace lo mismo que subirlo desde tu equipo (se lee con el OCR igualmente), pero sin buscarlo ni volver a transferirlo desde tu equipo.", "Los archivos se guardan cifrados dentro de la base de datos, así que van incluidos en las copias de seguridad."],
  },
  "menu.configuracion": {
    titulo: "Configuración",
    queEs: "Todo lo que se ajusta de la aplicación, solo para administradores: usuarios y roles, marcas y modelos, tiendas, tipos de pago, estados, preferencias, base de datos y tema.",
    pasos: [
      "«Gestión de usuarios y roles»: alta de usuarios, cambio de rol, bloqueo, restablecer contraseña o doble factor.",
      "Debajo, las pestañas (Marcas, Modelos, Tiendas, Pagos, Estados, Expedientes, BBDD y Tema), cada una con su propia «i» de guía.",
      "En BBDD están las copias de seguridad, las actualizaciones y el estado del equipo (la papelera está en Herramientas).",
    ],
    ojo: ["Un punto rojo junto a «Configuración» avisa de que hay demasiadas copias de seguridad.", "Lo que cambias aquí afecta a todos los usuarios."],
  },
  "menu.comisiones": {
    titulo: "Comisiones",
    queEs: "Los planes de comisionamiento: cuánto se cobra por cada coche según el plan del mes. De aquí salen las liquidaciones.",
    pasos: [
      "«Nuevo plan» crea un plan; se puede partir de una plantilla o importar uno de un archivo.",
      "Abre un plan para editarlo por pestañas (Resumen, Objetivo, VN, Usados, Financiación, Bonus, Penalizaciones, Liquidación y Notas), cada una con su «i».",
      "En «Liquidación» generas y revisas lo que corresponde mes a mes, vendedor a vendedor.",
    ],
    ojo: ["Un número rojo junto a «Comisiones» indica validaciones de comisiones pendientes.", "La validación con la hoja de la empresa y el control de cobros están en «Cotejo de pagos».", "Lo generado en un mes se cobra en la nómina del final del mes siguiente."],
  },
  "menu.cotejo": {
    titulo: "Cotejo de pagos",
    queEs: "Todo para comprobar que la empresa te ha pagado lo que toca: tu mes, la hoja (rejilla) de la empresa, el histórico de matrículas y tu nómina.",
    pasos: [
      "«Mi mes»: eliges un mes, subes la rejilla de la empresa (PDF o foto) y ves qué coches te han pagado y cuáles no, todo en la misma vista.",
      "«Histórico»: todas las matrículas de tus expedientes frente a todas las leídas de las rejillas guardadas, con un color por fila.",
      "«¿Cuadran los importes?»: cruza la hoja con tu liquidación del mes, por matrícula e importe.",
      "«Mis rejillas»: las rejillas guardadas, por mes, para verlas o corregirlas.",
      "«Mi nómina»: compara tu nómina con la liquidación, concepto a concepto.",
    ],
    ojo: ["Las rejillas leídas se revisan antes de guardarse: corrige lo mal leído a mano.", "El motor de lectura (OCR) se puede cambiar en «Mi mes», bajo el botón de subir la hoja."],
  },
  "menu.informes": {
    titulo: "Informes",
    queEs: "Informes de rendimiento de ventas y comisiones, con gráficos por marca, forma de pago y comercial.",
    pasos: ["Elige los filtros de consulta (fechas, vendedor, marca…).", "Mira las tarjetas de resumen y los gráficos: distribución por marca, por forma de pago y rendimiento económico por comercial.", "Los datos salen de los expedientes de la aplicación y de las comisiones calculadas."],
    ojo: ["Si cambias un expediente, el informe se actualiza al volver a consultar."],
  },
  "menu.log-importacion": {
    titulo: "Log de importaciones",
    queEs: "El registro de todas las cargas de archivos que han creado o modificado expedientes y clientes.",
    pasos: ["Cada línea es una importación: archivo, fecha y cuántos registros cambió.", "Abre una para ver qué se creó o cambió, registro a registro.", "«Deshacer importación» devuelve los datos a como estaban antes de esa carga."],
    ojo: ["Quitar una línea del historial no deshace los datos importados: para eso está «Deshacer importación»."],
  },
  "herramientas.historial": {
    titulo: "Historial de lecturas de pedidos",
    queEs: "Qué ha pasado con cada PDF o foto que has subido para leer, durante los últimos tres meses.",
    pasos: ["Filtra por resultado: leído, ignorado por no ser un pedido, fallido…", "Cada línea dice qué se hizo después: expediente creado, completado o quitado de la cola.", "Sirve para localizar un pedido que no entró en la cola o un dato mal leído."],
    ojo: ["De lo ignorado no se guarda el fichero, solo el principio de lo que se leyó."],
  },
  "menu.laboratorio": {
    titulo: "Laboratorio",
    queEs: "Un simulador de comisiones: toca reglas y mira cómo se mueven los puntos, el tramo y la comisión sin guardar nada.",
    pasos: ["Pulsa «Laboratorio» en el menú para abrir o cerrar el panel.", "Cambia reglas o datos del escenario y mira el resultado al momento.", "Al cerrar el panel no se queda nada guardado."],
    ojo: ["El botón se puede ocultar desde «Mis datos»."],
  },

  /* ---------------- Configuración ---------------- */
  "config.usuarios": {
    titulo: "Usuarios y roles",
    queEs: "Las personas que entran en la aplicación, su rol y su acceso: crea usuarios, cambia su rol, suspéndelos, restablece su doble factor o su contraseña.",
    pasos: [
      "Pulsa «Registrar Nuevo Usuario» para dar de alta a alguien.",
      "Cambia el rol desde el desplegable de su fila (administrador, director, jefe de tienda, vendedor…).",
      "«Suspender» impide el acceso sin borrar nada; «Cerrar sesiones» saca al usuario de todos sus dispositivos.",
      "«Reset 2FA» y «Contraseña temporal» sirven cuando alguien pierde el móvil o la contraseña.",
    ],
    ojo: ["Suspender no borra datos: el usuario y sus expedientes se conservan."],
  },
  "config.incidencias": {
    titulo: "Incidencias",
    queEs: "Todo lo que falla o va mal, reunido en un solo sitio: errores del servidor y del navegador, avisos de error que ha visto alguien, tareas y lecturas fallidas, lentitud, avisos del equipo y fallos que avisa una persona con «🐞 Avisar de un fallo».",
    pasos: [
      "Mira «Pendientes»: lo nuevo sale en negrita. Pulsa un mensaje para ver el detalle, la captura (si la hay) y los últimos pasos que se dieron antes del fallo.",
      "Marca las que quieras y pulsa «Resueltas» (si vuelven a ocurrir se reabren solas) o «Ignorar» (dejan de contar como pendientes).",
      "«📋 Copiar informe» deja en el portapapeles un texto con lo que pasó, dónde, cuántas veces y los pasos previos: pásaselo a quien vaya a arreglarlo.",
      "El círculo rojo de «Configuración» en el menú cuenta los errores nuevos; púlsalo para venir aquí.",
    ],
    ojo: ["Nunca se guardan contraseñas ni lo que se escribe en los formularios, y se tapan correos, documentos y números largos.", "Las cerradas se borran solas a los 45 días."],
  },
  "config.marcas": {
    titulo: "Marcas",
    queEs: "Las marcas de coches con las que trabajas. De ellas cuelgan los modelos, y desde aquí eliges cuáles tienen sistema de comisiones y cuáles salen en el acceso rápido al crear expedientes.",
    pasos: [
      "Escribe el nombre de la marca nueva y pulsa «Añadir».",
      "Activa «Acceso rápido» para que la marca salga como botón al crear un expediente.",
      "Activa «Sistema de comisiones» en las marcas que cuentan en tu plan de comisionamiento (Renault y Dacia, por ejemplo).",
      "Puedes poner un símbolo propio (un punto, una coma, un emoticono) para reconocer la marca en las listas.",
    ],
    ojo: ["Si borras una marca, también se borran sus modelos; van a la papelera y se pueden recuperar desde Herramientas › Papelera.", "Con los botones de arriba de la sección puedes exportar o importar las marcas y modelos."],
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
    ojo: ["Una tienda borrada va a la papelera y se puede recuperar desde Herramientas › Papelera."],
  },
  "config.pagos": {
    titulo: "Pagos (tipos de venta)",
    queEs: "Las formas de pago: Contado, Crédito, Preference… Cada una tiene un color y dos reglas que afectan a las comisiones.",
    pasos: [
      "Elige el color con el que se verá cada tipo de pago en las listas y en los botones de creación rápida de expedientes.",
      "«🎨 Paletas de colores» guarda los colores de los pagos, marcas y estados como una paleta, para cambiar de una a otra, exportarla a un archivo o importarla; «Por defecto» vuelve a rojo, ámbar y azul.",
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
  "config.clientes": {
    titulo: "Clientes (ajustes)",
    queEs: "Cómo se abre la lista de clientes: en qué orden, qué columnas, cuántos clientes de entrada y si solo salen los que ya tienen ventas.",
    pasos: ["Elige el orden con el que quieres ver la lista al entrar.", "Marca u oculta las columnas (correos, teléfonos, tienda, ventas, fecha de nacimiento).", "Si tienes muchos clientes, elige cuántos se ven de primeras; debajo de la tabla hay un botón para ver más.", "«Restaurar la lista de clientes» vuelve a lo de siempre."],
    ojo: ["Se guarda en el navegador de cada equipo. Lo que pulses en la propia lista (una cabecera, una casilla) manda mientras la tengas abierta."],
  },
  "config.dashboard": {
    titulo: "Dashboard (ajustes)",
    queEs: "Qué paneles se ven en el Dashboard y cuántos expedientes enseña «Últimos expedientes activos». El orden de los paneles se cambia en el propio Dashboard.",
    pasos: ["Marca u oculta cada panel; el cambio se guarda solo y se ve al volver al Dashboard.", "Pon cuántos expedientes recientes quieres ver (de 1 a 50).", "Para cambiar de sitio los paneles, entra en el Dashboard, pulsa «🔒 Mover paneles» y arrástralos por su asa ⠿.", "«Restaurar el Dashboard» vuelve a mostrar todo, en su orden y con 5 expedientes."],
    ojo: ["Estos ajustes se guardan en el navegador de cada equipo (el PC y el Mac pueden tenerlos distintos)."],
  },
  "config.expedientes.reglas": {
    titulo: "Colores de fila",
    queEs: "Reglas que pintan de un color las filas de la lista de Expedientes cuando se cumplen unas condiciones (el estado de la intranet, hace cuántos días se hizo el pedido, la marca, el vendedor…).",
    pasos: ["Pulsa «+ Añadir regla», ponle nombre y elige las condiciones, el color y la intensidad.", "Si una fila cumple varias reglas, gana la que esté más arriba: usa ▲ y ▼ para cambiar la prioridad.", "Desmarca una regla para dejar de aplicarla sin borrarla.", "«Guardar el esquema actual» guarda el conjunto con un nombre; «Exportar» e «Importar» lo llevan a otro equipo en un archivo."],
    ojo: ["Las reglas se guardan en el navegador de cada equipo."],
  },
  "config.bbdd": {
    titulo: "BBDD (base de datos y sistema)",
    queEs: "El mantenimiento de la aplicación: revisar la base de datos, las copias de seguridad, las actualizaciones y el estado del equipo. Solo para administradores.",
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
  "config.expedientes.apuntes": { titulo: "Semáforo y apuntes de los expedientes", queEs: "Los apuntes predefinidos que se pueden añadir a un expediente con un clic (Seguro, VO de retoma…). Cada uno tiene título, descripción, una etiqueta con color que puede salir junto al icono del cliente en la lista y, si quieres, un botón rápido.", pasos: ["Abre «ℹ️ ¿Cómo funciona el semáforo?» al principio de la pantalla: lo explica paso a paso.", "Pulsa «+ Nuevo predefinido», ponle título, descripción y el texto de la etiqueta (puede llevar emoticonos, que son opcionales). Si marcas «Funciona como un semáforo», defines sus estados (color y significado) y en cuál empiezan los expedientes.", "Elige el estilo: cápsula con relleno, o texto en color (con o sin pintar los emoticonos).", "Marca «Mostrar la etiqueta en la lista» si quieres que salga junto al icono del cliente.", "En cada expediente, el botón «＋ título» añade el apunte con un clic y solo deja uno por expediente."], ojo: ["«VO de retoma» lo añade solo la lectura de un pedido con retoma: se puede editar pero no borrar."] },
  "config.expedientes.modos": { titulo: "Selección y eliminación", queEs: "Los modos que activan la selección múltiple y la eliminación en la lista de expedientes. Están bloqueados para evitar borrar sin querer.", pasos: ["Elige cuánto tiempo se queda activo cada modo antes de volver a bloquearse.", "En la lista, pulsa el candado del modo para activarlo."] },
  "config.expedientes.foto": { titulo: "Foto del cliente", queEs: "La foto del cliente, tomada de su DNI, que aparece al dejar el ratón sobre su nombre en la lista de clientes o de expedientes.", pasos: ["Elige los segundos que hay que esperar con el ratón encima antes de que salga la foto."] },

  /* ---------------- Configuración › BBDD ---------------- */
  "config.bbdd.analisis": {
    titulo: "Análisis y limpieza",
    queEs: "Revisa la base de datos en busca de registros huérfanos (sin cliente, sin modelo…) y de cosas raras a revisar.",
    pasos: ["Pulsa «Analizar» y espera el resultado.", "Revisa cada grupo: la aplicación explica qué ha encontrado y qué se puede hacer.", "Usa «Limpiar» solo en lo que estés seguro de querer quitar."],
    ojo: ["La limpieza guarda antes una copia de seguridad. Los cambios grandes se hacen como tarea en segundo plano, con barra de progreso arriba."],
  },
  "herramientas.papelera": {
    titulo: "Papelera y purga",
    queEs: "Todo lo que eliminas en la aplicación viene aquí y sigue guardado hasta que lo purgues de verdad: solo la Papelera borra definitivamente. Puedes verlo, descargarlo y recuperarlo.",
    pasos: ["Elige la pestaña de lo que buscas (expedientes, clientes, pedidos, pagos RCI, marcas, modelos…); cada una tiene buscador, orden y columnas.", "Marca lo que quieras y pulsa «Restaurar lo elegido» para recuperarlo (los expedientes vuelven a contar en las comisiones y recuperan a su cliente).", "«Purgar» borra de verdad y libera espacio; en cantidades grandes se hace por lotes y en segundo plano.", "«Compactar» devuelve al disco el espacio que dejaron los registros purgados."],
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
