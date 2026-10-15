"use client";

import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

interface Cliente {
  id: number;
  nombre: string | null;
  dni: string | null;
}

interface Marca {
  id_marca: number;
  nombre: string;
}

interface Modelo {
  id_modelo: number;
  nombre_modelo: string;
  marca_id: number | null;
  marca?: Marca | null;
}

interface TipoDeVenta {
  id_tipo_de_venta: number;
  nombre_tipo_venta: string;
}

interface EstadoVehiculo {
  id_estado_vehiculo: number;
  nombre_estado_vehiculo: string;
}

interface Usuario {
  id_usuario: number;
  nombre: string | null;
  rol: string | null;
  tipo_vendedor: string;
  patron_vo: string | null;
}

interface Expediente {
  id_expediente: number;
  id_usuario: number | null;
  id_cliente: number | null;
  id_modelo: number | null;
  id_tienda: number | null;
  fecha_expediente: string | null;
  fecha_afectacion: string | null;
  fecha_matriculacion: string | null;
  fecha_entrega: string | null;
  fecha_rci: string | null;
  fecha_cobrado: string | null;
  cobrado_otra_fecha: boolean | null;
  id_tipo_de_venta: number | null;
  id_estado_vehiculo: number | null;
  valor_objetivo?: number | null;
  min_coches_multiplicador?: number | null;
  comision_coche_real: string | number | null;
  comision_financiacion_real: string | number | null;
  
  cliente?: Cliente | null;
  modelo?: Modelo | null;
  tipoDeVenta?: TipoDeVenta | null;
  estadoVehiculo?: EstadoVehiculo | null;
  usuario?: Usuario | null;
}

interface InformesDashboardProps {
  initialExpedientes: Expediente[];
  initialPlanes: any[];
  marcas: Marca[];
  modelos: Modelo[];
  tiendas: any[];
  usuarios: Usuario[];
  userRole: string;
}

