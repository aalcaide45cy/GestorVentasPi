import { describe, expect, it } from "vitest";
import { PREDEFINIDOS_INICIALES, aplicarPredefinidos, leerFiltrosGuardados } from "./filtros-expedientes";

describe("filtros de la lista de expedientes que se recuerdan", () => {
  it("recuerda también el estado de intranet, el rango de fechas y el orden", () => {
    const f = leerFiltrosGuardados(JSON.stringify({ busqueda: "dacia", vendedor: "Ana", tipoFecha: "fecha_facturacion", intranet: "Anulado", desde: "2026-04-01", hasta: "2026-04-30", ordenCampo: "cliente", ordenAsc: true }));
    expect(f).toMatchObject({ busqueda: "dacia", vendedor: "Ana", tipoFecha: "fecha_facturacion", intranet: "Anulado", desde: "2026-04-01", hasta: "2026-04-30", ordenCampo: "cliente", ordenAsc: true });
  });
  it("lo que falta o está mal escrito vuelve a lo habitual", () => {
    const f = leerFiltrosGuardados(JSON.stringify({ desde: "ayer", hasta: 5, tipoFecha: "otra", ordenCampo: "" }));
    expect(f).toMatchObject({ desde: "", hasta: "", tipoFecha: "fecha_expediente", intranet: "", ordenCampo: "fecha_expediente", ordenAsc: false });
    expect(leerFiltrosGuardados("no es json")).toBeNull();
    expect(leerFiltrosGuardados(null)).toBeNull();
  });
  it("«Todas las fechas» es un campo de fecha válido y se recuerda", () => {
    expect(leerFiltrosGuardados(JSON.stringify({ tipoFecha: "todas" }))?.tipoFecha).toBe("todas");
  });
  it("los valores de partida no traen rango ni estado de intranet", () => {
    expect(aplicarPredefinidos(PREDEFINIDOS_INICIALES, "Ana")).toMatchObject({ vendedor: "Ana", desde: "", hasta: "", intranet: "", ordenCampo: "fecha_expediente", ordenAsc: false });
  });
});
