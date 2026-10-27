import { describe, expect, it } from "vitest";
import type { ExpedienteDto } from "./dto";
import { aArchivoDeReglas, fondoDeRegla, leerImportacion, leerReglas, reglaNueva, reglaPedidosRecientes, reglaQueAplica, type ReglaColor } from "./reglas-color";

const exp = (o: Record<string, unknown>): ExpedienteDto => ({ id_expediente: 1, fecha_expediente: null, estado_intranet: null, tipoDeVenta: null, estadoVehiculo: null, modelo: null, usuario: null, cliente: null, comisionado: null, ...o }) as unknown as ExpedienteDto;
const regla = (o: Partial<ReglaColor>): ReglaColor => ({ ...reglaNueva(), ...o });
const HOY = "2026-10-24";

describe("reglas de color de las filas", () => {
  it("por apuntes: tiene o no un apunte (un expediente puede llevar varios)", () => {
    const ap = (...titulos: string[]) => titulos.map((titulo, id) => ({ id, titulo, etiqueta: "", color: "#000000", mostrar_etiqueta: false }));
    const conSeguro = [regla({ condiciones: [{ campo: "apunte", operador: "es", valor: "seguro" }] })];
    const sinSeguro = [regla({ condiciones: [{ campo: "apunte", operador: "no_es", valor: "Seguro" }] })];
    const sinApuntes = [regla({ condiciones: [{ campo: "apunte", operador: "vacio", valor: "" }] })];
    expect(reglaQueAplica(exp({ apuntes: ap("VO de retoma", "Seguro") }), conSeguro, HOY)).not.toBeNull();
    expect(reglaQueAplica(exp({ apuntes: ap("VO de retoma") }), conSeguro, HOY)).toBeNull();
    expect(reglaQueAplica(exp({ apuntes: ap("VO de retoma") }), sinSeguro, HOY)).not.toBeNull();
    expect(reglaQueAplica(exp({ apuntes: ap("Seguro") }), sinSeguro, HOY)).toBeNull();
    expect(reglaQueAplica(exp({}), sinApuntes, HOY)).not.toBeNull();
    expect(reglaQueAplica(exp({ apuntes: ap("x") }), sinApuntes, HOY)).toBeNull();
  });
  it("con matrícula o sin ella, con bastidor o sin él", () => {
    const sinMatricula = [regla({ condiciones: [{ campo: "matricula", operador: "vacio", valor: "" }] })];
    const conBastidor = [regla({ condiciones: [{ campo: "bastidor", operador: "no_vacio", valor: "" }] })];
    expect(reglaQueAplica(exp({ matricula: null }), sinMatricula, HOY)).not.toBeNull();
    expect(reglaQueAplica(exp({ matricula: "1234ABC" }), sinMatricula, HOY)).toBeNull();
    expect(reglaQueAplica(exp({ vin: "VF1ABC" }), conBastidor, HOY)).not.toBeNull();
    expect(reglaQueAplica(exp({ vin: null }), conBastidor, HOY)).toBeNull();
  });
  it("pedidos de hoy y de los últimos N días (la regla de antes)", () => {
    const r = [reglaPedidosRecientes(3, "#3b82f6", "media")];
    expect(reglaQueAplica(exp({ fecha_expediente: "2026-10-24" }), r, HOY)).not.toBeNull();
    expect(reglaQueAplica(exp({ fecha_expediente: "2026-10-21" }), r, HOY)).not.toBeNull();
    expect(reglaQueAplica(exp({ fecha_expediente: "2026-10-20" }), r, HOY)).toBeNull();
    expect(reglaQueAplica(exp({ fecha_expediente: "2026-10-25" }), r, HOY)).toBeNull();
    expect(reglaQueAplica(exp({ fecha_expediente: null }), r, HOY)).toBeNull();
    expect(reglaQueAplica(exp({ fecha_expediente: "2026-10-24" }), [reglaPedidosRecientes(0, "#3b82f6", null)], HOY)).toBeNull();
  });
  it("estado de la intranet, sin acentos ni mayúsculas, y la primera regla que cumple gana", () => {
    const rojo = regla({ nombre: "Post-venta", color: "#ef4444", condiciones: [{ campo: "estado_intranet", operador: "contiene", valor: "post-venta" }] });
    const gris = regla({ nombre: "Con estado", color: "#94a3b8", condiciones: [{ campo: "estado_intranet", operador: "no_vacio", valor: "" }] });
    expect(reglaQueAplica(exp({ estado_intranet: "Post-Venta" }), [rojo, gris], HOY)?.nombre).toBe("Post-venta");
    expect(reglaQueAplica(exp({ estado_intranet: "Matriculación" }), [rojo, gris], HOY)?.nombre).toBe("Con estado");
    expect(reglaQueAplica(exp({ estado_intranet: "Matriculacion" }), [regla({ condiciones: [{ campo: "estado_intranet", operador: "es", valor: "Matriculación" }] })], HOY)).not.toBeNull();
  });
  it("combina condiciones con «todas» o «alguna» y salta las reglas inactivas o sin condiciones", () => {
    const c = [
      { campo: "estado_intranet" as const, operador: "es", valor: "Archivado" },
      { campo: "fecha_entrega" as const, operador: "no_tiene", valor: "" },
    ];
    const e = exp({ estado_intranet: "Archivado", fecha_entrega: "2026-10-01" });
    expect(reglaQueAplica(e, [regla({ combinar: "todas", condiciones: c })], HOY)).toBeNull();
    expect(reglaQueAplica(e, [regla({ combinar: "alguna", condiciones: c })], HOY)).not.toBeNull();
    expect(reglaQueAplica(e, [regla({ activa: false, combinar: "alguna", condiciones: c })], HOY)).toBeNull();
    expect(reglaQueAplica(e, [regla({ condiciones: [] })], HOY)).toBeNull();
  });
  it("fechas: hace más de N días, hoy, con y sin fecha", () => {
    const e = exp({ fecha_afectacion: "2026-10-10" });
    const cond = (operador: string, valor = "") => regla({ condiciones: [{ campo: "fecha_afectacion", operador, valor }] });
    expect(reglaQueAplica(e, [cond("hace_mas", "10")], HOY)).not.toBeNull();
    expect(reglaQueAplica(e, [cond("hace_mas", "14")], HOY)).toBeNull();
    expect(reglaQueAplica(e, [cond("tiene")], HOY)).not.toBeNull();
    expect(reglaQueAplica(e, [cond("no_tiene")], HOY)).toBeNull();
    expect(reglaQueAplica(exp({ fecha_afectacion: HOY }), [cond("es_hoy")], HOY)).not.toBeNull();
  });
  it("lo guardado se valida y lo exportado se puede volver a importar", () => {
    const rs = [reglaPedidosRecientes(5, "#22c55e", "fuerte")];
    expect(leerReglas("{no json", rs)).toBe(rs);
    expect(leerReglas(JSON.stringify([{ id: "x" }]), rs)).toBe(rs);
    expect(leerReglas(JSON.stringify(rs), [])).toEqual(rs);
    expect(leerImportacion(aArchivoDeReglas("Mi esquema", rs))).toEqual({ nombre: "Mi esquema", reglas: rs });
    expect(leerImportacion(JSON.stringify(rs))).toEqual({ nombre: null, reglas: rs });
    expect(leerImportacion("[1,2]")).toBeNull();
  });
  it("el fondo lleva el color y la intensidad de la regla", () => {
    expect(fondoDeRegla({ color: "#f97316", fuerza: "fuerte" })).toBe("rgba(249, 115, 22, 0.32)");
  });
});