export default function InformesDashboard({
  initialExpedientes,
  initialPlanes,
  marcas,
  modelos,
  tiendas,
  usuarios,
  userRole,
}: InformesDashboardProps) {
  // 1. Estados de Filtros
  const today = new Date();
  const firstDayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const lastDayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  const [fechaInicio, setFechaInicio] = useState(firstDayStr);
  const [fechaFin, setFechaFin] = useState(lastDayStr);
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());

  const updateMonthPeriod = (month: number, year: number) => {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0);
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
    setFechaInicio(start);
    setFechaFin(end);
    setSelectedMonth(month);
    setSelectedYear(year);
  };

  const handleManualFechaInicio = (val: string) => {
    setFechaInicio(val);
    if (val && fechaFin) {
      const startParts = val.split("-");
      const endParts = fechaFin.split("-");
      if (startParts[0] === endParts[0] && startParts[1] === endParts[1]) {
        const y = Number(startParts[0]);
        const m = Number(startParts[1]);
        const dStart = Number(startParts[2]);
        const dEnd = Number(endParts[2]);
        const lastDayOfM = new Date(y, m, 0).getDate();
        if (dStart === 1 && dEnd === lastDayOfM) {
          setSelectedMonth(m);
          setSelectedYear(y);
          return;
        }
      }
    }
    setSelectedMonth(0);
  };

  const handleManualFechaFin = (val: string) => {
    setFechaFin(val);
    if (fechaInicio && val) {
      const startParts = fechaInicio.split("-");
      const endParts = val.split("-");
      if (startParts[0] === endParts[0] && startParts[1] === endParts[1]) {
        const y = Number(startParts[0]);
        const m = Number(startParts[1]);
        const dStart = Number(startParts[2]);
        const dEnd = Number(endParts[2]);
        const lastDayOfM = new Date(y, m, 0).getDate();
        if (dStart === 1 && dEnd === lastDayOfM) {
          setSelectedMonth(m);
          setSelectedYear(y);
          return;
        }
      }
    }
    setSelectedMonth(0);
  };

  const [filterTienda, setFilterTienda] = useState<string>("");
  const [filterVendedor, setFilterVendedor] = useState<string>("");
  const [filterMarca, setFilterMarca] = useState<string>("");
  const [filterVNVO, setFilterVNVO] = useState<string>(""); // VN o VO
  const [filterTipoVenta, setFilterTipoVenta] = useState<string>("");

  // Estados de Ordenación del Listado Detallado de Ventas
  const [sortField, setSortField] = useState<string>("vendedor");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Estado del Modal de Detalle
  const [detailModal, setDetailModal] = useState<{
    title: string;
    expedientes: Expediente[];
    conceptInfo?: string;
  } | null>(null);

  // Estados de Ordenación en el Modal de Detalle
  const [modalSortField, setModalSortField] = useState<string>("vendedor");
  const [modalSortDirection, setModalSortDirection] = useState<"asc" | "desc">("asc");

  const getMesYearLabel = () => {
    if (selectedMonth > 0) {
      const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
      return `${months[selectedMonth - 1]} ${selectedYear}`;
    }
    return "Período Seleccionado";
  };

  // 2. Auxiliares de Fechas
  const getEffectiveMatDate = (e: Expediente) => {
    return e.cobrado_otra_fecha && e.fecha_cobrado ? e.fecha_cobrado : e.fecha_matriculacion;
  };

  const getReferenceDate = (e: Expediente) => {
    const effectiveMat = getEffectiveMatDate(e);
    if (e.fecha_expediente && e.fecha_afectacion) {
      return e.fecha_expediente < e.fecha_afectacion ? e.fecha_expediente : e.fecha_afectacion;
    }
    return e.fecha_expediente || e.fecha_afectacion || effectiveMat || "";
  };

  // 3. Calculadora de Comisiones (Adaptada de ExpedientesList.tsx)
  const calculatedCommissions = useMemo(() => {
    const results: Record<number, {
      baseVN: number;
      baseVO: number;
      financiacion: number;
      preference: number;
      bonus: number;
      penalizaciones: number;
      total: number;
      cumpleMinimo: boolean;
      tramo: string;
      objetivoPuntos: number;
      matriculacionesMes: number;
      details?: { concept: string; amount: number }[];
    }> = {};

    // Agrupar expedientes por plan
    const expsByPlan: Record<number, Expediente[]> = {};
    initialExpedientes.forEach((exp) => {
      const refDate = getEffectiveMatDate(exp) || exp.fecha_expediente;
      if (!refDate) return;
      const plan = initialPlanes.find(p => p.fecha_inicio <= refDate && p.fecha_fin >= refDate);
      if (!plan) {
        results[exp.id_expediente] = {
          baseVN: 0, baseVO: 0, financiacion: 0, preference: 0, bonus: 0, penalizaciones: 0, total: 0,
          cumpleMinimo: false, tramo: "N/A", objetivoPuntos: 0, matriculacionesMes: 0,
          details: []
        };
        return;
      }
      if (!expsByPlan[plan.id_plan]) {
        expsByPlan[plan.id_plan] = [];
      }
      expsByPlan[plan.id_plan].push(exp);
    });

    // Procesar cada plan
    Object.entries(expsByPlan).forEach(([planIdStr, planExps]) => {
      const planId = Number(planIdStr);
      const plan = initialPlanes.find(p => p.id_plan === planId);
      if (!plan) return;

      const isWithinPlan = (dateStr: string | null | undefined) => {
        if (!dateStr) return false;
        const d = dateStr.substring(0, 10);
        return d >= plan.fecha_inicio && d <= plan.fecha_fin;
      };

      const isBeforeOrWithinPlan = (dateStr: string | null | undefined) => {
        if (!dateStr) return false;
        const d = dateStr.substring(0, 10);
        return d <= plan.fecha_fin;
      };

      const isAfterPlan = (dateStr: string | null | undefined) => {
        if (!dateStr) return true;
        const d = dateStr.substring(0, 10);
        return d > plan.fecha_fin;
      };

      const getActivityDate = (e: any) => {
        const effectiveMat = getEffectiveMatDate(e);
        if (e.fecha_expediente && e.fecha_afectacion) {
          return e.fecha_expediente < e.fecha_afectacion ? e.fecha_expediente : e.fecha_afectacion;
        }
        return e.fecha_expediente || e.fecha_afectacion || effectiveMat || "";
      };

      // Agrupar expedientes del plan por vendedor
      const expsBySeller: Record<number, Expediente[]> = {};
      planExps.forEach((exp) => {
        const sellerId = exp.id_usuario || 999999;
        if (!expsBySeller[sellerId]) {
          expsBySeller[sellerId] = [];
        }
        expsBySeller[sellerId].push(exp);
      });

      // Procesar cada vendedor de forma independiente para alinearse con el backend
      Object.entries(expsBySeller).forEach(([sellerIdStr, sellerExps]) => {
        const sellerId = Number(sellerIdStr);
        const seller = usuarios.find(u => u.id_usuario === sellerId);
        const isVOVendedor = seller?.tipo_vendedor === "VO";
        const patronName = seller?.patron_vo || "Estándar VO";

        let matchedPatternTiers: any[] = [];
        if (isVOVendedor) {
          const dbPattern = plan.voPatterns?.find((vp: any) => vp.nombre === patronName && vp.activo);
          if (dbPattern) {
            try {
              matchedPatternTiers = typeof dbPattern.tiers === "string" ? JSON.parse(dbPattern.tiers) : (dbPattern.tiers || []);
            } catch (e) {
              matchedPatternTiers = [];
            }
          }
        }

        // Ordenar sellerExps cronológicamente
        sellerExps.sort((a, b) => {
          const dateA = getEffectiveMatDate(a) || a.fecha_afectacion || a.fecha_expediente || "";
          const dateB = getEffectiveMatDate(b) || b.fecha_afectacion || b.fecha_expediente || "";
          return dateA.localeCompare(dateB);
        });

        // Filtrar expedientes que califican para el plan de comisiones (matriculados, RCI o backlog pipeline)
        const qualSellerExps = sellerExps.filter((exp) => {
          const isMatriculadoThisMonth = isWithinPlan(getEffectiveMatDate(exp));
          const isRciThisMonth = isWithinPlan(exp.fecha_rci);
          
          const actDate = getActivityDate(exp);
          const fuePedidoOFinanciado = isBeforeOrWithinPlan(actDate) || isBeforeOrWithinPlan(exp.fecha_rci);
          const noMatriculadoAun = isAfterPlan(getEffectiveMatDate(exp));
          const isPendingPipeline = fuePedidoOFinanciado && noMatriculadoAun;

          return isMatriculadoThisMonth || isRciThisMonth || isPendingPipeline;
        });

        // Calcular cupo targets
        const sellerCupoCounts: Record<number, number> = {};
        qualSellerExps.forEach((e) => {
          const actDate = getActivityDate(e);
          const entraActivity = isWithinPlan(actDate);
          if (entraActivity) {
            const targetCupo = e.min_coches_multiplicador !== null && e.min_coches_multiplicador !== undefined
              ? Number(e.min_coches_multiplicador)
              : 0;
            if (targetCupo > 0) {
              sellerCupoCounts[targetCupo] = (sellerCupoCounts[targetCupo] || 0) + 1;
            }
          }
        });

        // Contar matriculaciones en el mes para este vendedor
        let matriculacionesMes = 0;
        sellerExps.forEach((exp) => {
          if (isWithinPlan(getEffectiveMatDate(exp))) {
            matriculacionesMes++;
          }
        });

        const cumpleMinimo = matriculacionesMes >= plan.min_matriculaciones;

        // Calcular objetivo del vendedor actual
        let objetivoPuntos = 0;
        qualSellerExps.forEach((exp) => {
          const actDate = getActivityDate(exp);
          const isActivityThisMonth = isWithinPlan(actDate);
          const isMatriculadoThisMonth = isWithinPlan(getEffectiveMatDate(exp));
          const entraPedido = isWithinPlan(exp.fecha_expediente);
          const entraAfectacion = isWithinPlan(exp.fecha_afectacion);
          const entraRci = isWithinPlan(exp.fecha_rci);

          const salesTypeNameLower = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
          const isCreditoVenta = (salesTypeNameLower.includes("crédito") || salesTypeNameLower.includes("credito") || salesTypeNameLower.includes("financiado") || salesTypeNameLower.includes("renting")) && !salesTypeNameLower.includes("preference");
          const isPreferenceVenta = salesTypeNameLower.includes("preference");

          const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
          const isVN = stateName === "nuevo" || stateName === "demo";

          let originalVal = 1.0;
          if (exp.valor_objetivo !== null && exp.valor_objetivo !== undefined) {
            originalVal = Number(exp.valor_objetivo);
          } else {
            const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
            if (brandId) {
              const brandIntervention = plan.brandInterventionRates?.find((r: any) => r.id_marca === brandId);
              if (brandIntervention && brandIntervention.valor_objetivo_defecto !== undefined && brandIntervention.valor_objetivo_defecto !== null) {
                originalVal = Number(brandIntervention.valor_objetivo_defecto);
              }
            }
          }

          let objValorExpediente = 0.0;
          let afectoObjetivo = false;
          const baseVal = originalVal === 0 ? 1.0 : originalVal;

          if (isActivityThisMonth || isMatriculadoThisMonth) {
            afectoObjetivo = true;
            if (isActivityThisMonth) {
              const targetCupo = exp.min_coches_multiplicador !== null && exp.min_coches_multiplicador !== undefined
                ? Number(exp.min_coches_multiplicador)
                : 0;
              if (targetCupo > 0 && baseVal > 1) {
                const countOfSameCupo = sellerCupoCounts[targetCupo] || 0;
                if (countOfSameCupo >= targetCupo) {
                  objValorExpediente = baseVal;
                } else {
                  objValorExpediente = 1.0;
                }
              } else {
                objValorExpediente = baseVal;
              }
            } else {
              objValorExpediente = baseVal;
            }
          }

          let totalObjExp = 0;
          if (afectoObjetivo) {
            totalObjExp = objValorExpediente;
          }

          // Reglas generales que afectan al objetivo
          plan.rules?.forEach((rule: any) => {
            if (!rule.activa || !rule.afecta_objetivo) return;
            const eventMatches = 
              (rule.tipo_evento === "pedido" && entraPedido) ||
              (rule.tipo_evento === "afectacion" && entraAfectacion) ||
              (rule.tipo_evento === "matriculacion" && isMatriculadoThisMonth) ||
              ((rule.tipo_evento === "credito" || rule.tipo_evento === "financiacion") && entraRci && isCreditoVenta) ||
              (rule.tipo_evento === "preference" && entraRci && isPreferenceVenta);

            if (!eventMatches) return;

            const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
            const filterMarcaMatches = !rule.id_marca || brandId === rule.id_marca;
            const filterModeloMatches = !rule.id_modelo || exp.id_modelo === rule.id_modelo;

            if (filterMarcaMatches && filterModeloMatches) {
              totalObjExp += Number(rule.valor_objetivo || 0);

              if (rule.tipo_evento === "preference" && rule.ligar_a_credito) {
                const matchingCreditRule = plan.rules?.find((r: any) => {
                  if (!r.activa || !r.afecta_objetivo) return false;
                  if (r.tipo_evento !== "credito" && r.tipo_evento !== "financiacion") return false;
                  const filterMarcaMatches2 = !r.id_marca || brandId === r.id_marca;
                  const filterModeloMatches2 = !r.id_modelo || exp.id_modelo === r.id_modelo;
                  return filterMarcaMatches2 && filterModeloMatches2;
                });
                if (matchingCreditRule) {
                  totalObjExp += Number(matchingCreditRule.valor_objetivo || 0);
                }
              }
            }
          });

          // Bonus que afectan al objetivo
          plan.bonusRules?.forEach((bonus: any) => {
            if (!bonus.activo || !bonus.afecta_objetivo) return;
            const eventMatches = 
              (bonus.tipo_evento === "pedido" && (entraPedido || entraAfectacion)) ||
              (bonus.tipo_evento === "afectacion" && entraAfectacion) ||
              (bonus.tipo_evento === "matriculacion" && isMatriculadoThisMonth) ||
              ((bonus.tipo_evento === "credito" || bonus.tipo_evento === "financiacion") && entraRci && isCreditoVenta) ||
              (bonus.tipo_evento === "preference" && entraRci && isPreferenceVenta);

            if (!eventMatches) return;

            const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
            const filterMarcaMatches = !bonus.id_marca || brandId === bonus.id_marca;
            const filterModeloMatches = !bonus.id_modelo || exp.id_modelo === bonus.id_modelo;

            if (filterMarcaMatches && filterModeloMatches) {
              totalObjExp += Number(bonus.valor_objetivo || 0);
            }
          });

          objetivoPuntos += totalObjExp;
        });

        // Determinar tramo del vendedor
        let tramo: "X-4" | "X-3" | "X-2" | "X-1" | "X" | "X+1" | "X+2" | "X+3" = "X-4";
        const X_val = plan.objetivo_base + plan.arrastre;
        const diff = objetivoPuntos - X_val;
        if (diff >= 3) tramo = "X+3";
        else if (diff === 2) tramo = "X+2";
        else if (diff === 1) tramo = "X+1";
        else if (diff === 0) tramo = "X";
        else if (diff === -1) tramo = "X-1";
        else if (diff === -2) tramo = "X-2";
        else if (diff === -3) tramo = "X-3";
        else tramo = "X-4";

        // Contadores de Usados
        const sellerUsedCounts: Record<string, number> = { VO: 0, KM0: 0, BB: 0, Usado: 0 };
        qualSellerExps.forEach((exp) => {
          const isMatriculadoThisMonth = isWithinPlan(getEffectiveMatDate(exp));
          const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
          const isVN = stateName === "nuevo" || stateName === "demo";
          if (isMatriculadoThisMonth && !isVN) {
            let tipoUsado = "Usado";
            if (stateName === "km0") tipoUsado = "KM0";
            else if (stateName === "buyback" || stateName === "bb") tipoUsado = "BB";
            else if (stateName === "seminuevo" || stateName === "vo") tipoUsado = "VO";
            sellerUsedCounts[tipoUsado] = (sellerUsedCounts[tipoUsado] || 0) + 1;
          }
        });

        const sellerUsedProcessedIdx: Record<string, number> = { VO: 0, KM0: 0, BB: 0, Usado: 0 };
        let sellerVoUnitCounterPay = 0;

        // Calcular comisiones de cada expediente de este vendedor
        qualSellerExps.forEach((exp) => {
          const isMatriculadoThisMonth = isWithinPlan(getEffectiveMatDate(exp));
          const entraRci = isWithinPlan(exp.fecha_rci);
          const entraPedido = isWithinPlan(exp.fecha_expediente);
          const entraAfectacion = isWithinPlan(exp.fecha_afectacion);

          const salesTypeNameLower = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
          const isCreditoVenta = (salesTypeNameLower.includes("crédito") || salesTypeNameLower.includes("credito") || salesTypeNameLower.includes("financiado") || salesTypeNameLower.includes("renting")) && !salesTypeNameLower.includes("preference");
          const isPreferenceVenta = salesTypeNameLower.includes("preference");

          const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
          const isVN = stateName === "nuevo" || stateName === "demo";

          let baseVN = 0;
          let baseVO = 0;
          let baseFinan = 0;
          let basePref = 0;
          let reglasBonus = 0;
          let reglasPenalizacion = 0;

          const detailsList: { concept: string; amount: number }[] = [];

          const hasCocheOverride = exp.comision_coche_real !== null && exp.comision_coche_real !== undefined;
          const hasFinanOverride = exp.comision_financiacion_real !== null && exp.comision_financiacion_real !== undefined;

          // 1. Comisión base VN/VO (por matriculación)
          if (isMatriculadoThisMonth) {
            if (hasCocheOverride) {
              if (isVN) {
                baseVN = Number(exp.comision_coche_real);
                detailsList.push({ concept: "Comisión Base VN (Manual)", amount: baseVN });
              } else {
                baseVO = Number(exp.comision_coche_real);
                detailsList.push({ concept: "Comisión Base VO (Manual)", amount: baseVO });
              }
            } else if (isVN) {
              if (!isVOVendedor) {
                const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
                const totalBrandMat = sellerExps.filter(e => {
                  const bId = e.modelo?.marca_id || e.modelo?.marca?.id_marca;
                  const isVN_e = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "nuevo" || e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "demo";
                  const mat_e = isWithinPlan(getEffectiveMatDate(e));
                  return bId === brandId && isVN_e && mat_e;
                }).length;

                const totalBrandFin = sellerExps.filter(e => {
                  const bId = e.modelo?.marca_id || e.modelo?.marca?.id_marca;
                  const isVN_e = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "nuevo" || e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() === "demo";
                  const rci_e = isWithinPlan(e.fecha_rci);
                  const salesTypeName = e.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
                  const isFinancedType = salesTypeName.includes("preference") || salesTypeName.includes("crédito") || salesTypeName.includes("credito") || salesTypeName.includes("renting");
                  return bId === brandId && isVN_e && rci_e && isFinancedType;
                }).length;

                let tasaCumplida = true;
                if (totalBrandMat > 0) {
                  const brandInt = plan.brandInterventionRates?.find((i: any) => i.id_marca === brandId);
                  const targetRate = brandInt?.tasa_intervencion ?? 70;
                  const tipoTasa = brandInt?.tipo_tasa ?? "porcentaje";
                  if (tipoTasa === "unidades") {
                    tasaCumplida = totalBrandFin >= targetRate;
                  } else {
                    tasaCumplida = ((totalBrandFin / totalBrandMat) * 100) >= targetRate;
                  }
                }

                const modelRate = plan.rates?.find((r: any) => r.id_modelo === exp.id_modelo && r.activo && r.tasa_intervencion_cumplida === tasaCumplida);
                if (modelRate) {
                  let rateImporte = modelRate.rate_x_minus_4;
                  if (tramo === "X-3") rateImporte = modelRate.rate_x_minus_3;
                  else if (tramo === "X-2") rateImporte = modelRate.rate_x_minus_2;
                  else if (tramo === "X-1") rateImporte = modelRate.rate_x_minus_1;
                  else if (tramo === "X") rateImporte = modelRate.rate_x;
                  else if (tramo === "X+1") rateImporte = modelRate.rate_x_plus_1;
                  else if (tramo === "X+2") rateImporte = modelRate.rate_x_plus_2;
                  else if (tramo === "X+3") rateImporte = modelRate.rate_x_plus_3;
                  baseVN = rateImporte;
                  detailsList.push({ concept: `Comisión Base VN (Tramo ${tramo})`, amount: baseVN });
                }
              }
            } else {
              let tipoUsado: "VO" | "KM0" | "BB" | "Usado" | null = null;
              if (stateName === "km0") tipoUsado = "KM0";
              else if (stateName === "buyback" || stateName === "bb") tipoUsado = "BB";
              else if (stateName === "seminuevo" || stateName === "vo") tipoUsado = "VO";
              else tipoUsado = "Usado";

              if (tipoUsado) {
                if (!isVOVendedor) {
                  const usedRate = plan.usedRates?.find((r: any) => r.tipo_usado === tipoUsado && r.activo);
                  if (usedRate) {
                    const totalUnitsOfType = sellerUsedCounts[tipoUsado] || 0;
                    const currentIdx = sellerUsedProcessedIdx[tipoUsado]++;
                    if (totalUnitsOfType >= usedRate.min_aplicar) {
                      const isFirst = currentIdx === 0;
                      baseVO = isFirst ? usedRate.importe_primera : usedRate.importe_resto;
                      detailsList.push({ concept: `Comisión Base VO (${tipoUsado})`, amount: baseVO });
                    }
                  }
                } else {
                  sellerVoUnitCounterPay++;
                  const tier = matchedPatternTiers.find((t: any) => t.unidad === sellerVoUnitCounterPay)
                    || matchedPatternTiers[matchedPatternTiers.length - 1]
                    || { valor_objetivo: 1, importe: 150 };
                  baseVO = tier.importe;
                  detailsList.push({ concept: `Comisión Base VO (Escala VO Unidad #${sellerVoUnitCounterPay})`, amount: baseVO });
                }
              }
            }
          }

          // 2. Comisión Financiación (por RCI)
          if (entraRci) {
            if (hasFinanOverride) {
              baseFinan = Number(exp.comision_financiacion_real);
              detailsList.push({ concept: "Financiación RCI (Manual)", amount: baseFinan });
            } else {
              const isFinancedType = isCreditoVenta || isPreferenceVenta;
              if (isFinancedType && exp.id_tipo_de_venta) {
                let matchedFinanceType = "";
                if (salesTypeNameLower.includes("preference")) matchedFinanceType = "Preference";
                else if (salesTypeNameLower.includes("crédito") || salesTypeNameLower.includes("credito") || salesTypeNameLower.includes("financiado")) matchedFinanceType = "Crédito";
                else if (salesTypeNameLower.includes("renting")) matchedFinanceType = "Renting";
                else if (salesTypeNameLower.includes("contado")) matchedFinanceType = "Contado";

                const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
                if (matchedFinanceType && brandId) {
                  const finRate = plan.financeRates?.find(
                    (r: any) => r.id_marca === brandId && r.tipo_financiacion === matchedFinanceType
                  );
                  if (finRate) {
                    baseFinan = finRate.importe;
                    detailsList.push({ concept: `Financiación RCI (${matchedFinanceType})`, amount: baseFinan });
                  }
                }
              }

              // Reglas preference
              plan.preferenceRules?.forEach((rule: any) => {
                if (!rule.activa) return;
                const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
                const filterMarcaMatches = !rule.id_marca || brandId === rule.id_marca;
                const filterModeloMatches = !rule.id_modelo || exp.id_modelo === rule.id_modelo;

                let finMatches = true;
                if (rule.tipo_financiacion) {
                  const ruleFin = rule.tipo_financiacion.toLowerCase();
                  finMatches = salesTypeNameLower.includes(ruleFin) || ruleFin.includes(salesTypeNameLower);
                }

                if (filterMarcaMatches && filterModeloMatches && finMatches) {
                  basePref += rule.importe;
                  detailsList.push({ concept: `Regla Preference: ${rule.nombre || "Adicional"}`, amount: rule.importe });
                }
              });
            }
          }

          // 3. Reglas generales
          plan.rules?.forEach((rule: any) => {
            if (!rule.activa || rule.afecta_objetivo) return;
            const eventMatches = 
              (rule.tipo_evento === "pedido" && entraPedido) ||
              (rule.tipo_evento === "afectacion" && entraAfectacion) ||
              (rule.tipo_evento === "matriculacion" && isMatriculadoThisMonth) ||
              ((rule.tipo_evento === "credito" || rule.tipo_evento === "financiacion") && entraRci && isCreditoVenta) ||
              (rule.tipo_evento === "preference" && entraRci && isPreferenceVenta);

            if (!eventMatches) return;

            const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
            const filterMarcaMatches = !rule.id_marca || brandId === rule.id_marca;
            const filterModeloMatches = !rule.id_modelo || exp.id_modelo === rule.id_modelo;

            if (filterMarcaMatches && filterModeloMatches) {
              if (rule.importe < 0) {
                reglasPenalizacion += Math.abs(rule.importe);
                detailsList.push({ concept: `Regla: ${rule.nombre || "Penalización"}`, amount: rule.importe });
              } else {
                reglasBonus += rule.importe;
                detailsList.push({ concept: `Regla: ${rule.nombre || "Bonus"}`, amount: rule.importe });
              }
            }
          });

          // 4. Bonus de campaña
          plan.bonusRules?.forEach((bonus: any) => {
            if (!bonus.activo || bonus.afecta_objetivo || (!bonus.es_penalizacion && bonus.importe <= 0)) return;
            const eventMatches = 
              (bonus.tipo_evento === "pedido" && (entraPedido || entraAfectacion)) ||
              (bonus.tipo_evento === "afectacion" && entraAfectacion) ||
              (bonus.tipo_evento === "matriculacion" && isMatriculadoThisMonth) ||
              ((bonus.tipo_evento === "credito" || bonus.tipo_evento === "financiacion") && entraRci && isCreditoVenta) ||
              (bonus.tipo_evento === "preference" && entraRci && isPreferenceVenta);

            if (!eventMatches) return;
            if (bonus.tipo_vehiculo === "nuevo" && !isVN) return;
            if (bonus.tipo_vehiculo === "usado" && isVN) return;

            const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
            const filterMarcaMatches = !bonus.id_marca || brandId === bonus.id_marca;
            const filterModeloMatches = !bonus.id_modelo || exp.id_modelo === bonus.id_modelo;

            if (filterMarcaMatches && filterModeloMatches) {
              if (bonus.es_penalizacion) {
                reglasPenalizacion += Math.abs(bonus.importe);
                detailsList.push({ concept: `Campaña: ${bonus.nombre || "Penalización"}`, amount: -Math.abs(bonus.importe) });
              } else {
                reglasBonus += bonus.importe;
                detailsList.push({ concept: `Campaña: ${bonus.nombre || "Bonus"}`, amount: bonus.importe });
              }
            }
          });

          const totalTeoricoExp = baseVN + baseVO + baseFinan + basePref + reglasBonus - reglasPenalizacion;
          const totalExp = cumpleMinimo ? totalTeoricoExp : 0;

          results[exp.id_expediente] = {
            baseVN: cumpleMinimo ? baseVN : 0,
            baseVO: cumpleMinimo ? baseVO : 0,
            financiacion: cumpleMinimo ? baseFinan : 0,
            preference: cumpleMinimo ? basePref : 0,
            bonus: cumpleMinimo ? reglasBonus : 0,
            penalizaciones: cumpleMinimo ? reglasPenalizacion : 0,
            total: totalExp,
            cumpleMinimo,
            tramo,
            objetivoPuntos,
            matriculacionesMes,
            details: cumpleMinimo 
              ? detailsList 
              : detailsList.map(item => ({ concept: `${item.concept} (Anulado por mín. matriculaciones)`, amount: 0 }))
          };
        });
      });
    });

    return results;
  }, [initialExpedientes, initialPlanes, usuarios]);

  // 4. Expedientes Filtrados en Tiempo Real
  const filteredExpedientes = useMemo(() => {
    return initialExpedientes.filter((exp) => {
      // Filtro de Fechas robusto en base a cualquier evento dentro del período
      const effectiveMatDate = getEffectiveMatDate(exp);
      const matriculacionIn = !!(effectiveMatDate && effectiveMatDate >= fechaInicio && effectiveMatDate <= fechaFin);
      const rciIn = !!(exp.fecha_rci && exp.fecha_rci >= fechaInicio && exp.fecha_rci <= fechaFin);
      const afectacionIn = !!(exp.fecha_afectacion && exp.fecha_afectacion >= fechaInicio && exp.fecha_afectacion <= fechaFin);
      const pedidoIn = !!(exp.fecha_expediente && exp.fecha_expediente >= fechaInicio && exp.fecha_expediente <= fechaFin);

      const isRelatedThisMonth = matriculacionIn || rciIn || afectacionIn || pedidoIn;
      if (!isRelatedThisMonth) return false;

      // Filtro Tienda
      if (filterTienda && exp.id_tienda !== Number(filterTienda)) return false;

      // Filtro Vendedor
      if (filterVendedor && exp.id_usuario !== Number(filterVendedor) && exp.usuario?.id_usuario !== Number(filterVendedor)) return false;

      // Filtro Marca
      const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
      if (filterMarca && brandId !== Number(filterMarca)) return false;

      // Filtro VN/VO
      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const isVN = stateName === "nuevo" || stateName === "demo";
      if (filterVNVO) {
        if (filterVNVO === "VN" && !isVN) return false;
        if (filterVNVO === "VO" && isVN) return false;
      }

      // Filtro Tipo de Venta
      if (filterTipoVenta && exp.tipoDeVenta?.id_tipo_de_venta !== Number(filterTipoVenta)) return false;

      return true;
    });
  }, [initialExpedientes, fechaInicio, fechaFin, filterTienda, filterVendedor, filterMarca, filterVNVO, filterTipoVenta]);

  // 5. Estadísticas de Vendedores (Comerciales)
  const sellerStats = useMemo(() => {
    const stats: Record<number, {
      vendedor: string;
      vn: number;
      vo: number;
      total: number;
      cartera: number;
      financiadoVN: number;
      financiadoVO: number;
      totalFinanciado: number;
      baseVNComm: number;
      baseVOComm: number;
      finanComm: number;
      prefComm: number;
      bonusComm: number;
      penalComm: number;
      totalComm: number;
    }> = {};

    filteredExpedientes.forEach((exp) => {
      const seller = exp.usuario;
      if (!seller) return;

      if (!stats[seller.id_usuario]) {
        stats[seller.id_usuario] = {
          vendedor: seller.nombre || `ID: ${seller.id_usuario}`,
          vn: 0, vo: 0, total: 0, cartera: 0,
          financiadoVN: 0, financiadoVO: 0, totalFinanciado: 0,
          baseVNComm: 0, baseVOComm: 0, finanComm: 0, prefComm: 0, bonusComm: 0, penalComm: 0, totalComm: 0
        };
      }

      const row = stats[seller.id_usuario];
      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const isVN = stateName === "nuevo" || stateName === "demo";

      const saleTypeName = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
      const isFinanciado = saleTypeName.includes("crédito") || saleTypeName.includes("credito") || saleTypeName.includes("financiado") || saleTypeName.includes("preference") || saleTypeName.includes("box");

      const matDate = getEffectiveMatDate(exp);
      const isMatriculado = !!(matDate && matDate >= fechaInicio && matDate <= fechaFin);

      if (isMatriculado) {
        if (isVN) {
          row.vn++;
          if (isFinanciado) row.financiadoVN++;
        } else {
          row.vo++;
          if (isFinanciado) row.financiadoVO++;
        }
        row.total++;
        if (isFinanciado) row.totalFinanciado++;
      } else {
        row.cartera++;
      }

      // Agregar importes de comisión
      const comm = calculatedCommissions[exp.id_expediente] || { baseVN: 0, baseVO: 0, financiacion: 0, preference: 0, bonus: 0, penalizaciones: 0, total: 0 };
      row.baseVNComm += comm.baseVN;
      row.baseVOComm += comm.baseVO;
      row.finanComm += comm.financiacion;
      row.prefComm += comm.preference;
      row.bonusComm += comm.bonus;
      row.penalComm += comm.penalizaciones;
      row.totalComm += comm.total;
    });

    return Object.values(stats).sort((a, b) => b.total - a.total);
  }, [filteredExpedientes, calculatedCommissions, fechaInicio, fechaFin]);

  // 6. Estadísticas por Marca
  const brandStats = useMemo(() => {
    const stats: Record<number, {
      marca: string;
      vn: number;
      vo: number;
      total: number;
    }> = {};

    filteredExpedientes.forEach((exp) => {
      const brand = exp.modelo?.marca;
      if (!brand) return;

      if (!stats[brand.id_marca]) {
        stats[brand.id_marca] = {
          marca: brand.nombre,
          vn: 0, vo: 0, total: 0
        };
      }

      const row = stats[brand.id_marca];
      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const isVN = stateName === "nuevo" || stateName === "demo";

      if (isVN) row.vn++;
      else row.vo++;
      row.total++;
    });

    const totalVentas = filteredExpedientes.length || 1;
    return Object.values(stats)
      .map(row => ({
        ...row,
        porcentaje: Math.round((row.total / totalVentas) * 100)
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpedientes]);

  // 7. KPIs Consolidados
  const totalVN = useMemo(() => filteredExpedientes.filter(e => {
    const name = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
    return name === "nuevo" || name === "demo";
  }).length, [filteredExpedientes]);

  const totalVO = filteredExpedientes.length - totalVN;

  // Estadísticas por fecha de contratación (Pedido)
  const statsPorFechaContratacionList = useMemo(() => {
    return initialExpedientes.filter(exp => {
      const refDate = exp.fecha_expediente;
      if (!refDate) return false;
      if (fechaInicio && refDate < fechaInicio) return false;
      if (fechaFin && refDate > fechaFin) return false;
      
      if (filterTienda && exp.id_tienda !== Number(filterTienda)) return false;
      if (filterVendedor && exp.id_usuario !== Number(filterVendedor) && exp.usuario?.id_usuario !== Number(filterVendedor)) return false;
      const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
      if (filterMarca && brandId !== Number(filterMarca)) return false;
      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const isVN = stateName === "nuevo" || stateName === "demo";
      if (filterVNVO) {
        if (filterVNVO === "VN" && !isVN) return false;
        if (filterVNVO === "VO" && isVN) return false;
      }
      if (filterTipoVenta && exp.tipoDeVenta?.id_tipo_de_venta !== Number(filterTipoVenta)) return false;

      return true;
    });
  }, [initialExpedientes, fechaInicio, fechaFin, filterTienda, filterVendedor, filterMarca, filterVNVO, filterTipoVenta]);

  const statsPorFechaContratacion = statsPorFechaContratacionList.length;

  // Estadísticas por afectados
  const statsPorAfectadosList = useMemo(() => {
    return initialExpedientes.filter(exp => {
      const refDate = exp.fecha_afectacion;
      if (!refDate) return false;
      if (fechaInicio && refDate < fechaInicio) return false;
      if (fechaFin && refDate > fechaFin) return false;

      if (filterTienda && exp.id_tienda !== Number(filterTienda)) return false;
      if (filterVendedor && exp.id_usuario !== Number(filterVendedor) && exp.usuario?.id_usuario !== Number(filterVendedor)) return false;
      const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
      if (filterMarca && brandId !== Number(filterMarca)) return false;
      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const isVN = stateName === "nuevo" || stateName === "demo";
      if (filterVNVO) {
        if (filterVNVO === "VN" && !isVN) return false;
        if (filterVNVO === "VO" && isVN) return false;
      }
      if (filterTipoVenta && exp.tipoDeVenta?.id_tipo_de_venta !== Number(filterTipoVenta)) return false;

      return true;
    });
  }, [initialExpedientes, fechaInicio, fechaFin, filterTienda, filterVendedor, filterMarca, filterVNVO, filterTipoVenta]);

  const statsPorAfectados = statsPorAfectadosList.length;

  // Estadísticas por matriculados
  const statsPorMatriculadosList = useMemo(() => {
    return initialExpedientes.filter(exp => {
      const refDate = getEffectiveMatDate(exp);
      if (!refDate) return false;
      if (fechaInicio && refDate < fechaInicio) return false;
      if (fechaFin && refDate > fechaFin) return false;

      if (filterTienda && exp.id_tienda !== Number(filterTienda)) return false;
      if (filterVendedor && exp.id_usuario !== Number(filterVendedor) && exp.usuario?.id_usuario !== Number(filterVendedor)) return false;
      const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
      if (filterMarca && brandId !== Number(filterMarca)) return false;
      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const isVN = stateName === "nuevo" || stateName === "demo";
      if (filterVNVO) {
        if (filterVNVO === "VN" && !isVN) return false;
        if (filterVNVO === "VO" && isVN) return false;
      }
      if (filterTipoVenta && exp.tipoDeVenta?.id_tipo_de_venta !== Number(filterTipoVenta)) return false;

      return true;
    });
  }, [initialExpedientes, fechaInicio, fechaFin, filterTienda, filterVendedor, filterMarca, filterVNVO, filterTipoVenta]);

  const statsPorMatriculados = statsPorMatriculadosList.length;

  // Estadísticas por Cartera al inicio de mes (pedidos arrastrados)
  const statsCarteraInicioList = useMemo(() => {
    if (!fechaInicio) return [];
    return initialExpedientes.filter(exp => {
      const actDate = exp.fecha_expediente || exp.fecha_afectacion;
      if (!actDate) return false;
      
      const isBefore = actDate < fechaInicio;
      if (!isBefore) return false;

      const matDate = getEffectiveMatDate(exp);
      const notMatriculadoYet = !matDate || matDate >= fechaInicio;
      if (!notMatriculadoYet) return false;

      if (filterTienda && exp.id_tienda !== Number(filterTienda)) return false;
      if (filterVendedor && exp.id_usuario !== Number(filterVendedor) && exp.usuario?.id_usuario !== Number(filterVendedor)) return false;
      const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
      if (filterMarca && brandId !== Number(filterMarca)) return false;
      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const isVN = stateName === "nuevo" || stateName === "demo";
      if (filterVNVO) {
        if (filterVNVO === "VN" && !isVN) return false;
        if (filterVNVO === "VO" && isVN) return false;
      }
      if (filterTipoVenta && exp.tipoDeVenta?.id_tipo_de_venta !== Number(filterTipoVenta)) return false;

      return true;
    });
  }, [initialExpedientes, fechaInicio, filterTienda, filterVendedor, filterMarca, filterVNVO, filterTipoVenta]);

  const statsCarteraInicio = statsCarteraInicioList.length;

  const RCIInterventionVN = useMemo(() => {
    const vnExps = filteredExpedientes.filter(e => {
      const name = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      return name === "nuevo" || name === "demo";
    });
    if (vnExps.length === 0) return 0;
    const financed = vnExps.filter(e => {
      const saleType = e.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
      return saleType.includes("crédito") || saleType.includes("credito") || saleType.includes("financiado") || saleType.includes("preference") || saleType.includes("box");
    }).length;
    return Math.round((financed / vnExps.length) * 100);
  }, [filteredExpedientes]);

  const totalComisiones = useMemo(() => {
    return filteredExpedientes.reduce((acc, exp) => {
      const c = calculatedCommissions[exp.id_expediente];
      return acc + (c ? c.total : 0);
    }, 0);
  }, [filteredExpedientes, calculatedCommissions]);

  const comisionPromedio = useMemo(() => {
    if (statsPorMatriculados === 0) return 0;
    return Math.round(totalComisiones / statsPorMatriculados);
  }, [statsPorMatriculados, totalComisiones]);

  const getExpedienteCommissionTooltip = (expId: number) => {
    const comm = calculatedCommissions[expId];
    if (!comm) return "Comisión: 0 €";
    if (!comm.details || comm.details.length === 0) return "Comisión: 0 €";
    
    const lines = comm.details.map((item: any) => `• ${item.concept}: ${item.amount.toLocaleString()} €`);
    if (!comm.cumpleMinimo) {
      return `Mínimo de matriculaciones no alcanzado (${comm.matriculacionesMes} reales).\nComisiones base y bonus anuladas a 0 €.\n\nConceptos originales:\n` + lines.join("\n");
    }
    return `Desglose de Comisión:\n` + lines.join("\n") + `\n\nTotal Neto: ${comm.total.toLocaleString()} €`;
  };

  const getVendedorCommissionTooltip = (vendedorName: string, category: "bonus" | "penal" | "total") => {
    const sellerExps = filteredExpedientes.filter(e => e.usuario?.nombre === vendedorName);
    
    let totalVN = 0;
    let totalVO = 0;
    let totalFinan = 0;
    let totalPref = 0;
    let totalBonus = 0;
    let totalPenal = 0;
    let totalNet = 0;
    
    const bonusBreakdowns: Record<string, number> = {};
    const penalBreakdowns: Record<string, number> = {};

    sellerExps.forEach(exp => {
      const comm = calculatedCommissions[exp.id_expediente];
      if (!comm) return;
      totalVN += comm.baseVN;
      totalVO += comm.baseVO;
      totalFinan += comm.financiacion;
      totalPref += comm.preference;
      totalBonus += comm.bonus;
      totalPenal += comm.penalizaciones;
      totalNet += comm.total;

      if (comm.details) {
        comm.details.forEach((item: any) => {
          if (item.amount > 0) {
            bonusBreakdowns[item.concept] = (bonusBreakdowns[item.concept] || 0) + item.amount;
          } else if (item.amount < 0) {
            penalBreakdowns[item.concept] = (penalBreakdowns[item.concept] || 0) + Math.abs(item.amount);
          }
        });
      }
    });

    if (category === "bonus") {
      if (Object.keys(bonusBreakdowns).length === 0) return "Sin bonus especiales registrados en el periodo.";
      return `Desglose de Bonus Especiales:\n` + Object.entries(bonusBreakdowns)
        .map(([concept, val]) => `• ${concept}: ${val.toLocaleString()} €`)
        .join("\n");
    }

    if (category === "penal") {
      if (Object.keys(penalBreakdowns).length === 0) return "Sin penalizaciones registradas en el periodo.";
      return `Desglose de Penalizaciones:\n` + Object.entries(penalBreakdowns)
        .map(([concept, val]) => `• ${concept}: -${val.toLocaleString()} €`)
        .join("\n");
    }

    // "total"
    const lines = [
      `Resumen de Liquidación de ${vendedorName}:`,
      `• Comisiones Base VN: ${totalVN.toLocaleString()} €`,
      `• Comisiones Base VO: ${totalVO.toLocaleString()} €`,
      `• Financiación RCI: ${totalFinan.toLocaleString()} €`,
      `• Preference / Box: ${totalPref.toLocaleString()} €`
    ];
    if (Object.keys(bonusBreakdowns).length > 0) {
      lines.push(`• Bonus Especiales: ${totalBonus.toLocaleString()} €`);
    }
    if (Object.keys(penalBreakdowns).length > 0) {
      lines.push(`• Penalizaciones: -${totalPenal.toLocaleString()} €`);
    }
    lines.push(`\nTotal Comisión Neta: ${totalNet.toLocaleString()} €`);
    return lines.join("\n");
  };

  const getGlobalComisionesTooltip = () => {
    let totalBaseVN = 0;
    let totalBaseVO = 0;
    let totalFinan = 0;
    let totalPref = 0;
    let totalBonus = 0;
    let totalPenal = 0;
    
    Object.values(calculatedCommissions).forEach((comm: any) => {
      totalBaseVN += comm.baseVN;
      totalBaseVO += comm.baseVO;
      totalFinan += comm.financiacion;
      totalPref += comm.preference;
      totalBonus += comm.bonus;
      totalPenal += comm.penalizaciones;
    });

    return `Desglose de Comisión Neta Global:\n` +
      `• Base VN total: ${totalBaseVN.toLocaleString()} €\n` +
      `• Base VO total: ${totalBaseVO.toLocaleString()} €\n` +
      `• Financiación RCI total: ${totalFinan.toLocaleString()} €\n` +
      `• Preference / Box total: ${totalPref.toLocaleString()} €\n` +
      `• Bonus Especiales total: ${totalBonus.toLocaleString()} €\n` +
      `• Penalizaciones total: -${totalPenal.toLocaleString()} €\n\n` +
      `Total Neto del Periodo: ${totalComisiones.toLocaleString()} €`;
  };

  const getSellersExpedientes = (vendedorName: string, type: "VN" | "VO" | "all" | "financed" | "base" | "finanComm" | "bonus" | "penal") => {
    return filteredExpedientes.filter(exp => {
      const matchVendedor = exp.usuario?.nombre === vendedorName;
      if (!matchVendedor) return false;
      if (type === "VN") {
        const name = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
        return name === "nuevo" || name === "demo";
      }
      if (type === "VO") {
        const name = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
        return name !== "nuevo" && name !== "demo";
      }
      if (type === "financed") {
        const saleType = exp.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
        return saleType.includes("crédito") || saleType.includes("credito") || saleType.includes("financiado") || saleType.includes("preference") || saleType.includes("box");
      }
      if (type === "base") {
        const comm = calculatedCommissions[exp.id_expediente];
        return comm && (comm.baseVN > 0 || comm.baseVO > 0);
      }
      if (type === "finanComm") {
        const comm = calculatedCommissions[exp.id_expediente];
        return comm && (comm.financiacion > 0 || comm.preference > 0);
      }
      if (type === "bonus") {
        const comm = calculatedCommissions[exp.id_expediente];
        return comm && comm.bonus > 0;
      }
      if (type === "penal") {
        const comm = calculatedCommissions[exp.id_expediente];
        return comm && comm.penalizaciones > 0;
      }
      return true;
    });
  };

  const sortedDetailedExpedientes = useMemo(() => {
    const list = [...filteredExpedientes];
    if (!sortField) return list;
    list.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";
      if (sortField === "vendedor") {
        valA = a.usuario?.nombre || "";
        valB = b.usuario?.nombre || "";
      } else if (sortField === "cliente") {
        valA = a.cliente?.nombre || "";
        valB = b.cliente?.nombre || "";
      } else if (sortField === "marca") {
        const brandIdA = a.modelo?.marca_id || a.modelo?.marca?.id_marca;
        const brandIdB = b.modelo?.marca_id || b.modelo?.marca?.id_marca;
        valA = marcas.find(m => m.id_marca === brandIdA)?.nombre || "";
        valB = marcas.find(m => m.id_marca === brandIdB)?.nombre || "";
      } else if (sortField === "modelo") {
        valA = a.modelo?.nombre_modelo || "";
        valB = b.modelo?.nombre_modelo || "";
      } else if (sortField === "vnvo") {
        const stateA = a.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
        valA = (stateA === "nuevo" || stateA === "demo") ? "VN" : "VO";
        const stateB = b.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
        valB = (stateB === "nuevo" || stateB === "demo") ? "VN" : "VO";
      } else if (sortField === "metodoPago") {
        valA = a.tipoDeVenta?.nombre_tipo_venta || "";
        valB = b.tipoDeVenta?.nombre_tipo_venta || "";
      } else if (sortField === "matriculacion") {
        valA = getEffectiveMatDate(a) || "";
        valB = getEffectiveMatDate(b) || "";
      } else if (sortField === "comision") {
        valA = calculatedCommissions[a.id_expediente]?.total || 0;
        valB = calculatedCommissions[b.id_expediente]?.total || 0;
      }

      if (typeof valA === "string") {
        return sortDirection === "asc" 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        return sortDirection === "asc" 
          ? (valA > valB ? 1 : -1) 
          : (valB > valA ? 1 : -1);
      }
    });
    return list;
  }, [filteredExpedientes, sortField, sortDirection, calculatedCommissions, marcas]);

  const matriculadosList = useMemo(() => {
    return sortedDetailedExpedientes.filter(exp => {
      const matDate = getEffectiveMatDate(exp);
      return !!(matDate && matDate >= fechaInicio && matDate <= fechaFin);
    });
  }, [sortedDetailedExpedientes, fechaInicio, fechaFin]);

  const carteraList = useMemo(() => {
    return sortedDetailedExpedientes.filter(exp => {
      const matDate = getEffectiveMatDate(exp);
      return !matDate || matDate > fechaFin;
    });
  }, [sortedDetailedExpedientes, fechaFin]);

  const handleSortField = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedModalExpedientes = useMemo(() => {
    if (!detailModal) return [];
    const list = [...detailModal.expedientes];
    list.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";
      if (modalSortField === "vendedor") {
        valA = a.usuario?.nombre || "";
        valB = b.usuario?.nombre || "";
      } else if (modalSortField === "cliente") {
        valA = a.cliente?.nombre || "";
        valB = b.cliente?.nombre || "";
      } else if (modalSortField === "marca") {
        const brandIdA = a.modelo?.marca_id || a.modelo?.marca?.id_marca;
        const brandIdB = b.modelo?.marca_id || b.modelo?.marca?.id_marca;
        valA = marcas.find(m => m.id_marca === brandIdA)?.nombre || "";
        valB = marcas.find(m => m.id_marca === brandIdB)?.nombre || "";
      } else if (modalSortField === "modelo") {
        valA = a.modelo?.nombre_modelo || "";
        valB = b.modelo?.nombre_modelo || "";
      } else if (modalSortField === "vnvo") {
        const stateA = a.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
        valA = (stateA === "nuevo" || stateA === "demo") ? "VN" : "VO";
        const stateB = b.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
        valB = (stateB === "nuevo" || stateB === "demo") ? "VN" : "VO";
      } else if (modalSortField === "metodoPago") {
        valA = a.tipoDeVenta?.nombre_tipo_venta || "";
        valB = b.tipoDeVenta?.nombre_tipo_venta || "";
      } else if (modalSortField === "matriculacion") {
        valA = getEffectiveMatDate(a) || "";
        valB = getEffectiveMatDate(b) || "";
      } else if (modalSortField === "comision") {
        valA = calculatedCommissions[a.id_expediente]?.total || 0;
        valB = calculatedCommissions[b.id_expediente]?.total || 0;
      }

      if (typeof valA === "string") {
        return modalSortDirection === "asc" 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        return modalSortDirection === "asc" 
          ? (valA > valB ? 1 : -1) 
          : (valB > valA ? 1 : -1);
      }
    });
    return list;
  }, [detailModal, modalSortField, modalSortDirection, calculatedCommissions, marcas]);

  // 8. Distribución de Tipos de Venta (Métodos de pago)
  const paymentMethodStats = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredExpedientes.forEach((exp) => {
      const name = exp.tipoDeVenta?.nombre_tipo_venta || "Desconocido";
      counts[name] = (counts[name] || 0) + 1;
    });

    const total = filteredExpedientes.length || 1;
    const colors = ["var(--primary)", "var(--secondary)", "var(--accent)", "var(--text-muted)", "#a78bfa", "#f472b6", "#34d399"];
    return Object.entries(counts).map(([name, val], idx) => ({
      metodo: name,
      unidades: val,
      porcentaje: Math.round((val / total) * 100),
      color: colors[idx % colors.length]
    })).sort((a, b) => b.unidades - a.unidades);
  }, [filteredExpedientes]);

  // 9. Acciones de Exportación
  const handleExportCSV = () => {
    if (filteredExpedientes.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }

    const headers = ["ID Expediente", "Nº Expediente", "Vendedor", "Cliente", "Marca", "Modelo", "VN/VO", "Tipo de Venta", "Fecha Matriculación", "Fecha RCI", "Comisión Total (€)"];
    const rows = filteredExpedientes.map(exp => {
      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const vnvo = (stateName === "nuevo" || stateName === "demo") ? "VN" : "VO";
      const comm = calculatedCommissions[exp.id_expediente]?.total || 0;
      const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
      const brandName = marcas.find(m => m.id_marca === brandId)?.nombre || "";
      return [
        exp.id_expediente,
        exp.id_expediente,
        exp.usuario?.nombre || "",
        exp.cliente?.nombre || "",
        brandName,
        exp.modelo?.nombre_modelo || "",
        vnvo,
        exp.tipoDeVenta?.nombre_tipo_venta || "",
        getEffectiveMatDate(exp) || "",
        exp.fecha_rci || "",
        comm
      ];
    });

    const csvContent = [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `informe_comercial_${fechaInicio}_al_${fechaFin}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    if (filteredExpedientes.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }

    // 1. Hoja: Resumen Vendedores
    const vendedoresData = sellerStats.map(s => ({
      "Vendedor": s.vendedor,
      "Ventas VN": s.vn,
      "Ventas VO": s.vo,
      "Total Ventas": s.total,
      "Operaciones RCI": s.totalFinanciado,
      "Tasa RCI VN (%)": s.vn > 0 ? Math.round((s.financiadoVN / s.vn) * 100) : 0,
      "Comisión VN (€)": s.baseVNComm,
      "Comisión VO (€)": s.baseVOComm,
      "Comisión RCI (€)": s.finanComm + s.prefComm,
      "Bonus Extra (€)": s.bonusComm,
      "Penalizaciones (€)": s.penalComm,
      "Comisión Total Net (€)": s.totalComm
    }));

    // 2. Hoja: Distribución Marcas
    const marcasData = brandStats.map(b => ({
      "Marca": b.marca,
      "Ventas VN": b.vn,
      "Ventas VO": b.vo,
      "Total Ventas": b.total,
      "Cuota de Ventas (%)": b.porcentaje
    }));

    // 3. Hoja: Listado de Expedientes
    const expedientesData = filteredExpedientes.map(exp => {
      const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
      const vnvo = (stateName === "nuevo" || stateName === "demo") ? "VN" : "VO";
      const comm = calculatedCommissions[exp.id_expediente] || { baseVN: 0, baseVO: 0, financing: 0, preference: 0, bonus: 0, penalizaciones: 0, total: 0 };
      const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
      const brandName = marcas.find(m => m.id_marca === brandId)?.nombre || "";
      return {
        "ID": exp.id_expediente,
        "Expediente": exp.id_expediente,
        "Comercial": exp.usuario?.nombre || "",
        "Cliente": exp.cliente?.nombre || "",
        "Marca": brandName,
        "Modelo": exp.modelo?.nombre_modelo || "",
        "VN/VO": vnvo,
        "Método Venta": exp.tipoDeVenta?.nombre_tipo_venta || "",
        "Fecha Matriculación": getEffectiveMatDate(exp) || "",
        "Fecha RCI": exp.fecha_rci || "",
        "Comisión Base VN/VO (€)": comm.baseVN + comm.baseVO,
        "Comisión RCI/Pref (€)": comm.financiacion + comm.preference,
        "Bonus Reglas (€)": comm.bonus,
        "Penalizaciones (€)": comm.penalizaciones,
        "Comisión Total (€)": comm.total
      };
    });

    const wb = XLSX.utils.book_new();
    const wsVendedores = XLSX.utils.json_to_sheet(vendedoresData);
    const wsMarcas = XLSX.utils.json_to_sheet(marcasData);
    const wsExpedientes = XLSX.utils.json_to_sheet(expedientesData);

    XLSX.utils.book_append_sheet(wb, wsVendedores, "Resumen Vendedores");
    XLSX.utils.book_append_sheet(wb, wsMarcas, "Marcas y Modelos");
    XLSX.utils.book_append_sheet(wb, wsExpedientes, "Listado de Ventas");

    XLSX.writeFile(wb, `informe_comercial_consolidado_${fechaInicio}_al_${fechaFin}.xlsx`);
  };

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }} className="print-container">
      
      {/* 1. Cabecera (Se oculta parcialmente al imprimir si queremos un formato super limpio) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }} className="no-print">
        <div>
          <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>📊 Detalle y Análisis Estadístico</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Cuadro de mando analítico en tiempo real del rendimiento de ventas, comisiones y ratios de penetración financiera.
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button type="button" onClick={handleExportCSV} className="btn btn-secondary glass-panel-interactive" style={{ padding: "10px 18px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}>
            📤 CSV
          </button>
          <button type="button" onClick={handleExportExcel} className="btn btn-secondary glass-panel-interactive" style={{ padding: "10px 18px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}>
            🟢 Excel (SheetJS)
          </button>
          <button type="button" onClick={handlePrintPDF} className="btn btn-primary" style={{ padding: "10px 20px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}>
            🖨️ Imprimir PDF
          </button>
        </div>
      </div>

      {/* 2. Filtros Interactivos */}
      <div className="glass-panel no-print" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>🔍 Filtros de Consulta</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>Fecha Inicio</span>
            <input type="date" className="form-input" value={fechaInicio} onChange={(e) => handleManualFechaInicio(e.target.value)} style={{ width: "100%", padding: "8px 12px", fontSize: "0.85rem" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>Fecha Fin</span>
            <input type="date" className="form-input" value={fechaFin} onChange={(e) => handleManualFechaFin(e.target.value)} style={{ width: "100%", padding: "8px 12px", fontSize: "0.85rem" }} />
          </div>

          {/* Filtro Mensual Rápido */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", background: "var(--bg-btn-secondary)", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-light)" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 600 }}>📅 Período Mensual</span>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <select
                className="form-select"
                value={selectedMonth}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  if (m > 0) updateMonthPeriod(m, selectedYear || today.getFullYear());
                }}
                style={{ padding: "6px 10px", fontSize: "0.82rem", flex: 1 }}
              >
                <option value={0}>Mes...</option>
                <option value={1}>Enero</option>
                <option value={2}>Febrero</option>
                <option value={3}>Marzo</option>
                <option value={4}>Abril</option>
                <option value={5}>Mayo</option>
                <option value={6}>Junio</option>
                <option value={7}>Julio</option>
                <option value={8}>Agosto</option>
                <option value={9}>Septiembre</option>
                <option value={10}>Octubre</option>
                <option value={11}>Noviembre</option>
                <option value={12}>Diciembre</option>
              </select>

              <select
                className="form-select"
                value={selectedYear}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  if (selectedMonth > 0) {
                    updateMonthPeriod(selectedMonth, y);
                  } else {
                    setSelectedYear(y);
                  }
                }}
                style={{ padding: "6px 10px", fontSize: "0.82rem", width: "80px" }}
              >
                {Array.from({ length: 10 }, (_, i) => today.getFullYear() - 5 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: "4px", justifyContent: "space-between", marginTop: "2px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  let m = selectedMonth - 1;
                  let y = selectedYear;
                  if (m < 1) {
                    m = 12;
                    y -= 1;
                  }
                  updateMonthPeriod(m, y);
                }}
                style={{ padding: "4px 8px", fontSize: "0.75rem", flex: 1 }}
              >
                ◀️
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const now = new Date();
                  updateMonthPeriod(now.getMonth() + 1, now.getFullYear());
                }}
                style={{ padding: "4px 8px", fontSize: "0.75rem", backgroundColor: "var(--primary)", color: "#fff", border: "none", flex: 2 }}
              >
                Hoy
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  let m = selectedMonth + 1;
                  let y = selectedYear;
                  if (m > 12) {
                    m = 1;
                    y += 1;
                  }
                  updateMonthPeriod(m, y);
                }}
                style={{ padding: "4px 8px", fontSize: "0.75rem", flex: 1 }}
              >
                ▶️
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>Tienda / Sucursal</span>
            <select className="form-select" value={filterTienda} onChange={(e) => setFilterTienda(e.target.value)} style={{ width: "100%", padding: "8px 12px", fontSize: "0.85rem" }}>
              <option value="">Todas las Tiendas</option>
              {tiendas.map(t => <option key={t.id_tienda} value={t.id_tienda}>{t.nombre}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>Comercial / Vendedor</span>
            <select className="form-select" value={filterVendedor} onChange={(e) => setFilterVendedor(e.target.value)} style={{ width: "100%", padding: "8px 12px", fontSize: "0.85rem" }}>
              <option value="">Todos los Vendedores</option>
              {usuarios.filter(u => u.rol !== "invitado").map(u => <option key={u.id_usuario} value={u.id_usuario}>{u.nombre}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>Marca</span>
            <select className="form-select" value={filterMarca} onChange={(e) => setFilterMarca(e.target.value)} style={{ width: "100%", padding: "8px 12px", fontSize: "0.85rem" }}>
              <option value="">Todas las Marcas</option>
              {marcas.map(m => <option key={m.id_marca} value={m.id_marca}>{m.nombre}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>Estado Vehículo</span>
            <select className="form-select" value={filterVNVO} onChange={(e) => setFilterVNVO(e.target.value)} style={{ width: "100%", padding: "8px 12px", fontSize: "0.85rem" }}>
              <option value="">VN y VO</option>
              <option value="VN">Nuevos / Demo (VN)</option>
              <option value="VO">Usados / Seminuevos (VO)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Título de Impresión (Solo visible al imprimir) */}
      <div className="only-print" style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 800 }}>Informe de Rendimiento de Ventas y Comisiones</h1>
        <p style={{ color: "#555", fontSize: "0.9rem" }}>Periodo de consulta: {fechaInicio} al {fechaFin}</p>
        <hr style={{ border: "none", borderTop: "2px solid #333", margin: "10px 0" }} />
      </div>

      {/* 3. Indicadores Clave (KPIs) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "24px"
      }}>
        {/* KPI 1: Vehículos en Periodo */}
        <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "10px", borderLeft: "4px solid var(--primary)", cursor: "default" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Vehículos en {getMesYearLabel()}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.85rem", marginTop: "4px" }}>
            <div 
              onClick={() => setDetailModal({ title: `Pedidos en ${getMesYearLabel()}`, expedientes: statsPorFechaContratacionList, conceptInfo: "Pedidos / contrataciones registradas en este periodo." })}
              style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", borderBottom: "1px dashed var(--border-light)", paddingBottom: "3px" }}
              title="Click para ver detalle"
            >
              <span>Contratación:</span>
              <strong style={{ color: "var(--text-primary)" }}>{statsPorFechaContratacion} uds</strong>
            </div>
            <div 
              onClick={() => setDetailModal({ title: `Afectados en ${getMesYearLabel()}`, expedientes: statsPorAfectadosList, conceptInfo: "Pedidos que han sido afectados (fecha de afectación) en este periodo." })}
              style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", borderBottom: "1px dashed var(--border-light)", paddingBottom: "3px" }}
              title="Click para ver detalle"
            >
              <span>Afectados:</span>
              <strong style={{ color: "var(--primary)" }}>{statsPorAfectados} uds</strong>
            </div>
            <div 
              onClick={() => setDetailModal({ title: `Matriculados en ${getMesYearLabel()}`, expedientes: statsPorMatriculadosList, conceptInfo: "Expedientes matriculados en este periodo." })}
              style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", borderBottom: "1px dashed var(--border-light)", paddingBottom: "3px" }}
              title="Click para ver detalle"
            >
              <span>Matriculados:</span>
              <strong style={{ color: "var(--secondary)" }}>{statsPorMatriculados} uds</strong>
            </div>
            <div 
              onClick={() => setDetailModal({ title: `Cartera Inicial en ${getMesYearLabel()}`, expedientes: statsCarteraInicioList, conceptInfo: "Pedidos/afectaciones de meses anteriores que estaban pendientes de matricular al inicio de este mes." })}
              style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}
              title="Click para ver detalle"
            >
              <span>Cartera Inicial:</span>
              <strong style={{ color: "var(--accent)" }}>{statsCarteraInicio} uds</strong>
            </div>
          </div>
        </div>

        {/* KPI 2: RCI VN */}
        <div 
          onClick={() => {
            const vnFinancedExps = filteredExpedientes.filter(e => {
              const name = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
              const isVN = name === "nuevo" || name === "demo";
              const saleType = e.tipoDeVenta?.nombre_tipo_venta?.toLowerCase() || "";
              const isFinanced = saleType.includes("crédito") || saleType.includes("credito") || saleType.includes("financiado") || saleType.includes("preference") || saleType.includes("box");
              return isVN && isFinanced;
            });
            setDetailModal({ title: "Vehículos VN Financiados RCI", expedientes: vnFinancedExps, conceptInfo: "Vehículos nuevos VN financiados con RCI (Crédito, Financiado, Preference, Renting o Box)." });
          }}
          className="glass-panel-interactive" 
          style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "10px", borderLeft: "4px solid var(--secondary)", cursor: "pointer" }}
          title="Click para ver detalle"
        >
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Penetración Financiera VN</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--text-primary)" }}>{RCIInterventionVN}%</span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Financiación RCI</span>
          </div>
        </div>

        {/* KPI 3: Total Comisiones */}
        <div 
          onClick={() => {
            const commExps = filteredExpedientes.filter(e => (calculatedCommissions[e.id_expediente]?.total || 0) > 0);
            setDetailModal({ title: "Expedientes que Generan Comisión", expedientes: commExps, conceptInfo: "Listado de expedientes que han aportado comisiones efectivas netas en este periodo." });
          }}
          className="glass-panel-interactive" 
          style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "10px", borderLeft: "4px solid var(--success)", cursor: "pointer" }}
          title={getGlobalComisionesTooltip()}
        >
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Comisión Neta Generada</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--text-primary)" }}>{totalComisiones.toLocaleString()} €</span>
            <span style={{ fontSize: "0.8rem", color: "var(--success)" }}>Neto del Periodo</span>
          </div>
        </div>

        {/* KPI 4: Promedio por Expediente */}
        <div 
          onClick={() => setDetailModal({ title: "Historial de Vehículos del Periodo", expedientes: filteredExpedientes, conceptInfo: "Todos los expedientes que participan en los cálculos del informe." })}
          className="glass-panel-interactive" 
          style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "10px", borderLeft: "4px solid var(--accent)", cursor: "pointer" }}
          title="Click para ver detalle"
        >
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Comisión Media</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--text-primary)" }}>{comisionPromedio.toLocaleString()} €</span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>por vehículo vendido</span>
          </div>
        </div>
      </div>

      {/* 4. Gráficos Visuales (Segunda Sección) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))",
        gap: "24px"
      }} className="no-print">
        
        {/* GRÁFICO 1: Distribución por Marca */}
        <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Distribución por Marca</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {brandStats.map(b => (
              <div 
                key={b.marca} 
                onClick={() => {
                  const mId = marcas.find(m => m.nombre === b.marca)?.id_marca;
                  const brandExps = filteredExpedientes.filter(e => (e.modelo?.marca_id || e.modelo?.marca?.id_marca) === mId);
                  setDetailModal({ title: `Ventas de Marca: ${b.marca}`, expedientes: brandExps });
                }}
                style={{ display: "flex", flexDirection: "column", gap: "4px", cursor: "pointer" }}
                title="Click para ver detalle"
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{b.marca}</span>
                  <span style={{ color: "var(--text-secondary)" }}>{b.total} coches ({b.porcentaje}%)</span>
                </div>
                <div style={{ height: "6px", width: "100%", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${b.porcentaje}%`, backgroundColor: "var(--primary)", borderRadius: "3px" }}></div>
                </div>
              </div>
            ))}
            {brandStats.length === 0 && (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>No hay datos suficientes.</p>
            )}
          </div>
        </div>

        {/* GRÁFICO 2: Distribución por Forma de Pago */}
        <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Distribución por Forma de Pago</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {paymentMethodStats.map(p => (
              <div 
                key={p.metodo} 
                onClick={() => {
                  const paymentExps = filteredExpedientes.filter(e => e.tipoDeVenta?.nombre_tipo_venta === p.metodo);
                  setDetailModal({ title: `Ventas con Método: ${p.metodo}`, expedientes: paymentExps });
                }}
                style={{ display: "flex", flexDirection: "column", gap: "4px", cursor: "pointer" }}
                title="Click para ver detalle"
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{p.metodo}</span>
                  <span style={{ color: "var(--text-secondary)" }}>{p.unidades} uds ({p.porcentaje}%)</span>
                </div>
                <div style={{ height: "6px", width: "100%", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${p.porcentaje}%`, backgroundColor: p.color, borderRadius: "3px" }}></div>
                </div>
              </div>
            ))}
            {paymentMethodStats.length === 0 && (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>No hay datos suficientes.</p>
            )}
          </div>
        </div>
      </div>

      {/* 5. Tabla por Comercial (Consolidación) */}
      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)" }}>📈 Rendimiento Económico por Comercial</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border-light)", textAlign: "left" }}>
                <th style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600 }}>Comercial</th>
                <th style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "center" }}>Matriculados VN</th>
                <th style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "center" }}>Matriculados VO</th>
                <th style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "center" }}>Total Matriculados</th>
                <th style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "center" }}>Pedidos en Cartera</th>
                <th style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "center" }}>RCI Financiado</th>
                <th style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "center" }}>Ratio RCI VN</th>
                <th style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "right" }}>Base VN/VO (€)</th>
                <th style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "right" }}>Financiación (€)</th>
                <th style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "right" }}>Bonus Extra (€)</th>
                <th style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "right" }}>Penalizaciones (€)</th>
                <th style={{ padding: "12px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "right" }}>Comisión Total (€)</th>
              </tr>
            </thead>
            <tbody>
              {sellerStats.map(s => (
                <tr key={s.vendedor} style={{ borderBottom: "1px solid var(--border-light)", fontSize: "0.85rem" }}>
                  <td onClick={() => setDetailModal({ title: `Expedientes de: ${s.vendedor}`, expedientes: getSellersExpedientes(s.vendedor, "all"), conceptInfo: `Todos los expedientes asociados a ${s.vendedor} en este periodo.` })} style={{ padding: "12px", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer", textDecoration: "underline" }} title="Click para ver desglosado">{s.vendedor}</td>
                  <td onClick={() => setDetailModal({ title: `Matriculados VN de: ${s.vendedor}`, expedientes: getSellersExpedientes(s.vendedor, "VN").filter(e => { const matDate = getEffectiveMatDate(e); return !!(matDate && matDate >= fechaInicio && matDate <= fechaFin); }), conceptInfo: `Expedientes VN matriculados de ${s.vendedor} en este periodo.` })} style={{ padding: "12px", textAlign: "center", cursor: "pointer", textDecoration: "underline" }} title="Ver detalle">{s.vn}</td>
                  <td onClick={() => setDetailModal({ title: `Matriculados VO de: ${s.vendedor}`, expedientes: getSellersExpedientes(s.vendedor, "VO").filter(e => { const matDate = getEffectiveMatDate(e); return !!(matDate && matDate >= fechaInicio && matDate <= fechaFin); }), conceptInfo: `Expedientes VO matriculados de ${s.vendedor} en este periodo.` })} style={{ padding: "12px", textAlign: "center", cursor: "pointer", textDecoration: "underline" }} title="Ver detalle">{s.vo}</td>
                  <td onClick={() => setDetailModal({ title: `Matriculados Totales de: ${s.vendedor}`, expedientes: getSellersExpedientes(s.vendedor, "all").filter(e => { const matDate = getEffectiveMatDate(e); return !!(matDate && matDate >= fechaInicio && matDate <= fechaFin); }), conceptInfo: `Total expedientes matriculados de ${s.vendedor} en este periodo.` })} style={{ padding: "12px", textAlign: "center", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }} title="Ver detalle">{s.total}</td>
                  <td onClick={() => setDetailModal({ title: `Pedidos en Cartera de: ${s.vendedor}`, expedientes: getSellersExpedientes(s.vendedor, "all").filter(e => { const matDate = getEffectiveMatDate(e); return !matDate || matDate > fechaFin; }), conceptInfo: `Pedidos creados o afectados en este periodo pero pendientes de matriculación.` })} style={{ padding: "12px", textAlign: "center", cursor: "pointer", textDecoration: "underline", color: "var(--accent)" }} title="Ver pedidos en cartera">{s.cartera}</td>
                  <td onClick={() => setDetailModal({ title: `Financiados RCI de: ${s.vendedor}`, expedientes: getSellersExpedientes(s.vendedor, "financed"), conceptInfo: `Expedientes con financiación RCI de ${s.vendedor}.` })} style={{ padding: "12px", textAlign: "center", cursor: "pointer", textDecoration: "underline" }} title="Ver detalle">{s.totalFinanciado}</td>
                  <td style={{ padding: "12px", textAlign: "center" }}>{s.vn > 0 ? `${Math.round((s.financiadoVN / s.vn) * 100)}%` : "0%"}</td>
                  <td onClick={() => setDetailModal({ title: `Base VN/VO de: ${s.vendedor}`, expedientes: getSellersExpedientes(s.vendedor, "base"), conceptInfo: `Comisiones base VN/VO abonadas a ${s.vendedor}.` })} style={{ padding: "12px", textAlign: "right", cursor: "pointer", textDecoration: "underline" }} title={`Base VN: ${s.baseVNComm.toLocaleString()} €\nBase VO: ${s.baseVOComm.toLocaleString()} €`}>{(s.baseVNComm + s.baseVOComm).toLocaleString()} €</td>
                  <td onClick={() => setDetailModal({ title: `Incentivos Financiación de: ${s.vendedor}`, expedientes: getSellersExpedientes(s.vendedor, "finanComm"), conceptInfo: `Comisiones ligadas a financiación y Preference de ${s.vendedor}.` })} style={{ padding: "12px", textAlign: "right", cursor: "pointer", textDecoration: "underline" }} title={`Financiación RCI: ${s.finanComm.toLocaleString()} €\nPreference / Box: ${s.prefComm.toLocaleString()} €`}>{(s.finanComm + s.prefComm).toLocaleString()} €</td>
                  <td onClick={() => setDetailModal({ title: `Bonus de Campaña de: ${s.vendedor}`, expedientes: getSellersExpedientes(s.vendedor, "bonus"), conceptInfo: `Bonus extra acumulados por reglas o planes de campaña de ${s.vendedor}.` })} style={{ padding: "12px", textAlign: "right", color: "var(--success)", cursor: "pointer", textDecoration: "underline" }} title={getVendedorCommissionTooltip(s.vendedor, "bonus")}>{s.bonusComm > 0 ? `+${s.bonusComm.toLocaleString()}` : "0"} €</td>
                  <td onClick={() => setDetailModal({ title: `Penalizaciones de: ${s.vendedor}`, expedientes: getSellersExpedientes(s.vendedor, "penal"), conceptInfo: `Descuentos o penalizaciones aplicadas a ${s.vendedor}.` })} style={{ padding: "12px", textAlign: "right", color: "var(--danger)", cursor: "pointer", textDecoration: "underline" }} title={getVendedorCommissionTooltip(s.vendedor, "penal")}>{s.penalComm > 0 ? `-${s.penalComm.toLocaleString()}` : "0"} €</td>
                  <td onClick={() => setDetailModal({ title: `Liquidación Total de: ${s.vendedor}`, expedientes: getSellersExpedientes(s.vendedor, "all"), conceptInfo: `Comisión neta final a percibir por ${s.vendedor} (VN+VO+RCI+Bonus-Penalizaciones).` })} style={{ padding: "12px", textAlign: "right", fontWeight: 700, color: "var(--text-primary)", cursor: "pointer", textDecoration: "underline" }} title={getVendedorCommissionTooltip(s.vendedor, "total")}>{s.totalComm.toLocaleString()} €</td>
                </tr>
              ))}
              {sellerStats.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                    No hay registros de ventas para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Listado Detallado de Operaciones - Dos Cajas Separadas */}
      
      {/* Caja 1: Matriculados */}
      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)" }}>📋 Vehículos Matriculados en el Periodo</h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            Mostrando <strong>{matriculadosList.length}</strong> matriculados ({matriculadosList.filter(e => {
              const name = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
              return name === "nuevo" || name === "demo";
            }).length} VN y {matriculadosList.filter(e => {
              const name = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
              return name !== "nuevo" && name !== "demo";
            }).length} VO)
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border-light)", textAlign: "left" }}>
                <th onClick={() => handleSortField("vendedor")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  Vendedor {sortField === "vendedor" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("cliente")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  Cliente {sortField === "cliente" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("marca")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  Marca {sortField === "marca" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("modelo")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  Modelo {sortField === "modelo" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("vnvo")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  VN/VO {sortField === "vnvo" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("metodoPago")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  Método Pago {sortField === "metodoPago" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("matriculacion")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  Matriculación {sortField === "matriculacion" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("comision")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "right", cursor: "pointer", userSelect: "none" }}>
                  Comisión {sortField === "comision" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {matriculadosList.map(exp => {
                const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
                const vnvo = (stateName === "nuevo" || stateName === "demo") ? "VN" : "VO";
                const comm = calculatedCommissions[exp.id_expediente]?.total || 0;
                const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
                const brandName = marcas.find(m => m.id_marca === brandId)?.nombre || "";

                return (
                  <tr key={exp.id_expediente} style={{ borderBottom: "1px solid var(--border-light)", fontSize: "0.85rem" }}>
                    <td style={{ padding: "10px" }}>{exp.usuario?.nombre || ""}</td>
                    <td style={{ padding: "10px" }}>{exp.cliente?.nombre || ""}</td>
                    <td style={{ padding: "10px" }}>{brandName}</td>
                    <td style={{ padding: "10px" }}>{exp.modelo?.nombre_modelo || ""}</td>
                    <td style={{ padding: "10px" }}>
                      <span className={`badge ${vnvo === "VN" ? "badge-tienda" : "badge-vendedor"}`} style={{ fontSize: "0.7rem", padding: "3px 6px" }}>
                        {vnvo}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>{exp.tipoDeVenta?.nombre_tipo_venta || ""}</td>
                    <td style={{ padding: "10px" }}>{getEffectiveMatDate(exp) || ""}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: 600, cursor: "help" }} title={getExpedienteCommissionTooltip(exp.id_expediente)}>{comm.toLocaleString()} €</td>
                  </tr>
                );
              })}
              {matriculadosList.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                    Ningún vehículo matriculado en este periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            Mostrando <strong>{matriculadosList.length}</strong> matriculados ({matriculadosList.filter(e => {
              const name = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
              return name === "nuevo" || name === "demo";
            }).length} VN y {matriculadosList.filter(e => {
              const name = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
              return name !== "nuevo" && name !== "demo";
            }).length} VO)
          </span>
        </div>
      </div>

      {/* Caja 2: Pedidos en Cartera */}
      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)" }}>💼 Pedidos en Cartera (Pendientes de Matriculación)</h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            Mostrando <strong>{carteraList.length}</strong> pedidos en cartera ({carteraList.filter(e => {
              const name = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
              return name === "nuevo" || name === "demo";
            }).length} VN y {carteraList.filter(e => {
              const name = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
              return name !== "nuevo" && name !== "demo";
            }).length} VO)
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border-light)", textAlign: "left" }}>
                <th onClick={() => handleSortField("vendedor")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  Vendedor {sortField === "vendedor" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("cliente")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  Cliente {sortField === "cliente" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("marca")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  Marca {sortField === "marca" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("modelo")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  Modelo {sortField === "modelo" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("vnvo")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  VN/VO {sortField === "vnvo" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("metodoPago")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  Método Pago {sortField === "metodoPago" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("matriculacion")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                  Matriculación {sortField === "matriculacion" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
                <th onClick={() => handleSortField("comision")} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "right", cursor: "pointer", userSelect: "none" }}>
                  Comisión {sortField === "comision" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {carteraList.map(exp => {
                const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
                const vnvo = (stateName === "nuevo" || stateName === "demo") ? "VN" : "VO";
                const comm = calculatedCommissions[exp.id_expediente]?.total || 0;
                const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
                const brandName = marcas.find(m => m.id_marca === brandId)?.nombre || "";

                return (
                  <tr key={exp.id_expediente} style={{ borderBottom: "1px solid var(--border-light)", fontSize: "0.85rem" }}>
                    <td style={{ padding: "10px" }}>{exp.usuario?.nombre || ""}</td>
                    <td style={{ padding: "10px" }}>{exp.cliente?.nombre || ""}</td>
                    <td style={{ padding: "10px" }}>{brandName}</td>
                    <td style={{ padding: "10px" }}>{exp.modelo?.nombre_modelo || ""}</td>
                    <td style={{ padding: "10px" }}>
                      <span className={`badge ${vnvo === "VN" ? "badge-tienda" : "badge-vendedor"}`} style={{ fontSize: "0.7rem", padding: "3px 6px" }}>
                        {vnvo}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>{exp.tipoDeVenta?.nombre_tipo_venta || ""}</td>
                    <td style={{ padding: "10px" }}>{getEffectiveMatDate(exp) || ""}</td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: 600, cursor: "help" }} title={getExpedienteCommissionTooltip(exp.id_expediente)}>{comm.toLocaleString()} €</td>
                  </tr>
                );
              })}
              {carteraList.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                    Ningún pedido en cartera pendiente en este periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            Mostrando <strong>{carteraList.length}</strong> pedidos en cartera ({carteraList.filter(e => {
              const name = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
              return name === "nuevo" || name === "demo";
            }).length} VN y {carteraList.filter(e => {
              const name = e.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
              return name !== "nuevo" && name !== "demo";
            }).length} VO)
          </span>
        </div>
      </div>

      {/* Estilos específicos para impresión */}
      <style jsx global>{`
        @media print {
          body {
            background: #fff !important;
            color: #000 !important;
            font-size: 10pt !important;
          }
          .no-print {
            display: none !important;
          }
          .only-print {
            display: block !important;
          }
          .glass-panel {
            background: none !important;
            border: none !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          table {
            page-break-inside: auto !important;
          }
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          .print-container {
            gap: 20px !important;
          }
        }
        .only-print {
          display: none;
        }
      `}</style>

      {/* Modal Genérico de Desglose de Operaciones */}
      {detailModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{
            width: "90%",
            maxWidth: "850px",
            maxHeight: "85vh",
            padding: "28px",
            display: "flex",
            flexDirection: "column",
            gap: "20px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
                  🔍 Detalle: {detailModal.title}
                </h3>
                {detailModal.conceptInfo && (
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", margin: "4px 0 0 0" }}>
                    {detailModal.conceptInfo}
                  </p>
                )}
              </div>
              <button 
                onClick={() => setDetailModal(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: "4px"
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ overflowY: "auto", flex: 1, border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)" }}>
              <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border-light)", textAlign: "left", background: "rgba(128,128,128,0.05)" }}>
                    <th onClick={() => {
                      if (modalSortField === "vendedor") setModalSortDirection(d => d === "asc" ? "desc" : "asc");
                      else { setModalSortField("vendedor"); setModalSortDirection("asc"); }
                    }} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                      Vendedor {modalSortField === "vendedor" ? (modalSortDirection === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => {
                      if (modalSortField === "cliente") setModalSortDirection(d => d === "asc" ? "desc" : "asc");
                      else { setModalSortField("cliente"); setModalSortDirection("asc"); }
                    }} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                      Cliente {modalSortField === "cliente" ? (modalSortDirection === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => {
                      if (modalSortField === "marca") setModalSortDirection(d => d === "asc" ? "desc" : "asc");
                      else { setModalSortField("marca"); setModalSortDirection("asc"); }
                    }} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                      Marca {modalSortField === "marca" ? (modalSortDirection === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => {
                      if (modalSortField === "modelo") setModalSortDirection(d => d === "asc" ? "desc" : "asc");
                      else { setModalSortField("modelo"); setModalSortDirection("asc"); }
                    }} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                      Modelo {modalSortField === "modelo" ? (modalSortDirection === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => {
                      if (modalSortField === "vnvo") setModalSortDirection(d => d === "asc" ? "desc" : "asc");
                      else { setModalSortField("vnvo"); setModalSortDirection("asc"); }
                    }} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                      VN/VO {modalSortField === "vnvo" ? (modalSortDirection === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => {
                      if (modalSortField === "metodoPago") setModalSortDirection(d => d === "asc" ? "desc" : "asc");
                      else { setModalSortField("metodoPago"); setModalSortDirection("asc"); }
                    }} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                      Forma Pago {modalSortField === "metodoPago" ? (modalSortDirection === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => {
                      if (modalSortField === "matriculacion") setModalSortDirection(d => d === "asc" ? "desc" : "asc");
                      else { setModalSortField("matriculacion"); setModalSortDirection("asc"); }
                    }} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                      Matriculación {modalSortField === "matriculacion" ? (modalSortDirection === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th onClick={() => {
                      if (modalSortField === "comision") setModalSortDirection(d => d === "asc" ? "desc" : "asc");
                      else { setModalSortField("comision"); setModalSortDirection("asc"); }
                    }} style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600, textAlign: "right", cursor: "pointer", userSelect: "none" }}>
                      Comisión {modalSortField === "comision" ? (modalSortDirection === "asc" ? "▲" : "▼") : ""}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedModalExpedientes.map(exp => {
                    const stateName = exp.estadoVehiculo?.nombre_estado_vehiculo?.toLowerCase() || "";
                    const vnvo = (stateName === "nuevo" || stateName === "demo") ? "VN" : "VO";
                    const comm = calculatedCommissions[exp.id_expediente]?.total || 0;
                    const brandId = exp.modelo?.marca_id || exp.modelo?.marca?.id_marca;
                    const brandName = marcas.find(m => m.id_marca === brandId)?.nombre || "";

                    return (
                      <tr key={exp.id_expediente} style={{ borderBottom: "1px solid var(--border-light)", fontSize: "0.8rem" }}>
                        <td style={{ padding: "8px 10px" }}>{exp.usuario?.nombre || ""}</td>
                        <td style={{ padding: "8px 10px" }}>{exp.cliente?.nombre || ""}</td>
                        <td style={{ padding: "8px 10px" }}>{brandName}</td>
                        <td style={{ padding: "8px 10px" }}>{exp.modelo?.nombre_modelo || ""}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span className={`badge ${vnvo === "VN" ? "badge-tienda" : "badge-vendedor"}`} style={{ fontSize: "0.65rem", padding: "2px 5px" }}>
                            {vnvo}
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px" }}>{exp.tipoDeVenta?.nombre_tipo_venta || ""}</td>
                        <td style={{ padding: "8px 10px" }}>{getEffectiveMatDate(exp) || ""}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>{comm.toLocaleString()} €</td>
                      </tr>
                    );
                  })}
                  {sortedModalExpedientes.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                        No hay expedientes para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Total: <strong>{sortedModalExpedientes.length}</strong> expedientes
              </span>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setDetailModal(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
