import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import {
  commissionPlans,
  commissionPlanModelRates,
  commissionRules,
  commissionBonusRules,
  commissionFinanceRules,
  commissionUsedRates,
  commissionFinanceRates,
  commissionPreferenceRules,
  marcas,
  commissionLiquidations,
  commissionLiquidationLines,
  commissionLiquidationLineItems,
  expedientes,
  usuarios
} from "@/db/schema";
import { eq } from "drizzle-orm";

async function checkAdminAuth() {
  const { userId } = await auth();
  if (!userId) return null;

  const localUser = await db.query.usuarios.findFirst({
    where: eq(usuarios.clerk_id, userId),
  });

  if (!localUser || localUser.rol !== "administrador") {
    return null;
  }
  return localUser;
}

export async function GET(req: NextRequest) {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return NextResponse.json({ message: "No autorizado. Se requieren permisos de administrador." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const lineIdStr = searchParams.get("lineId");

    if (!lineIdStr) {
      return NextResponse.json({ message: "Falta el ID de la línea de liquidación" }, { status: 400 });
    }

    const lineId = Number(lineIdStr);

    const items = await db.query.commissionLiquidationLineItems.findMany({
      where: eq(commissionLiquidationLineItems.id_line, lineId)
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error: any) {
    console.error("Error al obtener detalles de la línea:", error);
    return NextResponse.json({ message: error.message || "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return NextResponse.json({ message: "No autorizado. Se requieren permisos de administrador." }, { status: 403 });
    }

    const body = await req.json();
    const { id_plan } = body;

    if (!id_plan) {
      return NextResponse.json({ message: "Falta el ID del plan de comisión" }, { status: 400 });
    }

    const planId = Number(id_plan);

    // 1. Obtener datos del plan
    const plan = await db.query.commissionPlans.findFirst({
      where: eq(commissionPlans.id_plan, planId),
      with: {
        rates: true,
        rules: true,
        bonusRules: true,
        financeRules: true,
        usedRates: true,
        financeRates: true,
        preferenceRules: true,
        voPatterns: true,
        brandInterventionRates: true,
        liquidations: true
      }
    });

    if (!plan) {
      return NextResponse.json({ message: "Plan no encontrado" }, { status: 404 });
    }

    const startDate = plan.fecha_inicio;
    const endDate = plan.fecha_fin;
    const X = plan.objetivo_base + plan.arrastre;

    // 2. Limpiar liquidaciones previas en borrador
    const existingLiq = plan.liquidations?.[0];
    if (existingLiq) {
      await db.delete(commissionLiquidations).where(eq(commissionLiquidations.id_liquidation, existingLiq.id_liquidation));
    }

    // 3. Consultar todos los expedientes de la BD con relaciones
    const allExpedientes = await db.query.expedientes.findMany({
      with: {
        usuario: true,
        cliente: true,
        tipoDeVenta: true,
        estadoVehiculo: true,
        modelo: {
          with: {
            marca: true
          }
        }
      }
    });

    // 4. Filtrar expedientes que cualifiquen por fechas de Matriculación (o Facturación en VO) o RCI
    const qualExpedientes = allExpedientes.filter((exp) => {
      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const isVN = stateName === "nuevo" || stateName === "demo";
      const effectiveMatDate = exp.cobrado_otra_fecha && exp.fecha_cobrado 
        ? exp.fecha_cobrado 
        : (isVN ? exp.fecha_matriculacion : (exp.fecha_facturacion || exp.fecha_matriculacion));
      const matriculacionIn = effectiveMatDate && effectiveMatDate >= startDate && effectiveMatDate <= endDate;
      const rciIn = exp.fecha_rci && exp.fecha_rci >= startDate && exp.fecha_rci <= endDate;
      const afectacionIn = exp.fecha_afectacion && exp.fecha_afectacion >= startDate && exp.fecha_afectacion <= endDate;
      const pedidoIn = exp.fecha_expediente && exp.fecha_expediente >= startDate && exp.fecha_expediente <= endDate;
      return matriculacionIn || rciIn || afectacionIn || pedidoIn;
    });

    // 5. Agrupar expedientes por vendedor (id_usuario) para calcular tramos individuales
    const expedientesByVendedor: Record<number, typeof qualExpedientes> = {};
    qualExpedientes.forEach((exp) => {
      const idVendedor = exp.id_usuario;
      if (idVendedor) {
        if (!expedientesByVendedor[idVendedor]) {
          expedientesByVendedor[idVendedor] = [];
        }
        expedientesByVendedor[idVendedor].push(exp);
      }
    });

    // Estructuras para acumular los resultados calculados
    const linesToInsert: any[] = [];
    const lineItemsToInsertMap: Record<string, any[]> = {}; // mapea por index temporal de la línea

    let totalLiquidacionGlobal = 0;
    let indexLineaTemp = 0;

    // 6. Realizar cálculos para cada vendedor
    for (const [idVendedorStr, vendedorExps] of Object.entries(expedientesByVendedor)) {
      const idVendedor = Number(idVendedorStr);
      const seller = vendedorExps[0]?.usuario;
      const isVOVendedor = seller?.tipo_vendedor === "VO";
      const patronName = seller?.patron_vo || "Estándar VO";

      const matchedPattern = plan.voPatterns?.find((vp: any) => vp.nombre === patronName && vp.activo)
        || plan.voPatterns?.find((vp: any) => vp.activo && vp.aplica_a_vn);

      let matchedPatternTiers: any[] = [];
      const appliesVoPattern = isVOVendedor || (matchedPattern && matchedPattern.aplica_a_vn);

      if (matchedPattern && appliesVoPattern) {
        try {
          matchedPatternTiers = typeof matchedPattern.tiers === "string" ? JSON.parse(matchedPattern.tiers) : (matchedPattern.tiers || []);
        } catch (e) {
          matchedPatternTiers = [];
        }
      }

      // Ordenar expedientes cronológicamente para aplicar progresiones de forma secuencial y consistente
      vendedorExps.sort((a, b) => {
        const isVNa = (a.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "") === "nuevo" || (a.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "") === "demo";
        const isVNb = (b.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "") === "nuevo" || (b.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "") === "demo";
        const dateA = (a.cobrado_otra_fecha && a.fecha_cobrado ? a.fecha_cobrado : (isVNa ? a.fecha_matriculacion : (a.fecha_facturacion || a.fecha_matriculacion))) || a.fecha_afectacion || a.fecha_expediente || "";
        const dateB = (b.cobrado_otra_fecha && b.fecha_cobrado ? b.fecha_cobrado : (isVNb ? b.fecha_matriculacion : (b.fecha_facturacion || b.fecha_matriculacion))) || b.fecha_afectacion || b.fecha_expediente || "";
        return dateA.localeCompare(dateB);
      });

      // Pre-calcular tasas de intervención por marca para el vendedor actual (basado en VN matriculados y fecha_rci)
      const totalMatriculadosPorMarca: Record<number, number> = {};
      const financiadosPorMarca: Record<number, number> = {};

      vendedorExps.forEach((exp) => {
        const brandId = exp.modelo?.marca_id;
        if (brandId) {
          const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
          const isVN = stateName === "nuevo" || stateName === "demo";
          
          if (isVN) {
            // Denominador: Coches matriculados en el mes
            const effectiveMatDate = exp.cobrado_otra_fecha && exp.fecha_cobrado ? exp.fecha_cobrado : exp.fecha_matriculacion;
            const entraMatriculacion = effectiveMatDate && effectiveMatDate >= startDate && effectiveMatDate <= endDate;
            if (entraMatriculacion) {
              totalMatriculadosPorMarca[brandId] = (totalMatriculadosPorMarca[brandId] || 0) + 1;
            }
            
            // Numerador: Coches con contratación de financiación (fecha_rci) en el mes
            const entraRci = exp.fecha_rci && exp.fecha_rci >= startDate && exp.fecha_rci <= endDate;
            if (entraRci) {
              const salesTypeName = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
              const isFinanced = salesTypeName.includes("preference") || 
                                 salesTypeName.includes("crédito") || 
                                 salesTypeName.includes("credito") || 
                                 salesTypeName.includes("renting");
              if (isFinanced) {
                financiadosPorMarca[brandId] = (financiadosPorMarca[brandId] || 0) + 1;
              }
            }
          }
        }
      });

      const checkTasaCumplida = (brandId: number) => {
        const total = totalMatriculadosPorMarca[brandId] || 0;
        if (total === 0) return true; // Por defecto cumple si no tiene matriculaciones de esa marca
        
        const financiados = financiadosPorMarca[brandId] || 0;
        const brandInt = plan.brandInterventionRates?.find((i: any) => i.id_marca === brandId);
        const targetRate = brandInt?.tasa_intervencion ?? 70;
        const tipoTasa = brandInt?.tipo_tasa ?? "porcentaje";
        
        if (tipoTasa === "unidades") {
          return financiados >= targetRate;
        } else {
          const actualRate = (financiados / total) * 100;
          return actualRate >= targetRate;
        }
      };

      // Helper para obtener el valor objetivo original de un expediente (priorizando el del expediente y cayendo al default de la marca del plan)
      const getOriginalValorObjetivo = (exp: any) => {
        if (exp.valor_objetivo !== null && exp.valor_objetivo !== undefined) {
          return Number(exp.valor_objetivo);
        }
        const brandId = exp.modelo?.marca_id;
        if (brandId) {
          const brandIntervention = plan.brandInterventionRates?.find((r: any) => r.id_marca === brandId);
          if (brandIntervention && brandIntervention.valor_objetivo_defecto !== undefined && brandIntervention.valor_objetivo_defecto !== null) {
            return Number(brandIntervention.valor_objetivo_defecto);
          }
        }
        return 1.0;
      };

      // Helper para obtener la fecha de actividad inicial (mínima entre fecha_expediente y fecha_afectacion, cayendo a fecha_matriculacion)
      const getActivityDate = (e: any) => {
        if (e.fecha_expediente && e.fecha_afectacion) {
          return e.fecha_expediente < e.fecha_afectacion ? e.fecha_expediente : e.fecha_afectacion;
        }
        return e.fecha_expediente || e.fecha_afectacion || e.fecha_matriculacion || "";
      };

      // Pre-calcular la cantidad de expedientes en el período para cada valor de cupo (min_coches_multiplicador)
      const cupoCounts: Record<number, number> = {};
      vendedorExps.forEach((e) => {
        const actDate = getActivityDate(e);
        const eEntraActivity = actDate && actDate >= startDate && actDate <= endDate;
        if (eEntraActivity) {
          const targetCupo = e.min_coches_multiplicador !== null && e.min_coches_multiplicador !== undefined
            ? Number(e.min_coches_multiplicador)
            : 0;
          if (targetCupo > 0) {
            cupoCounts[targetCupo] = (cupoCounts[targetCupo] || 0) + 1;
          }
        }
      });

      // --- Primera Pasada: Identificar tipos, calcular totalComputablesVendedor y matriculacionesRealesVendedor ---
      let totalComputablesVendedor = 0;
      let matriculacionesRealesVendedor = 0;
      let voUnitCounter = 0;

      // Estructura para registrar los datos clasificados por expediente
      const expsClasificados = vendedorExps.map((exp) => {
        const entraPedido = exp.fecha_expediente && exp.fecha_expediente >= startDate && exp.fecha_expediente <= endDate;
        const entraAfectacion = exp.fecha_afectacion && exp.fecha_afectacion >= startDate && exp.fecha_afectacion <= endDate;
        const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
        const isVN = stateName === "nuevo" || stateName === "demo";
        const effectiveMatDate = exp.cobrado_otra_fecha && exp.fecha_cobrado 
          ? exp.fecha_cobrado 
          : (isVN ? exp.fecha_matriculacion : (exp.fecha_facturacion || exp.fecha_matriculacion));
        const entraMatriculacion = effectiveMatDate && effectiveMatDate >= startDate && effectiveMatDate <= endDate;
        const entraRci = exp.fecha_rci && exp.fecha_rci >= startDate && exp.fecha_rci <= endDate;

        const actDate = getActivityDate(exp);
        const entraActivity = actDate && actDate >= startDate && actDate <= endDate;

        const salesTypeNameLower = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
        const isCreditoVenta = (salesTypeNameLower.includes("crédito") || salesTypeNameLower.includes("credito") || salesTypeNameLower.includes("financiado") || salesTypeNameLower.includes("renting")) && !salesTypeNameLower.includes("preference");
        const isPreferenceVenta = salesTypeNameLower.includes("preference");

        if (entraMatriculacion) {
          matriculacionesRealesVendedor++;
        }

        let tipoUsado: "VO" | "KM0" | "BB" | "Usado" | null = null;
        if (!isVN) {
          if (stateName === "km0") tipoUsado = "KM0";
          else if (stateName === "buyback" || stateName === "bb") tipoUsado = "BB";
          else if (stateName === "seminuevo" || stateName === "vo") tipoUsado = "VO";
          else tipoUsado = "Usado";
        }

        let objValorExpediente = 0;
        let sufijoDetalle = "";
        let afectoObjetivo = false;
        const itemsDetalle: { concepto: string; importe: number; afecta_objetivo: boolean; valor_objetivo: number }[] = [];

        const originalVal = getOriginalValorObjetivo(exp);

        const baseVal = originalVal === 0 ? 1.0 : originalVal;

        if (entraActivity || entraMatriculacion) {
          afectoObjetivo = true;
          if (entraActivity) {
            const targetCupo = exp.min_coches_multiplicador !== null && exp.min_coches_multiplicador !== undefined
              ? Number(exp.min_coches_multiplicador)
              : 0;

            if (targetCupo > 0 && baseVal > 1) {
              const countOfSameCupo = cupoCounts[targetCupo] || 0;
              if (countOfSameCupo >= targetCupo) {
                // Cupo cumplido!
                objValorExpediente = baseVal;
                sufijoDetalle = ` (Cupo ${targetCupo} cumplido: suma +${baseVal})`;
              } else {
                // Cupo no cumplido!
                objValorExpediente = 1.0;
                sufijoDetalle = ` (Cupo ${targetCupo} no cumplido [hecho ${countOfSameCupo}/${targetCupo}]: cae a +1.0)`;
              }
            } else {
              // Sin cupo requerido
              objValorExpediente = baseVal;
              sufijoDetalle = ` (Aporta su valor original: +${baseVal})`;
            }
          } else {
            // Entra por matriculación únicamente (actividad fue en otro mes)
            objValorExpediente = baseVal;
            sufijoDetalle = ` (Aporta por matriculación: +${baseVal})`;
          }
        }

        // A. Cómputo objetivo base VN o VO
        if (afectoObjetivo) {
          if (isVN) {
            const brandId = exp.modelo?.marca_id;
            const tasaCumplida = brandId ? checkTasaCumplida(brandId) : false;
            const modelRate = plan.rates.find(r => r.id_modelo === exp.id_modelo && r.activo && r.tasa_intervencion_cumplida === tasaCumplida);
            if (modelRate) {
              objValorExpediente = objValorExpediente; // ya establecido
              itemsDetalle.push({
                concepto: `Cómputo Base VN Modelo (${exp.modelo?.nombre_modelo}) [${tasaCumplida ? 'Tasa OK' : 'Tasa Baja'}]${sufijoDetalle}`,
                importe: 0,
                afecta_objetivo: true,
                valor_objetivo: objValorExpediente
              });
            }
          } else if (tipoUsado) {
            if (!appliesVoPattern) {
              const usedRate = plan.usedRates.find(r => r.tipo_usado === tipoUsado && r.activo);
              if (usedRate) {
                itemsDetalle.push({
                  concepto: `Cómputo Base VO Tipo (${tipoUsado})${sufijoDetalle}`,
                  importe: 0,
                  afecta_objetivo: true,
                  valor_objetivo: objValorExpediente
                });
              }
            } else {
              voUnitCounter++;
              itemsDetalle.push({
                concepto: `Cómputo VO Progresivo (Unidad #${voUnitCounter})${sufijoDetalle}`,
                importe: 0,
                afecta_objetivo: true,
                valor_objetivo: objValorExpediente
              });
            }
          }
        }

        // B. Cómputo por reglas generales (commissionRules)
        plan.rules.forEach((rule) => {
          if (!rule.activa) return;

          const eventMatches = 
            (rule.tipo_evento === "pedido" && entraPedido) ||
            (rule.tipo_evento === "afectacion" && entraAfectacion) ||
            (rule.tipo_evento === "matriculacion" && entraMatriculacion) ||
            ((rule.tipo_evento === "credito" || rule.tipo_evento === "financiacion") && entraRci && exp.id_tipo_de_venta && isCreditoVenta) ||
            (rule.tipo_evento === "preference" && entraRci && isPreferenceVenta);

          if (!eventMatches) return;

          if (rule.tasa_intervencion_cumplida !== null && rule.tasa_intervencion_cumplida !== undefined) {
            const brandId = exp.modelo?.marca_id;
            if (!brandId) return;
            const tasaCumplida = checkTasaCumplida(brandId);
            if (tasaCumplida !== rule.tasa_intervencion_cumplida) return;
          }

          const filterMarcaMatches = !rule.id_marca || exp.modelo?.marca_id === rule.id_marca;
          const filterModeloMatches = !rule.id_modelo || exp.id_modelo === rule.id_modelo;

          if (filterMarcaMatches && filterModeloMatches) {
            if (rule.afecta_objetivo) {
              objValorExpediente += rule.valor_objetivo;
              itemsDetalle.push({
                concepto: `Regla Objetivo: ${rule.nombre}`,
                importe: 0,
                afecta_objetivo: true,
                valor_objetivo: rule.valor_objetivo
              });
            }

            // Si es preference y está ligada a crédito, buscar regla de crédito aplicable y sumar su objetivo si afecta
            if (rule.tipo_evento === "preference" && rule.ligar_a_credito) {
              const matchingCreditRule = plan.rules.find((r) => {
                if (!r.activa) return false;
                if (r.tipo_evento !== "credito" && r.tipo_evento !== "financiacion") return false;

                const brandId = exp.modelo?.marca_id;
                const filterMarcaMatches = !r.id_marca || brandId === r.id_marca;
                const filterModeloMatches = !r.id_modelo || exp.id_modelo === r.id_modelo;

                let tasaMatches = true;
                if (r.tasa_intervencion_cumplida !== null && r.tasa_intervencion_cumplida !== undefined) {
                  if (brandId) {
                    const tasaCumplida = checkTasaCumplida(brandId);
                    tasaMatches = (tasaCumplida === r.tasa_intervencion_cumplida);
                  } else {
                    tasaMatches = false;
                  }
                }

                return filterMarcaMatches && filterModeloMatches && tasaMatches;
              });

              if (matchingCreditRule && matchingCreditRule.afecta_objetivo) {
                objValorExpediente += matchingCreditRule.valor_objetivo;
                itemsDetalle.push({
                  concepto: `Regla Objetivo Ligada (Crédito): ${matchingCreditRule.nombre}`,
                  importe: 0,
                  afecta_objetivo: true,
                  valor_objetivo: matchingCreditRule.valor_objetivo
                });
              }
            }
          }
        });

        // C. Cómputo por bonus personalizados (commissionBonusRules)
        plan.bonusRules.forEach((bonus) => {
          if (!bonus.activo) return;

          const eventMatches = 
            (bonus.tipo_evento === "pedido" && (entraPedido || entraAfectacion)) ||
            (bonus.tipo_evento === "afectacion" && entraAfectacion) ||
            (bonus.tipo_evento === "matriculacion" && entraMatriculacion) ||
            ((bonus.tipo_evento === "credito" || bonus.tipo_evento === "financiacion") && entraRci && exp.id_tipo_de_venta && isCreditoVenta) ||
            (bonus.tipo_evento === "preference" && entraRci && isPreferenceVenta);

          if (!eventMatches) return;

          // Filtro tipo_vehiculo del bonus (nuevo, usado, cualquiera)
          if (bonus.tipo_vehiculo === "nuevo" && !isVN) return;
          if (bonus.tipo_vehiculo === "usado" && isVN) return;

          // Filtro de fechas
          let eventDate = exp.fecha_expediente;
          if (bonus.tipo_evento === "pedido" && entraAfectacion && exp.fecha_afectacion) {
            eventDate = exp.fecha_afectacion;
          } else if (bonus.tipo_evento === "afectacion") {
            eventDate = exp.fecha_afectacion;
          } else if (bonus.tipo_evento === "matriculacion") {
            eventDate = exp.fecha_matriculacion || (exp.cobrado_otra_fecha && exp.fecha_cobrado ? exp.fecha_cobrado : null);
          } else if (bonus.tipo_evento === "credito" || bonus.tipo_evento === "financiacion" || bonus.tipo_evento === "preference") {
            eventDate = exp.fecha_rci;
          }

          const refEventDate = eventDate || exp.fecha_expediente;
          if (bonus.fecha_inicio && refEventDate && refEventDate < bonus.fecha_inicio) return;
          if (bonus.fecha_fin && refEventDate && refEventDate > bonus.fecha_fin) return;

          const filterMarcaMatches = !bonus.id_marca || exp.modelo?.marca_id === bonus.id_marca;
          const filterModeloMatches = !bonus.id_modelo || exp.id_modelo === bonus.id_modelo;

          if (filterMarcaMatches && filterModeloMatches) {
            if (bonus.afecta_objetivo) {
              objValorExpediente += bonus.valor_objetivo;
              itemsDetalle.push({
                concepto: `Bonus Objetivo: ${bonus.nombre}`,
                importe: 0,
                afecta_objetivo: true,
                valor_objetivo: bonus.valor_objetivo
              });
            }
          }
        });

        totalComputablesVendedor += objValorExpediente;

        return {
          exp,
          entraPedido,
          entraAfectacion,
          entraMatriculacion,
          entraRci,
          isVN,
          tipoUsado,
          isCreditoVenta,
          isPreferenceVenta,
          valorObjetivoCalculado: objValorExpediente,
          itemsDetalleInitial: itemsDetalle
        };
      });

      // Determinar tramo (rango X-4 a X+3)
      let tramoAlcanzado: "X-4" | "X-3" | "X-2" | "X-1" | "X" | "X+1" | "X+2" | "X+3" = "X-4";
      const diff = totalComputablesVendedor - X;
      if (diff >= 3) tramoAlcanzado = "X+3";
      else if (diff === 2) tramoAlcanzado = "X+2";
      else if (diff === 1) tramoAlcanzado = "X+1";
      else if (diff === 0) tramoAlcanzado = "X";
      else if (diff === -1) tramoAlcanzado = "X-1";
      else if (diff === -2) tramoAlcanzado = "X-2";
      else if (diff === -3) tramoAlcanzado = "X-3";
      else tramoAlcanzado = "X-4";

      const cumpleMinimo = matriculacionesRealesVendedor >= plan.min_matriculaciones;

      // --- Contar y preparar para el pago de Usados/VO ---
      // Necesitamos saber cuántos usados de cada tipo tiene matriculados el vendedor
      const matriculatedUsedCounts: Record<string, number> = { VO: 0, KM0: 0, BB: 0, Usado: 0 };
      expsClasificados.forEach((c) => {
        if (c.entraMatriculacion && !c.isVN && c.tipoUsado) {
          matriculatedUsedCounts[c.tipoUsado] = (matriculatedUsedCounts[c.tipoUsado] || 0) + 1;
        }
      });

      // Mapear un contador acumulativo para saber el índice de la unidad VO de cada tipo
      const currentUsedProcessedIndex: Record<string, number> = { VO: 0, KM0: 0, BB: 0, Usado: 0 };
      let voUnitCounterPay = 0;

      // --- Segunda Pasada: Calcular comisiones económicas ---
      expsClasificados.forEach(({ exp, entraPedido, entraAfectacion, entraMatriculacion, entraRci, isVN, tipoUsado, isCreditoVenta, isPreferenceVenta, valorObjetivoCalculado, itemsDetalleInitial }) => {
        const hasCocheOverride = exp.comision_coche_real !== null && exp.comision_coche_real !== undefined;
        const hasFinanOverride = exp.comision_financiacion_real !== null && exp.comision_financiacion_real !== undefined;

        let comisionBaseVN = 0;
        let comisionUsado = 0;
        let comisionFinanciacion = 0;
        let comisionPreference = 0;
        let bonusAcumulado = 0;

        const finalItems = [...itemsDetalleInitial];

        if (entraMatriculacion) {
          // 1. Comisión Base VN o VO/Usado
          if (hasCocheOverride) {
            comisionBaseVN = Number(exp.comision_coche_real);
            comisionUsado = 0;
            if (!isVN && tipoUsado) {
              currentUsedProcessedIndex[tipoUsado]++;
            }
            finalItems.push({
              concepto: `Comisión VN/VO Coche (Modificado manualmente)`,
              importe: comisionBaseVN,
              afecta_objetivo: false,
              valor_objetivo: 0
            });
          } else if (isVN) {
            if (!isVOVendedor) {
              // VN
              const brandId = exp.modelo?.marca_id;
              const tasaCumplida = brandId ? checkTasaCumplida(brandId) : false;
              const modelRate = plan.rates.find(r => r.id_modelo === exp.id_modelo && r.activo && r.tasa_intervencion_cumplida === tasaCumplida);
              if (modelRate) {
                let rateImporte = modelRate.rate_x_minus_4;
                if (tramoAlcanzado === "X-3") rateImporte = modelRate.rate_x_minus_3;
                else if (tramoAlcanzado === "X-2") rateImporte = modelRate.rate_x_minus_2;
                else if (tramoAlcanzado === "X-1") rateImporte = modelRate.rate_x_minus_1;
                else if (tramoAlcanzado === "X") rateImporte = modelRate.rate_x;
                else if (tramoAlcanzado === "X+1") rateImporte = modelRate.rate_x_plus_1;
                else if (tramoAlcanzado === "X+2") rateImporte = modelRate.rate_x_plus_2;
                else if (tramoAlcanzado === "X+3") rateImporte = modelRate.rate_x_plus_3;

                comisionBaseVN = rateImporte;
                finalItems.push({
                  concepto: `Comisión Base VN (${exp.modelo?.nombre_modelo}) - Tramo ${tramoAlcanzado} (${tasaCumplida ? 'Tasa Int. OK' : 'Tasa Int. Baja'})`,
                  importe: rateImporte,
                  afecta_objetivo: false,
                  valor_objetivo: 0
                });
              }
            } else {
              comisionBaseVN = 0;
              finalItems.push({
                concepto: `Comisión Base VN (${exp.modelo?.nombre_modelo}) - Omitida (Vendedor de VO)`,
                importe: 0,
                afecta_objetivo: false,
                valor_objetivo: 0
              });
            }
          } else if (tipoUsado) {
            if (!appliesVoPattern) {
              // VO/Usado
              const usedRate = plan.usedRates.find(r => r.tipo_usado === tipoUsado && r.activo);
              if (usedRate) {
                const totalUnitsOfType = matriculatedUsedCounts[tipoUsado] || 0;
                const currentIdx = currentUsedProcessedIndex[tipoUsado]++; // 0, 1, 2...

                if (totalUnitsOfType >= usedRate.min_aplicar) {
                  const isFirst = currentIdx === 0;
                  const rateImporte = isFirst ? usedRate.importe_primera : usedRate.importe_resto;
                  comisionUsado = rateImporte;

                  finalItems.push({
                    concepto: `Comisión VO (${tipoUsado}) - Unidad ${currentIdx + 1} de ${totalUnitsOfType}`,
                    importe: rateImporte,
                    afecta_objetivo: false,
                    valor_objetivo: 0
                  });
                } else {
                  finalItems.push({
                    concepto: `Comisión VO (${tipoUsado}) - No aplica (mínimo no alcanzado: ${totalUnitsOfType}/${usedRate.min_aplicar})`,
                    importe: 0,
                    afecta_objetivo: false,
                    valor_objetivo: 0
                  });
                }
              }
            } else {
              voUnitCounterPay++;
              const tier = matchedPatternTiers.find((t: any) => t.unidad === voUnitCounterPay)
                || matchedPatternTiers[matchedPatternTiers.length - 1]
                || { valor_objetivo: 1, importe: 150 };

              comisionUsado = tier.importe;
              finalItems.push({
                concepto: `Comisión VO Progresiva (Unidad #${voUnitCounterPay}) - Patrón: ${matchedPattern?.nombre || patronName}`,
                importe: tier.importe,
                afecta_objetivo: false,
                valor_objetivo: 0
              });
            }
          }

        }

        // 2. Comisión por Financiación (configurable por Marca y Tipo Financiación) - Se abona según fecha RCI
        if (!hasFinanOverride && entraRci && exp.id_tipo_de_venta) {
          const salesTypeName = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
          let matchedFinanceType = "";
          if (salesTypeName.includes("preference")) {
            matchedFinanceType = "Preference";
          } else if (salesTypeName.includes("crédito") || salesTypeName.includes("credito") || salesTypeName.includes("financiado")) {
            matchedFinanceType = "Crédito";
          } else if (salesTypeName.includes("renting")) {
            matchedFinanceType = "Renting";
          } else if (salesTypeName.includes("contado")) {
            matchedFinanceType = "Contado";
          }

          if (matchedFinanceType && exp.modelo?.marca_id) {
            const finRate = plan.financeRates.find(
              r => r.id_marca === exp.modelo?.marca_id && r.tipo_financiacion === matchedFinanceType
            );
            if (finRate) {
              comisionFinanciacion = finRate.importe;
              finalItems.push({
                concepto: `Incentivo Financiación (${exp.modelo?.marca?.nombre} - ${matchedFinanceType})`,
                importe: finRate.importe,
                afecta_objetivo: false,
                valor_objetivo: 0
              });
            }
          }
        }

        // 3. Reglas Preference / BOX3 (commissionPreferenceRules) - Se aplican según fecha RCI
        if (!hasFinanOverride && entraRci) {
          plan.preferenceRules.forEach((rule) => {
            if (!rule.activa) return;

            // Filtros de regla
            const filterMarcaMatches = !rule.id_marca || exp.modelo?.marca_id === rule.id_marca;
            const filterModeloMatches = !rule.id_modelo || exp.id_modelo === rule.id_modelo;

            let finMatches = true;
            if (rule.tipo_financiacion) {
              const ruleFin = rule.tipo_financiacion.toLowerCase();
              const expFin = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
              finMatches = expFin.includes(ruleFin) || ruleFin.includes(expFin);
            }

            if (filterMarcaMatches && filterModeloMatches && finMatches) {
              comisionPreference += rule.importe;
              finalItems.push({
                concepto: `Regla Preference/BOX3: ${rule.nombre}`,
                importe: rule.importe,
                afecta_objetivo: false,
                valor_objetivo: 0
              });
            }
          });
        }

        // 4. Evaluar reglas generales de comisión (para dinero)
        plan.rules.forEach((rule) => {
          if (!rule.activa || !rule.afecta_comision) return;
          if (hasFinanOverride && (rule.tipo_evento === "preference" || rule.tipo_evento === "credito" || rule.tipo_evento === "financiacion")) return;

          const eventMatches = 
            (rule.tipo_evento === "pedido" && entraPedido) ||
            (rule.tipo_evento === "afectacion" && entraAfectacion) ||
            (rule.tipo_evento === "matriculacion" && entraMatriculacion) ||
            ((rule.tipo_evento === "credito" || rule.tipo_evento === "financiacion") && entraRci && exp.id_tipo_de_venta && isCreditoVenta) ||
            (rule.tipo_evento === "preference" && entraRci && isPreferenceVenta);

          if (!eventMatches) return;

          if (rule.tasa_intervencion_cumplida !== null && rule.tasa_intervencion_cumplida !== undefined) {
            const brandId = exp.modelo?.marca_id;
            if (!brandId) return;
            const tasaCumplida = checkTasaCumplida(brandId);
            if (tasaCumplida !== rule.tasa_intervencion_cumplida) return;
          }

          const filterMarcaMatches = !rule.id_marca || exp.modelo?.marca_id === rule.id_marca;
          const filterModeloMatches = !rule.id_modelo || exp.id_modelo === rule.id_modelo;

          if (filterMarcaMatches && filterModeloMatches) {
            if (rule.tipo_evento === "preference") {
              comisionPreference += rule.importe;
            } else if (rule.tipo_evento === "credito" || rule.tipo_evento === "financiacion") {
              comisionFinanciacion += rule.importe;
            } else {
              bonusAcumulado += rule.importe;
            }
            finalItems.push({
              concepto: `Regla Comisión: ${rule.nombre}`,
              importe: rule.importe,
              afecta_objetivo: false,
              valor_objetivo: 0
            });

            // Si es preference y está ligada a crédito, buscar regla de crédito aplicable y sumar su importe
            if (rule.tipo_evento === "preference" && rule.ligar_a_credito) {
              const matchingCreditRule = plan.rules.find((r) => {
                if (!r.activa) return false;
                if (r.tipo_evento !== "credito" && r.tipo_evento !== "financiacion") return false;

                const brandId = exp.modelo?.marca_id;
                const filterMarcaMatches = !r.id_marca || brandId === r.id_marca;
                const filterModeloMatches = !r.id_modelo || exp.id_modelo === r.id_modelo;

                let tasaMatches = true;
                if (r.tasa_intervencion_cumplida !== null && r.tasa_intervencion_cumplida !== undefined) {
                  if (brandId) {
                    const tasaCumplida = checkTasaCumplida(brandId);
                    tasaMatches = (tasaCumplida === r.tasa_intervencion_cumplida);
                  } else {
                    tasaMatches = false;
                  }
                }

                return filterMarcaMatches && filterModeloMatches && tasaMatches;
              });

              if (matchingCreditRule) {
                comisionFinanciacion += matchingCreditRule.importe;
                finalItems.push({
                  concepto: `Regla Comisión Ligada (Crédito): ${matchingCreditRule.nombre}`,
                  importe: matchingCreditRule.importe,
                  afecta_objetivo: false,
                  valor_objetivo: 0
                });
              }
            }
          }
        });

        // 5. Evaluar bonus personalizados (para dinero)
        plan.bonusRules.forEach((bonus) => {
          if (!bonus.activo || (!bonus.es_penalizacion && bonus.importe <= 0)) return;

          const eventMatches = 
            (bonus.tipo_evento === "pedido" && (entraPedido || entraAfectacion)) ||
            (bonus.tipo_evento === "afectacion" && entraAfectacion) ||
            (bonus.tipo_evento === "matriculacion" && entraMatriculacion) ||
            ((bonus.tipo_evento === "credito" || bonus.tipo_evento === "financiacion") && entraRci && exp.id_tipo_de_venta && isCreditoVenta) ||
            (bonus.tipo_evento === "preference" && entraRci && isPreferenceVenta);

          if (!eventMatches) return;

          // Filtro tipo_vehiculo del bonus
          if (bonus.tipo_vehiculo === "nuevo" && !isVN) return;
          if (bonus.tipo_vehiculo === "usado" && isVN) return;

          // Filtro de fechas
          let eventDate = exp.fecha_expediente;
          if (bonus.tipo_evento === "pedido" && entraAfectacion && exp.fecha_afectacion) {
            eventDate = exp.fecha_afectacion;
          } else if (bonus.tipo_evento === "afectacion") {
            eventDate = exp.fecha_afectacion;
          } else if (bonus.tipo_evento === "matriculacion") {
            eventDate = exp.fecha_matriculacion || (exp.cobrado_otra_fecha && exp.fecha_cobrado ? exp.fecha_cobrado : null);
          } else if (bonus.tipo_evento === "credito" || bonus.tipo_evento === "financiacion" || bonus.tipo_evento === "preference") {
            eventDate = exp.fecha_rci;
          }

          const refEventDate = eventDate || exp.fecha_expediente;
          if (bonus.fecha_inicio && refEventDate && refEventDate < bonus.fecha_inicio) return;
          if (bonus.fecha_fin && refEventDate && refEventDate > bonus.fecha_fin) return;

          const filterMarcaMatches = !bonus.id_marca || exp.modelo?.marca_id === bonus.id_marca;
          const filterModeloMatches = !bonus.id_modelo || exp.id_modelo === bonus.id_modelo;

          if (filterMarcaMatches && filterModeloMatches) {
            if (bonus.es_penalizacion) {
              const penaltyVal = -Math.abs(bonus.importe);
              bonusAcumulado += penaltyVal;
              finalItems.push({
                concepto: `Penalización: ${bonus.nombre}`,
                importe: penaltyVal,
                afecta_objetivo: false,
                valor_objetivo: 0
              });
            } else {
              bonusAcumulado += bonus.importe;
              finalItems.push({
                concepto: `Bonus Campaña: ${bonus.nombre}`,
                importe: bonus.importe,
                afecta_objetivo: false,
                valor_objetivo: 0
              });
            }
          }
        });
        if (hasFinanOverride) {
          comisionFinanciacion = Number(exp.comision_financiacion_real);
          comisionPreference = 0;
          finalItems.push({
            concepto: `Comisión Financiación (Modificado manualmente)`,
            importe: comisionFinanciacion,
            afecta_objetivo: false,
            valor_objetivo: 0
          });
        }

        // Sumar todos los componentes para calcular la comisión económica teórica
        const totalTeoricoExpediente = comisionBaseVN + comisionUsado + comisionFinanciacion + comisionPreference + bonusAcumulado;

        // Si no se cumple con el mínimo de matriculaciones reales del periodo, se penaliza a 0 la comisión final.
        const totalGeneradoFinal = cumpleMinimo ? totalTeoricoExpediente : 0;
        
        totalLiquidacionGlobal += totalGeneradoFinal;

        const effectiveMatDate = exp.cobrado_otra_fecha && exp.fecha_cobrado 
          ? exp.fecha_cobrado 
          : (isVN ? exp.fecha_matriculacion : (exp.fecha_facturacion || exp.fecha_matriculacion));
        const referenceDateStr = effectiveMatDate || exp.fecha_afectacion || exp.fecha_expediente || startDate;
        const refDate = new Date(referenceDateStr);
        const mesGeneracion = refDate.toLocaleString("es-ES", { month: "long", year: "numeric" });
        
        const payDate = new Date(refDate);
        payDate.setMonth(payDate.getMonth() + 1);
        const mesPagoEstimado = payDate.toLocaleString("es-ES", { month: "long", year: "numeric" });

        // Guardar la línea de liquidación temporalmente
        const lineKey = `line_${indexLineaTemp++}`;
        linesToInsert.push({
          id_expediente: exp.id_expediente,
          vendedor_nombre: exp.usuario?.nombre || "Desconocido",
          cliente_nombre: exp.cliente?.nombre || "Sin Cliente",
          marca_nombre: exp.modelo?.marca?.nombre || (isVN ? "VN" : "VO"),
          modelo_nombre: exp.modelo?.nombre_modelo || "Sin Modelo",
          fecha_pedido: exp.fecha_expediente,
          fecha_afectacion: exp.fecha_afectacion,
          fecha_matriculacion: exp.fecha_matriculacion,
          entra_por_pedido: !!entraPedido,
          entra_por_afectacion: !!entraAfectacion,
          entra_por_matriculacion: !!entraMatriculacion,
          valor_para_objetivo: valorObjetivoCalculado,
          // comision_base is the sum of VN and VO/Usado for backwards compatibility
          comision_base: comisionBaseVN + comisionUsado,
          comision_base_vn: comisionBaseVN,
          comision_usado: comisionUsado,
          comision_financiacion: comisionFinanciacion,
          comision_preference: comisionPreference,
          bonus_acumulado: bonusAcumulado,
          total_generado: totalGeneradoFinal,
          mes_generacion: mesGeneracion,
          mes_pago_estimado: mesPagoEstimado,
          // Valores de control para mostrar en la fila del listado
          tramo_vendedor: tramoAlcanzado,
          computables_vendedor: totalComputablesVendedor,
          matriculaciones_vendedor: matriculacionesRealesVendedor,
          cumple_minimo_vendedor: cumpleMinimo
        });

        lineItemsToInsertMap[lineKey] = finalItems;
      });
    }

    // Determinar tramo global (el tramo predominante, o el del primer vendedor,
    // para rellenar la cabecera de la liquidación global, o simplemente ponemos "Calculado")
    let tramoPredominante = "X-4";
    if (linesToInsert.length > 0) {
      tramoPredominante = linesToInsert[0].tramo_vendedor;
    }

    const finalComision = Math.max(0, totalLiquidacionGlobal - Math.abs(plan.penalizacion_importe || 0));

    // A. Insertar cabecera de liquidación
    const [insertedLiq] = await db.insert(commissionLiquidations).values({
      id_plan: planId,
      estado: "calculada",
      fecha_calculo: new Date().toISOString().split("T")[0],
      objetivo_base_snapshot: plan.objetivo_base,
      arrastre_snapshot: plan.arrastre,
      x_calculado_snapshot: X,
      total_computables_snapshot: linesToInsert.reduce((sum, l) => sum + l.valor_para_objetivo, 0),
      tramo_alcanzado_snapshot: tramoPredominante,
      matriculaciones_reales_snapshot: linesToInsert.filter(l => l.entra_por_matriculacion).length,
      cumple_minimo_snapshot: linesToInsert.every(l => l.cumple_minimo_vendedor),
      total_comision_economica: totalLiquidacionGlobal,
      penalizacion_importe_snapshot: -Math.abs(plan.penalizacion_importe || 0),
      penalizacion_titulo_snapshot: plan.penalizacion_titulo || null,
      penalizacion_descripcion_snapshot: plan.penalizacion_descripcion || null,
    }).returning();

    const newLiquidationId = insertedLiq.id_liquidation;

    // B. Insertar líneas e ítems de desglose
    for (let i = 0; i < linesToInsert.length; i++) {
      const lineData = linesToInsert[i];
      
      const [insertedLine] = await db.insert(commissionLiquidationLines).values({
        id_liquidation: newLiquidationId,
        id_expediente: lineData.id_expediente,
        vendedor_nombre: lineData.vendedor_nombre,
        cliente_nombre: lineData.cliente_nombre,
        marca_nombre: lineData.marca_nombre,
        modelo_nombre: lineData.modelo_nombre,
        fecha_pedido: lineData.fecha_pedido,
        fecha_afectacion: lineData.fecha_afectacion,
        fecha_matriculacion: lineData.fecha_matriculacion,
        entra_por_pedido: lineData.entra_por_pedido,
        entra_por_afectacion: lineData.entra_por_afectacion,
        entra_por_matriculacion: lineData.entra_por_matriculacion,
        valor_para_objetivo: lineData.valor_para_objetivo,
        comision_base: lineData.comision_base,
        comision_base_vn: lineData.comision_base_vn,
        comision_usado: lineData.comision_usado,
        comision_financiacion: lineData.comision_financiacion,
        comision_preference: lineData.comision_preference,
        bonus_acumulado: lineData.bonus_acumulado,
        total_generado: lineData.total_generado,
        mes_generacion: lineData.mes_generacion,
        mes_pago_estimado: lineData.mes_pago_estimado,
      }).returning();

      const lineKey = `line_${i}`;
      const items = lineItemsToInsertMap[lineKey] || [];
      
      if (items.length > 0) {
        await db.insert(commissionLiquidationLineItems).values(
          items.map(it => ({
            id_line: insertedLine.id_line,
            concepto: it.concepto,
            importe: it.importe,
            afecta_objetivo: it.afecta_objetivo,
            valor_objetivo: it.valor_objetivo
          }))
        );
      }
    }

    return NextResponse.json({ success: true, message: "Liquidación calculada con éxito" });
  } catch (error: any) {
    console.error("Error al calcular liquidación de comisiones:", error);
    return NextResponse.json({ message: error.message || "Error interno al liquidar" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return NextResponse.json({ message: "No autorizado. Se requieren permisos de administrador." }, { status: 403 });
    }

    const body = await req.json();
    const { id_plan, estado_plan, id_liquidation, estado_liquidation } = body;

    if (!id_plan) {
      return NextResponse.json({ message: "Falta el ID del plan de comisión" }, { status: 400 });
    }

    // Actualizar estado del plan (borrador, activo, cerrado)
    if (estado_plan !== undefined) {
      await db.update(commissionPlans).set({
        estado: estado_plan
      }).where(eq(commissionPlans.id_plan, Number(id_plan)));
    }

    // Actualizar estado de la liquidación
    if (id_liquidation !== undefined && estado_liquidation !== undefined) {
      await db.update(commissionLiquidations).set({
        estado: estado_liquidation
      }).where(eq(commissionLiquidations.id_liquidation, Number(id_liquidation)));
    }

    return NextResponse.json({ success: true, message: "Estado de liquidación actualizado correctamente" });
  } catch (error: any) {
    console.error("Error al cambiar estado de liquidación:", error);
    return NextResponse.json({ message: error.message || "Error interno" }, { status: 500 });
  }
}
