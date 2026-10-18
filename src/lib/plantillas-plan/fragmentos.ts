import { renumerarOrden } from "@/lib/plantillas-tarifas/orden";
import type { PlanEditable } from "@/lib/servicios/planes";
import type { Fragmento } from "./esquema-fragmento";

export type { Fragmento } from "./esquema-fragmento";

/**
 * Plantillas de partes de un plan de comisionamiento (por pestaña y del plan entero).
 * Un «fragmento» es esa parte del plan con marcas, modelos y vendedores por NOMBRE (no por número), así sirve para cualquier
 * plan e instalación. Este módulo es puro: lo usan el servidor (validar) y la pantalla (extraer del plan y aplicar al plan).
 */

export const AMBITOS = ["global", "resumen", "objetivo", "usados", "reglas", "bonus", "penalizaciones", "notas"] as const;
export type Ambito = (typeof AMBITOS)[number];

export const COMPONENTES = ["resumen", "vendedores", "tasas", "promociones", "puntosModelo", "tarifasVN", "opcionesUsados", "usados", "patrones", "financiacion", "preference", "reglas", "bonus", "penalizacion", "notas"] as const;
export type Componente = (typeof COMPONENTES)[number];

export const TITULO_AMBITO: Record<Ambito, string> = {
  global: "Plan completo",
  resumen: "Resumen",
  objetivo: "Objetivo",
  usados: "Usados / VO",
  reglas: "Financiación y reglas",
  bonus: "Bonus",
  penalizaciones: "Penalizaciones",
  notas: "Notas",
};

export const INFO_COMPONENTE: Record<Componente, { titulo: string; ayuda: string }> = {
  resumen: { titulo: "Tramos y puntos por pedido", ayuda: "Tramo mínimo y máximo y puntos por pedido." },
  vendedores: { titulo: "Objetivos de los vendedores", ayuda: "Objetivo X y arrastre de cada vendedor (se buscan por nombre)." },
  tasas: { titulo: "Tasa de intervención (marcas, global y usados)", ayuda: "Tipo de tasa, objetivo y puntos por defecto de cada marca, y el objetivo de la tasa global y la de usados." },
  promociones: { titulo: "Promociones de puntos", ayuda: "Puntos especiales según unidades vendidas." },
  puntosModelo: { titulo: "Puntos por modelo", ayuda: "Puntos que da cada modelo (se buscan por marca y modelo)." },
  tarifasVN: { titulo: "Tarifas VN por tramo", ayuda: "Importes por modelo y tramo. Los modelos que no existan en tu catálogo se omiten (usa VN › Plantillas para crearlos)." },
  opcionesUsados: { titulo: "Cómo cuentan los usados", ayuda: "Fecha que hace contar a un usado y si suma puntos (y cuántos)." },
  usados: { titulo: "Tarifas de usados", ayuda: "Importes por subtipo de vehículo de ocasión." },
  patrones: { titulo: "Patrones VO por tramos", ayuda: "Escalas de importes según unidades vendidas." },
  financiacion: { titulo: "Incentivos de financiación", ayuda: "Importe por marca y tipo de financiación." },
  preference: { titulo: "Reglas de Preference", ayuda: "Reglas de Preference por marca o modelo." },
  reglas: { titulo: "Reglas", ayuda: "Reglas que suman o restan puntos o importes." },
  bonus: { titulo: "Bonus", ayuda: "Bonus del plan." },
  penalizacion: { titulo: "Penalización global", ayuda: "Importe, título y descripción de la penalización." },
  notas: { titulo: "Notas", ayuda: "Texto de las notas del plan." },
};

export const COMPONENTES_AMBITO: Record<Ambito, Componente[]> = {
  global: [...COMPONENTES],
  resumen: ["resumen"],
  objetivo: ["vendedores", "tasas", "promociones", "puntosModelo"],
  usados: ["opcionesUsados", "usados", "patrones"],
  reglas: ["financiacion", "preference", "reglas"],
  bonus: ["bonus"],
  penalizaciones: ["penalizacion"],
  notas: ["notas"],
};


export interface CatalogoNombres {
  marcas: { id: number; nombre: string }[];
  modelos: { id: number; nombre: string; marcaId: number | null }[];
  vendedores: { id: number; nombre: string }[];
}

const norm = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Cuántos elementos tiene un componente de un fragmento (1 para los de valor único). */
export function contarComponente(f: Fragmento, c: Componente): number {
  const v = f[c];
  if (v === undefined) return 0;
  return Array.isArray(v) ? v.length : 1;
}

/** Componentes que trae el fragmento. */
export const componentesDe = (f: Fragmento): Componente[] => COMPONENTES.filter((c) => contarComponente(f, c) > 0 || (c === "notas" && f.notas !== undefined));

