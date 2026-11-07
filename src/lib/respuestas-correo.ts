/** Interpretación de las respuestas a los correos a clientes potenciales (función pura). */

const sinAcentos = (t: string): string =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Lo que ha escrito la persona, sin el texto citado de nuestro correo: corta en la primera línea que empieza por «>», en «El … escribió:»,
 * «On … wrote:», «De: …» o «-----Mensaje original-----».
 */
export function textoNuevo(texto: string): string {
  const lineas = texto.replace(/\r/g, "").split("\n");
  const fin = lineas.findIndex((l, i) => {
    const t = l.trim();
    // «El jue, 5 nov 2026 a las 12:00, Nombre <correo> escribió:» puede venir partido en dos o tres líneas
    const cabecera = [
      t,
      `${t} ${(lineas[i + 1] ?? "").trim()}`,
      `${t} ${(lineas[i + 1] ?? "").trim()} ${(lineas[i + 2] ?? "").trim()}`,
    ];
    if (
      cabecera.some(
        (c) =>
          /^(El|On)\s.{3,200}(escribi[óo]|wrote)\s*:\s*$/i.test(c.trim()) &&
          /\d{1,2}:\d{2}|\d{4}/.test(c),
      )
    )
      return true;
    return (
      /^>/.test(t) ||
      /^(El|On)\s.+(escribi[óo]|wrote)\s*:?\s*$/i.test(t) ||
      /^-{2,}\s*(Mensaje original|Original Message|Forwarded)/i.test(t) ||
      /^(De|From):\s.+@/i.test(t) ||
      /^_{5,}$/.test(t)
    );
  });
  return (fin >= 0 ? lineas.slice(0, fin) : lineas).join("\n").trim();
}

/**
 * ¿Pide la baja? Sí si lo único que escribe es «baja», o si usa una frase clara («dame de baja», «no quiero recibir más», «unsubscribe»), o si
 * pone BAJA en mayúsculas al principio. Otras frases que contienen «baja» (por ejemplo, «tengo que dar de baja mi coche») no cuentan.
 */
export function pideLaBaja(texto: string): boolean {
  const nuevo = textoNuevo(texto);
  const plano = sinAcentos(nuevo).toLowerCase().replace(/\s+/g, " ").trim();
  if (!plano) return false;
  if (/^(por favor,? )?(baja|b a j a|bajaaa*)[\s.!¡]*$/.test(plano))
    return true;
  if (
    /\b(dar(me|nos)? de baja|dame de baja|damos de baja|quiero (la )?baja|solicito (la )?baja|quiero causar baja|baja de (sus |estas |estos )?(correos|mensajes|comunicaciones|lista)|(cancelar|anular) (la )?suscripcion)\b/.test(
      plano,
    ) &&
    !/\b(coche|vehiculo|seguro|linea|telefono|contrato)\b.{0,25}\bde baja|\bde baja (mi|el|la|un|una|mi)\b/.test(
      plano.replace(
        /dar(me|nos)? de baja (mi|el|la)\s+(coche|vehiculo|seguro|linea|telefono|contrato)/g,
        "",
      ),
    )
  ) {
    // «dar de baja mi coche» no es pedir la baja de los correos
    if (
      !/dar(me|nos)? de baja (mi|el|la|un|una)\s+(coche|vehiculo|seguro|linea|telefono|contrato|moto)/.test(
        plano,
      )
    )
      return true;
  }
  if (
    /\b(no (quiero|deseo|necesito) (recibir|que me (escribais|escribas|envieis|envies|mandeis|mandes))|no me (escribais|escribas|envieis|envies|mandeis|mandes) mas|dejad de (escribirme|enviarme|mandarme)|deja de (escribirme|enviarme|mandarme)|unsubscribe|remove me)\b/.test(
      plano,
    )
  )
    return true;
  // BAJA en mayúsculas en las primeras líneas («BAJA», «Hola, BAJA»)
  return nuevo
    .split("\n")
    .slice(0, 3)
    .some((l) => /(^|[\s,.:;!¡])BAJA([\s,.:;!¡]|$)/.test(sinAcentos(l)));
}

/** Recorta un texto para guardarlo como extracto. */
export const extracto = (texto: string, max = 400): string => {
  const t = textoNuevo(texto).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};
