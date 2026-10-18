import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { esquemaFragmento } from "@/lib/plantillas-plan/esquema-fragmento";
import { aplicar, extraer, type CatalogoNombres } from "@/lib/plantillas-plan/fragmentos";
import { crearUsuarioPrueba, reiniciarBd } from "../../../tests/ayudas";
import { exportarSeccion, importarSeccion } from "./intercambio";
import type { PlanEditable } from "./planes";
import { actualizarPlantillaPlan, borrarPlantillaPlan, crearPlantillaPlan, duplicarPlantillaPlan, listarPlantillasPlan } from "./plantillas-plan";

beforeEach(reiniciarBd);

const plan = (extra: Partial<PlanEditable> = {}): PlanEditable => ({
  idPlan: 1,
  nombre: "Octubre 2026",
  fechaInicio: "2026-10-01",
  fechaFin: "2026-10-31",
  estado: "borrador",
  tramoMin: -4,
  tramoMax: 3,
  puntosPorPedido: 50,
  voPuntosModo: "cuentan",
  voPuntos: null,
  tasaGlobalTipo: "porcentaje",
  tasaGlobalObjetivo: null,
  tasaVoTipo: "porcentaje",
  tasaVoObjetivo: null,
  tasaIncluyeVo: true,
  penalizacionImporte: 0,
  penalizacionTitulo: null,
  penalizacionDescripcion: null,
  notas: null,
  vendedores: [],
  promociones: [],
  puntosModelo: [],
  tasas: [],
  tarifasVN: [],
  usados: [],
  patrones: [],
  financiacion: [],
  preference: [],
  reglas: [],
  bonus: [],
  pendientes: [],
  ...extra,
});

const catA: CatalogoNombres = { marcas: [{ id: 1, nombre: "Dacia" }, { id: 2, nombre: "Renault" }], modelos: [{ id: 10, nombre: "Sandero", marcaId: 1 }, { id: 20, nombre: "Clio", marcaId: 2 }], vendedores: [{ id: 5, nombre: "Ana Pérez" }] };
// Otra instalación: ids distintos y sin Renault ni Clio
const catB: CatalogoNombres = { marcas: [{ id: 7, nombre: "DACIA" }], modelos: [{ id: 70, nombre: "sandero", marcaId: 7 }], vendedores: [{ id: 9, nombre: "ana perez" }] };

const regla = { nombre: "Bonus Clio", evento: "matriculacion" as const, tipoVehiculo: "nuevo" as const, fechaInicio: null, fechaFin: null, idMarca: 2, idModelo: 20, tasaIntervencion: "indiferente" as const, puntos: 0, importe: 5000, esPenalizacion: false, ligarACredito: false, activa: true };

describe("plantillas de plan: fragmentos", () => {
  it("extraer + aplicar en otro catálogo traduce los nombres a los ids de allí y omite lo que no existe", () => {
    const origen = plan({
      vendedores: [{ idUsuario: 5, objetivoBase: 1300, arrastre: 0 }],
      tasas: [{ idMarca: 1, tipoTasa: "porcentaje", objetivo: 70, puntosDefecto: 100 }, { idMarca: 2, tipoTasa: "unidades", objetivo: 3, puntosDefecto: 100 }],
      tarifasVN: [{ idModelo: 10, tasaCumplida: true, importes: { "0": 15050 }, activo: true, orden: 0 }, { idModelo: 20, tasaCumplida: true, importes: { "0": 9900 }, activo: true, orden: 1 }],
      bonus: [regla, { ...regla, nombre: "Bonus general", idMarca: null, idModelo: null }],
      notas: "Notas de octubre",
    });
    const f = extraer(origen, catA, ["vendedores", "tasas", "tarifasVN", "bonus", "notas"]);
    expect(esquemaFragmento.safeParse(JSON.parse(JSON.stringify(f))).success).toBe(true);
    expect(f.tasas?.map((t) => t.marca)).toEqual(["Dacia", "Renault"]);
    expect(f.bonus?.[0]).toMatchObject({ marca: "Renault", modelo: "Clio" });

    const destino = aplicar(plan({ idPlan: 2 }), f, catB, ["vendedores", "tasas", "tarifasVN", "bonus", "notas"], {});
    expect(destino.plan.vendedores).toEqual([{ idUsuario: 9, objetivoBase: 1300, arrastre: 0 }]);
    expect(destino.plan.tasas).toEqual([{ idMarca: 7, tipoTasa: "porcentaje", objetivo: 70, puntosDefecto: 100 }]);
    expect(destino.plan.tarifasVN).toEqual([{ idModelo: 70, tasaCumplida: true, importes: { "0": 15050 }, activo: true, orden: 0 }]);
    expect(destino.plan.bonus.map((b) => b.nombre)).toEqual(["Bonus general"]);
    expect(destino.plan.notas).toBe("Notas de octubre");
    expect(destino.plan.nombre).toBe("Octubre 2026"); // el nombre y las fechas del plan no se tocan
    const tasas = destino.resultados.find((r) => r.componente === "tasas")!;
    expect(tasas).toMatchObject({ aplicados: 1, sinReferencia: ["Marca «Renault»"] });
    expect(destino.resultados.find((r) => r.componente === "bonus")!.sinReferencia).toEqual(["Bonus Clio"]);
  });

  it("«completar» solo añade lo que falta y «reemplazar» sustituye", () => {
    const f = extraer(plan({ usados: [{ subtipo: "KM0", importePrimera: 10000, importeResto: 5000, minAplicar: 0, activo: true }, { subtipo: "DEMO", importePrimera: 8000, importeResto: 4000, minAplicar: 0, activo: true }] }), catA, ["usados"]);
    const conKm0 = plan({ usados: [{ subtipo: "km0", importePrimera: 1, importeResto: 1, minAplicar: 0, activo: true }] });
    const completar = aplicar(conKm0, f, catA, ["usados"], { usados: "completar" });
    expect(completar.plan.usados.map((u) => [u.subtipo, u.importePrimera])).toEqual([["km0", 1], ["DEMO", 8000]]);
    expect(completar.resultados[0]).toMatchObject({ aplicados: 1, yaEstaban: 1 });
    const reemplazar = aplicar(conKm0, f, catA, ["usados"], { usados: "reemplazar" });
    expect(reemplazar.plan.usados.map((u) => [u.subtipo, u.importePrimera])).toEqual([["KM0", 10000], ["DEMO", 8000]]);
  });
});