/** Saca del plan las partes elegidas, con marcas, modelos y vendedores por nombre. Lo que no se puede nombrar (id ya borrado) se omite. */
export function extraer(plan: PlanEditable, cat: CatalogoNombres, comps: Componente[]): Fragmento {
  const marca = (id: number | null): string | null => (id === null ? null : (cat.marcas.find((m) => m.id === id)?.nombre ?? null));
  const modelo = (id: number | null): { marca: string; modelo: string } | null => {
    const m = id === null ? undefined : cat.modelos.find((x) => x.id === id);
    const mc = m ? marca(m.marcaId) : null;
    return m && mc ? { marca: mc, modelo: m.nombre } : null;
  };
  const f: Fragmento = {};
  const tiene = (c: Componente) => comps.includes(c);
  if (tiene("resumen")) f.resumen = { tramoMin: plan.tramoMin, tramoMax: plan.tramoMax, puntosPorPedido: plan.puntosPorPedido };
  if (tiene("vendedores")) f.vendedores = plan.vendedores.flatMap((v) => { const n = cat.vendedores.find((x) => x.id === v.idUsuario)?.nombre; return n ? [{ nombre: n, objetivoBase: v.objetivoBase, arrastre: v.arrastre }] : []; });
  if (tiene("tasas")) {
    f.tasas = plan.tasas.flatMap((t) => { const m = marca(t.idMarca); return m ? [{ marca: m, tipoTasa: t.tipoTasa, objetivo: t.objetivo, puntosDefecto: t.puntosDefecto }] : []; });
    f.tasasPlan = { tasaGlobalTipo: plan.tasaGlobalTipo, tasaGlobalObjetivo: plan.tasaGlobalObjetivo, tasaVoTipo: plan.tasaVoTipo, tasaVoObjetivo: plan.tasaVoObjetivo, tasaIncluyeVo: plan.tasaIncluyeVo };
  }
  if (tiene("promociones")) f.promociones = plan.promociones.map((p) => ({ nombre: p.nombre, puntosEspeciales: p.puntosEspeciales, minimoUnidades: p.minimoUnidades, puntosSiNoCumple: p.puntosSiNoCumple }));
  if (tiene("puntosModelo")) f.puntosModelo = plan.puntosModelo.flatMap((p) => { const m = modelo(p.idModelo); return m ? [{ ...m, puntos: p.puntos }] : []; });
  if (tiene("tarifasVN")) f.tarifasVN = plan.tarifasVN.flatMap((t) => { const m = modelo(t.idModelo); return m ? [{ ...m, tasaCumplida: t.tasaCumplida, importes: { ...t.importes }, activo: t.activo, orden: t.orden }] : []; });
  if (tiene("opcionesUsados")) f.opcionesUsados = { voPuntosModo: plan.voPuntosModo, voPuntos: plan.voPuntos };
  if (tiene("usados")) f.usados = plan.usados.map((u) => ({ ...u }));
  if (tiene("patrones")) f.patrones = plan.patrones.map((p) => ({ ...p, tiers: p.tiers.map((t) => ({ ...t })) }));
  if (tiene("financiacion")) f.financiacion = plan.financiacion.flatMap((x) => { const m = marca(x.idMarca); return m ? [{ marca: m, tipoFinanciacion: x.tipoFinanciacion, aplicaA: x.aplicaA, importe: x.importe, tasaIntervencion: x.tasaIntervencion, tasaAmbito: x.tasaAmbito }] : []; });
  if (tiene("preference")) f.preference = plan.preference.map((p) => { const mo = modelo(p.idModelo); return { nombre: p.nombre, marca: mo?.marca ?? marca(p.idMarca), modelo: mo?.modelo ?? null, tipoFinanciacion: p.tipoFinanciacion, aplicaA: p.aplicaA, importe: p.importe, activa: p.activa, tasaIntervencion: p.tasaIntervencion, tasaAmbito: p.tasaAmbito }; });
  const regla = (r: PlanEditable["reglas"][number]) => {
    const mo = modelo(r.idModelo);
    const { idMarca, idModelo, ...resto } = r;
    void idMarca;
    void idModelo;
    return { ...resto, marca: mo?.marca ?? marca(r.idMarca), modelo: mo?.modelo ?? null };
  };
  if (tiene("reglas")) f.reglas = plan.reglas.map(regla);
  if (tiene("bonus")) f.bonus = plan.bonus.map(regla);
  if (tiene("penalizacion")) f.penalizacion = { importe: plan.penalizacionImporte, titulo: plan.penalizacionTitulo, descripcion: plan.penalizacionDescripcion };
  if (tiene("notas")) f.notas = { texto: plan.notas };
  return f;
}

export type ModoAplicar = "reemplazar" | "completar";

