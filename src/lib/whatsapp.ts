/** Mensaje de WhatsApp al cliente con los datos de su vehículo y de la entrega (funciones puras). */

export const CLAVE_PLANTILLA_WHATSAPP = "exp-whatsapp-plantilla";
/** Con qué «campo» se guarda el color del botón (misma tabla que los sobres de las fechas). */
export const CAMPO_WHATSAPP = "whatsapp";

export const PLANTILLA_WHATSAPP = `Estimad@ {nombre},

• Le remito datos de su vehículo
    ◦ Matrícula: {matricula}
    ◦ Fecha de Matrícula: {fecha_matricula}
    ◦ Bastidor: {bastidor}
• La entrega la tenemos prevista para:
    ◦ Día: {dia}
    ◦ Hora: {hora}
    ◦ Rogamos máxima puntualidad.
[retoma]
• En el caso de entregar un vehículo como forma de pago, deberá traer la siguiente documentación del vehículo:
    ◦ Los 2 juegos de llaves
    ◦ El permiso de circulación
    ◦ Ficha técnica e impuesto municipal del año vigente
    ◦ El libro de mantenimiento y garantía
    ◦ Facturas de los últimos mantenimientos o reparaciones
    ◦ El manual de uso
    ◦ ITV
    ◦ Anote los kilómetros con los que nos entrega el vehículo
    ◦ Si se financió el vehículo, aportar documento del levantamiento de la reserva de dominio
[/retoma]`;

export interface DatosWhatsapp {
  nombre: string;
  matricula: string;
  fecha_matricula: string;
  bastidor: string;
  dia: string;
  hora: string;
}

const NOMBRES: Record<keyof DatosWhatsapp, string> = {
  nombre: "nombre del cliente",
  matricula: "matrícula",
  fecha_matricula: "fecha de matrícula",
  bastidor: "bastidor",
  dia: "día de entrega",
  hora: "hora de entrega",
};

/**
 * Rellena la plantilla. La línea de un dato que falta se quita (y se devuelve en `faltan`), y lo que va entre [retoma] y [/retoma]
 * solo sale si el cliente entrega un vehículo.
 */
export function redactarWhatsapp(plantilla: string, datos: DatosWhatsapp, conRetoma: boolean): { texto: string; faltan: string[] } {
  const faltan = new Set<string>();
  const base = plantilla.replace(/\r/g, "").replace(/\[retoma\]\n?([\s\S]*?)\[\/retoma\]\n?/g, (_t, dentro: string) => (conRetoma ? dentro : ""));
  const lineas = base.split("\n").flatMap((linea) => {
    let vacia = false;
    const nueva = linea.replace(/\{(\w+)\}/g, (texto, clave: string) => {
      if (!(clave in NOMBRES)) return texto;
      const valor = datos[clave as keyof DatosWhatsapp].trim();
      if (!valor) {
        vacia = true;
        faltan.add(NOMBRES[clave as keyof DatosWhatsapp]);
      }
      return valor;
    });
    return vacia ? [] : [nueva];
  });
  return { texto: lineas.join("\n").trim(), faltan: [...faltan] };
}

/** Número tal como lo pide WhatsApp (solo cifras y con prefijo; un número español de 9 cifras recibe el 34). Vacío si no es un móvil utilizable. */
export function numeroWhatsapp(telefono: string): string {
  let n = telefono.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.length === 9) return /^[67]/.test(n) ? `34${n}` : "";
  return n.length >= 10 && n.length <= 15 ? n : "";
}

export const enlaceWhatsapp = (numero: string, texto: string): string => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
