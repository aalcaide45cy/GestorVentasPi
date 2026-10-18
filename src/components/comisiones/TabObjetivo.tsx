"use client";

import { BotonMini, InputCentesimas, InputEntero, Seccion } from "./campos";
import type { PropsPestana } from "./tipos";

export default function TabObjetivo({ plan, setPlan, cat }: PropsPestana) {
  const libres = cat.vendedores.filter((v) => !plan.vendedores.some((x) => x.idUsuario === v.id));
  const nombreV = (id: number) => cat.vendedores.find((v) => v.id === id)?.nombre ?? `Usuario ${id}`;
  const marcasUsadas = cat.marcas.filter((m) => !plan.tasas.some((t) => t.idMarca === m.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Seccion
        titulo="Cálculo del Objetivo X"
        ayuda="Cada vendedor tiene su propio objetivo en puntos. Objetivo X = objetivo base + arrastre."
        acciones={
          libres.length > 0 && (
            <select
              className="form-input"
              style={{ width: "auto" }}
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) setPlan((p) => ({ ...p, vendedores: [...p.vendedores, { idUsuario: id, objetivoBase: 1300, arrastre: 0 }] }));
              }}
            >
              <option value="">+ Añadir vendedor…</option>
              {libres.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre} ({v.tipo})
                </option>
              ))}
            </select>
          )
        }
      >
        <div className="table-container">
          <table className="table-premium">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Objetivo base (puntos)</th>
                <th>Arrastre (puntos)</th>
                <th>Objetivo X</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plan.vendedores.map((v, i) => (
                <tr key={v.idUsuario}>
                  <td>{nombreV(v.idUsuario)}</td>
                  <td>
                    <InputCentesimas valor={v.objetivoBase} onChange={(n) => setPlan((p) => ({ ...p, vendedores: p.vendedores.map((x, j) => (j === i ? { ...x, objetivoBase: n ?? 0 } : x)) }))} />
                  </td>
                  <td>
                    <InputCentesimas valor={v.arrastre} onChange={(n) => setPlan((p) => ({ ...p, vendedores: p.vendedores.map((x, j) => (j === i ? { ...x, arrastre: n ?? 0 } : x)) }))} />
                  </td>
                  <td>{((v.objetivoBase + v.arrastre) / 100).toLocaleString("es-ES", { minimumFractionDigits: 2 })}</td>
                  <td>
                    <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, vendedores: p.vendedores.filter((_, j) => j !== i) }))}>
                      Quitar
                    </BotonMini>
                  </td>
                </tr>
              ))}
              {plan.vendedores.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--text-muted)" }}>
                    Aún no hay vendedores en el plan: sin objetivo, el objetivo X es 0.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Seccion>

      <Seccion
        titulo="Tasa de intervención global y de usados"
        ayuda="La tasa global suma todos los coches nuevos de todas las marcas; la de usados (VO), los usados. Cada una compara los coches financiados del mes con los que cuentan en el mes. Sin objetivo se da siempre por cumplida. Se usan en las reglas financieras («Solo si está cumplida» o «no cumplida») y se enseñan en el resumen del mes."
      >
        <div className="table-container">
          <table className="table-premium">
            <thead>
              <tr>
                <th>Tasa</th>
                <th>Con objetivo</th>
                <th>Tipo de tasa</th>
                <th>Objetivo</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  { etiqueta: "Global (todos los coches nuevos)", tipo: plan.tasaGlobalTipo, objetivo: plan.tasaGlobalObjetivo, claveTipo: "tasaGlobalTipo", claveObjetivo: "tasaGlobalObjetivo" },
                  { etiqueta: "Usados (VO)", tipo: plan.tasaVoTipo, objetivo: plan.tasaVoObjetivo, claveTipo: "tasaVoTipo", claveObjetivo: "tasaVoObjetivo" },
                ] as const
              ).map((f) => (
                <tr key={f.claveTipo}>
                  <td>{f.etiqueta}</td>
                  <td>
                    <input type="checkbox" checked={f.objetivo !== null} onChange={(e) => setPlan((p) => ({ ...p, [f.claveObjetivo]: e.target.checked ? 70 : null }))} style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }} title="Sin objetivo, la tasa se da siempre por cumplida" />
                  </td>
                  <td>
                    <select className="form-input" value={f.tipo} disabled={f.objetivo === null} onChange={(e) => setPlan((p) => ({ ...p, [f.claveTipo]: e.target.value as "porcentaje" | "unidades" }))}>
                      <option value="porcentaje">Porcentaje (%)</option>
                      <option value="unidades">Unidades</option>
                    </select>
                  </td>
                  <td>{f.objetivo === null ? <span style={{ color: "var(--text-muted)" }}>Sin objetivo (siempre cumplida)</span> : <InputEntero valor={f.objetivo} min={0} onChange={(n) => setPlan((p) => ({ ...p, [f.claveObjetivo]: n }))} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      <Seccion
        titulo="Tasa de intervención objetiva y puntos por defecto por marca"
        ayuda="Tasa de intervención: porcentaje (o nº de unidades) de VN de la marca que debe financiarse. Sin VN de la marca en el mes, se considera cumplida."
        acciones={
          marcasUsadas.length > 0 && (
            <select
              className="form-input"
              style={{ width: "auto" }}
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) setPlan((p) => ({ ...p, tasas: [...p.tasas, { idMarca: id, tipoTasa: "porcentaje", objetivo: 70, puntosDefecto: 100 }] }));
              }}
            >
              <option value="">+ Añadir marca…</option>
              {marcasUsadas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          )
        }
      >
        <div className="table-container">
          <table className="table-premium">
            <thead>
              <tr>
                <th>Marca</th>
                <th>Tipo de tasa</th>
                <th>Objetivo</th>
                <th>Puntos por defecto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plan.tasas.map((t, i) => (
                <tr key={t.idMarca}>
                  <td>{cat.marcas.find((m) => m.id === t.idMarca)?.nombre}</td>
                  <td>
                    <select className="form-input" value={t.tipoTasa} onChange={(e) => setPlan((p) => ({ ...p, tasas: p.tasas.map((x, j) => (j === i ? { ...x, tipoTasa: e.target.value as "porcentaje" } : x)) }))}>
                      <option value="porcentaje">Porcentaje (%)</option>
                      <option value="unidades">Unidades</option>
                    </select>
                  </td>
                  <td>
                    <InputEntero valor={t.objetivo} min={0} onChange={(n) => setPlan((p) => ({ ...p, tasas: p.tasas.map((x, j) => (j === i ? { ...x, objetivo: n } : x)) }))} />
                  </td>
                  <td>
                    <InputCentesimas valor={t.puntosDefecto} onChange={(n) => setPlan((p) => ({ ...p, tasas: p.tasas.map((x, j) => (j === i ? { ...x, puntosDefecto: n ?? 100 } : x)) }))} />
                  </td>
                  <td>
                    <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, tasas: p.tasas.filter((_, j) => j !== i) }))}>
                      Quitar
                    </BotonMini>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      <Seccion
        titulo="Puntos por defecto por modelo"
        ayuda="Si un expediente no tiene puntos propios se usan los del modelo, después los de la marca y, por último, 1,00."
        acciones={
          <select
            className="form-input"
            style={{ width: "auto" }}
            value=""
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id) setPlan((p) => ({ ...p, puntosModelo: [...p.puntosModelo, { idModelo: id, puntos: 100 }] }));
            }}
          >
            <option value="">+ Añadir modelo…</option>
            {cat.modelos
              .filter((m) => !plan.puntosModelo.some((x) => x.idModelo === m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {cat.marcas.find((x) => x.id === m.marcaId)?.nombre} {m.nombre}
                </option>
              ))}
          </select>
        }
      >
        {plan.puntosModelo.map((x, i) => (
          <div key={x.idModelo} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ minWidth: "220px" }}>{cat.modelos.find((m) => m.id === x.idModelo)?.nombre}</span>
            <InputCentesimas valor={x.puntos} onChange={(n) => setPlan((p) => ({ ...p, puntosModelo: p.puntosModelo.map((y, j) => (j === i ? { ...y, puntos: n ?? 0 } : y)) }))} sufijo="puntos" />
            <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, puntosModelo: p.puntosModelo.filter((_, j) => j !== i) }))}>
              Quitar
            </BotonMini>
          </div>
        ))}
      </Seccion>

      <Seccion
        titulo="Promociones de puntos (coches de doble puntuación)"
        ayuda="Todos los coches de la misma promoción cuentan juntos, sea cual sea el modelo. Si en el mes se llega al mínimo, cada coche vale los puntos especiales; si no, los puntos «si no cumple». La comisión se cobra una sola vez por coche."
        acciones={
          <BotonMini onClick={() => setPlan((p) => ({ ...p, promociones: [...p.promociones, { nombre: "", puntosEspeciales: 200, minimoUnidades: 2, puntosSiNoCumple: 100 }] }))}>
            + Nueva promoción
          </BotonMini>
        }
      >
        {plan.promociones.map((x, i) => (
          <div key={x.id ?? `n${i}`} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: "10px", alignItems: "end" }}>
            <div>
              <label className="form-label">Nombre</label>
              <input className="form-input" value={x.nombre} onChange={(e) => setPlan((p) => ({ ...p, promociones: p.promociones.map((y, j) => (j === i ? { ...y, nombre: e.target.value } : y)) }))} />
            </div>
            <div>
              <label className="form-label">Puntos especiales</label>
              <InputCentesimas valor={x.puntosEspeciales} onChange={(n) => setPlan((p) => ({ ...p, promociones: p.promociones.map((y, j) => (j === i ? { ...y, puntosEspeciales: n ?? 0 } : y)) }))} />
            </div>
            <div>
              <label className="form-label">Mínimo de unidades</label>
              <InputEntero valor={x.minimoUnidades} min={1} onChange={(n) => setPlan((p) => ({ ...p, promociones: p.promociones.map((y, j) => (j === i ? { ...y, minimoUnidades: Math.max(1, n) } : y)) }))} />
            </div>
            <div>
              <label className="form-label">Puntos si no cumple</label>
              <InputCentesimas valor={x.puntosSiNoCumple} onChange={(n) => setPlan((p) => ({ ...p, promociones: p.promociones.map((y, j) => (j === i ? { ...y, puntosSiNoCumple: n ?? 0 } : y)) }))} />
            </div>
            <BotonMini peligro onClick={() => setPlan((p) => ({ ...p, promociones: p.promociones.filter((_, j) => j !== i) }))}>
              Quitar
            </BotonMini>
          </div>
        ))}
      </Seccion>
    </div>
  );
}
