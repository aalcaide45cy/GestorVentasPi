"use client";

import { useEffect } from "react";

/**
 * Ayuda emergente de reserva para TODOS los botones y enlaces de la aplicación: cuando se pasa el ratón (o se enfoca con el
 * teclado) por uno que todavía no explica nada, se le pone un texto que dice para qué sirve. Los botones que ya tienen su propio
 * `title` o `aria-label` no se tocan. Las explicaciones son frases hechas para los textos más habituales y reglas por verbo.
 */

const EXACTAS: Record<string, string> = {
  "cerrar sesión": "Sale de la aplicación y vuelve a la pantalla de acceso.",
  dashboard: "Panel principal con tus cifras del mes.",
  expedientes: "Lista y gestión de los expedientes (ventas).",
  clientes: "Base de clientes y su historial de ventas.",
  configuración: "Ajustes, catálogos, usuarios y copias de seguridad.",
  comisiones: "Planes de comisionamiento, liquidaciones y control de cobros.",
  "cotejo de pagos": "Compara lo que paga la empresa con lo que calcula la aplicación.",
  informes: "Informes y estadísticas de ventas.",
  "log importación": "Registro de las importaciones de datos.",
  "ver todos": "Abre la lista completa.",
  "nuevo expediente": "Crea un expediente de venta nuevo.",
  "limpiar filtros": "Quita todos los filtros y búsquedas de la lista.",
  "mes anterior": "Va al mes anterior.",
  "mes actual": "Vuelve al mes en curso.",
  "mes siguiente": "Va al mes siguiente.",
  "ver desglose": "Despliega el detalle de cómo sale esta cifra, expediente a expediente.",
  "ocultar desglose": "Recoge el detalle.",
  plegar: "Recoge este panel para ahorrar espacio.",
  desplegar: "Abre este panel.",
  cancelar: "Cierra esta ventana sin cambiar nada.",
  cerrar: "Cierra esta ventana.",
  aceptar: "Confirma y cierra la ventana.",
  guardar: "Guarda los cambios.",
  listo: "Cierra la ventana: los cambios ya están aplicados.",
  quitar: "Quita este elemento de la lista (no se guarda hasta que guardes).",
  editar: "Modifica este elemento.",
  eliminar: "Elimina este elemento (te pedirá confirmación).",
  duplicar: "Crea una copia de este elemento.",
  abrir: "Abre este elemento para verlo o editarlo.",
  volver: "Vuelve a la pantalla anterior.",
  restablecer: "Vuelve a los valores originales.",
  "elegir archivo": "Elige un archivo de tu equipo.",
  siguiente: "Va a la página siguiente.",
  anterior: "Va a la página anterior.",
  "subir rejillas (pdf o foto)": "Sube las hojas de comisiones de la empresa para cotejarlas con tus cálculos.",
  "subir listados (excel)": "Sube un listado en Excel para cotejarlo con tus expedientes.",
  "exportar (csv)": "Descarga los datos en un archivo CSV que se abre con Excel.",
  "importar csv": "Carga datos desde un archivo CSV exportado antes.",
  "+ registrar nuevo cliente": "Da de alta un cliente nuevo.",
  "+ nuevo plan": "Crea un plan de comisionamiento nuevo.",
  "+ registrar nuevo usuario": "Da de alta un usuario nuevo.",
  "resumen": "Datos generales del plan: tramos, puntos por pedido y estado.",
  "objetivo": "Objetivo de cada vendedor, tasas de intervención y promociones de puntos.",
  vn: "Tarifas de coches nuevos por modelo y tramo.",
  "usados / vo": "Tarifas y patrones para vehículos de ocasión.",
  "financ/reglas": "Incentivos de financiación, reglas de Preference y reglas generales.",
  bonus: "Bonus del plan.",
  penalizaciones: "Penalizaciones del plan.",
  liquidación: "Calcula y guarda la liquidación mensual de este plan.",
  notas: "Notas y comisiones pendientes de arrastrar.",
};

const REGLAS: [RegExp, string | ((m: RegExpExecArray) => string)][] = [
  [/^(10|20|50|100|200|500|1000)$/, (m) => `Muestra ${m[1]} filas por página.`],
  [/^\d+ venta\(s\)$/, () => "Muestra las ventas de este cliente."],
  [/^[▾▸] /, () => "Despliega o recoge esta sección."],
  [/^\+ ?(nuev[oa]s?|añadir|agregar)/, () => "Añade un elemento nuevo a esta lista."],
  [/^(guardar|actualizar)/, () => "Guarda los cambios."],
  [/^(eliminar|borrar)/, () => "Elimina lo indicado (te pedirá confirmación)."],
  [/^(editar|modificar|renombrar)/, () => "Modifica este elemento."],
  [/^(cancelar|descartar)/, () => "Cierra sin aplicar ningún cambio."],
  [/^(cerrar|volver|salir)/, () => "Cierra o vuelve a la pantalla anterior."],
  [/^sí[,.]/, () => "Confirma y ejecuta la acción que describe la ventana."],
  [/^(descargar|exportar)/, () => "Descarga un archivo con estos datos; no cambia nada en la aplicación."],
  [/^(importar|subir|cargar)/, () => "Carga datos desde un archivo de tu equipo. Verás qué cambia antes de aplicarlo."],
  [/^(restaurar|recuperar)/, () => "Vuelve a un estado guardado antes (verás qué cambia antes de aplicarlo)."],
  [/^(copiar|pegar)/, () => "Copia o pega estos valores."],
  [/^(buscar|filtrar)/, () => "Busca o filtra la lista."],
  [/^(crear|nuevo|nueva)/, () => "Crea un elemento nuevo."],
  [/^(mostrar|ver)/, () => "Muestra más información."],
  [/^(ocultar)/, () => "Oculta esta información."],
  [/^(aplicar)/, () => "Aplica lo elegido. Se ve antes lo que cambia."],
  [/^(probar|calcular|recalcular)/, () => "Calcula el resultado con los datos actuales."],
];

/** Texto sin emojis ni símbolos de adorno al principio, en minúsculas y con los espacios normalizados. */
function limpiar(texto: string): string {
  return texto
    .replace(/^[^\p{L}\p{N}+▾▸←→]+/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function ayudaPara(textoBoton: string): string | null {
  const t = limpiar(textoBoton);
  if (t.length < 2) return null;
  if (EXACTAS[t]) return EXACTAS[t];
  for (const [re, ayuda] of REGLAS) {
    const m = re.exec(t);
    if (m) return typeof ayuda === "function" ? ayuda(m) : ayuda;
  }
  return `Pulsa para: ${textoBoton.replace(/\s+/g, " ").trim()}`;
}

const SELECTOR = "button, a.btn, nav a, aside a, label.btn, summary, [role='tab'], [role='button']";

export default function AyudaBotones() {
  useEffect(() => {
    const poner = (e: Event) => {
      const origen = e.target instanceof Element ? e.target : null;
      const el = origen?.closest(SELECTOR);
      if (!el || el.getAttribute("title") || el.getAttribute("aria-label")) return;
      // Si algo que lo contiene ya explica (por ejemplo, una etiqueta con ayuda), no se pisa
      if (el.parentElement?.closest("[title]")) return;
      const ayuda = ayudaPara((el as HTMLElement).innerText ?? el.textContent ?? "");
      if (ayuda) el.setAttribute("title", ayuda);
    };
    document.addEventListener("pointerover", poner, true);
    document.addEventListener("focusin", poner, true);
    return () => {
      document.removeEventListener("pointerover", poner, true);
      document.removeEventListener("focusin", poner, true);
    };
  }, []);
  return null;
}
