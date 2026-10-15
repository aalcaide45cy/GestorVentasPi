import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { 
  usuarios, 
  expedientes, 
  clientes,
  marcas,
  modelos,
  tipoDeVenta,
  estadoVehiculo,
  commissionPlans, 
  commissionPlanModelRates, 
  commissionRules, 
  commissionBonusRules, 
  commissionFinanceRules, 
  commissionUsedRates, 
  commissionFinanceRates, 
  commissionPreferenceRules, 
  commissionVoPatterns 
} from "@/db/schema";
import { eq, and, lte, gte, ne } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { 
      id_expediente, 
      id_usuario, 
      id_modelo, 
      id_tipo_de_venta, 
      id_estado_vehiculo, 
      fecha_expediente, 
      fecha_afectacion, 
      fecha_matriculacion, 
      fecha_entrega, 
      fecha_rci, 
      fecha_facturacion,
      matricula, 
      vin, 
      valor_objetivo,
      min_coches_multiplicador,
      id_cliente,
      cobrado_otra_fecha,
      fecha_cobrado
    } = body;

    if (!id_usuario) {
      return NextResponse.json({ message: "Falta id_usuario para calcular" }, { status: 400 });
    }

    // 1. Encontrar vendedor
    const sellerUser = await db.query.usuarios.findFirst({
      where: eq(usuarios.id_usuario, Number(id_usuario))
    });

    if (!sellerUser) {
      return NextResponse.json({ message: "Vendedor no encontrado" }, { status: 404 });
    }

    // Determinar fecha de cálculo (incluyendo fecha_rci en la prioridad y fecha_cobrado o fecha_facturacion si aplica)
    const effectiveMatDateSim = cobrado_otra_fecha && fecha_cobrado 
      ? fecha_cobrado 
      : (sellerUser.tipo_vendedor === "VO" ? (fecha_facturacion || fecha_matriculacion) : fecha_matriculacion);
    const targetDate = effectiveMatDateSim || fecha_facturacion || fecha_rci || fecha_afectacion || fecha_expediente || new Date().toISOString().split("T")[0];

    // 2. Obtener el plan de comisiones aplicable para esa fecha
    const plan = await db.query.commissionPlans.findFirst({
      where: and(
        lte(commissionPlans.fecha_inicio, targetDate),
        gte(commissionPlans.fecha_fin, targetDate)
      ),
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
      }
    });

    if (!plan) {
      return NextResponse.json({ 
        success: false, 
        message: "No hay ningún plan de comisiones activo ni registrado para la fecha de este expediente." 
      });
    }

    const startDate = plan.fecha_inicio;
    const endDate = plan.fecha_fin;

    // 3. Buscar otros expedientes del mismo vendedor en el mismo período
    const otherExpedientes = await db.query.expedientes.findMany({
      where: and(
        eq(expedientes.id_usuario, Number(id_usuario)),
        id_expediente ? ne(expedientes.id_expediente, Number(id_expediente)) : undefined
      ),
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

    // 4. Construir el expediente simulado actual
    const currentModel = id_modelo 
      ? await db.query.modelos.findFirst({ 
          where: eq(modelos.id_modelo, Number(id_modelo)),
          with: { marca: true } 
        }) 
      : null;

    const currentTipoVenta = id_tipo_de_venta
      ? await db.query.tipoDeVenta.findFirst({ 
          where: eq(tipoDeVenta.id_tipo_de_venta, Number(id_tipo_de_venta)) 
        }) 
      : null;

    const currentEstadoVehiculo = id_estado_vehiculo
      ? await db.query.estadoVehiculo.findFirst({ 
          where: eq(estadoVehiculo.id_estado_vehiculo, Number(id_estado_vehiculo)) 
        }) 
      : null;

    const currentCliente = id_cliente
      ? await db.query.clientes.findFirst({
          where: eq(clientes.id, Number(id_cliente))
        })
      : null;

    const simulatedExp = {
      id_expediente: Number(id_expediente) || -999, // ID ficticio si es nuevo
      id_usuario: Number(id_usuario),
      id_modelo: id_modelo ? Number(id_modelo) : null,
      id_tipo_de_venta: id_tipo_de_venta ? Number(id_tipo_de_venta) : null,
      id_estado_vehiculo: id_estado_vehiculo ? Number(id_estado_vehiculo) : null,
      fecha_expediente: fecha_expediente || null,
      fecha_afectacion: fecha_afectacion || null,
      fecha_matriculacion: fecha_matriculacion || null,
      fecha_entrega: fecha_entrega || null,
      fecha_rci: fecha_rci || null,
      fecha_facturacion: fecha_facturacion || null,
      matricula: matricula || null,
      vin: vin || null,
      valor_objetivo: valor_objetivo !== undefined ? (valor_objetivo !== null ? Number(valor_objetivo) : null) : null,
      min_coches_multiplicador: min_coches_multiplicador !== undefined ? (min_coches_multiplicador !== null ? Number(min_coches_multiplicador) : 0) : 0,
      cobrado_otra_fecha: !!cobrado_otra_fecha,
      fecha_cobrado: fecha_cobrado || null,
      usuario: sellerUser,
      cliente: currentCliente,
      tipoDeVenta: currentTipoVenta,
      estadoVehiculo: currentEstadoVehiculo,
      modelo: currentModel
    };

    // Unir todos los expedientes
    const allExpedientes = [...otherExpedientes, simulatedExp];

    // 5. Filtrar que entren en el período (incluyendo RCI)
    const qualExpedientes = allExpedientes.filter((exp) => {
      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const isVN = stateName === "nuevo" || stateName === "demo";
      const effectiveMatDate = exp.cobrado_otra_fecha && exp.fecha_cobrado 
        ? exp.fecha_cobrado 
        : (isVN ? exp.fecha_matriculacion : (exp.fecha_facturacion || exp.fecha_matriculacion));
      const matriculacionIn = effectiveMatDate && effectiveMatDate >= startDate && effectiveMatDate <= endDate;
      const rciIn = exp.fecha_rci && exp.fecha_rci >= startDate && exp.fecha_rci <= endDate;
      return matriculacionIn || rciIn;
    });

    const isVOVendedor = sellerUser.tipo_vendedor === "VO";
    const patronName = sellerUser.patron_vo || "Estándar VO";

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

    // Ordenar por fechas para tener progresión
    qualExpedientes.sort((a, b) => {
      const effectiveMatA = (a.cobrado_otra_fecha && a.fecha_cobrado ? a.fecha_cobrado : a.fecha_matriculacion) || a.fecha_afectacion || a.fecha_expediente || "";
      const effectiveMatB = (b.cobrado_otra_fecha && b.fecha_cobrado ? b.fecha_cobrado : b.fecha_matriculacion) || b.fecha_afectacion || b.fecha_expediente || "";
      return effectiveMatA.localeCompare(effectiveMatB);
    });

    // Calcular Tasas Intervención por Marca (basado en matriculaciones y fecha RCI, simulando para pipeline)
    const totalMatriculadosPorMarca: Record<number, number> = {};
    const financiadosPorMarca: Record<number, number> = {};

    qualExpedientes.forEach((exp) => {
      const brandId = exp.modelo?.marca_id;
      if (brandId) {
        const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
        const isVN = stateName === "nuevo" || stateName === "demo";
        
        if (isVN) {
          const effectiveMatDate = exp.cobrado_otra_fecha && exp.fecha_cobrado ? exp.fecha_cobrado : exp.fecha_matriculacion;
          const entraMatriculacion = effectiveMatDate && effectiveMatDate >= startDate && effectiveMatDate <= endDate;
          if (entraMatriculacion) {
            totalMatriculadosPorMarca[brandId] = (totalMatriculadosPorMarca[brandId] || 0) + 1;
          }
          
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
      if (total === 0) return true;
      
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
      const effectiveMatDate = e.cobrado_otra_fecha && e.fecha_cobrado ? e.fecha_cobrado : e.fecha_matriculacion;
      if (e.fecha_expediente && e.fecha_afectacion) {
        return e.fecha_expediente < e.fecha_afectacion ? e.fecha_expediente : e.fecha_afectacion;
      }
      return e.fecha_expediente || e.fecha_afectacion || effectiveMatDate || "";
    };

    // Pre-calcular la cantidad de expedientes en el período para cada valor de cupo (min_coches_multiplicador)
    const cupoCounts: Record<number, number> = {};
    qualExpedientes.forEach((e) => {
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

    // Primera pasada: objetivos computables
    let totalComputablesVendedor = 0;
    let matriculacionesRealesVendedor = 0;
    let voUnitCounter = 0;

    const expsClasificados = qualExpedientes.map((exp) => {
      const entraPedido = exp.fecha_expediente && exp.fecha_expediente >= startDate && exp.fecha_expediente <= endDate;
      const entraAfectacion = exp.fecha_afectacion && exp.fecha_afectacion >= startDate && exp.fecha_afectacion <= endDate;
      const effectiveMatDate = exp.cobrado_otra_fecha && exp.fecha_cobrado ? exp.fecha_cobrado : exp.fecha_matriculacion;
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

      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const isVN = stateName === "nuevo" || stateName === "demo";

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
      const itemsDetalle: any[] = [];

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

      // Reglas generales (objetivo)
      plan.rules.forEach((rule) => {
        if (!rule.activa) return;
        const eventMatches = 
          (rule.tipo_evento === "pedido" && entraPedido) ||
          (rule.tipo_evento === "afectacion" && entraAfectacion) ||
          (rule.tipo_evento === "matriculacion" && entraMatriculacion) ||
          ((rule.tipo_evento === "credito" || rule.tipo_evento === "financiacion") && entraRci && exp.id_tipo_de_venta && isCreditoVenta) ||
          (rule.tipo_evento === "preference" && entraRci && isPreferenceVenta);

        if (!eventMatches) return;

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

      // Bonus rules (objetivo)
      plan.bonusRules.forEach((bonus) => {
        if (!bonus.activo) return;
        const eventMatches = 
          (bonus.tipo_evento === "pedido" && (entraPedido || entraAfectacion)) ||
          (bonus.tipo_evento === "afectacion" && entraAfectacion) ||
          (bonus.tipo_evento === "matriculacion" && entraMatriculacion) ||
          ((bonus.tipo_evento === "credito" || bonus.tipo_evento === "financiacion") && entraRci && exp.id_tipo_de_venta && isCreditoVenta) ||
          (bonus.tipo_evento === "preference" && entraRci && isPreferenceVenta);

        if (!eventMatches) return;

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

    // Tramo vendedor (rango X-4 a X+3)
    const X = plan.objetivo_base + plan.arrastre;
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

    // Usados count (incluyendo estimación)
    const matriculatedUsedCounts: Record<string, number> = { VO: 0, KM0: 0, BB: 0, Usado: 0 };
    expsClasificados.forEach((c) => {
      if (!c.isVN && c.tipoUsado) {
        matriculatedUsedCounts[c.tipoUsado] = (matriculatedUsedCounts[c.tipoUsado] || 0) + 1;
      }
    });

    const currentUsedProcessedIndex: Record<string, number> = { VO: 0, KM0: 0, BB: 0, Usado: 0 };
    let voUnitCounterPay = 0;

    let simulatedResult: any = null;

    expsClasificados.forEach(({ exp, entraPedido, entraAfectacion, entraMatriculacion, entraRci, isVN, tipoUsado, isCreditoVenta, isPreferenceVenta, itemsDetalleInitial }) => {
      let comisionBaseVN = 0;
      let comisionUsado = 0;
      let comisionFinanciacion = 0;
      let comisionPreference = 0;
      let bonusAcumulado = 0;

      const finalItems = [...itemsDetalleInitial];
      const isFinancedType = isCreditoVenta || isPreferenceVenta;

      // 1. Comisión Base VN o VO/Usado (Simulamos matriculación para estimar)
      if (isVN) {
        if (!isVOVendedor) {
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
          finalItems.push({
            concepto: `Comisión Base VN (${exp.modelo?.nombre_modelo}) - Omitida (Vendedor de VO)`,
            importe: 0,
            afecta_objetivo: false,
            valor_objetivo: 0
          });
        }
      } else if (tipoUsado) {
        if (!appliesVoPattern) {
          const usedRate = plan.usedRates.find(r => r.tipo_usado === tipoUsado && r.activo);
          if (usedRate) {
            const totalUnitsOfType = matriculatedUsedCounts[tipoUsado] || 0;
            const currentIdx = currentUsedProcessedIndex[tipoUsado]++;

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

      // 2. Comisión por Financiación (se calcula si es de tipo financiado, simulando RCI)
      if (isFinancedType && exp.id_tipo_de_venta) {
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

      // 3. Reglas Preference / BOX3 (se aplica si es de tipo preference, simulando RCI)
      if (isPreferenceVenta) {
        plan.preferenceRules.forEach((rule) => {
          if (!rule.activa) return;
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

      // 4. Reglas generales de comisión
      plan.rules.forEach((rule) => {
        if (!rule.activa || !rule.afecta_comision) return;
        const eventMatches = 
          (rule.tipo_evento === "pedido" && entraPedido) ||
          (rule.tipo_evento === "afectacion" && entraAfectacion) ||
          (rule.tipo_evento === "matriculacion" && true) ||
          ((rule.tipo_evento === "credito" || rule.tipo_evento === "financiacion") && isCreditoVenta) ||
          (rule.tipo_evento === "preference" && isPreferenceVenta);

        if (!eventMatches) return;

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

      // 5. Bonus personalizados
      plan.bonusRules.forEach((bonus) => {
        if (!bonus.activo || bonus.importe <= 0) return;
        const eventMatches = 
          (bonus.tipo_evento === "pedido" && (entraPedido || entraAfectacion)) ||
          (bonus.tipo_evento === "afectacion" && entraAfectacion) ||
          (bonus.tipo_evento === "matriculacion" && true) ||
          ((bonus.tipo_evento === "credito" || bonus.tipo_evento === "financiacion") && isCreditoVenta) ||
          (bonus.tipo_evento === "preference" && isPreferenceVenta);

        if (!eventMatches) return;

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
          bonusAcumulado += bonus.importe;
          finalItems.push({
            concepto: `Bonus Campaña: ${bonus.nombre}`,
            importe: bonus.importe,
            afecta_objetivo: false,
            valor_objetivo: 0
          });
        }
      });

      const totalTeorico = comisionBaseVN + comisionUsado + comisionFinanciacion + comisionPreference + bonusAcumulado;
      const totalGenerado = cumpleMinimo ? totalTeorico : 0;

      if (exp.id_expediente === simulatedExp.id_expediente) {
        simulatedResult = {
          totalTeorico,
          totalGenerado,
          cumpleMinimo,
          tramoAlcanzado,
          totalComputablesVendedor,
          matriculacionesRealesVendedor,
          minMatriculacionesPlan: plan.min_matriculaciones,
          items: finalItems,
          comisionBaseVN,
          comisionUsado,
          comisionFinanciacion,
          comisionPreference,
          bonusAcumulado,
          planNombre: plan.nombre,
          entraPedido,
          entraAfectacion,
          entraMatriculacion: true // simulated for view
        };
      }
    });

    return NextResponse.json({ 
      success: true, 
      data: simulatedResult 
    });

  } catch (error: any) {
    console.error("Error al simular comision:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