export interface ResultadoComponente {
  componente: Componente;
  /** Elementos que se ponen en el plan. */
  aplicados: number;
  /** Elementos que ya estaban y no se tocan (modo «completar»). */
  yaEstaban: number;
  /** Elementos que no se pueden poner porque su marca, modelo o vendedor no existe en este catálogo. */
  sinReferencia: string[];
}

/**
 * Pone en el plan las partes elegidas de un fragmento. «reemplazar» sustituye lo que hay en esa parte; «completar» solo añade lo
 * que el plan todavía no tiene. Los valores únicos (tramos, penalización, notas) siempre se sustituyen. No toca nada más del plan.
 */
export function aplicar(plan: PlanEditable, f: Fragmento, cat: CatalogoNombres, comps: Componente[], modos: Partial<Record<Componente, ModoAplicar>>): { plan: PlanEditable; resultados: ResultadoComponente[] } {
  const marcaId = (n: string | null): number | null => (n === null ? null : (cat.marcas.find((m) => norm(m.nombre) === norm(n))?.id ?? null));
  const modeloId = (m: string | null, mo: string | null): number | null => {
    const idM = marcaId(m);
    return idM === null || mo === null ? null : (cat.modelos.find((x) => x.marcaId === idM && norm(x.nombre) === norm(mo))?.id ?? null);
  };
  const vendedorId = (n: string): number | null => cat.vendedores.find((v) => norm(v.nombre) === norm(n))?.id ?? null;
  let p: PlanEditable = { ...plan };
  const resultados: ResultadoComponente[] = [];

  /** Combina una lista según el modo, con una clave que identifica cada elemento. */
  function lista<T>(c: Componente, actual: T[], nuevos: { valor: T | null; etiqueta: string }[], clave: (x: T) => string): T[] {
    const modo = modos[c] ?? "reemplazar";
    const validos = nuevos.flatMap((n) => (n.valor === null ? [] : [n.valor]));
    const sinReferencia = nuevos.filter((n) => n.valor === null).map((n) => n.etiqueta);
    if (modo === "completar") {
      const claves = new Set(actual.map(clave));
      const añadir = validos.filter((x) => !claves.has(clave(x)));
      resultados.push({ componente: c, aplicados: añadir.length, yaEstaban: validos.length - añadir.length, sinReferencia });
      return [...actual, ...añadir];
    }
    resultados.push({ componente: c, aplicados: validos.length, yaEstaban: 0, sinReferencia });
    return validos;
  }
  const unico = (c: Componente) => resultados.push({ componente: c, aplicados: 1, yaEstaban: 0, sinReferencia: [] });
  const quiere = (c: Componente) => comps.includes(c) && f[c] !== undefined;

  if (quiere("resumen") && f.resumen) {
    p = { ...p, tramoMin: f.resumen.tramoMin, tramoMax: f.resumen.tramoMax, puntosPorPedido: f.resumen.puntosPorPedido };
    unico("resumen");
  }
  if (quiere("vendedores") && f.vendedores)
    p.vendedores = lista("vendedores", p.vendedores, f.vendedores.map((v) => { const id = vendedorId(v.nombre); return { valor: id === null ? null : { idUsuario: id, objetivoBase: v.objetivoBase, arrastre: v.arrastre }, etiqueta: `Vendedor «${v.nombre}»` }; }), (x) => String(x.idUsuario));
  if (quiere("tasas") && f.tasas)
    p.tasas = lista("tasas", p.tasas, f.tasas.map((t) => { const id = marcaId(t.marca); return { valor: id === null ? null : { idMarca: id, tipoTasa: t.tipoTasa, objetivo: t.objetivo, puntosDefecto: t.puntosDefecto }, etiqueta: `Marca «${t.marca}»` }; }), (x) => String(x.idMarca));
  if (quiere("tasas") && f.tasasPlan) p = { ...p, ...f.tasasPlan };
  if (quiere("promociones") && f.promociones)
    p.promociones = lista("promociones", p.promociones, f.promociones.map((x) => ({ valor: { ...x }, etiqueta: x.nombre })), (x) => norm(x.nombre));
  if (quiere("puntosModelo") && f.puntosModelo)
    p.puntosModelo = lista("puntosModelo", p.puntosModelo, f.puntosModelo.map((x) => { const id = modeloId(x.marca, x.modelo); return { valor: id === null ? null : { idModelo: id, puntos: x.puntos }, etiqueta: `${x.marca} ${x.modelo}` }; }), (x) => String(x.idModelo));
  if (quiere("tarifasVN") && f.tarifasVN)
    p.tarifasVN = lista("tarifasVN", p.tarifasVN, f.tarifasVN.map((x) => { const id = modeloId(x.marca, x.modelo); return { valor: id === null ? null : { idModelo: id, tasaCumplida: x.tasaCumplida, importes: { ...x.importes }, activo: x.activo, orden: x.orden }, etiqueta: `${x.marca} ${x.modelo}` }; }), (x) => `${x.idModelo}|${x.tasaCumplida}`);
  if (quiere("tarifasVN") && f.tarifasVN) p.tarifasVN = renumerarOrden(p.tarifasVN, cat.modelos);
  if (quiere("opcionesUsados") && f.opcionesUsados) {
    p = { ...p, voPuntosModo: f.opcionesUsados.voPuntosModo, voPuntos: f.opcionesUsados.voPuntos };
    unico("opcionesUsados");
  }
  if (quiere("usados") && f.usados) p.usados = lista("usados", p.usados, f.usados.map((x) => ({ valor: { ...x }, etiqueta: x.subtipo })), (x) => norm(x.subtipo));
  if (quiere("patrones") && f.patrones) p.patrones = lista("patrones", p.patrones, f.patrones.map((x) => ({ valor: { ...x, tiers: x.tiers.map((t) => ({ ...t })) }, etiqueta: x.nombre })), (x) => norm(x.nombre));
  if (quiere("financiacion") && f.financiacion)
    p.financiacion = lista("financiacion", p.financiacion, f.financiacion.map((x) => { const id = marcaId(x.marca); return { valor: id === null ? null : { idMarca: id, tipoFinanciacion: x.tipoFinanciacion, aplicaA: x.aplicaA, importe: x.importe, tasaIntervencion: x.tasaIntervencion, tasaAmbito: x.tasaAmbito }, etiqueta: `Marca «${x.marca}» (${x.tipoFinanciacion.toLowerCase()}, ${x.aplicaA}${x.tasaIntervencion === "indiferente" ? "" : `, tasa ${x.tasaIntervencion === "cumplida" ? "cumplida" : "no cumplida"}`})` }; }), (x) => `${x.idMarca}|${x.tipoFinanciacion}|${x.aplicaA}|${x.tasaIntervencion}|${x.tasaAmbito}`);
  /** Regla (o bonus) con marca y modelo por nombre → con ids; nula si el nombre de marca o modelo no existe aquí. */
  const resolverRegla = (r: NonNullable<Fragmento["reglas"]>[number]): PlanEditable["reglas"][number] | null => {
    const idM = r.marca === null ? null : marcaId(r.marca);
    const idMo = r.modelo === null ? null : modeloId(r.marca, r.modelo);
    if ((r.marca !== null && idM === null) || (r.modelo !== null && idMo === null)) return null;
    const { marca, modelo, ...resto } = r;
    void marca;
    void modelo;
    return { ...resto, idMarca: idMo !== null ? (cat.modelos.find((x) => x.id === idMo)?.marcaId ?? idM) : idM, idModelo: idMo };
  };
  const claveRegla = (x: PlanEditable["reglas"][number]) => `${norm(x.nombre)}|${x.evento}|${x.idMarca ?? ""}|${x.idModelo ?? ""}`;
  if (quiere("preference") && f.preference)
    p.preference = lista(
      "preference",
      p.preference,
      f.preference.map((x) => {
        const idM = x.marca === null ? null : marcaId(x.marca);
        const idMo = x.modelo === null ? null : modeloId(x.marca, x.modelo);
        const roto = (x.marca !== null && idM === null) || (x.modelo !== null && idMo === null);
        return { valor: roto ? null : { nombre: x.nombre, idMarca: idM, idModelo: idMo, tipoFinanciacion: x.tipoFinanciacion, aplicaA: x.aplicaA, importe: x.importe, activa: x.activa, tasaIntervencion: x.tasaIntervencion, tasaAmbito: x.tasaAmbito }, etiqueta: x.nombre ?? [x.marca, x.modelo].filter(Boolean).join(" ") ?? "Regla Preference" };
      }),
      (x) => `${norm(x.nombre ?? "")}|${x.idMarca ?? ""}|${x.idModelo ?? ""}|${x.tipoFinanciacion ?? ""}|${x.aplicaA}|${x.tasaIntervencion}|${x.tasaAmbito}`,
    );
  if (quiere("reglas") && f.reglas) p.reglas = lista("reglas", p.reglas, f.reglas.map((r) => ({ valor: resolverRegla(r), etiqueta: r.nombre })), claveRegla);
  if (quiere("bonus") && f.bonus) p.bonus = lista("bonus", p.bonus, f.bonus.map((r) => ({ valor: resolverRegla(r), etiqueta: r.nombre })), claveRegla);
  if (quiere("penalizacion") && f.penalizacion) {
    p = { ...p, penalizacionImporte: f.penalizacion.importe, penalizacionTitulo: f.penalizacion.titulo, penalizacionDescripcion: f.penalizacion.descripcion };
    unico("penalizacion");
  }
  if (quiere("notas") && f.notas) {
    p = { ...p, notas: f.notas.texto };
    unico("notas");
  }
  return { plan: p, resultados };
}
