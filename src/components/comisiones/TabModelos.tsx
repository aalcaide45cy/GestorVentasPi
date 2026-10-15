"use client";

import { InputCentesimas, BotonMini, Seccion } from "./campos";
import { tramosDe, type Plan, type PropsPestana } from "./tipos";
import { etiquetaTramo } from "@/lib/formato";

type Tarifa = Plan["tarifasVN"][number];

export default function TabModelos({ plan, setPlan, cat }: PropsPestana) {
  const tramos = tramosDe(plan);
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

  const aplicarAbajo = (marcaId: number, desdeIdx: number, cumplida: boolean) => {
    const modelos = cat.modelos.filter((m) => m.marcaId === marcaId);
    const origen = tarifa(modelos[desdeIdx].id, cumplida);
    if (!origen) return;
    for (const m of modelos.slice(desdeIdx + 1)) fijar(m.id, cumplida, (t) => ({ ...t, importes: { ...origen.importes } }));
  };

  const marcasConModelos = cat.marcas.filter((m) => cat.modelos.some((x) => x.marcaId === m.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <p style={{ color: "var(--text-secondary)" }}>
        Importe de la comisión del coche VN por modelo y tramo. La fila «Tasa ≥ objetivo» se usa si la marca cumple su tasa de intervención en el mes; «Tasa &lt; objetivo» en caso contrario. Un hueco significa «sin tarifa» (0 € con aviso).
      </p>
      {marcasConModelos.map((marca) => {
        const modelos = cat.modelos.filter((m) => m.marcaId === marca.id);
        return (
          <Seccion key={marca.id} titulo={`MODELOS DE ${marca.nombre.toUpperCase()}`}>
            <div className="table-container">
              <table className="table-premium">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>Tasa</th>
                    {tramos.map((t) => (
                      <th key={t} style={{ textAlign: "right" }}>
                        {etiquetaTramo(t)}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {modelos.flatMap((m, idx) =>
                    [true, false].map((cumplida) => (
                      <tr key={`${m.id}-${cumplida}`}>
                        {cumplida && (
                          <td rowSpan={2} style={{ fontWeight: 600 }}>
                            {m.nombre}
                          </td>
                        )}
                        <td style={{ whiteSpace: "nowrap", color: cumplida ? "var(--success)" : "var(--danger)" }}>{cumplida ? "Tasa ≥ objetivo" : "Tasa < objetivo"}</td>
                        {tramos.map((t) => (
                          <td key={t}>
                            <InputCentesimas ancho="84px" vacioEsNulo valor={tarifa(m.id, cumplida)?.importes[String(t)] ?? null} onChange={(v) => fijarImporte(m.id, cumplida, t, v)} />
                          </td>
                        ))}
                        <td style={{ whiteSpace: "nowrap" }}>
                          <BotonMini titulo="Copiar esta fila en los modelos de abajo" onClick={() => aplicarAbajo(marca.id, idx, cumplida)}>
                            ⬇ Aplicar a los de abajo
                          </BotonMini>
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
      {marcasConModelos.length === 0 && <p>No hay modelos dados de alta: créalos en Configuración → Modelos.</p>}
    </div>
  );
}
