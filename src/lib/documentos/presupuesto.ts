/**
 * Lectura de un presupuesto de Renault/Dacia («INFORMACIÓN DE VEHÍCULO NUEVO»): del texto del PDF (o del OCR) saca el cliente, el contacto, el
 * vehículo ofertado y el importe. Función pura: no toca la base de datos. Lo que no sea un presupuesto se descarta (`esPresupuesto: false`).
 */

const sinAcentos = (t: string): string =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export interface DatosPresupuesto {
  esPresupuesto: boolean;
  /** Número del presupuesto («7639-00»). */
  numero: string | null;
  /** Referencia que acompaña al número, si la hay. */
  referencia: string | null;
  /** Fecha (AAAA-MM-DD) y hora (HH:MM) en que se hizo. */
  fecha: string | null;
  hora: string | null;
  cliente: string;
  telefono: string;
  email: string;
  poblacion: string;
  provincia: string;
  codigoPostal: string;
  /** Marca y modelo tal como salen en el presupuesto, para casarlos con el catálogo. */
  modeloTexto: string;
  color: string;
  /** Total a pagar, en céntimos. */
  totalCentimos: number | null;
  /** Vendedor que lo hizo, si sale en el documento. */
  vendedor: string;
  avisos: string[];
}

const MESES: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

/** «21.189,17» → 2118917. */
export function aCentimos(texto: string): number | null {
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const TELEFONO = /^(?:\+?34\s?)?([6-9]\d{2}[\s.]?\d{3}[\s.]?\d{3})$/;

export function parsearPresupuesto(texto: string): DatosPresupuesto {
  const vacio: DatosPresupuesto = {
    esPresupuesto: false,
    numero: null,
    referencia: null,
    fecha: null,
    hora: null,
    cliente: "",
    telefono: "",
    email: "",
    poblacion: "",
    provincia: "",
    codigoPostal: "",
    modeloTexto: "",
    color: "",
    totalCentimos: null,
    vendedor: "",
    avisos: [],
  };
  const lineas = texto.split(/\r?\n/).map((l) => l.replace(/\s+$/g, ""));
  const plano = sinAcentos(texto);
  // Solo es un presupuesto lo que lleva el título y el resumen de precios; cualquier otro papel se descarta
  if (
    !plano.includes("INFORMACION DE VEHICULO NUEVO") ||
    !/RESUMEN/.test(plano) ||
    !/TOTAL A PAGAR|TOTAL VEHICULO/.test(plano)
  )
    return vacio;
  const r: DatosPresupuesto = { ...vacio, esPresupuesto: true };

  // «Viernes, 06 Noviembre 2026 / 11:56 hs - 7639-00 - dnt - REFERENCIA»
  const cab = lineas.find((l) =>
    /\d{1,2}\s+[A-Za-zÁÉÍÓÚáéíóúñ]+\s+\d{4}\s*\/\s*\d{1,2}:\d{2}\s*hs/i.test(l),
  );
  if (cab) {
    const m =
      /(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóúñ]+)\s+(\d{4})\s*\/\s*(\d{1,2}):(\d{2})\s*hs\s*-\s*(\d{3,5}-\d{2})(?:\s*-\s*[A-Za-z]+\s*-\s*(\S+))?/i.exec(
        cab,
      );
    if (m) {
      const mes = MESES[sinAcentos(m[2])];
      if (mes)
        r.fecha = `${m[3]}-${String(mes).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
      r.hora = `${String(Number(m[4])).padStart(2, "0")}:${m[5]}`;
      r.numero = m[6];
      r.referencia = m[7] ?? null;
    }
  }
  if (!r.numero)
    r.avisos.push("No se ha podido leer el número del presupuesto.");
  if (!r.fecha) r.avisos.push("No se ha podido leer la fecha del presupuesto.");

  // Bloque del cliente: lo que hay a la izquierda (antes de dos espacios) bajo «CLIENTE   ESTABLECIMIENTO…» y hasta «Tel.:»
  const iCli = lineas.findIndex((l) =>
    /^CLIENTE\s+ESTABLECIMIENTO/i.test(sinAcentos(l)),
  );
  if (iCli >= 0) {
    const fin = lineas.findIndex(
      (l, i) => i > iCli && /^Tel\.?:/i.test(l.trim()),
    );
    const bloque = lineas
      .slice(iCli + 1, fin > iCli ? fin : iCli + 8)
      .map((l) => l.split(/\s{2,}/)[0].trim())
      .filter(Boolean);
    for (const [i, izq] of bloque.entries()) {
      const correo = EMAIL.exec(izq);
      const tel = TELEFONO.exec(izq.replace(/\s+/g, " ").trim());
      const lugar = /^(.+?),\s*(.+?)\s*\((\d{5})\)/.exec(izq);
      if (correo && !r.email) r.email = correo[0].toLowerCase();
      else if (tel && !r.telefono) r.telefono = tel[1].replace(/\D/g, "");
      else if (lugar && !r.poblacion) {
        r.poblacion = lugar[1].trim();
        r.provincia = lugar[2].trim();
        r.codigoPostal = lugar[3];
      } else if (i === 0 && !r.cliente)
        r.cliente = izq
          .replace(/^(?:Sr\.?|Sra\.?|Srta\.?)\s*/i, "")
          .replace(/^(?:Don|Doña|Dña\.?|D\.|Dª)\s+/i, "")
          .trim();
    }
  }
  if (!r.cliente) {
    const linea = lineas.find((l) => /^Estimad[oa]\s/i.test(l.trim())) ?? "";
    const e =
      /Estimad[oa]\s+(?:Sr\.?|Sra\.?|Srta\.?)?\s*(?:Don|Doña|Dña\.?)?\s*(.+)$/i.exec(
        linea.trim(),
      );
    if (e) r.cliente = e[1].trim();
  }
  if (!r.cliente) r.avisos.push("No se ha podido leer el nombre del cliente.");
  if (!r.email && !r.telefono)
    r.avisos.push("El presupuesto no trae correo ni teléfono del cliente.");

  // Vendedor: la línea del nombre bajo el horario del concesionario, antes de su correo corporativo
  const iVend = lineas.findIndex((l) => /^Sábado:/i.test(l.trim()));
  if (iVend >= 0 && lineas[iVend + 1] && !EMAIL.test(lineas[iVend + 1]))
    r.vendedor = lineas[iVend + 1].trim();

  // Vehículo: «Modelo:  MARCA Modelo versión códigos   21.189,17 €»
  const mod = lineas.find((l) => /^Modelo:/i.test(l.trim()));
  if (mod) {
    r.modeloTexto = mod
      .replace(/^\s*Modelo:\s*/i, "")
      .replace(/\s+-?[\d.]+,\d{2}\s*€\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (!r.modeloTexto)
    r.avisos.push("No se ha podido leer el modelo del presupuesto.");
  const col = lineas.find((l) => /^Color:/i.test(l.trim()));
  if (col) {
    r.color = col
      .replace(/^\s*Color:\s*/i, "")
      .replace(/\s+-?[\d.]+,\d{2}\s*€\s*$/, "")
      .replace(/\s+[A-Z0-9]{2,4}\s*$/, "")
      .trim();
  }

  const tot = /TOTAL A PAGAR\s+([\d.]+,\d{2})\s*€/i.exec(texto);
  if (tot) r.totalCentimos = aCentimos(tot[1]);
  return r;
}
