"use client";

import { useMemo, useState } from "react";
import { InputCentesimas, BotonMini, Seccion } from "./campos";
import EditorTasas from "./EditorTasas";
import BarraPlantillas from "./PlantillasTarifas";
import { tramosDe, type Plan, type PropsPestana } from "./tipos";
import { etiquetaTramo } from "@/lib/formato";

type Tarifa = Plan["tarifasVN"][number];
type Importes = Tarifa["importes"];

/** Lo último que se copió: una fila (una tasa) o un modelo entero (las dos filas). */
type Portapapeles = { tipo: "fila"; importes: Importes } | { tipo: "modelo"; cumplida: Importes; noCumplida: Importes } | null;

export default function TabModelos({ plan, setPlan, cat: catBase }: PropsPestana) {
  const tramos = tramosDe(plan);
  // Marcas y modelos creados desde una plantilla: se ven al instante, sin esperar a que la página recargue el catálogo
  const [ampliado, setAmpliado] = useState<{ marcas: PropsPestana["cat"]["marcas"]; modelos: PropsPestana["cat"]["modelos"] } | null>(null);
  const cat = useMemo(
    () => ({
      ...catBase,
      marcas: [...catBase.marcas, ...(ampliado?.marcas ?? []).filter((m) => !catBase.marcas.some((x) => x.id === m.id))],
      modelos: [...catBase.modelos, ...(ampliado?.modelos ?? []).filter((m) => !catBase.modelos.some((x) => x.id === m.id))],
    }),
    [catBase, ampliado],
  );
  const [portapapeles, setPortapapeles] = useState<Portapapeles>(null);
  const tarifa = (idModelo: number, cumplida: boolean): Tarifa | undefined => plan.tarifasVN.find((t) => t.idModelo === idModelo && t.tasaCumplida === cumplida);

  const fijar = (idModelo: number, cumplida: boolean, cambio: (t: Tarifa) => Tarifa) =>
    setPlan((p) => {
      const existe = p.tarifasVN.some((t) => t.idModelo === idModelo && t.tasaCumplida === cumplida);
      const base: Tarifa = { idModelo, tasaCumplida: cumplida, importes: {}, activo: true, orden: 0 };
      return {
        ...p,
        tarifasVN: existe ? p.tarifasVN.map((t) => (t.idModelo === idModelo && t.tasaCumplida === cumplida ? cambio(t) : t)) : [...p.tarifasVN, cambio(base)],
      };
    });

  const fijarImporte = (idModelo: number, cumplida: boolean, tramo: number, v: number | null) =>
    fijar(idModelo, cumplida, (t) => {
      const importes = { ...t.importes };
      if (v === null) delete importes[String(tramo)];
      else importes[String(tramo)] = v;
      return { ...t, importes };
    });

  /** Modelos de una marca en el orden elegido en el plan (los que no tienen orden van al final, por nombre). */
  const modelosDe = (marcaId: number) => {
    const lista = cat.modelos.filter((m) => m.marcaId === marcaId);
    const orden = (id: number) => tarifa(id, true)?.orden ?? tarifa(id, false)?.orden ?? Number.MAX_SAFE_INTEGER;
    return [...lista].sort((a, b) => orden(a.id) - orden(b.id) || a.nombre.localeCompare(b.nombre, "es"));
  };

  const aplicarAbajo = (marcaId: number, desdeIdx: number, cumplida: boolean) => {
    const modelos = modelosDe(marcaId);
    const origen = tarifa(modelos[desdeIdx].id, cumplida);
    if (!origen) return;
    for (const m of modelos.slice(desdeIdx + 1)) fijar(m.id, cumplida, (t) => ({ ...t, importes: { ...origen.importes } }));
  };

  /** Sube o baja un modelo en la lista de su marca y guarda el orden de todos. */
  const mover = (marcaId: number, idx: number, delta: -1 | 1) => {
    const modelos = modelosDe(marcaId);
    const destino = idx + delta;
    if (destino < 0 || destino >= modelos.length) return;
    const nuevo = [...modelos];
    [nuevo[idx], nuevo[destino]] = [nuevo[destino], nuevo[idx]];
    nuevo.forEach((m, i) => {
      for (const cumplida of [true, false]) fijar(m.id, cumplida, (t) => ({ ...t, orden: i }));
    });
  };

  const copiarFila = (idModelo: number, cumplida: boolean) => setPortapapeles({ tipo: "fila", importes: { ...(tarifa(idModelo, cumplida)?.importes ?? {}) } });
  const copiarModelo = (idModelo: number) => setPortapapeles({ tipo: "modelo", cumplida: { ...(tarifa(idModelo, true)?.importes ?? {}) }, noCumplida: { ...(tarifa(idModelo, false)?.importes ?? {}) } });
  const pegarFila = (idModelo: number, cumplida: boolean) => {
    if (portapapeles?.tipo === "fila") fijar(idModelo, cumplida, (t) => ({ ...t, importes: { ...portapapeles.importes } }));
  };
  const pegarModelo = (idModelo: number) => {
    if (portapapeles?.tipo !== "modelo") return;
    fijar(idModelo, true, (t) => ({ ...t, importes: { ...portapapeles.cumplida } }));
    fijar(idModelo, false, (t) => ({ ...t, importes: { ...portapapeles.noCumplida } }));
  };

  const etiquetaTasa = (marcaId: number, cumplida: boolean): string => {
    const cfg = plan.tasas.find((t) => t.idMarca === marcaId);
    const objetivo = cfg?.objetivo ?? 70;
    const unidad = cfg?.tipoTasa === "unidades" ? " unid." : "%";
    return `Tasa ${cumplida ? "≥" : "<"} ${objetivo}${unidad}`;
  };

  const marcasConModelos = cat.marcas.filter((m) => cat.modelos.some((x) => x.marcaId === m.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h3 style={{ fontSize: "1.15rem", margin: "0 0 6px" }}>Tarifas de Modelos VN por Tramo</h3>
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>
          Define las tarifas de comisiones de coches nuevos agrupados por marcas. Importe de la comisión del coche VN por modelo y tramo. Cada modelo tiene 2 líneas: una para cuando la tasa de intervención real de la marca en el mes alcanza el objetivo, y otra para cuando no lo alcanza. El tramo (X-4 … X+3) sale de los puntos del mes frente al objetivo X del plan. Un hueco significa «sin tarifa» (0 € con aviso). Una línea desmarcada en «Activo» se ignora.
        </p>
        <div style={{ margin: "12px 0 0" }}>
          <BarraPlantillas plan={plan} setPlan={setPlan} cat={cat} alAmpliarCatalogo={(marcas, modelos) => setAmpliado({ marcas, modelos })} />
        </div>
        {portapapeles && (
          <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--primary)" }}>
            📋 Copiado: {portapapeles.tipo === "fila" ? "una fila" : "un modelo (las dos filas)"}. Pulsa «Pegar» donde quieras ponerlo.{" "}
            <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => setPortapapeles(null)}>
              Descartar
            </button>
          </p>
        )}
      </div>
      {marcasConModelos.map((marca) => {
        const modelos = modelosDe(marca.id);
        return (
          <Seccion key={marca.id} destacado titulo={`📦 MODELOS DE ${marca.nombre.toUpperCase()}`}>
            <EditorTasas plan={plan} setPlan={setPlan} cat={cat} ambito="marca" idMarca={marca.id} />
            <div className="table-container">
              <table className="table-premium table-compact">
                <thead>
                  <tr>
                    <th>Orden</th>
                    <th>Modelo</th>
                    <th>Tasa intervención</th>
                    {tramos.map((t) => (
                      <th key={t}>
                        {etiquetaTramo(t)}
                      </th>
                    ))}
                    <th>Activo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {modelos.flatMap((m, idx) =>
                    [true, false].map((cumplida) => (
                      <tr key={`${m.id}-${cumplida}`} style={{ opacity: tarifa(m.id, cumplida)?.activo === false ? 0.5 : 1 }}>
                        {cumplida && (
                          <td rowSpan={2}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}>
                              <button type="button" title="Subir este modelo" className="btn btn-secondary" disabled={idx === 0} onClick={() => mover(marca.id, idx, -1)} style={{ padding: "0 8px", fontSize: "0.7rem" }}>
                                ▲
                              </button>
                              <button type="button" title="Bajar este modelo" className="btn btn-secondary" disabled={idx === modelos.length - 1} onClick={() => mover(marca.id, idx, 1)} style={{ padding: "0 8px", fontSize: "0.7rem" }}>
                                ▼
                              </button>
                            </div>
                          </td>
                        )}
                        {cumplida && (
                          <td rowSpan={2} style={{ fontWeight: 600, minWidth: "170px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <span>{m.nombre}</span>
                              <BotonMini titulo="Copia las dos filas de este modelo para pegarlas en otro" onClick={() => copiarModelo(m.id)}>
                                📦 Copiar modelo
                              </BotonMini>
                              {portapapeles?.tipo === "modelo" && (
                                <BotonMini titulo="Pega aquí las dos filas copiadas" onClick={() => pegarModelo(m.id)}>
                                  📥 Pegar modelo
                                </BotonMini>
                              )}
                              <BotonMini titulo="Copia las dos filas de este modelo en todos los de abajo de la misma marca" onClick={() => { aplicarAbajo(marca.id, idx, true); aplicarAbajo(marca.id, idx, false); }}>
                                ⬇ Aplicar a los de abajo
                              </BotonMini>
                            </div>
                          </td>
                        )}
                        <td style={{ whiteSpace: "nowrap", fontWeight: 600, color: cumplida ? "var(--success)" : "var(--danger)" }}>{etiquetaTasa(marca.id, cumplida)}</td>
                        {tramos.map((t) => (
                          <td key={t}>
                            <InputCentesimas ancho="84px" vacioEsNulo valor={tarifa(m.id, cumplida)?.importes[String(t)] ?? null} onChange={(v) => fijarImporte(m.id, cumplida, t, v)} />
                          </td>
                        ))}
                        <td>
                          <input
                            type="checkbox"
                            checked={tarifa(m.id, cumplida)?.activo !== false}
                            onChange={(e) => fijar(m.id, cumplida, (x) => ({ ...x, activo: e.target.checked }))}
                            title="Si lo desmarcas, esta línea no se usa al calcular comisiones"
                            style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }}
                          />
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <BotonMini titulo="Copia los importes de esta fila para pegarlos en otra" onClick={() => copiarFila(m.id, cumplida)}>
                              📄 Copiar
                            </BotonMini>
                            {portapapeles?.tipo === "fila" && (
                              <BotonMini titulo="Pega aquí los importes copiados" onClick={() => pegarFila(m.id, cumplida)}>
                                📥 Pegar
                              </BotonMini>
                            )}
                          </div>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </Seccion>
        );
      })}
      {marcasConModelos.length === 0 && (
        <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
          <div style={{ fontWeight: 700 }}>Todavía no hay marcas ni modelos con «Sist. Comisiones» activado</div>
          <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Puedes darlos de alta en Configuración → Marcas y Modelos, o crearlos ahora desde una plantilla de tarifas: elegirás qué marcas y modelos quieres crear y recibirán sus tarifas.
          </div>
          <BarraPlantillas plan={plan} setPlan={setPlan} cat={cat} soloAplicar alAmpliarCatalogo={(marcas, modelos) => setAmpliado({ marcas, modelos })} />
        </div>
      )}
    </div>
  );
}
