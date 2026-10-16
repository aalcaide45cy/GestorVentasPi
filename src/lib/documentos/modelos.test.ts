import { describe, expect, it } from "vitest";
import { proponerMarcaModelo, type CatalogoParaProponer } from "./modelos";

const catalogo: CatalogoParaProponer = {
  marcas: [
    { id: 1, nombre: "Dacia", modelos: [{ id: 10, nombre: "Sandero" }, { id: 11, nombre: "Jogger" }, { id: 12, nombre: "Sandero Stepway" }, { id: 13, nombre: "Duster" }] },
    { id: 2, nombre: "Renault", modelos: [{ id: 20, nombre: "Clio" }, { id: 21, nombre: "5" }, { id: 22, nombre: "Captur" }] },
    { id: 3, nombre: "Mobilize", modelos: [] },
  ],
};
const vacio: CatalogoParaProponer = { marcas: [] };

describe("proponerMarcaModelo: solo marca y modelo", () => {
  it("el pedido de ejemplo: Dacia / Jogger, sin acabado, motor, plazas ni códigos", () => {
    const linea = "DACIA JOGGER extreme Eco-G 120 auto 7 plazas -SS2XT7 NCA6XGS";
    expect(proponerMarcaModelo(linea, vacio)).toEqual({ marca: "Dacia", modelo: "Jogger", idMarca: null, idModelo: null });
    // Si el modelo ya existe se usa aunque traiga acabados detrás
    expect(proponerMarcaModelo(linea, catalogo)).toMatchObject({ marca: "Dacia", modelo: "Jogger", idMarca: 1, idModelo: 11 });
  });

  it("modelos del catálogo con dos palabras tienen preferencia sobre los de una", () => {
    expect(proponerMarcaModelo("DACIA SANDERO stepway expression Eco-G 1202SX NC 6XGS  13.658,68 €", catalogo)).toMatchObject({ modelo: "Sandero Stepway", idModelo: 12 });
    expect(proponerMarcaModelo("DACIA SANDERO Essential TCe 90", catalogo)).toMatchObject({ modelo: "Sandero", idModelo: 10 });
  });

  it("marca existente y modelo nuevo: propone el modelo con la marca del catálogo", () => {
    expect(proponerMarcaModelo("RENAULT AUSTRAL techno esprit alpine E-Tech full hybrid 200", catalogo)).toMatchObject({ marca: "Renault", modelo: "Austral", idMarca: 2, idModelo: null });
  });

  it("marcas conocidas aunque no estén creadas: Nissan, Mitsubishi, Mobilize, Alpine…", () => {
    expect(proponerMarcaModelo("NISSAN MICRA Acenta IG-T 92", vacio)).toMatchObject({ marca: "Nissan", modelo: "Micra" });
    expect(proponerMarcaModelo("MITSUBISHI ASX Motion Hybrid", vacio)).toMatchObject({ marca: "Mitsubishi", modelo: "ASX" });
    expect(proponerMarcaModelo("MOBILIZE DUO Essential", catalogo)).toMatchObject({ marca: "Mobilize", modelo: "Duo", idMarca: 3 });
    expect(proponerMarcaModelo("ALPINE A290 GT Premium 220cv  42.658,68 EUR", vacio)).toMatchObject({ marca: "Alpine", modelo: "A290" });
    expect(proponerMarcaModelo("Land Rover Defender 110 D250", vacio)).toMatchObject({ marca: "Land Rover", modelo: "Defender" });
  });

  it("abreviaturas y nombres numéricos: R5 es Renault 5; «Nuevo» no cuenta", () => {
    expect(proponerMarcaModelo("R5 E-Tech techno 150", catalogo)).toMatchObject({ marca: "Renault", modelo: "5", idModelo: 21 });
    expect(proponerMarcaModelo("RENAULT NUEVO CLIO Evolution TCe", catalogo)).toMatchObject({ marca: "Renault", modelo: "Clio", idModelo: 20 });
    expect(proponerMarcaModelo("DACIA NUEVO SPRING Extreme", vacio)).toMatchObject({ marca: "Dacia", modelo: "Spring" });
  });

  it("modelos compuestos nuevos (Grand Scenic) y marcas desconocidas", () => {
    expect(proponerMarcaModelo("RENAULT GRAND SCENIC Techno", vacio)).toMatchObject({ modelo: "Grand Scenic" });
    expect(proponerMarcaModelo("XPENG G6 Long Range", vacio)).toMatchObject({ marca: "Xpeng", modelo: "G6" });
  });

  it("sin texto o solo la marca no inventa nada", () => {
    expect(proponerMarcaModelo("", vacio)).toEqual({ marca: "", modelo: "", idMarca: null, idModelo: null });
    expect(proponerMarcaModelo("DACIA", vacio)).toMatchObject({ marca: "Dacia", modelo: "" });
  });
});
