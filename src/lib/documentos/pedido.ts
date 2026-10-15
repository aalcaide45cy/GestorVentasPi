import { matriculasEnTexto } from "@/lib/rejilla/analizar";
import { buscarDniEnTexto } from "./dni";

/**
 * Extracción de datos de un pedido (orden de compra del concesionario) a partir de su texto.
 * Es una lectura genérica por patrones y etiquetas: bastidor (17 caracteres), matrícula, DNI/NIE, fechas rotuladas,
 * modelo y forma de pago comparados con los catálogos de la aplicación. [P] Hay que afinarla con un pedido real.
 */

export interface CatalogoPedido {
  modelos: { id: number; nombre: string; marca: string | null }[];
  tiposVenta: { id: number; nombre: string; categoria: string }[];
}

export interface DatosPedido {
  vin: string | null;
  matricula: string | null;
  dni: string | null;
  cliente: string | null;
  fechaExpediente: string | null;
  fechaEntrega: string | null;
  fechaMatriculacion: string | null;
  idModelo: number | null;
  modeloTexto: string | null;
  idTipoDeVenta: number | null;
  avisos: string[];
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

function aIso(d: string, m: string, a: string): string | null {
  const dd = Number(d);
  const mm = Number(m);
  let aa = Number(a);
  if (aa < 100) aa += 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || aa < 1990 || aa > 2100) return null;
  return `${aa}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Primera fecha que aparece en la línea de la etiqueta o en la siguiente. */
function fechaTrasEtiqueta(lineas: string[], etiqueta: RegExp): string | null {
  for (let i = 0; i < lineas.length; i++) {
    if (!etiqueta.test(sinAcentos(lineas[i]))) continue;
    for (const l of [lineas[i], lineas[i + 1] ?? ""]) {
      const m = l.match(/(\d{1,2})[\s./-](\d{1,2})[\s./-](\d{2,4})/);
      if (m) {
        const f = aIso(m[1], m[2], m[3]);
        if (f) return f;
      }
    }
  }
  return null;
}

export function parsearPedido(texto: string, catalogo: CatalogoPedido): DatosPedido {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const mayus = sinAcentos(texto);
  const avisos: string[] = [];

  // Bastidor: 17 caracteres alfanuméricos sin I, O ni Q (el OCR confunde O/0 e I/1: se corrigen)
  let vin: string | null = null;
  for (const m of mayus.matchAll(/(?<![A-Z0-9])([A-Z0-9]{17})(?![A-Z0-9])/g)) {
    const c = m[1].replace(/O/g, "0").replace(/I/g, "1").replace(/Q/g, "0");
    if (/\d/.test(c) && /[A-Z]/.test(c)) {
      vin = c;
      break;
    }
  }

  const matricula = lineas.flatMap((l) => (/\b[A-HJ-NP-Z0-9]{17}\b/i.test(l) ? [] : matriculasEnTexto(l)))[0] ?? null;

  const dni = buscarDniEnTexto(mayus)?.dni ?? null;

  let cliente: string | null = null;
  const i = lineas.findIndex((l) => /^(CLIENTE|TITULAR|COMPRADOR|NOMBRE Y APELLIDOS|NOMBRE)\b/i.test(sinAcentos(l)));
  if (i >= 0) {
    const mismo = lineas[i].replace(/^[^:]*:\s*/, "");
    const cand = mismo !== lineas[i] ? mismo : lineas[i + 1];
    if (cand && /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'. -]{4,}$/.test(cand)) cliente = cand.replace(/\s+/g, " ").trim();
  }

  const fechaExpediente = fechaTrasEtiqueta(lineas, /FECHA\s*(DE\s*)?(PEDIDO|ORDEN|CONTRATO|EXPEDIENTE)|^FECHA\b/);
  const fechaEntrega = fechaTrasEtiqueta(lineas, /ENTREGA/);
  const fechaMatriculacion = fechaTrasEtiqueta(lineas, /MATRICULACION/);

  // Modelo: el nombre de catálogo más largo que aparece en el texto (preferiblemente junto a su marca)
  const candidatos = catalogo.modelos
    .filter((m) => m.nombre.trim().length >= 2 && new RegExp(`(?<![A-Z0-9])${sinAcentos(m.nombre).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Z0-9])`).test(mayus))
    .sort((a, b) => b.nombre.length - a.nombre.length);
  const conMarca = candidatos.find((m) => m.marca && mayus.includes(sinAcentos(m.marca)));
  const modelo = conMarca ?? candidatos[0] ?? null;
  if (candidatos.length > 1 && !conMarca) avisos.push("Aparecen varios modelos del catálogo en el pedido: comprueba el elegido.");

  // Forma de pago por palabras clave
  let idTipoDeVenta: number | null = null;
  const porCategoria = (cat: string) => catalogo.tiposVenta.find((t) => t.categoria === cat)?.id ?? null;
  if (/RENTING|ARRENDAMIENTO/.test(mayus)) idTipoDeVenta = porCategoria("RENTING");
  else if (/PREFERENCE/.test(mayus)) idTipoDeVenta = porCategoria("PREFERENCE");
  else if (/FINANCIA|CREDITO|PRESTAMO|\bRCI\b/.test(mayus)) idTipoDeVenta = porCategoria("CREDITO");
  else if (/CONTADO|TRANSFERENCIA/.test(mayus)) idTipoDeVenta = porCategoria("CONTADO");
  const porNombre = catalogo.tiposVenta.find((t) => t.nombre.length >= 4 && mayus.includes(sinAcentos(t.nombre)));
  if (porNombre) idTipoDeVenta = porNombre.id;

  if (!vin && !matricula && !dni && !modelo) avisos.push("No se ha reconocido ningún dato útil en el documento.");
  else avisos.push("Lectura automática: comprueba cada dato antes de guardar.");

  return { vin, matricula, dni, cliente, fechaExpediente, fechaEntrega, fechaMatriculacion, idModelo: modelo?.id ?? null, modeloTexto: modelo?.nombre ?? null, idTipoDeVenta, avisos };
}