describe("plantillas de plan: servicio", () => {
  const datos = { notas: { texto: "Hola" } };

  it("crear, listar por ámbito, renombrar, duplicar y borrar; el nombre es único por sección", async () => {
    const p = await crearPlantillaPlan(db, { ambito: "notas", nombre: "Mis notas", datos });
    expect(p).toMatchObject({ ambito: "notas", nombre: "Mis notas", contenido: [{ componente: "notas", elementos: 1 }] });
    await expect(crearPlantillaPlan(db, { ambito: "notas", nombre: "MIS NOTAS", datos })).rejects.toMatchObject({ status: 409 });
    // El mismo nombre en otra sección sí vale
    await crearPlantillaPlan(db, { ambito: "global", nombre: "Mis notas", datos });
    await expect(crearPlantillaPlan(db, { ambito: "bonus", nombre: "Vacía", datos: {} })).rejects.toMatchObject({ status: 400 });

    expect((await listarPlantillasPlan(db, "notas")).length).toBe(1);
    expect((await listarPlantillasPlan(db)).length).toBe(2);

    const act = await actualizarPlantillaPlan(db, p.id, { ambito: "notas", nombre: "Otras notas", datos: { notas: { texto: "Adiós" } } });
    expect(act.datos.notas?.texto).toBe("Adiós");
    await expect(actualizarPlantillaPlan(db, p.id, { ambito: "bonus", nombre: "X", datos })).rejects.toMatchObject({ status: 400 });
    expect((await duplicarPlantillaPlan(db, p.id)).nombre).toBe("Copia de Otras notas");
    await borrarPlantillaPlan(db, p.id);
    await expect(borrarPlantillaPlan(db, p.id)).rejects.toMatchObject({ status: 404 });
  });

  it("una plantilla de una pestaña solo conserva las partes de esa pestaña", async () => {
    const p = await crearPlantillaPlan(db, { ambito: "bonus", nombre: "B", datos: { notas: { texto: "no" }, bonus: [{ nombre: "Bonus", evento: "pedido", marca: null, modelo: null, importe: 100 }] } });
    expect(p.contenido.map((c) => c.componente)).toEqual(["bonus"]);
  });

  it("se exportan e importan en la sección «plantillas_plan»", async () => {
    const admin = await crearUsuarioPrueba("administrador");
    const p = await crearPlantillaPlan(db, { ambito: "notas", nombre: "Mis notas", datos });
    const paquete = await exportarSeccion(db, "plantillas_plan");
    expect(paquete.registros).toBe(1);
    await borrarPlantillaPlan(db, p.id);
    expect(await importarSeccion(db, admin.idUsuario, paquete, "anadir", true)).toMatchObject({ aplicado: true, nuevos: 1 });
    expect((await listarPlantillasPlan(db)).map((x) => x.nombre)).toEqual(["Mis notas"]);
    expect(await importarSeccion(db, admin.idUsuario, paquete, "anadir", true)).toMatchObject({ nuevos: 0, omitidos: 1 });
  });
});
