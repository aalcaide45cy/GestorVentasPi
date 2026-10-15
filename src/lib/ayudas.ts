/**
 * Ayudas emergentes (texto que aparece al pasar el ratón). Se asignan automáticamente a botones, etiquetas, cabeceras y campos
 * que no tengan ya un `title` propio, buscando por su texto. Un elemento con `title` o `data-sin-ayuda` no se toca.
 */

/** Quita iconos, signos y asteriscos y pasa a minúsculas: «✏️ Editar *» → «editar». */
export function normalizarTexto(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** [expresión sobre el texto normalizado, ayuda]. La primera que coincida gana, así que van de lo concreto a lo general. */
const AYUDAS: [RegExp, string][] = [
  // Navegación
  [/^dashboard$|^panel$|^inicio$/, "Resumen del mes: pedidos, matriculaciones, comisión estimada y avisos."],
  [/^expedientes$/, "Lista de todos los expedientes de venta: buscar, filtrar, editar y exportar."],
  [/^clientes$/, "Fichas de clientes con sus teléfonos, correos y documentos."],
  [/^comisiones$/, "Planes de comisiones, liquidación mensual, validación con la rejilla de la empresa y simulador."],
  [/^informes$/, "Estadísticas por periodo, marca, modelo, vendedor y forma de pago."],
  [/^log importacion$/, "Registro de las importaciones de Excel/CSV hechas y qué cambió cada una."],
  [/^configuracion$|^administracion$|^ajustes$/, "Catálogos (marcas, modelos, tiendas, pagos, estados), usuarios, copias de seguridad y apariencia."],
  [/^perfil$|^mi perfil$/, "Tus datos, contraseña y doble factor."],
  [/^cerrar sesion$/, "Cierra tu sesión en este navegador."],
  [/^apagar equipo$/, "Apaga la Raspberry Pi de forma ordenada (pide confirmación)."],

  // Pestañas de configuración
  [/^marcas$/, "Marcas de vehículos que puedes elegir al crear un expediente."],
  [/^modelos$/, "Modelos de cada marca; los de acceso rápido aparecen como botones al crear un expediente."],
  [/^tiendas$/, "Puntos de venta. Cada expediente y cliente pertenece a una tienda."],
  [/^pagos$/, "Formas de pago (Contado, Crédito, Preference…) y el color con que se muestran."],
  [/^estados$/, "Estados del vehículo (Nuevo, Demo, KM0, Buyback, Usado…) y si cuentan como VN o VO."],
  [/^bbdd$/, "Mantenimiento de la base de datos: copias, conversión de la app antigua y borrado total."],
  [/^tema$/, "Elige la combinación de colores de la aplicación."],
  [/^usuarios$/, "Cuentas de acceso: roles, tiendas y seguridad."],

  // Marcas / modelos
  [/^sist comisiones$|^sistema de comisiones$|^sist comisiones$/, "Marca las marcas cuyos modelos van al sistema de comisiones: en «Modelos» se muestran agrupadas arriba como «Comisiones Activo»; el resto aparece en «Resto de Marcas». No cambia ningún cálculo."],
  [/^acceso rapido$/, "Si está activo, aparece como botón de acceso directo al crear un expediente."],
  [/^modelos asoc$/, "Cuántos modelos tiene esta marca."],
  [/^estado$/, "Estado actual del elemento (activo o inactivo, o estado del vehículo)."],
  [/^predeterminad[oa]$|^predet$/, "Se selecciona automáticamente al crear algo nuevo."],
  [/^color$|^color asignado$/, "Color con el que se muestra en las listas y los gráficos."],
  [/^orden$/, "Posición en la que aparece; los números bajos van primero."],

  // Acciones generales
  [/^crear\b|^nuevo\b|^nueva\b|^anadir\b|^agregar\b/, "Crea un elemento nuevo."],
  [/^editar$|^modificar$/, "Abre el elemento para cambiar sus datos."],
  [/^eliminar\b|^borrar$/, "Elimina el elemento. Se archiva (no se pierde el histórico ni las estadísticas) y pide confirmación."],
  [/^guardar\b/, "Guarda los cambios."],
  [/^cancelar$|^cerrar$|^volver$/, "Cierra sin guardar los cambios."],
  [/^aceptar$|^confirmar$|^si$/, "Confirma la acción."],
  [/^limpiar$|^restablecer$|^quitar filtros$/, "Quita los filtros y vuelve a la vista completa."],
  [/^buscar\b|^filtrar\b/, "Busca o filtra la lista con lo escrito."],
  [/^exportar\b/, "Descarga los datos en un archivo."],
  [/^importar\b/, "Carga datos desde un archivo (Excel o CSV)."],
  [/^descargar\b/, "Descarga el archivo a este equipo."],
  [/^subir\b|^adjuntar\b|^elegir (copia|archivo|fichero)/, "Selecciona un archivo de tu equipo para cargarlo."],
  [/^restaurar\b/, "Recupera los datos de una copia de seguridad (sustituye los actuales; antes se hace una copia previa)."],
  [/^analizar\b/, "Revisa sin cambiar nada y muestra lo que encuentra."],
  [/^convertir\b/, "Sustituye los datos actuales por las partes marcadas de la copia antigua."],
  [/^comparar\b/, "Muestra las diferencias entre dos cálculos."],
  [/^recalcular\b|^calcular\b/, "Vuelve a calcular los importes con el motor de comisiones."],
  [/^cerrar liquidacion|^cerrar mes/, "Fija la liquidación del mes: a partir de ahí no cambia aunque se edite un expediente."],
  [/^reabrir\b/, "Reabre una liquidación cerrada para poder recalcularla."],
  [/^ver\b|^detalle\b|^abrir\b/, "Muestra el detalle."],
  [/^imprimir$/, "Abre la vista de impresión."],
  [/^seleccionar\b/, "Elige este elemento."],
  [/^mostrar\b|^ocultar\b/, "Muestra u oculta este elemento de la pantalla."],
  [/^siguiente$|^anterior$|^primera$|^ultima$/, "Cambia de página."],

  // Expedientes y clientes
  [/^expediente$|^n expediente$|^id$/, "Número interno del expediente."],
  [/^matricula/, "Matrícula del vehículo. Es la clave para cruzar el expediente con la rejilla de comisiones."],
  [/^bastidor|^vin\b/, "Número de bastidor (VIN) de 17 caracteres."],
  [/^vendedor|^comercial/, "Persona que gestiona la venta y cobra la comisión."],
  [/^cliente$|^nombre completo|^nombre$/, "Nombre completo del cliente."],
  [/^dni|^nif|^nie/, "Documento de identidad. Puedes rellenarlo leyendo la foto del DNI."],
  [/^telefono/, "Teléfono de contacto."],
  [/^email$|^correo/, "Correo electrónico."],
  [/^fecha de nacimiento/, "Fecha de nacimiento del cliente."],
  [/^marca modelo$|^vehiculo$/, "Marca y modelo del vehículo."],
  [/^marca$/, "Marca del vehículo."],
  [/^modelo$/, "Modelo del vehículo."],
  [/^tienda/, "Tienda o punto de venta."],
  [/^t venta$|^tipo venta$|^tipo de pago$|^metodo de venta$|^forma de pago$|^pago$/, "Forma de pago de la venta: contado, crédito o preference."],
  [/^estado vehiculo$/, "Estado del vehículo: nuevo, demo, KM0, buyback o usado."],
  [/^f exp$|^fecha expediente$|^pedido$/, "Fecha del pedido o apertura del expediente."],
  [/^f afect$|^afectacion$/, "Fecha de afectación del vehículo al cliente."],
  [/^f mat$|^matriculacion$|^matriculados$/, "Fecha de matriculación."],
  [/^f rci$|^rci$/, "Fecha de aprobación de la financiación (RCI)."],
  [/^f entrega$|^entrega$/, "Fecha de entrega del vehículo al cliente."],
  [/^fecha de cobrado$|^se cobra en$|^cobro$/, "Mes en el que se cobra la comisión de este expediente."],
  [/^financiacion$/, "Importe o tipo de financiación."],
  [/^contacto$/, "Teléfono y correo del cliente."],
  [/^visibilidad columnas$/, "Elige qué columnas se ven en la tabla."],
  [/^ocultar entregados$/, "Oculta los expedientes ya entregados."],

  // Comisiones
  [/^puntos/, "Puntos del mes: según ellos se calcula el tramo de comisión."],
  [/^objetivo/, "Objetivo de puntos del mes."],
  [/^tramo/, "Tramo de comisión alcanzado respecto al objetivo X."],
  [/^bruto$/, "Comisión antes de penalizaciones."],
  [/^neto$|^comision neta$/, "Comisión final tras penalizaciones."],
  [/^penalizacion/, "Importe que se resta si no se cumple el mínimo del plan."],
  [/^diferencia/, "Diferencia entre dos valores (cálculo nuevo, liquidación antigua o lo pagado)."],
  [/^importe/, "Importe en euros."],
  [/^concepto$|^descripcion$/, "Texto que describe el importe o el movimiento."],
  [/^plan$/, "Plan de comisiones al que pertenece."],
  [/^mes$|^periodo$|^mes de la liquidacion$/, "Mes al que se refiere."],
  [/^evento$/, "Hecho que genera la comisión: pedido, afectación, matriculación, crédito, preference o cobro."],
  [/^regla$/, "Regla de comisión del plan."],
  [/^tasa/, "Tasa de intervención o de financiación aplicada."],
  [/^minimo/, "Número mínimo de unidades para que se aplique."],
  [/^arrastre/, "Puntos que pasan del mes anterior."],
  [/^nomina/, "Comisión prevista para cobrar en nómina."],
  [/^pendiente de cobro$|^pendientes del plan$/, "Comisiones que todavía no se han cobrado."],
  [/^columna /, "Columna del archivo que contiene este dato."],
  [/^fila de cabeceras$/, "Fila del archivo donde están los títulos de las columnas."],
  [/^hoja$/, "Hoja del Excel que se va a leer."],

  // Seguridad / usuarios
  [/^correo electronico acceso|^contrasena$|^tu contrasena$/, "Credenciales de acceso a la aplicación."],
  [/^nueva contrasena|^repite la nueva contrasena/, "Mínimo 12 caracteres y no demasiado fácil de adivinar."],
  [/^codigo/, "Código de 6 dígitos de tu aplicación de autenticación, o un código de recuperación."],
  [/^rol|^administrador$|^director$|^jefe zona$/, "Rol: define qué puede ver y hacer la persona en la aplicación."],
  [/^tipo de vendedor/, "Vendedor VN, VO o ambos; decide qué comisiones se le calculan."],
  [/^patron de comisionamiento vo/, "Escala de importes por unidad vendida de usados."],

  // Copias
  [/^sha 256$/, "Huella del archivo: sirve para comprobar que la copia no está dañada."],
  [/^diarias$|^semanales$|^mensuales$/, "Cuántas copias de este tipo se conservan antes de borrar las más antiguas."],
  [/^drive$/, "Estado de la copia en Google Drive."],
  [/^hora$/, "Hora a la que se hace la copia automática."],
  [/^tamano$/, "Tamaño del archivo."],
  [/^acciones?$/, "Acciones disponibles para esta fila."],
];

/** Ayuda para un texto visible, o null si no hay ninguna. */
export function ayudaPara(texto: string): string | null {
  const t = normalizarTexto(texto);
  if (t.length < 2 || t.length > 80) return null;
  for (const [re, ayuda] of AYUDAS) if (re.test(t)) return ayuda;
  return null;
}
