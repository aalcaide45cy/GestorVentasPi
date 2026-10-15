"use client";

import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { formatDate } from "@/lib/date-utils";

interface DropdownItem {
  id: number;
  nombre: string;
  sistema_comisiones?: boolean;
}

interface ModeloItem {
  id: number;
  nombre: string;
  marca_id: number;
}

interface ComisionesManagerProps {
  initialPlanes: any[];
  marcas: DropdownItem[];
  modelos: ModeloItem[];
  isAdmin?: boolean;
}

export default function ComisionesManager({ initialPlanes, marcas, modelos, isAdmin = false }: ComisionesManagerProps) {
  const router = useRouter();
  const [planes, setPlanes] = useState(initialPlanes);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [planData, setPlanData] = useState<any>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "resumen" | "objetivo" | "modelos" | "usados" | "preference" | "reglas" | "bonus" | "penalizaciones" | "liquidacion" | "notas"
  >("resumen");

  // Estados para creación/clonación de planes
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanStart, setNewPlanStart] = useState("");
  const [newPlanEnd, setNewPlanEnd] = useState("");
  const [newPlanBase, setNewPlanBase] = useState("12");
  const [newPlanArrastre, setNewPlanArrastre] = useState("0");
  const [newPlanMinMat, setNewPlanMinMat] = useState("6");
  const [cloneFromId, setCloneFromId] = useState<string>("");
  const [modalRefDate, setModalRefDate] = useState<Date>(new Date());
  const [showDuplicateConfirmModal, setShowDuplicateConfirmModal] = useState(false);

  // Estados para notas y comisiones pendientes del plan
  const [planNotes, setPlanNotes] = useState<any[]>([]);
  const [planPendingComs, setPlanPendingComs] = useState<any[]>([]);
  const [newNoteTexto, setNewNoteTexto] = useState("");
  const [newPendingTitulo, setNewPendingTitulo] = useState("");
  const [newPendingValor, setNewPendingValor] = useState("");
  const [newPendingDescripcion, setNewPendingDescripcion] = useState("");

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados locales del editor del plan
  const [planName, setPlanName] = useState("");
  const [planStart, setPlanStart] = useState("");
  const [planEnd, setPlanEnd] = useState("");
  const [planEstado, setPlanEstado] = useState("borrador");
  const [objetivoBase, setObjetivoBase] = useState(12);
  const [arrastre, setArrastre] = useState(0);
  const [minMatriculaciones, setMinMatriculaciones] = useState(6);
  const [minCochesMultiplicador, setMinCochesMultiplicador] = useState(0);
  const [penalizacionImporte, setPenalizacionImporte] = useState(0);
  const [penalizacionTitulo, setPenalizacionTitulo] = useState("");
  const [penalizacionDescripcion, setPenalizacionDescripcion] = useState("");

  // Modelos y tarifas
  const [rates, setRates] = useState<any[]>([]);

  // Reglas generales
  const [rules, setRules] = useState<any[]>([]);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleType, setNewRuleType] = useState("pedido");
  const [newRuleMarca, setNewRuleMarca] = useState<string>("");
  const [newRuleModelo, setNewRuleModelo] = useState<string>("");
  const [newRuleAfectaObj, setNewRuleAfectaObj] = useState(false);
  const [newRuleValObj, setNewRuleValObj] = useState("1");
  const [newRuleAfectaCom, setNewRuleAfectaCom] = useState(true);
  const [newRuleImporte, setNewRuleImporte] = useState("100");
  const [newRuleTasaIntervencion, setNewRuleTasaIntervencion] = useState<string>("");
  const [newRuleLigarACredito, setNewRuleLigarACredito] = useState(false);

  const [editingRuleIdx, setEditingRuleIdx] = useState<number | null>(null);
  const [editingRuleName, setEditingRuleName] = useState("");
  const [editingRuleType, setEditingRuleType] = useState("pedido");
  const [editingRuleMarca, setEditingRuleMarca] = useState<string>("");
  const [editingRuleModelo, setEditingRuleModelo] = useState<string>("");
  const [editingRuleAfectaObj, setEditingRuleAfectaObj] = useState(false);
  const [editingRuleValObj, setEditingRuleValObj] = useState("1");
  const [editingRuleAfectaCom, setEditingRuleAfectaCom] = useState(true);
  const [editingRuleImporte, setEditingRuleImporte] = useState("100");
  const [editingRuleTasaIntervencion, setEditingRuleTasaIntervencion] = useState<string>("");
  const [editingRuleLigarACredito, setEditingRuleLigarACredito] = useState(false);

  // Bonus
  const [bonusRules, setBonusRules] = useState<any[]>([]);
  const [newBonusName, setNewBonusName] = useState("");
  const [newBonusDesc, setNewBonusDesc] = useState("");
  const [newBonusType, setNewBonusType] = useState("afectacion");
  const [newBonusMarca, setNewBonusMarca] = useState<string>("");
  const [newBonusModelo, setNewBonusModelo] = useState<string>("");
  const [newBonusImporte, setNewBonusImporte] = useState("150");
  const [newBonusAfectaObj, setNewBonusAfectaObj] = useState(false);
  const [newBonusValObj, setNewBonusValObj] = useState("0");
  const [newBonusStart, setNewBonusStart] = useState("");
  const [newBonusEnd, setNewBonusEnd] = useState("");

  // Financiación
  const [financeNormal, setFinanceNormal] = useState(0);
  const [financePref, setFinancePref] = useState(0);

  // Usados / VO
  const [usedRates, setUsedRates] = useState<any[]>([]);
  const [voPatterns, setVoPatterns] = useState<any[]>([]);
  const [prefLocked, setPrefLocked] = useState(true);

  // Financiación por marca
  const [financeRates, setFinanceRates] = useState<any[]>([]);
  const [brandInterventionRates, setBrandInterventionRates] = useState<any[]>([]);

  // Estados para listado, ordenación, filtrado y paginación de planes
  const [planPageSize, setPlanPageSize] = useState(10);
  const [planCurrentPage, setPlanCurrentPage] = useState(1);
  const [planSortField, setPlanSortField] = useState<string>("fecha_inicio");
  const [planSortOrder, setPlanSortOrder] = useState<"asc" | "desc">("desc");
  const [planSearchQuery, setPlanSearchQuery] = useState("");

  // Estados para cotejo/verificación de comisiones
  const [cotejoPlanId, setCotejoPlanId] = useState<number | null>(null);



  const handlePlanSort = (field: string) => {
    if (planSortField === field) {
      setPlanSortOrder(planSortOrder === "asc" ? "desc" : "asc");
    } else {
      setPlanSortField(field);
      setPlanSortOrder("asc");
    }
    setPlanCurrentPage(1);
  };

  const renderPlanSortIndicator = (field: string) => {
    if (planSortField !== field) return " ↕";
    return planSortOrder === "asc" ? " ▲" : " ▼";
  };

  const handlePlanPageSizeChange = (newSize: number) => {
    setPlanPageSize(newSize);
    setPlanCurrentPage(1);
  };



  const filteredPlanes = planes.filter((p) => {
    const q = planSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.nombre.toLowerCase().includes(q) ||
      p.fecha_inicio.includes(q) ||
      p.fecha_fin.includes(q)
    );
  });

  const sortedPlanes = [...filteredPlanes].sort((a, b) => {
    let aVal: any = a[planSortField];
    let bVal: any = b[planSortField];
    
    if (planSortField === "liquidacion") {
      const aLiq = a.liquidations?.[0];
      const bLiq = b.liquidations?.[0];
      aVal = aLiq ? (aLiq.total_comision_economica - Math.abs(aLiq.penalizacion_importe_snapshot || 0)) : -1;
      bVal = bLiq ? (bLiq.total_comision_economica - Math.abs(bLiq.penalizacion_importe_snapshot || 0)) : -1;
    } else if (planSortField === "objetivo") {
      aVal = a.objetivo_base + a.arrastre;
      bVal = b.objetivo_base + b.arrastre;
    }

    if (aVal === undefined || aVal === null) return 1;
    if (bVal === undefined || bVal === null) return -1;

    if (aVal < bVal) return planSortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return planSortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const totalFilteredPlanes = sortedPlanes.length;
  const totalPlanPages = Math.max(1, Math.ceil(totalFilteredPlanes / planPageSize));
  const safePlanPage = Math.min(planCurrentPage, totalPlanPages);
  const paginatedPlanes = sortedPlanes.slice(
    (safePlanPage - 1) * planPageSize,
    safePlanPage * planPageSize
  );

  const goToPlanPage = (page: number) => {
    setPlanCurrentPage(Math.max(1, Math.min(page, totalPlanPages)));
  };

  const [cotejoLines, setCotejoLines] = useState<any[]>([]);
  const [cotejoPenalizacionImporte, setCotejoPenalizacionImporte] = useState<number>(0);
  const [cotejoPenalizacionTitulo, setCotejoPenalizacionTitulo] = useState<string>("");
  const [cotejoFilter, setCotejoFilter] = useState<"todos" | "pendientes" | "cobrados">("todos");
  const [cotejoSearch, setCotejoSearch] = useState("");
  const [cotejoVendedorFilter, setCotejoVendedorFilter] = useState("");
  const [cotejoSortField, setCotejoSortField] = useState("matricula");
  const [cotejoSortOrder, setCotejoSortOrder] = useState<"asc" | "desc">("asc");

  const handleToggleAllComponents = async (line: any) => {
    const isCocheCobrada = line.comision_coche_cobrada || false;
    const isUsadoCobrada = line.comision_usado_cobrada || false;
    const isFinanCobrada = line.comision_financiacion_cobrada || false;
    const isPrefCobrada = line.comision_preference_cobrada || false;
    const isBonusCobrada = line.comision_bonus_cobrada || false;
    let customConcepts: any[] = [];
    if (line.conceptos_adicionales) {
      try {
        customConcepts = JSON.parse(line.conceptos_adicionales);
      } catch (e) {
        console.error(e);
      }
    }
    const allConceptsCobrados = customConcepts.every(c => c.cobrado);
    
    const targetValue = !(isCocheCobrada && isUsadoCobrada && isFinanCobrada && isPrefCobrada && isBonusCobrada && allConceptsCobrados);
    const updatedConcepts = customConcepts.map(c => ({ ...c, cobrado: targetValue }));
    
    // Optimistic update
    setCotejoLines(prev => prev.map(l => {
      if (l.id_expediente === line.id_expediente) {
        return {
          ...l,
          comision_cobrada: targetValue,
          comision_coche_cobrada: targetValue,
          comision_usado_cobrada: targetValue,
          comision_financiacion_cobrada: targetValue,
          comision_preference_cobrada: targetValue,
          comision_bonus_cobrada: targetValue,
          conceptos_adicionales: JSON.stringify(updatedConcepts)
        };
      }
      return l;
    }));

    try {
      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: line.id_expediente,
          expediente: {
            comision_cobrada: targetValue,
            comision_coche_cobrada: targetValue,
            comision_usado_cobrada: targetValue,
            comision_financiacion_cobrada: targetValue,
            comision_preference_cobrada: targetValue,
            comision_bonus_cobrada: targetValue,
            conceptos_adicionales: JSON.stringify(updatedConcepts)
          }
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
    } catch (err: any) {
      console.error(err);
      showNotification("Error al guardar cambios de verificación masiva.", "error");
      setCotejoLines(prev => prev.map(l => {
        if (l.id_expediente === line.id_expediente) {
          return {
            ...l,
            comision_cobrada: line.comision_cobrada,
            comision_coche_cobrada: isCocheCobrada,
            comision_usado_cobrada: isUsadoCobrada,
            comision_financiacion_cobrada: isFinanCobrada,
            comision_preference_cobrada: isPrefCobrada,
            comision_bonus_cobrada: isBonusCobrada,
            conceptos_adicionales: line.conceptos_adicionales
          };
        }
        return l;
      }));
    }
  };

  const handleToggleComponent = async (line: any, component: "coche" | "usado" | "financiacion" | "preference" | "bonus") => {
    const isCoche = component === "coche";
    const isUsado = component === "usado";
    const isFinan = component === "financiacion";
    const isPref = component === "preference";
    const isBonus = component === "bonus";

    const fieldName = `comision_${component === "coche" ? "coche" : component === "usado" ? "usado" : component === "financiacion" ? "financiacion" : component === "preference" ? "preference" : "bonus"}_cobrada`;
    const currentValue = line[fieldName] || false;
    const targetValue = !currentValue;

    const isCocheCobrada = isCoche ? targetValue : (line.comision_coche_cobrada || false);
    const isUsadoCobrada = isUsado ? targetValue : (line.comision_usado_cobrada || false);
    const isFinanCobrada = isFinan ? targetValue : (line.comision_financiacion_cobrada || false);
    const isPrefCobrada = isPref ? targetValue : (line.comision_preference_cobrada || false);
    const isBonusCobrada = isBonus ? targetValue : (line.comision_bonus_cobrada || false);
    
    let customConcepts: any[] = [];
    if (line.conceptos_adicionales) {
      try {
        customConcepts = JSON.parse(line.conceptos_adicionales);
      } catch(e) {}
    }
    const allConceptsCobrados = customConcepts.every(c => c.cobrado);
    const newOverallCobrada = isCocheCobrada && isUsadoCobrada && isFinanCobrada && isPrefCobrada && isBonusCobrada && allConceptsCobrados;

    // Optimistic update
    setCotejoLines(prev => prev.map(l => {
      if (l.id_expediente === line.id_expediente) {
        return {
          ...l,
          comision_cobrada: newOverallCobrada,
          [fieldName]: targetValue
        };
      }
      return l;
    }));

    try {
      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: line.id_expediente,
          expediente: {
            comision_cobrada: newOverallCobrada,
            [fieldName]: targetValue
          }
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
    } catch (err: any) {
      console.error(err);
      showNotification("Error al guardar el estado de cobro.", "error");
      setCotejoLines(prev => prev.map(l => {
        if (l.id_expediente === line.id_expediente) {
          return {
            ...l,
            comision_cobrada: line.comision_cobrada,
            [fieldName]: currentValue
          };
        }
        return l;
      }));
    }
  };

  const handleToggleCustomConcept = async (line: any, conceptId: string) => {
    let customConcepts: any[] = [];
    if (line.conceptos_adicionales) {
      try {
        customConcepts = JSON.parse(line.conceptos_adicionales);
      } catch (e) {}
    }
    
    const updatedConcepts = customConcepts.map(c => {
      if (c.id === conceptId) {
        return { ...c, cobrado: !c.cobrado };
      }
      return c;
    });
    
    const isCocheCobrada = line.comision_coche_cobrada || false;
    const isFinanCobrada = line.comision_financiacion_cobrada || false;
    const allConceptsCobrados = updatedConcepts.every(c => c.cobrado);
    const newOverallCobrada = isCocheCobrada && isFinanCobrada && allConceptsCobrados;

    // Optimistic update
    setCotejoLines(prev => prev.map(l => {
      if (l.id_expediente === line.id_expediente) {
        return {
          ...l,
          comision_cobrada: newOverallCobrada,
          conceptos_adicionales: JSON.stringify(updatedConcepts)
        };
      }
      return l;
    }));

    try {
      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: line.id_expediente,
          expediente: {
            comision_cobrada: newOverallCobrada,
            conceptos_adicionales: JSON.stringify(updatedConcepts)
          }
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
    } catch (err: any) {
      console.error(err);
      showNotification("Error al guardar concepto adicional.", "error");
      setCotejoLines(prev => prev.map(l => {
        if (l.id_expediente === line.id_expediente) {
          return {
            ...l,
            comision_cobrada: line.comision_cobrada,
            conceptos_adicionales: line.conceptos_adicionales
          };
        }
        return l;
      }));
    }
  };

  const handleCotejoSort = (field: string) => {
    if (cotejoSortField === field) {
      setCotejoSortOrder(cotejoSortOrder === "asc" ? "desc" : "asc");
    } else {
      setCotejoSortField(field);
      setCotejoSortOrder("asc");
    }
  };

  const [editingExp, setEditingExp] = useState<any | null>(null);
  const [editMatricula, setEditMatricula] = useState("");
  const [editVin, setEditVin] = useState("");
  const [editComisionCocheReal, setEditComisionCocheReal] = useState<string>("");
  const [editComisionFinanciacionReal, setEditComisionFinanciacionReal] = useState<string>("");
  const [editConceptosAdicionales, setEditConceptosAdicionales] = useState<any[]>([]);
  const [newConceptTitulo, setNewConceptTitulo] = useState("");
  const [newConceptValor, setNewConceptValor] = useState("");
  const [newConceptDescripcion, setNewConceptDescripcion] = useState("");

  const [editComisionCocheCobrada, setEditComisionCocheCobrada] = useState(false);
  const [editComisionUsadoCobrada, setEditComisionUsadoCobrada] = useState(false);
  const [editComisionFinanciacionCobrada, setEditComisionFinanciacionCobrada] = useState(false);
  const [editComisionPreferenceCobrada, setEditComisionPreferenceCobrada] = useState(false);
  const [editComisionBonusCobrada, setEditComisionBonusCobrada] = useState(false);

  const [liqVendedorFilter, setLiqVendedorFilter] = useState("");
  const [calculatingCotejo, setCalculatingCotejo] = useState(false);

  const { user } = useUser();
  const uniqueSellersLiq = planData?.liquidations?.[0]?.lines 
    ? Array.from(new Set(planData.liquidations[0].lines.map((l: any) => l.vendedor_nombre))).filter(Boolean) as string[]
    : [];

  const filteredLiqLines = planData?.liquidations?.[0]?.lines?.filter((line: any) => {
    if (liqVendedorFilter && line.vendedor_nombre !== liqVendedorFilter) return false;
    return true;
  }) || [];

  useEffect(() => {
    if (user?.fullName && uniqueSellersLiq.length > 0) {
      const userFullNameLower = user.fullName.toLowerCase();
      const match = uniqueSellersLiq.find(s => s.toLowerCase() === userFullNameLower);
      if (match) {
        setLiqVendedorFilter(match);
      } else {
        const partialMatch = uniqueSellersLiq.find(s => s.toLowerCase().includes(userFullNameLower) || userFullNameLower.includes(s.toLowerCase()));
        if (partialMatch) {
          setLiqVendedorFilter(partialMatch);
        }
      }
    }
  }, [user, uniqueSellersLiq.length]);

  const openEditModal = (line: any) => {
    setEditingExp(line);
    setEditMatricula(line.matricula || "");
    setEditVin(line.vin || "");
    setEditComisionCocheReal(line.comision_coche_real !== null && line.comision_coche_real !== undefined ? String(line.comision_coche_real) : "");
    setEditComisionFinanciacionReal(line.comision_financiacion_real !== null && line.comision_financiacion_real !== undefined ? String(line.comision_financiacion_real) : "");
    
    setEditComisionCocheCobrada(line.comision_coche_cobrada || false);
    setEditComisionUsadoCobrada(line.comision_usado_cobrada || false);
    setEditComisionFinanciacionCobrada(line.comision_financiacion_cobrada || false);
    setEditComisionPreferenceCobrada(line.comision_preference_cobrada || false);
    setEditComisionBonusCobrada(line.comision_bonus_cobrada || false);

    let concepts = [];
    if (line.conceptos_adicionales) {
      try {
        concepts = JSON.parse(line.conceptos_adicionales);
      } catch (err) {
        console.error("Error parsing conceptos_adicionales:", err);
      }
    }
    setEditConceptosAdicionales(concepts);
    
    setNewConceptTitulo("");
    setNewConceptValor("");
    setNewConceptDescripcion("");
  };

  const handleAddConcept = () => {
    if (!newConceptTitulo.trim()) {
      showNotification("El título del concepto es obligatorio.", "error");
      return;
    }
    const val = parseFloat(newConceptValor);
    if (isNaN(val)) {
      showNotification("El valor de la comisión debe ser un número válido.", "error");
      return;
    }
    const newConcept = {
      id: Math.random().toString(36).substr(2, 9),
      titulo: newConceptTitulo.trim(),
      valor: val,
      descripcion: newConceptDescripcion.trim()
    };
    setEditConceptosAdicionales(prev => [...prev, newConcept]);
    setNewConceptTitulo("");
    setNewConceptValor("");
    setNewConceptDescripcion("");
  };

  const handleRemoveConcept = (id: string) => {
    setEditConceptosAdicionales(prev => prev.filter(c => c.id !== id));
  };

  const handleToggleConceptCobradoInModal = (id: string) => {
    setEditConceptosAdicionales(prev => prev.map(c => {
      if (c.id === id) {
        return { ...c, cobrado: !c.cobrado };
      }
      return c;
    }));
  };

  const handleSaveExpedienteChanges = async () => {
    if (!editingExp) return;
    
    const cocheVal = editComisionCocheReal.trim() === "" ? null : parseFloat(editComisionCocheReal);
    const finanVal = editComisionFinanciacionReal.trim() === "" ? null : parseFloat(editComisionFinanciacionReal);
    
    if (cocheVal !== null && isNaN(cocheVal)) {
      showNotification("Comisión de coche no es un número válido.", "error");
      return;
    }
    if (finanVal !== null && isNaN(finanVal)) {
      showNotification("Comisión de financiación no es un número válido.", "error");
      return;
    }

    const allMainConceptsCobrado = editComisionCocheCobrada && 
                                   editComisionUsadoCobrada && 
                                   editComisionFinanciacionCobrada && 
                                   editComisionPreferenceCobrada && 
                                   editComisionBonusCobrada;
    const allExtraCobrado = editConceptosAdicionales.every((c: any) => c.cobrado);
    const finalCobrado = allMainConceptsCobrado && allExtraCobrado;

    const body = {
      id_expediente: editingExp.id_expediente,
      expediente: {
        matricula: editMatricula.trim(),
        vin: editVin.trim(),
        comision_coche_real: cocheVal,
        comision_financiacion_real: finanVal,
        conceptos_adicionales: JSON.stringify(editConceptosAdicionales),
        comision_coche_cobrada: editComisionCocheCobrada,
        comision_usado_cobrada: editComisionUsadoCobrada,
        comision_financiacion_cobrada: editComisionFinanciacionCobrada,
        comision_preference_cobrada: editComisionPreferenceCobrada,
        comision_bonus_cobrada: editComisionBonusCobrada,
        comision_cobrada: finalCobrado
      }
    };

    try {
      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Error al actualizar expediente");
      }
      
      // Actualizar listado local
      setCotejoLines(prev => prev.map(l => {
        if (l.id_expediente === editingExp.id_expediente) {
          return {
            ...l,
            matricula: editMatricula.trim(),
            vin: editVin.trim(),
            comision_coche_real: cocheVal,
            comision_financiacion_real: finanVal,
            conceptos_adicionales: JSON.stringify(editConceptosAdicionales),
            comision_coche_cobrada: editComisionCocheCobrada,
            comision_usado_cobrada: editComisionUsadoCobrada,
            comision_financiacion_cobrada: editComisionFinanciacionCobrada,
            comision_preference_cobrada: editComisionPreferenceCobrada,
            comision_bonus_cobrada: editComisionBonusCobrada,
            comision_cobrada: finalCobrado
          };
        }
        return l;
      }));
      
      setEditingExp(null);
      showNotification("Expediente actualizado con éxito.", "success");
    } catch (err: any) {
      console.error(err);
      showNotification(err.message || "Error al guardar los cambios del expediente.", "error");
    }
  };

  const handleLoadCotejoPlanes = async (planId: number) => {
    setLoadingPlan(true);
    try {
      const res = await fetch(`/api/comisiones/verificar?id_plan=${planId}`);
      const data = await res.json();
      if (!data.success) {
        showNotification(data.message || "Error al obtener las líneas del plan", "error");
        setCotejoLines([]);
        return;
      }
      setCotejoLines(data.lines || []);
      setCotejoPenalizacionImporte(data.penalizacion_importe || 0);
      setCotejoPenalizacionTitulo(data.penalizacion_titulo || "Penalización");
      showNotification("Expedientes del plan cargados con éxito.", "success");
    } catch (e: any) {
      console.error(e);
      showNotification("Error de conexión al cargar expedientes del plan.", "error");
      setCotejoLines([]);
    } finally {
      setLoadingPlan(false);
    }
  };

  const handleRecalculateCotejoPlan = async () => {
    if (!cotejoPlanId) return;
    setCalculatingCotejo(true);
    try {
      const res = await fetch("/api/comisiones/liquidar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_plan: cotejoPlanId })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Error al recalcular la liquidación");
      }
      showNotification("Liquidación recalculada con éxito.", "success");
      // Refrescar listado
      await handleLoadCotejoPlanes(cotejoPlanId);
    } catch (err: any) {
      console.error(err);
      showNotification(err.message || "Error al recalcular.", "error");
    } finally {
      setCalculatingCotejo(false);
    }
  };

  const handleToggleComisionCobrada = async (idExpediente: number, currentValue: boolean) => {
    // Optimistic update
    setCotejoLines(prev => prev.map(l => {
      if (l.id_expediente === idExpediente) {
        return { ...l, comision_cobrada: !currentValue };
      }
      return l;
    }));

    try {
      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_expediente: idExpediente,
          expediente: {
            comision_cobrada: !currentValue
          }
        })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Error al guardar el estado");
      }
      showNotification("Estado de cobro actualizado.", "success");
    } catch (e: any) {
      console.error(e);
      showNotification(e.message || "Error al actualizar estado en la base de datos.", "error");
      // Revert optimistic update
      setCotejoLines(prev => prev.map(l => {
        if (l.id_expediente === idExpediente) {
          return { ...l, comision_cobrada: currentValue };
        }
        return l;
      }));
    }
  };

  // Clipboard para copiar/pegar valores de tarifas
  const [rateClipboard, setRateClipboard] = useState<{
    rate_x_minus_4: number;
    rate_x_minus_3: number;
    rate_x_minus_2: number;
    rate_x_minus_1: number;
    rate_x: number;
    rate_x_plus_1: number;
    rate_x_plus_2: number;
    rate_x_plus_3: number;
    activo: boolean;
  } | null>(null);

  // Clipboard para copiar/pegar tarifas completas de un modelo (superior e inferior a la vez)
  const [modelClipboard, setModelClipboard] = useState<{
    rate_x_minus_4_less: number;
    rate_x_minus_3_less: number;
    rate_x_minus_2_less: number;
    rate_x_minus_1_less: number;
    rate_x_less: number;
    rate_x_plus_1_less: number;
    rate_x_plus_2_less: number;
    rate_x_plus_3_less: number;
    
    rate_x_minus_4_more: number;
    rate_x_minus_3_more: number;
    rate_x_minus_2_more: number;
    rate_x_minus_1_more: number;
    rate_x_more: number;
    rate_x_plus_1_more: number;
    rate_x_plus_2_more: number;
    rate_x_plus_3_more: number;
  } | null>(null);

  // Orden manual de modelos por marca (map brandId -> array de modelIds)
  const [modelOrder, setModelOrder] = useState<Record<number, number[]>>({});

  // Estados para actualización masiva de cupo
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkYear, setBulkYear] = useState(2026);
  const [bulkMonth, setBulkMonth] = useState(6);
  const [bulkDateType, setBulkDateType] = useState("fecha_expediente");
  const [bulkSaving, setBulkSaving] = useState(false);

  // Preference / BOX3
  const [preferenceRules, setPreferenceRules] = useState<any[]>([]);
  const [newPrefName, setNewPrefName] = useState("");
  const [newPrefMarca, setNewPrefMarca] = useState("");
  const [newPrefModelo, setNewPrefModelo] = useState("");
  const [newPrefFinType, setNewPrefFinType] = useState("");
  const [newPrefImporte, setNewPrefImporte] = useState("100");

  // Filtro tipo vehiculo para Bonus
  const [newBonusTypeVehiculo, setNewBonusTypeVehiculo] = useState("cualquiera");

  // Penalties rule creation states
  const [newPenaltyName, setNewPenaltyName] = useState("");
  const [newPenaltyDesc, setNewPenaltyDesc] = useState("");
  const [newPenaltyType, setNewPenaltyType] = useState("pedido");
  const [newPenaltyMarca, setNewPenaltyMarca] = useState("");
  const [newPenaltyModelo, setNewPenaltyModelo] = useState("");
  const [newPenaltyImporte, setNewPenaltyImporte] = useState("50");
  const [newPenaltyStart, setNewPenaltyStart] = useState("");
  const [newPenaltyEnd, setNewPenaltyEnd] = useState("");
  const [newPenaltyTypeVehiculo, setNewPenaltyTypeVehiculo] = useState("cualquiera");

  // Estados para editar Bonus
  const [editingBonusIdx, setEditingBonusIdx] = useState<number | null>(null);
  const [editingBonusName, setEditingBonusName] = useState("");
  const [editingBonusDesc, setEditingBonusDesc] = useState("");
  const [editingBonusType, setEditingBonusType] = useState("afectacion");
  const [editingBonusMarca, setEditingBonusMarca] = useState("");
  const [editingBonusModelo, setEditingBonusModelo] = useState("");
  const [editingBonusTypeVehiculo, setEditingBonusTypeVehiculo] = useState("cualquiera");
  const [editingBonusImporte, setEditingBonusImporte] = useState("150");
  const [editingBonusAfectaObj, setEditingBonusAfectaObj] = useState(false);
  const [editingBonusValObj, setEditingBonusValObj] = useState("0");
  const [editingBonusStart, setEditingBonusStart] = useState("");
  const [editingBonusEnd, setEditingBonusEnd] = useState("");

  // Liquidación
  const [calculating, setCalculating] = useState(false);
  const [selectedLineDetails, setSelectedLineDetails] = useState<any | null>(null);

  // Estados para Editar Expediente Individual en Modal
  const [showEditExpedienteModal, setShowEditExpedienteModal] = useState(false);
  const [editingExpedienteId, setEditingExpedienteId] = useState<number | null>(null);
  const [catalogs, setCatalogs] = useState<{
    marcas: { id: number; nombre: string }[];
    modelosPorMarca: Record<number, { id: number; nombre: string }[]>;
    tiposVenta: { id: number; nombre: string }[];
    vendedores: { id: number; nombre: string }[];
  } | null>(null);

  const [editMarca, setEditMarca] = useState<number | "">("");
  const [editModelo, setEditModelo] = useState<number | "">("");
  const [editTipoVenta, setEditTipoVenta] = useState<number | "">("");
  const [editVendedor, setEditVendedor] = useState<number | "">("");
  const [editFExp, setEditFExp] = useState("");
  const [editFAfect, setEditFAfect] = useState("");
  const [editFRci, setEditFRci] = useState("");
  const [editFMat, setEditFMat] = useState("");
  const [editFEntrega, setEditFEntrega] = useState("");
  const [editClienteNombre, setEditClienteNombre] = useState("");
  const [editCobradoOtraFecha, setEditCobradoOtraFecha] = useState<boolean>(false);
  const [editFechaCobrado, setEditFechaCobrado] = useState("");
  const [originalCliente, setOriginalCliente] = useState<any>(null);
  const [originalExpediente, setOriginalExpediente] = useState<any>(null);
  const [showConfirmUnsavedModal, setShowConfirmUnsavedModal] = useState(false);

  // Cargar lista de planes
  const refreshPlanes = async () => {
    try {
      const res = await fetch(`/api/comisiones/planes?t=${Date.now()}`);
      const result = await res.json();
      if (result.success) {
        setPlanes(result.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const showNotification = (text: string, type: "success" | "error") => {
    if (type === "success") {
      setSuccessMsg(text);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setErrorMsg(text);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  // Cargar detalles de un plan
  const loadPlanDetails = async (id: number, keepTab = false) => {
    setLoadingPlan(true);
    try {
      const res = await fetch(`/api/comisiones/planes?id=${id}&t=${Date.now()}`);
      const result = await res.json();
      if (result.success) {
        const plan = result.data;
        setPlanData(plan);
        setSelectedPlanId(id);
        
        // Cargar variables de estado
        setPlanName(plan.nombre);
        setPlanStart(plan.fecha_inicio);
        setPlanEnd(plan.fecha_fin);
        setPlanEstado(plan.estado);
        setObjetivoBase(plan.objetivo_base);
        setArrastre(plan.arrastre);
        setMinMatriculaciones(plan.min_matriculaciones);
        setMinCochesMultiplicador(plan.min_coches_multiplicador || 0);
        setPenalizacionImporte(plan.penalizacion_importe || 0);
        setPenalizacionTitulo(plan.penalizacion_titulo || "");
        setPenalizacionDescripcion(plan.penalizacion_descripcion || "");

        let parsedNotes = { notes: [], comisiones_pendientes: [] };
        if (plan.notas_adicionales) {
          try {
            parsedNotes = JSON.parse(plan.notas_adicionales);
          } catch (e) {
            console.error("Error parsing notas_adicionales:", e);
          }
        }
        setPlanNotes(parsedNotes.notes || []);
        setPlanPendingComs(parsedNotes.comisiones_pendientes || []);

        const planDate = plan.fecha_inicio ? new Date(plan.fecha_inicio) : new Date();
        setBulkYear(planDate.getFullYear());
        setBulkMonth(planDate.getMonth() + 1);

        // Proactive Healing: Asegurar que cada modelo de marca activa tenga exactamente 2 filas (tasa cumplida y no cumplida)
        const initialRates = plan.rates || [];
        const activeBrands = marcas.filter(m => !!m.sistema_comisiones);
        const activeBrandIds = activeBrands.map(b => b.id);
        const systemModels = modelos.filter(m => activeBrandIds.includes(m.marca_id));
        
        const normalizedRates = [...initialRates];
        systemModels.forEach(m => {
          // Buscar el "ultimo modelo subido" (el modelo de esta marca con ID más alto en initialRates)
          const brandModelsInRates = initialRates.filter((r: any) => {
            const modelObj = modelos.find(mod => mod.id === r.id_modelo);
            return modelObj?.marca_id === m.marca_id;
          });

          let lastBrandRateInferior: any = null;
          let lastBrandRateSuperior: any = null;
          if (brandModelsInRates.length > 0) {
            const maxModelId = Math.max(...brandModelsInRates.map((r: any) => r.id_modelo).filter(Boolean) as number[]);
            lastBrandRateInferior = brandModelsInRates.find((r: any) => r.id_modelo === maxModelId && !r.tasa_intervencion_cumplida);
            lastBrandRateSuperior = brandModelsInRates.find((r: any) => r.id_modelo === maxModelId && r.tasa_intervencion_cumplida);
          }

          const hasInferior = initialRates.some((r: any) => r.id_modelo === m.id && r.tasa_intervencion_cumplida === false);
          if (!hasInferior) {
            normalizedRates.push({
              id_plan: id,
              id_modelo: m.id,
              tasa_intervencion_cumplida: false,
              rate_x_minus_4: lastBrandRateInferior?.rate_x_minus_4 ?? 70,
              rate_x_minus_3: lastBrandRateInferior?.rate_x_minus_3 ?? 80,
              rate_x_minus_2: lastBrandRateInferior?.rate_x_minus_2 ?? 90,
              rate_x_minus_1: lastBrandRateInferior?.rate_x_minus_1 ?? 100,
              rate_x: lastBrandRateInferior?.rate_x ?? 120,
              rate_x_plus_1: lastBrandRateInferior?.rate_x_plus_1 ?? 140,
              rate_x_plus_2: lastBrandRateInferior?.rate_x_plus_2 ?? 160,
              rate_x_plus_3: lastBrandRateInferior?.rate_x_plus_3 ?? 180,
              valor_objetivo: 1,
              activo: true,
            });
          }
          
          const hasSuperior = initialRates.some((r: any) => r.id_modelo === m.id && r.tasa_intervencion_cumplida === true);
          if (!hasSuperior) {
            normalizedRates.push({
              id_plan: id,
              id_modelo: m.id,
              tasa_intervencion_cumplida: true,
              rate_x_minus_4: lastBrandRateSuperior?.rate_x_minus_4 ?? 90,
              rate_x_minus_3: lastBrandRateSuperior?.rate_x_minus_3 ?? 100,
              rate_x_minus_2: lastBrandRateSuperior?.rate_x_minus_2 ?? 110,
              rate_x_minus_1: lastBrandRateSuperior?.rate_x_minus_1 ?? 120,
              rate_x: lastBrandRateSuperior?.rate_x ?? 140,
              rate_x_plus_1: lastBrandRateSuperior?.rate_x_plus_1 ?? 160,
              rate_x_plus_2: lastBrandRateSuperior?.rate_x_plus_2 ?? 180,
              rate_x_plus_3: lastBrandRateSuperior?.rate_x_plus_3 ?? 200,
              valor_objetivo: 1,
              activo: true,
            });
          }
        });

        setRates(normalizedRates);
        setRules(plan.rules || []);
        setBonusRules(plan.bonusRules || []);
        setUsedRates(plan.usedRates || []);
        setFinanceRates(plan.financeRates || []);
        setPreferenceRules(plan.preferenceRules || []);
        setVoPatterns(plan.voPatterns || []);
        setBrandInterventionRates(plan.brandInterventionRates || []);
        
        if (plan.financeRules) {
          setFinanceNormal(plan.financeRules.importe_normal);
          setFinancePref(plan.financeRules.importe_preference);
        } else {
          setFinanceNormal(80);
          setFinancePref(120);
        }

        if (!keepTab) {
          setActiveTab("resumen");
        }
      } else {
        showNotification(result.message || "Error al cargar detalles del plan", "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("Error de conexión al cargar plan", "error");
    } finally {
      setLoadingPlan(false);
    }
  };

  const getBonusTooltip = (line: any) => {
    if (!line.items || line.items.length === 0) return "";
    
    const bonusItems = line.items.filter((item: any) => {
      const isBase = item.concepto.includes("Comisión Base");
      const isUsado = item.concepto.includes("Comisión Usado");
      const isFinance = item.concepto.includes("Incentivo Financiación");
      
      const isPrefRule = item.concepto.startsWith("Regla Preference/BOX3:") ||
        (item.concepto.startsWith("Regla Comisión:") && planData?.rules?.find((r: any) => r.nombre === item.concepto.replace("Regla Comisión: ", ""))?.tipo_evento === "preference");
        
      const isFinRule = (item.concepto.startsWith("Regla Comisión:") && 
        ["credito", "financiacion"].includes(planData?.rules?.find((r: any) => r.nombre === item.concepto.replace("Regla Comisión: ", ""))?.tipo_evento || ""));

      return !isBase && !isUsado && !isFinance && !isPrefRule && !isFinRule;
    });

    if (bonusItems.length === 0) return "No hay bonus aplicados";

    return bonusItems
      .map((item: any) => {
        const cleanName = item.concepto.replace(/^(Bonus Campaña:|Regla Comisión:)\s*/, "");
        const foundBonus = planData?.bonusRules?.find((b: any) => b.nombre === cleanName);
        const desc = foundBonus?.descripcion || "";
        return `${cleanName}: ${item.importe} €` + (desc ? `\n(${desc})` : "");
      })
      .join("\n\n");
  };

  const handleOpenEditExpediente = async (id: number) => {
    setLoadingPlan(true);
    try {
      if (!catalogs) {
        const catRes = await fetch("/api/admin/catalogos");
        const catResult = await catRes.json();
        if (catResult.success) {
          setCatalogs(catResult.data);
        }
      }

      const res = await fetch(`/api/expedientes?id=${id}`);
      const result = await res.json();
      if (result.success) {
        const exp = result.data;
        setEditingExpedienteId(id);
        
        setOriginalExpediente(exp);
        setOriginalCliente(exp.cliente || null);

        setEditMarca(exp.modelo?.marca_id || "");
        setEditModelo(exp.id_modelo || "");
        setEditTipoVenta(exp.id_tipo_de_venta || "");
        setEditVendedor(exp.id_usuario || "");
        setEditFExp(exp.fecha_expediente || "");
        setEditFAfect(exp.fecha_afectacion || "");
        setEditFRci(exp.fecha_rci || "");
        setEditFMat(exp.fecha_matriculacion || "");
        setEditFEntrega(exp.fecha_entrega || "");
        setEditClienteNombre(exp.cliente?.nombre || "");
        setEditCobradoOtraFecha(exp.cobrado_otra_fecha || false);
        setEditFechaCobrado(exp.fecha_cobrado || "");
        
        setShowEditExpedienteModal(true);
      } else {
        showNotification(result.message || "Error al cargar expediente.", "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("Error de conexión al cargar expediente.", "error");
    } finally {
      setLoadingPlan(false);
    }
  };

  const getHasUnsavedChanges = () => {
    if (!originalExpediente) return { clientChanged: false, expChanged: false };
    
    const clientChanged = editClienteNombre !== (originalCliente?.nombre || "");
    const expChanged = 
      editModelo !== (originalExpediente.id_modelo || "") ||
      editTipoVenta !== (originalExpediente.id_tipo_de_venta || "") ||
      editVendedor !== (originalExpediente.id_usuario || "") ||
      editFExp !== (originalExpediente.fecha_expediente || "") ||
      editFAfect !== (originalExpediente.fecha_afectacion || "") ||
      editFRci !== (originalExpediente.fecha_rci || "") ||
      editFMat !== (originalExpediente.fecha_matriculacion || "") ||
      editFEntrega !== (originalExpediente.fecha_entrega || "") ||
      editCobradoOtraFecha !== (originalExpediente.cobrado_otra_fecha || false) ||
      editFechaCobrado !== (originalExpediente.fecha_cobrado || "");
      
    return { clientChanged, expChanged };
  };

  const saveChanges = async (options: { saveClient: boolean; saveExp: boolean }) => {
    if (!editingExpedienteId) return;
    setSaving(true);
    try {
      if (options.saveClient && originalCliente) {
        const clientBody = {
          id: originalCliente.id,
          nombre: editClienteNombre,
          dni: originalCliente.dni,
          fecha_de_nacimiento: originalCliente.fecha_de_nacimiento,
          tienda_id: originalCliente.tienda_id,
          emails: originalCliente.emails?.map((e: any) => ({ email: e.email || e.email_cliente, tipo: e.tipo_email || e.tipo || "Principal" })) || [],
          telefonos: originalCliente.telefonos?.map((t: any) => ({ telefono: t.telefono || t.telefono_cliente, tipo: t.tipo_telefono || t.tipo || "Principal" })) || []
        };
        const clientRes = await fetch("/api/clientes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clientBody)
        });
        if (!clientRes.ok) {
          const errData = await clientRes.json();
          throw new Error(errData.message || "Error al actualizar el cliente.");
        }
      }

      if (options.saveExp) {
        const res = await fetch("/api/expedientes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id_expediente: editingExpedienteId,
            expediente: {
              id_modelo: editModelo !== "" ? Number(editModelo) : null,
              id_tipo_de_venta: editTipoVenta !== "" ? Number(editTipoVenta) : null,
              id_usuario: isAdmin && editVendedor !== "" ? Number(editVendedor) : undefined,
              fecha_expediente: editFExp || null,
              fecha_afectacion: editFAfect || null,
              fecha_rci: editFRci || null,
              fecha_matriculacion: editFMat || null,
              fecha_entrega: editFEntrega || null,
              cobrado_otra_fecha: editCobradoOtraFecha,
              fecha_cobrado: editCobradoOtraFecha ? (editFechaCobrado || null) : null,
            }
          })
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || "Error al guardar el expediente.");
        }
      }

      showNotification("Cambios guardados correctamente.", "success");
      setShowEditExpedienteModal(false);
      setShowConfirmUnsavedModal(false);
      setEditingExpedienteId(null);
      if (selectedPlanId) {
        loadPlanDetails(selectedPlanId, true);
      }
    } catch (err: any) {
      console.error(err);
      showNotification(err.message || "Error al guardar cambios.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEditExpediente = async () => {
    await saveChanges({ saveClient: true, saveExp: true });
  };

  const handleCancelOrClose = () => {
    const { clientChanged, expChanged } = getHasUnsavedChanges();
    if (clientChanged || expChanged) {
      setShowConfirmUnsavedModal(true);
    } else {
      setShowEditExpedienteModal(false);
      setEditingExpedienteId(null);
    }
  };

  // Guardar Plan
  const handleSavePlan = async (overrideBonusRules?: any[] | React.MouseEvent) => {
    if (!selectedPlanId) return;
    setSaving(true);
    const finalBonusRules = Array.isArray(overrideBonusRules) ? overrideBonusRules : bonusRules;
    try {
      const res = await fetch("/api/comisiones/planes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_plan: selectedPlanId,
          nombre: planName,
          fecha_inicio: planStart,
          fecha_fin: planEnd,
          estado: planEstado,
          objetivo_base: objetivoBase,
          arrastre: arrastre,
          min_matriculaciones: minMatriculaciones,
          min_coches_multiplicador: minCochesMultiplicador,
          penalizacion_importe: penalizacionImporte,
          penalizacion_titulo: penalizacionTitulo,
          penalizacion_descripcion: penalizacionDescripcion,
          notas_adicionales: JSON.stringify({ notes: planNotes, comisiones_pendientes: planPendingComs }),
          rates,
          financeRules: {
            importe_normal: financeNormal,
            importe_preference: financePref
          },
          rules,
          bonusRules: finalBonusRules,
          usedRates,
          financeRates,
          preferenceRules,
          voPatterns,
          brandInterventionRates
        })
      });

      const result = await res.json();
      if (result.success) {
        showNotification("Plan guardado con éxito", "success");
        loadPlanDetails(selectedPlanId, true);
        refreshPlanes();
      } else {
        showNotification(result.message || "Error al guardar el plan", "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("Error de conexión al guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  // Actualización masiva de cupo
  const handleExecuteBulkUpdate = async () => {
    if (minCochesMultiplicador === undefined || minCochesMultiplicador === null) {
      showNotification("Por favor define primero un valor para el cupo", "error");
      return;
    }
    setBulkSaving(true);
    try {
      const res = await fetch("/api/expedientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isBulk: true,
          mes: bulkMonth,
          año: bulkYear,
          tipoFecha: bulkDateType,
          min_coches_multiplicador: minCochesMultiplicador
        })
      });
      const result = await res.json();
      if (result.success) {
        showNotification("Cupo aplicado a los expedientes en lote correctamente", "success");
        setBulkModalOpen(false);
      } else {
        showNotification(result.message || "Error al aplicar el cupo en lote", "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("Error de conexión al aplicar el cupo en lote", "error");
    } finally {
      setBulkSaving(false);
    }
  };

  const updateModalDate = (targetDate: Date) => {
    setModalRefDate(targetDate);
    const meses = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    const mesNombre = meses[targetDate.getMonth()];
    const anio = targetDate.getFullYear();
    
    const primerDia = `${anio}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-01`;
    const ultimoDiaDate = new Date(anio, targetDate.getMonth() + 1, 0);
    const ultimoDia = `${anio}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(ultimoDiaDate.getDate()).padStart(2, '0')}`;
    
    setNewPlanName(`${mesNombre} ${anio}`);
    setNewPlanStart(primerDia);
    setNewPlanEnd(ultimoDia);
  };

  const getUniquePlanName = (baseName: string) => {
    let counter = 1;
    let currentName = `${baseName} (${counter})`;
    while (planes.some((p: any) => p.nombre.toLowerCase().trim() === currentName.toLowerCase().trim())) {
      counter++;
      currentName = `${baseName} (${counter})`;
    }
    return currentName;
  };

  const executePlanCreation = async (planNameValue: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/comisiones/planes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: planNameValue,
          fecha_inicio: newPlanStart,
          fecha_fin: newPlanEnd,
          objetivo_base: Number(newPlanBase),
          arrastre: Number(newPlanArrastre),
          min_matriculaciones: Number(newPlanMinMat),
          cloneFromId: cloneFromId || null
        })
      });

      const result = await res.json();
      if (result.success) {
        showNotification(cloneFromId ? "Plan clonado correctamente" : "Plan creado correctamente", "success");
        setShowCreateModal(false);
        // Limpiar formulario
        setNewPlanName("");
        setNewPlanStart("");
        setNewPlanEnd("");
        setNewPlanBase("12");
        setNewPlanArrastre("0");
        setNewPlanMinMat("6");
        setCloneFromId("");

        refreshPlanes();
        if (result.data?.id_plan) {
          loadPlanDetails(result.data.id_plan);
        }
      } else {
        showNotification(result.message || "Error al procesar el plan", "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("Error de conexión al crear plan", "error");
    } finally {
      setSaving(false);
    }
  };

  // Crear o Clonar Plan
  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanName || !newPlanStart || !newPlanEnd) {
      showNotification("Por favor, rellene el nombre y las fechas.", "error");
      return;
    }

    const nameExists = planes.some((p: any) => p.nombre.toLowerCase().trim() === newPlanName.toLowerCase().trim());
    if (nameExists) {
      setShowDuplicateConfirmModal(true);
      return;
    }

    await executePlanCreation(newPlanName);
  };

  // Eliminar Plan
  const handleDeletePlan = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar permanentemente este plan de comisionamiento?")) return;
    try {
      const res = await fetch(`/api/comisiones/planes?id=${id}`, {
        method: "DELETE"
      });
      const result = await res.json();
      if (result.success) {
        showNotification("Plan eliminado correctamente", "success");
        refreshPlanes();
        if (selectedPlanId === id) {
          setSelectedPlanId(null);
          setPlanData(null);
        }
      } else {
        showNotification(result.message || "Error al eliminar plan", "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("Error de conexión al eliminar", "error");
    }
  };

  // Calcular Liquidación
  const handleCalculateLiquidation = async () => {
    if (!selectedPlanId) return;
    setCalculating(true);
    try {
      const res = await fetch("/api/comisiones/liquidar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_plan: selectedPlanId })
      });
      const result = await res.json();
      if (result.success) {
        showNotification("Liquidación calculada y guardada correctamente", "success");
        loadPlanDetails(selectedPlanId, true);
      } else {
        showNotification(result.message || "Error al calcular la liquidación", "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("Error de conexión al calcular liquidación", "error");
    } finally {
      setCalculating(false);
    }
  };

  // Cerrar Plan / Liquidación
  const handleCloseLiquidation = async () => {
    if (!selectedPlanId || !planData?.liquidations?.[0]) return;
    if (!confirm("¿Estás seguro de cerrar definitivamente este plan y su liquidación? No se podrán recalcular ni modificar los valores una vez cerrado.")) return;

    setSaving(true);
    try {
      const res = await fetch("/api/comisiones/liquidar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_plan: selectedPlanId,
          estado_plan: "cerrado",
          id_liquidation: planData.liquidations[0].id_liquidation,
          estado_liquidation: "cerrada"
        })
      });

      const result = await res.json();
      if (result.success) {
        showNotification("Liquidación cerrada de forma inmutable", "success");
        loadPlanDetails(selectedPlanId, true);
        refreshPlanes();
      } else {
        showNotification(result.message || "Error al cerrar liquidación", "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("Error de conexión al cerrar", "error");
    } finally {
      setSaving(false);
    }
  };

  // --- CRUD local de reglas ---
  const handleAddRule = () => {
    if (!newRuleName.trim()) {
      showNotification("Por favor, introduce un nombre para la regla", "error");
      return;
    }
    const newRule = {
      nombre: newRuleName,
      tipo_evento: newRuleType,
      id_marca: newRuleMarca ? Number(newRuleMarca) : null,
      id_modelo: newRuleModelo ? Number(newRuleModelo) : null,
      afecta_objetivo: newRuleAfectaObj,
      valor_objetivo: Number(newRuleValObj || 0),
      afecta_comision: newRuleAfectaCom,
      importe: Number(newRuleImporte || 0),
      activa: true,
      tasa_intervencion_cumplida: newRuleTasaIntervencion === "" ? null : (newRuleTasaIntervencion === "true"),
      ligar_a_credito: newRuleType === "preference" ? newRuleLigarACredito : false
    };
    setRules([...rules, newRule]);
    // Resetear formulario
    setNewRuleName("");
    setNewRuleType("pedido");
    setNewRuleMarca("");
    setNewRuleModelo("");
    setNewRuleAfectaObj(false);
    setNewRuleValObj("1");
    setNewRuleAfectaCom(true);
    setNewRuleImporte("100");
    setNewRuleTasaIntervencion("");
    setNewRuleLigarACredito(false);
  };

  const handleDeleteRule = (idx: number) => {
    setRules(rules.filter((_, i) => i !== idx));
    if (editingRuleIdx === idx) {
      setEditingRuleIdx(null);
    }
  };

  const handleStartEditRule = (idx: number) => {
    const r = rules[idx];
    setEditingRuleIdx(idx);
    setEditingRuleName(r.nombre);
    setEditingRuleType(r.tipo_evento);
    setEditingRuleMarca(r.id_marca ? String(r.id_marca) : "");
    setEditingRuleModelo(r.id_modelo ? String(r.id_modelo) : "");
    setEditingRuleAfectaObj(r.afecta_objetivo);
    setEditingRuleValObj(String(r.valor_objetivo || 1));
    setEditingRuleAfectaCom(r.afecta_comision);
    setEditingRuleImporte(String(r.importe || 0));
    setEditingRuleTasaIntervencion(r.tasa_intervencion_cumplida === null ? "" : String(r.tasa_intervencion_cumplida));
    setEditingRuleLigarACredito(!!r.ligar_a_credito);
  };

  const handleSaveRuleEdit = (idx: number) => {
    if (!editingRuleName.trim()) {
      showNotification("Por favor, introduce un nombre para la regla", "error");
      return;
    }
    const updatedRules = [...rules];
    updatedRules[idx] = {
      ...updatedRules[idx],
      nombre: editingRuleName,
      tipo_evento: editingRuleType,
      id_marca: editingRuleMarca ? Number(editingRuleMarca) : null,
      id_modelo: editingRuleModelo ? Number(editingRuleModelo) : null,
      afecta_objetivo: editingRuleAfectaObj,
      valor_objetivo: editingRuleAfectaObj ? Number(editingRuleValObj || 0) : 0,
      afecta_comision: editingRuleAfectaCom,
      importe: editingRuleAfectaCom ? Number(editingRuleImporte || 0) : 0,
      tasa_intervencion_cumplida: editingRuleTasaIntervencion === "" ? null : (editingRuleTasaIntervencion === "true"),
      ligar_a_credito: editingRuleType === "preference" ? editingRuleLigarACredito : false
    };
    setRules(updatedRules);
    setEditingRuleIdx(null);
  };

  const handleCancelRuleEdit = () => {
    setEditingRuleIdx(null);
  };

  // --- CRUD local de bonus ---
  const handleAddBonus = () => {
    if (!newBonusName.trim()) {
      showNotification("Por favor, introduce un nombre para el Bonus", "error");
      return;
    }
    const newBonus = {
      nombre: newBonusName,
      descripcion: newBonusDesc || null,
      tipo_evento: newBonusType,
      id_marca: newBonusMarca ? Number(newBonusMarca) : null,
      id_modelo: newBonusModelo ? Number(newBonusModelo) : null,
      importe: Number(newBonusImporte || 0),
      afecta_objetivo: newBonusAfectaObj,
      valor_objetivo: Number(newBonusValObj || 0),
      fecha_inicio: newBonusStart || null,
      fecha_fin: newBonusEnd || null,
      activo: true,
      tipo_vehiculo: newBonusTypeVehiculo
    };
    setBonusRules([...bonusRules, newBonus]);
    // Resetear
    setNewBonusName("");
    setNewBonusDesc("");
    setNewBonusType("pedido");
    setNewBonusMarca("");
    setNewBonusModelo("");
    setNewBonusImporte("150");
    setNewBonusAfectaObj(false);
    setNewBonusValObj("0");
    setNewBonusStart("");
    setNewBonusEnd("");
  };

  const handleAddPenalty = () => {
    if (!newPenaltyName.trim()) {
      showNotification("Por favor, introduce un nombre para la Penalización", "error");
      return;
    }
    const newPenalty = {
      nombre: newPenaltyName,
      descripcion: newPenaltyDesc || null,
      tipo_evento: newPenaltyType,
      id_marca: newPenaltyMarca ? Number(newPenaltyMarca) : null,
      id_modelo: newPenaltyModelo ? Number(newPenaltyModelo) : null,
      importe: -Math.abs(Number(newPenaltyImporte || 0)),
      afecta_objetivo: false,
      valor_objetivo: 0,
      fecha_inicio: newPenaltyStart || null,
      fecha_fin: newPenaltyEnd || null,
      activo: true,
      tipo_vehiculo: newPenaltyTypeVehiculo,
      es_penalizacion: true
    };
    setBonusRules([...bonusRules, newPenalty]);
    setNewPenaltyName("");
    setNewPenaltyDesc("");
    setNewPenaltyType("pedido");
    setNewPenaltyMarca("");
    setNewPenaltyModelo("");
    setNewPenaltyImporte("50");
    setNewPenaltyStart("");
    setNewPenaltyEnd("");
    setNewPenaltyTypeVehiculo("cualquiera");
  };

  const handleDeleteBonus = (idx: number) => {
    setBonusRules(bonusRules.filter((_, i) => i !== idx));
  };

  const handleStartEditBonus = (idx: number, b: any) => {
    setEditingBonusIdx(idx);
    setEditingBonusName(b.nombre || "");
    setEditingBonusDesc(b.descripcion || "");
    setEditingBonusType(b.tipo_evento || "pedido");
    setEditingBonusMarca(b.id_marca ? String(b.id_marca) : "");
    setEditingBonusModelo(b.id_modelo ? String(b.id_modelo) : "");
    setEditingBonusTypeVehiculo(b.tipo_vehiculo || "cualquiera");
    setEditingBonusImporte(String(b.importe || 0));
    setEditingBonusAfectaObj(!!b.afecta_objetivo);
    setEditingBonusValObj(String(b.valor_objetivo || 0));
    setEditingBonusStart(b.fecha_inicio || "");
    setEditingBonusEnd(b.fecha_fin || "");
  };

  const handleSaveBonusEdit = (idx: number) => {
    if (!editingBonusName.trim()) {
      showNotification("Por favor, introduce un nombre para el Bonus", "error");
      return;
    }
    const updated = [...bonusRules];
    updated[idx] = {
      ...updated[idx],
      nombre: editingBonusName,
      descripcion: editingBonusDesc || null,
      tipo_evento: editingBonusType,
      id_marca: editingBonusMarca ? Number(editingBonusMarca) : null,
      id_modelo: editingBonusModelo ? Number(editingBonusModelo) : null,
      tipo_vehiculo: editingBonusTypeVehiculo,
      importe: Number(editingBonusImporte || 0),
      afecta_objetivo: editingBonusAfectaObj,
      valor_objetivo: Number(editingBonusValObj || 0),
      fecha_inicio: editingBonusStart || null,
      fecha_fin: editingBonusEnd || null,
    };
    setBonusRules(updated);
    setEditingBonusIdx(null);
    handleSavePlan(updated);
  };

  // --- CRUD local de preference rules ---
  const handleAddPrefRule = () => {
    if (!newPrefName.trim()) {
      showNotification("Por favor, introduce un nombre para la regla Preference", "error");
      return;
    }
    const newRule = {
      nombre: newPrefName,
      id_marca: newPrefMarca ? Number(newPrefMarca) : null,
      id_modelo: newPrefModelo ? Number(newPrefModelo) : null,
      tipo_financiacion: newPrefFinType || null,
      importe: Number(newPrefImporte || 0),
      activa: true
    };
    setPreferenceRules([...preferenceRules, newRule]);
    setNewPrefName("");
    setNewPrefMarca("");
    setNewPrefModelo("");
    setNewPrefFinType("");
    setNewPrefImporte("100");
  };

  const handleDeletePrefRule = (idx: number) => {
    setPreferenceRules(preferenceRules.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ position: "relative" }}>
      {/* NOTIFICACIONES FLOTANTES */}
      {successMsg && (
        <div style={{
          position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", color: "#ffffff", borderLeft: "4px solid var(--success)",
          background: "rgba(16, 185, 129, 0.95)", backdropFilter: "blur(8px)",
          minWidth: "300px", textAlign: "center", zIndex: 1000, borderRadius: "4px",
          boxShadow: "var(--shadow-md)"
        }}>
          ✓ {successMsg}
        </div>
      )}

      {errorMsg && (
        <div style={{
          position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", color: "#ffffff", borderLeft: "4px solid var(--danger)",
          background: "rgba(239, 68, 68, 0.95)", backdropFilter: "blur(8px)",
          minWidth: "300px", textAlign: "center", zIndex: 1000, borderRadius: "4px",
          boxShadow: "var(--shadow-md)"
        }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* VISTA 1: LISTADO DE PLANES */}
      {!selectedPlanId && (
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h1 style={{ fontSize: "1.85rem", marginBottom: "8px" }}>Planes de Comisionamiento</h1>
              <p style={{ color: "var(--text-secondary)" }}>
                Configura periodos mensuales, tamos de objetivos y calcula las liquidaciones de los vendedores.
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  setCloneFromId("");
                  setModalRefDate(new Date());
                  
                  const meses = [
                    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
                  ];
                  const hoy = new Date();
                  const mesNombre = meses[hoy.getMonth()];
                  const anio = hoy.getFullYear();
                  
                  const primerDia = `${anio}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
                  const ultimoDiaDate = new Date(anio, hoy.getMonth() + 1, 0);
                  const ultimoDia = `${anio}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(ultimoDiaDate.getDate()).padStart(2, '0')}`;
                  
                  setNewPlanName(`${mesNombre} ${anio}`);
                  setNewPlanStart(primerDia);
                  setNewPlanEnd(ultimoDia);
                  setShowCreateModal(true);
                }}
                className="btn btn-primary"
              >
                ➕ Crear Nuevo Plan
              </button>
            )}
          </div>

          <div className="glass-panel" style={{ padding: "8px" }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-light)",
              marginBottom: "8px"
            }}>
              <input
                type="text"
                className="form-input"
                placeholder="Buscar plan por nombre o fecha..."
                value={planSearchQuery}
                onChange={e => {
                  setPlanSearchQuery(e.target.value);
                  setPlanCurrentPage(1);
                }}
                style={{ maxWidth: "350px" }}
              />
            </div>

            <div className="table-container">
              <table className="table-premium">
                <thead>
                  <tr>
                    <th style={{ cursor: "pointer" }} onClick={() => handlePlanSort("nombre")}>
                      Nombre del Plan{renderPlanSortIndicator("nombre")}
                    </th>
                    <th style={{ cursor: "pointer" }} onClick={() => handlePlanSort("fecha_inicio")}>
                      Inicio{renderPlanSortIndicator("fecha_inicio")}
                    </th>
                    <th style={{ cursor: "pointer" }} onClick={() => handlePlanSort("fecha_fin")}>
                      Fin{renderPlanSortIndicator("fecha_fin")}
                    </th>
                    <th style={{ cursor: "pointer", textAlign: "center" }} onClick={() => handlePlanSort("objetivo")}>
                      Objetivo (X){renderPlanSortIndicator("objetivo")}
                    </th>
                    <th style={{ cursor: "pointer", textAlign: "center" }} onClick={() => handlePlanSort("min_matriculaciones")}>
                      Mínimo Mat.{renderPlanSortIndicator("min_matriculaciones")}
                    </th>
                    <th style={{ cursor: "pointer", textAlign: "center" }} onClick={() => handlePlanSort("liquidacion")}>
                      Liquidación{renderPlanSortIndicator("liquidacion")}
                    </th>
                    <th style={{ textAlign: "center" }}>
                      Comisiones Pendientes
                    </th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPlanes.map((p) => {
                    const liq = p.liquidations?.[0];
                    const finalTotal = liq ? Math.max(0, liq.total_comision_economica - Math.abs(liq.penalizacion_importe_snapshot || 0)) : 0;
                    
                    let pendingComsTotal = 0;
                    if (p.notas_adicionales) {
                      try {
                        const parsed = JSON.parse(p.notas_adicionales);
                        if (parsed.comisiones_pendientes && Array.isArray(parsed.comisiones_pendientes)) {
                          pendingComsTotal = parsed.comisiones_pendientes.reduce((acc: number, item: any) => acc + (item.valor || 0), 0);
                        }
                      } catch (e) {
                        console.error("Error parsing notas_adicionales on list:", e);
                      }
                    }

                    return (
                      <tr key={p.id_plan}>
                        <td style={{ fontWeight: "bold", color: "var(--text-primary)" }}>{p.nombre}</td>
                        <td>{formatDate(p.fecha_inicio)}</td>
                        <td>{formatDate(p.fecha_fin)}</td>
                        <td style={{ textAlign: "center", fontWeight: 600 }}>{p.objetivo_base + p.arrastre} (base: {p.objetivo_base})</td>
                        <td style={{ textAlign: "center" }}>{p.min_matriculaciones} uds</td>
                        <td style={{ textAlign: "center" }}>
                          {liq ? (
                            <span className="badge badge-tienda" style={{ fontSize: "0.75rem", backgroundColor: liq.estado === "cerrada" ? "var(--success)" : undefined }}>
                              {liq.estado === "cerrada" ? "🔒 Cerrada" : "✓ Calculada"} ({finalTotal.toLocaleString()} €)
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No calculada</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {pendingComsTotal !== 0 ? (
                            <span style={{ 
                              fontWeight: "bold", 
                              color: pendingComsTotal >= 0 ? "var(--success)" : "var(--danger)" 
                            }}>
                              {pendingComsTotal >= 0 ? "+" : ""}{pendingComsTotal.toLocaleString()} €
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>-</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              onClick={() => loadPlanDetails(p.id_plan)}
                              className="btn btn-secondary"
                              style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                            >
                              📂 Abrir
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setCloneFromId(String(p.id_plan));
                                  setModalRefDate(new Date());
                                  
                                  const meses = [
                                    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                                    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
                                  ];
                                  const hoy = new Date();
                                  const mesNombre = meses[hoy.getMonth()];
                                  const anio = hoy.getFullYear();
                                  const primerDia = `${anio}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
                                  const ultimoDiaDate = new Date(anio, hoy.getMonth() + 1, 0);
                                  const ultimoDia = `${anio}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(ultimoDiaDate.getDate()).padStart(2, '0')}`;
                                  
                                  setNewPlanName(`${mesNombre} ${anio}`);
                                  setNewPlanStart(primerDia);
                                  setNewPlanEnd(ultimoDia);
                                  setShowCreateModal(true);
                                }}
                                className="btn btn-secondary"
                                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                              >
                                📋 Clonar
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => handleDeletePlan(p.id_plan)}
                                className="btn"
                                style={{
                                  padding: "6px 12px", fontSize: "0.8rem", color: "var(--danger)",
                                  background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)",
                                  borderRadius: "var(--radius-sm)", cursor: "pointer"
                                }}
                              >
                                🗑️ Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {planes.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px" }}>
                        No hay planes de comisionamiento configurados. Haz clic en &quot;Crear Nuevo Plan&quot; para iniciar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Barra de Paginación */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
              padding: "10px 16px",
              background: "rgba(255, 255, 255, 0.02)",
              borderTop: "1px solid var(--border-light)",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              marginTop: "8px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Mostrar:</span>
                {[5, 10, 20, 50].map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handlePlanPageSizeChange(size)}
                    style={{
                      padding: "3px 10px",
                      fontSize: "0.8rem",
                      border: `1px solid ${planPageSize === size ? "var(--primary)" : "var(--border-light)"}`,
                      borderRadius: "4px",
                      background: planPageSize === size ? "rgba(var(--primary-rgb), 0.12)" : "transparent",
                      color: planPageSize === size ? "var(--primary)" : "var(--text-secondary)",
                      cursor: "pointer",
                      fontWeight: planPageSize === size ? 700 : 400
                    }}
                  >{size}</button>
                ))}
                <span style={{ marginLeft: "8px" }}>
                  {totalFilteredPlanes} resultado(s)
                  {totalFilteredPlanes !== planes.length ? ` (de ${planes.length} totales)` : ""}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <button type="button" onClick={() => goToPlanPage(1)} disabled={safePlanPage === 1}
                  style={{ padding: "4px 8px", border: "1px solid var(--border-light)", borderRadius: "4px", background: "transparent", color: safePlanPage === 1 ? "var(--text-muted)" : "var(--text-primary)", cursor: safePlanPage === 1 ? "default" : "pointer", fontSize: "0.8rem" }}
                  title="Primera página"
                >«</button>
                <button type="button" onClick={() => goToPlanPage(safePlanPage - 1)} disabled={safePlanPage === 1}
                  style={{ padding: "4px 8px", border: "1px solid var(--border-light)", borderRadius: "4px", background: "transparent", color: safePlanPage === 1 ? "var(--text-muted)" : "var(--text-primary)", cursor: safePlanPage === 1 ? "default" : "pointer", fontSize: "0.8rem" }}
                  title="Página anterior"
                >‹</button>
                <span style={{ padding: "4px 12px", fontWeight: 600, color: "var(--text-primary)" }}>
                  Pág. {safePlanPage} / {totalPlanPages}
                </span>
                <button type="button" onClick={() => goToPlanPage(safePlanPage + 1)} disabled={safePlanPage === totalPlanPages}
                  style={{ padding: "4px 8px", border: "1px solid var(--border-light)", borderRadius: "4px", background: "transparent", color: safePlanPage === totalPlanPages ? "var(--text-muted)" : "var(--text-primary)", cursor: safePlanPage === totalPlanPages ? "default" : "pointer", fontSize: "0.8rem" }}
                  title="Página siguiente"
                >›</button>
                <button type="button" onClick={() => goToPlanPage(totalPlanPages)} disabled={safePlanPage === totalPlanPages}
                  style={{ padding: "4px 8px", border: "1px solid var(--border-light)", borderRadius: "4px", background: "transparent", color: safePlanPage === totalPlanPages ? "var(--text-muted)" : "var(--text-primary)", cursor: safePlanPage === totalPlanPages ? "default" : "pointer", fontSize: "0.8rem" }}
                  title="Última página"
                >»</button>
              </div>
            </div>
          </div>

          {/* SECCIÓN NUEVA: VERIFICACIÓN Y COTEJO DE COMISIONES */}
          <div className="glass-panel" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
            <div>
              <h2 style={{ fontSize: "1.25rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "10px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                🔍 Control y Verificación de Cobros de Comisiones
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "6px" }}>
                Visualiza los expedientes que corresponden al plan mensual seleccionado y márcalos como cobrados a medida que verifiques tus comisiones.
              </p>
            </div>

            <div style={{ display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="form-group" style={{ marginBottom: 0, minWidth: "280px" }}>
                <label className="form-label">Seleccionar Plan de Comisión (Periodo)</label>
                <select 
                  className="form-select" 
                  value={cotejoPlanId || ""} 
                  onChange={e => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setCotejoPlanId(val);
                    if (val) {
                      handleLoadCotejoPlanes(val);
                    } else {
                      setCotejoLines([]);
                    }
                  }}
                >
                  <option value="">Selecciona un plan...</option>
                  {planes.map(p => (
                    <option key={p.id_plan} value={p.id_plan}>
                      {p.nombre} ({formatDate(p.fecha_inicio)} a {formatDate(p.fecha_fin)})
                    </option>
                  ))}
                </select>
              </div>

              {cotejoPlanId && (
                <button
                  type="button"
                  onClick={handleRecalculateCotejoPlan}
                  disabled={calculatingCotejo}
                  className="btn btn-secondary"
                  style={{
                    padding: "10px 18px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "0.85rem",
                    height: "42px",
                    marginBottom: 0
                  }}
                >
                  🔄 {calculatingCotejo ? "Recalculando..." : "Recalcular Liquidación"}
                </button>
              )}

              {cotejoPlanId && (
                <>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: "200px" }}>
                    <label className="form-label">Filtrar por Estado</label>
                    <select 
                      className="form-select" 
                      value={cotejoFilter} 
                      onChange={e => setCotejoFilter(e.target.value as any)}
                    >
                      <option value="todos">Todos los expedientes</option>
                      <option value="pendientes">🕒 Solo Pendientes</option>
                      <option value="cobrados">💰 Solo Cobrados</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0, minWidth: "200px" }}>
                    <label className="form-label">Filtrar por Vendedor</label>
                    <select 
                      className="form-select" 
                      value={cotejoVendedorFilter} 
                      onChange={e => setCotejoVendedorFilter(e.target.value)}
                    >
                      <option value="">Todos los vendedores</option>
                      {Array.from(new Set(cotejoLines.map(l => l.vendedor_nombre).filter(Boolean))).map((v: any) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: "200px" }}>
                    <label className="form-label">Buscar Expediente</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Buscar por matrícula, cliente o vendedor..." 
                      value={cotejoSearch}
                      onChange={e => setCotejoSearch(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            {cotejoPlanId && cotejoLines.length > 0 && (() => {
              // Filtrar y buscar
              const searchLower = cotejoSearch.toLowerCase().trim();
              const filteredLines = cotejoLines.filter(l => {
                // Filtro por estado
                if (cotejoFilter === "pendientes" && l.comision_cobrada) return false;
                if (cotejoFilter === "cobrados" && !l.comision_cobrada) return false;

                // Filtro por vendedor
                if (cotejoVendedorFilter && l.vendedor_nombre !== cotejoVendedorFilter) return false;

                // Búsqueda
                if (!searchLower) return true;
                return (
                  (l.matricula && l.matricula.toLowerCase().includes(searchLower)) ||
                  (l.cliente_nombre && l.cliente_nombre.toLowerCase().includes(searchLower)) ||
                  (l.vendedor_nombre && l.vendedor_nombre.toLowerCase().includes(searchLower)) ||
                  (l.modelo_nombre && l.modelo_nombre.toLowerCase().includes(searchLower))
                );
              });

              // Ordenar
              const sortedLines = [...filteredLines].sort((a: any, b: any) => {
                let aVal: any = "";
                let bVal: any = "";

                if (cotejoSortField === "matricula") {
                  aVal = a.matricula || "";
                  bVal = b.matricula || "";
                } else if (cotejoSortField === "cliente") {
                  aVal = a.cliente_nombre || "";
                  bVal = b.cliente_nombre || "";
                } else if (cotejoSortField === "vehiculo") {
                  aVal = a.modelo_nombre || "";
                  bVal = b.modelo_nombre || "";
                } else if (cotejoSortField === "pago") {
                  aVal = a.tipo_venta_nombre || "";
                  bVal = b.tipo_venta_nombre || "";
                } else if (cotejoSortField === "vn_base") {
                  aVal = a.comision_coche_real !== null && a.comision_coche_real !== undefined ? Number(a.comision_coche_real) : (a.comision_base_vn || 0);
                  bVal = b.comision_coche_real !== null && b.comision_coche_real !== undefined ? Number(b.comision_coche_real) : (b.comision_base_vn || 0);
                } else if (cotejoSortField === "usado") {
                  aVal = a.comision_usado || 0;
                  bVal = b.comision_usado || 0;
                } else if (cotejoSortField === "finan") {
                  aVal = a.comision_financiacion_real !== null && a.comision_financiacion_real !== undefined ? Number(a.comision_financiacion_real) : (a.comision_financiacion || 0);
                  bVal = b.comision_financiacion_real !== null && b.comision_financiacion_real !== undefined ? Number(b.comision_financiacion_real) : (b.comision_financiacion || 0);
                } else if (cotejoSortField === "pref") {
                  aVal = a.comision_preference || 0;
                  bVal = b.comision_preference || 0;
                } else if (cotejoSortField === "bonus") {
                  aVal = a.bonus_acumulado || 0;
                  bVal = b.bonus_acumulado || 0;
                } else if (cotejoSortField === "extra") {
                  let aExtra = 0, bExtra = 0;
                  try { aExtra = a.conceptos_adicionales ? JSON.parse(a.conceptos_adicionales).reduce((acc: number, c: any) => acc + (c.valor || 0), 0) : 0; } catch(e){}
                  try { bExtra = b.conceptos_adicionales ? JSON.parse(b.conceptos_adicionales).reduce((acc: number, c: any) => acc + (c.valor || 0), 0) : 0; } catch(e){}
                  aVal = aExtra;
                  bVal = bExtra;
                } else if (cotejoSortField === "total") {
                  const getTot = (x: any) => {
                    const coche = x.comision_coche_real !== null && x.comision_coche_real !== undefined ? Number(x.comision_coche_real) : (x.comision_base_vn || 0);
                    const finan = x.comision_financiacion_real !== null && x.comision_financiacion_real !== undefined ? Number(x.comision_financiacion_real) : (x.comision_financiacion || 0);
                    let ext = 0;
                    try { ext = x.conceptos_adicionales ? JSON.parse(x.conceptos_adicionales).reduce((acc: number, c: any) => acc + (c.valor || 0), 0) : 0; } catch(e){}
                    return coche + (x.comision_usado || 0) + finan + (x.comision_preference || 0) + (x.bonus_acumulado || 0) + ext;
                  };
                  aVal = getTot(a);
                  bVal = getTot(b);
                }

                if (typeof aVal === "string" && typeof bVal === "string") {
                  return cotejoSortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
                return cotejoSortOrder === "asc" ? (aVal - bVal) : (bVal - aVal);
              });

              // Totales para el footer
              let sumVnBase = 0;
              let sumUsado = 0;
              let sumFinan = 0;
              let sumPref = 0;
              let sumBonus = 0;
              let sumExtra = 0;
              let sumTotal = 0;

              sortedLines.forEach((l: any) => {
                const hasCocheOverride = l.comision_coche_real !== null && l.comision_coche_real !== undefined;
                const hasFinanOverride = l.comision_financiacion_real !== null && l.comision_financiacion_real !== undefined;
                const comVnBase = hasCocheOverride ? Number(l.comision_coche_real) : (l.comision_base_vn || 0);
                const comUsado = hasCocheOverride ? 0 : (l.comision_usado || 0);
                const comFinan = hasFinanOverride ? Number(l.comision_financiacion_real) : (l.comision_financiacion || 0);
                const comPref = hasFinanOverride ? 0 : (l.comision_preference || 0);
                const comBonus = l.bonus_acumulado || 0;
                
                let extraCom = 0;
                if (l.conceptos_adicionales) {
                  try {
                    extraCom = JSON.parse(l.conceptos_adicionales).reduce((acc: number, c: any) => acc + (c.valor || 0), 0);
                  } catch (e) {}
                }
                sumVnBase += comVnBase;
                sumUsado += comUsado;
                sumFinan += comFinan;
                sumPref += comPref;
                sumBonus += comBonus;
                sumExtra += extraCom;
                sumTotal += (comVnBase + comUsado + comFinan + comPref + comBonus + extraCom);
              });

              const renderCotejoSortIndicator = (field: string) => {
                if (cotejoSortField !== field) return null;
                return cotejoSortOrder === "asc" ? " 🔼" : " 🔽";
              };

              const totalCount = filteredLines.length;
              const cobradosCount = filteredLines.filter(l => l.comision_cobrada).length;
              const pendientesCount = totalCount - cobradosCount;

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "12px", borderTop: "1px solid var(--border-light)", paddingTop: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <h3 style={{ fontSize: "1.1rem" }}>
                      📋 Expedientes a Verificar ({totalCount})
                    </h3>
                    <div style={{ display: "flex", gap: "12px", fontSize: "0.85rem" }}>
                      <span className="badge" style={{ backgroundColor: "rgba(16, 185, 129, 0.15)", color: "var(--success)" }}>
                        💰 Cobrados: {cobradosCount}
                      </span>
                      <span className="badge" style={{ backgroundColor: "rgba(245, 158, 11, 0.12)", color: "var(--warning)" }}>
                        🕒 Pendientes: {pendientesCount}
                      </span>
                    </div>
                  </div>

                  <div className="table-container">
                    <table className="table-premium">
                      <thead>
                        <tr>
                          <th style={{ width: "80px", textAlign: "center" }}>Cobrado</th>
                          <th style={{ cursor: "pointer" }} onClick={() => handleCotejoSort("matricula")}>Matrícula{renderCotejoSortIndicator("matricula")}</th>
                          <th style={{ cursor: "pointer" }} onClick={() => handleCotejoSort("cliente")}>Cliente{renderCotejoSortIndicator("cliente")}</th>
                          <th style={{ cursor: "pointer" }} onClick={() => handleCotejoSort("vehiculo")}>Vehículo{renderCotejoSortIndicator("vehiculo")}</th>
                          <th style={{ cursor: "pointer", textAlign: "center" }} onClick={() => handleCotejoSort("fecha_matriculacion")}>Fecha Mat{renderCotejoSortIndicator("fecha_matriculacion")}</th>
                          <th style={{ cursor: "pointer", textAlign: "center" }} onClick={() => handleCotejoSort("fecha_rci")}>Fecha RCI{renderCotejoSortIndicator("fecha_rci")}</th>
                          <th style={{ cursor: "pointer" }} onClick={() => handleCotejoSort("pago")}>Modo Pago{renderCotejoSortIndicator("pago")}</th>
                          <th style={{ cursor: "pointer", textAlign: "right" }} onClick={() => handleCotejoSort("vn_base")}>VN Base{renderCotejoSortIndicator("vn_base")}</th>
                          <th style={{ cursor: "pointer", textAlign: "right" }} onClick={() => handleCotejoSort("usado")}>Usado{renderCotejoSortIndicator("usado")}</th>
                          <th style={{ cursor: "pointer", textAlign: "right" }} onClick={() => handleCotejoSort("finan")}>Finan{renderCotejoSortIndicator("finan")}</th>
                          <th style={{ cursor: "pointer", textAlign: "right" }} onClick={() => handleCotejoSort("pref")}>Pref/Box{renderCotejoSortIndicator("pref")}</th>
                          <th style={{ cursor: "pointer", textAlign: "right" }} onClick={() => handleCotejoSort("bonus")}>Bonus{renderCotejoSortIndicator("bonus")}</th>
                          <th style={{ cursor: "pointer", textAlign: "right" }} onClick={() => handleCotejoSort("extra")}>Conceptos Extra{renderCotejoSortIndicator("extra")}</th>
                          <th style={{ cursor: "pointer", textAlign: "right" }} onClick={() => handleCotejoSort("total")}>Total Plan{renderCotejoSortIndicator("total")}</th>
                          <th style={{ width: "110px", textAlign: "center" }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedLines.map((l: any, idx: number) => {
                          const hasCocheOverride = l.comision_coche_real !== null && l.comision_coche_real !== undefined;
                          const hasFinanOverride = l.comision_financiacion_real !== null && l.comision_financiacion_real !== undefined;
                          const comVnBase = hasCocheOverride ? Number(l.comision_coche_real) : (l.comision_base_vn || 0);
                          const comUsado = hasCocheOverride ? 0 : (l.comision_usado || 0);
                          const comFinan = hasFinanOverride ? Number(l.comision_financiacion_real) : (l.comision_financiacion || 0);
                          const comPref = hasFinanOverride ? 0 : (l.comision_preference || 0);
                          const comBonus = l.bonus_acumulado || 0;
                          
                          let extraCom = 0;
                          let customConcepts: any[] = [];
                          if (l.conceptos_adicionales) {
                            try {
                              customConcepts = JSON.parse(l.conceptos_adicionales);
                              extraCom = customConcepts.reduce((acc: number, c: any) => acc + (c.valor || 0), 0);
                            } catch (e) {
                              console.error(e);
                            }
                          }
                          const totalVal = comVnBase + comUsado + comFinan + comPref + comBonus + extraCom;

                          // Check general: ¿Todos los componentes están cobrados?
                          const allComponentsChecked = (l.comision_coche_cobrada || false) && 
                                                      (l.comision_usado_cobrada || false) && 
                                                      (l.comision_financiacion_cobrada || false) && 
                                                      (l.comision_preference_cobrada || false) && 
                                                      (l.comision_bonus_cobrada || false) && 
                                                      customConcepts.every(c => c.cobrado);
                          
                          return (
                            <tr key={l.id_line || idx} style={{ opacity: l.comision_cobrada ? 0.75 : 1 }}>
                              {/* Check General */}
                              <td style={{ textAlign: "center" }}>
                                <input 
                                  type="checkbox" 
                                  checked={allComponentsChecked} 
                                  onChange={() => handleToggleAllComponents(l)}
                                  disabled={!l.id_expediente}
                                  style={{ width: "18px", height: "18px", accentColor: "var(--success)", cursor: l.id_expediente ? "pointer" : "not-allowed" }}
                                  title="Marcar/Desmarcar todos los conceptos de este expediente"
                                />
                              </td>
                              <td style={{ fontWeight: 700, color: "var(--primary)" }}>
                                <div>{l.matricula || "S/M"}</div>
                                {l.vin && <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: "normal" }}>VIN: {l.vin}</div>}
                              </td>
                              <td>
                                <div>{l.cliente_nombre}</div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Vend: {l.vendedor_nombre}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 500 }}>{l.modelo_nombre}</div>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{l.marca_nombre}</div>
                              </td>
                              {/* Fechas */}
                              <td style={{ textAlign: "center" }}>
                                {l.cobrado_otra_fecha ? (
                                  <span
                                    style={{ textDecoration: "underline", cursor: "help" }}
                                    title={l.fecha_cobrado ? `Cobrado en otra fecha: ${formatDate(l.fecha_cobrado)}` : undefined}
                                  >
                                    {formatDate(l.fecha_matriculacion)}
                                  </span>
                                ) : (
                                  formatDate(l.fecha_matriculacion) || "-"
                                )}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                {formatDate(l.fecha_rci) || "-"}
                              </td>
                              {/* Modo de Pago */}
                              <td>
                                <span className="badge" style={{ backgroundColor: `${l.tipo_venta_color}22`, color: l.tipo_venta_color, border: `1px solid ${l.tipo_venta_color}44`, fontSize: "0.75rem" }}>
                                  {l.tipo_venta_nombre || "Contado/Otro"}
                                </span>
                              </td>
                              {/* Comisión VN Base Individual */}
                              <td style={{ textAlign: "right", fontWeight: 600 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                                  <input 
                                    type="checkbox"
                                    checked={l.comision_coche_cobrada || false}
                                    onChange={() => handleToggleComponent(l, "coche")}
                                    disabled={!l.id_expediente}
                                    style={{ accentColor: "var(--success)", cursor: l.id_expediente ? "pointer" : "default" }}
                                  />
                                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {hasCocheOverride && <span title="Valor modificado manualmente" style={{ fontSize: "0.75rem" }}>✍️</span>}
                                    <span style={{ textDecoration: l.comision_coche_cobrada ? "line-through" : "none", color: l.comision_coche_cobrada ? "var(--text-muted)" : "inherit" }}>
                                      {comVnBase.toLocaleString()} €
                                    </span>
                                  </div>
                                </div>
                              </td>
                              {/* Comisión Usado Individual */}
                              <td style={{ textAlign: "right", fontWeight: 600 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                                  <input 
                                    type="checkbox"
                                    checked={l.comision_usado_cobrada || false}
                                    onChange={() => handleToggleComponent(l, "usado")}
                                    disabled={!l.id_expediente}
                                    style={{ accentColor: "var(--success)", cursor: l.id_expediente ? "pointer" : "default" }}
                                  />
                                  <span style={{ textDecoration: l.comision_usado_cobrada ? "line-through" : "none", color: l.comision_usado_cobrada ? "var(--text-muted)" : "inherit" }}>
                                    {comUsado.toLocaleString()} €
                                  </span>
                                </div>
                              </td>
                              {/* Comisión Financiación Individual */}
                              <td style={{ textAlign: "right", fontWeight: 600 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                                  <input 
                                    type="checkbox"
                                    checked={l.comision_financiacion_cobrada || false}
                                    onChange={() => handleToggleComponent(l, "financiacion")}
                                    disabled={!l.id_expediente}
                                    style={{ accentColor: "var(--success)", cursor: l.id_expediente ? "pointer" : "default" }}
                                  />
                                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    {hasFinanOverride && <span title="Valor modificado manualmente" style={{ fontSize: "0.75rem" }}>✍️</span>}
                                    <span style={{ textDecoration: l.comision_financiacion_cobrada ? "line-through" : "none", color: l.comision_financiacion_cobrada ? "var(--text-muted)" : "inherit" }}>
                                      {comFinan.toLocaleString()} €
                                    </span>
                                  </div>
                                </div>
                              </td>
                              {/* Comisión Pref/Box Individual */}
                              <td style={{ textAlign: "right", fontWeight: 600 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                                  <input 
                                    type="checkbox"
                                    checked={l.comision_preference_cobrada || false}
                                    onChange={() => handleToggleComponent(l, "preference")}
                                    disabled={!l.id_expediente}
                                    style={{ accentColor: "var(--success)", cursor: l.id_expediente ? "pointer" : "default" }}
                                  />
                                  <span style={{ textDecoration: l.comision_preference_cobrada ? "line-through" : "none", color: l.comision_preference_cobrada ? "var(--text-muted)" : "inherit" }}>
                                    {comPref.toLocaleString()} €
                                  </span>
                                </div>
                              </td>
                              {/* Comisión Bonus Individual */}
                              <td style={{ textAlign: "right", fontWeight: 600 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                                  <input 
                                    type="checkbox"
                                    checked={l.comision_bonus_cobrada || false}
                                    onChange={() => handleToggleComponent(l, "bonus")}
                                    disabled={!l.id_expediente}
                                    style={{ accentColor: "var(--success)", cursor: l.id_expediente ? "pointer" : "default" }}
                                  />
                                  <span style={{ textDecoration: l.comision_bonus_cobrada ? "line-through" : "none", color: l.comision_bonus_cobrada ? "var(--text-muted)" : "inherit" }}>
                                    {comBonus.toLocaleString()} €
                                  </span>
                                </div>
                              </td>
                              {/* Conceptos Extra Individuales */}
                              <td style={{ textAlign: "right", fontWeight: 600 }}>
                                {customConcepts.length > 0 ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
                                    {customConcepts.map((cc: any) => (
                                      <div key={cc.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem" }}>
                                        <input 
                                          type="checkbox"
                                          checked={cc.cobrado || false}
                                          onChange={() => handleToggleCustomConcept(l, cc.id)}
                                          disabled={!l.id_expediente}
                                          style={{ accentColor: "var(--success)", cursor: l.id_expediente ? "pointer" : "default" }}
                                        />
                                        <span style={{ 
                                          textDecoration: cc.cobrado ? "line-through" : "none",
                                          color: cc.cobrado ? "var(--text-muted)" : (cc.valor >= 0 ? "var(--success)" : "var(--danger)")
                                        }} title={cc.descripcion}>
                                          {cc.titulo}: {cc.valor >= 0 ? "+" : ""}{cc.valor} €
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span style={{ color: "var(--text-muted)" }}>-</span>
                                )}
                              </td>
                              {/* Total General */}
                              <td style={{ textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>{totalVal.toLocaleString()} €</td>
                              {/* Acciones */}
                              <td style={{ textAlign: "center" }}>
                                {l.id_expediente ? (
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(l)}
                                    className="btn btn-secondary"
                                    style={{ padding: "4px 8px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                                  >
                                    ✏️ Modificar
                                  </button>
                                ) : (
                                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>N/D</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {sortedLines.length === 0 && (
                          <tr>
                            <td colSpan={15} style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px" }}>
                              No se encontraron expedientes con los criterios de búsqueda aplicados.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {/* Fila de Totales */}
                      {sortedLines.length > 0 && (
                        <tfoot>
                          <tr style={{ borderTop: "2px solid var(--border-light)", background: "rgba(255, 255, 255, 0.04)", fontWeight: 700 }}>
                            <td colSpan={7} style={{ padding: "12px 16px", color: "var(--text-primary)" }}>TOTALES</td>
                            <td style={{ textAlign: "right" }}>{sumVnBase.toLocaleString()} €</td>
                            <td style={{ textAlign: "right" }}>{sumUsado.toLocaleString()} €</td>
                            <td style={{ textAlign: "right" }}>{sumFinan.toLocaleString()} €</td>
                            <td style={{ textAlign: "right" }}>{sumPref.toLocaleString()} €</td>
                            <td style={{ textAlign: "right" }}>{sumBonus.toLocaleString()} €</td>
                            <td style={{ textAlign: "right", color: "var(--success)" }}>+{sumExtra.toLocaleString()} €</td>
                            <td style={{ textAlign: "right", color: "var(--success)" }}>{sumTotal.toLocaleString()} €</td>
                            <td></td>
                          </tr>
                          {Math.abs(cotejoPenalizacionImporte) > 0 && (
                            <tr style={{ background: "rgba(239, 68, 68, 0.04)", fontWeight: 700 }}>
                              <td colSpan={7} style={{ padding: "12px 16px", color: "var(--danger)" }}>
                                ⚠️ Penalizaciones del Periodo ({cotejoPenalizacionTitulo})
                              </td>
                              <td style={{ textAlign: "right" }}></td>
                              <td style={{ textAlign: "right" }}></td>
                              <td style={{ textAlign: "right" }}></td>
                              <td style={{ textAlign: "right" }}></td>
                              <td style={{ textAlign: "right" }}></td>
                              <td style={{ textAlign: "right" }}></td>
                              <td style={{ textAlign: "right", color: "var(--danger)" }}>-{Math.abs(cotejoPenalizacionImporte).toLocaleString()} €</td>
                              <td></td>
                            </tr>
                          )}
                          {Math.abs(cotejoPenalizacionImporte) > 0 && (
                            <tr style={{ borderTop: "1px solid var(--border-light)", background: "rgba(16, 185, 129, 0.04)", fontWeight: 800 }}>
                              <td colSpan={7} style={{ padding: "12px 16px", color: "var(--text-primary)" }}>TOTAL NETO DE COMISIÓN</td>
                              <td style={{ textAlign: "right" }}></td>
                              <td style={{ textAlign: "right" }}></td>
                              <td style={{ textAlign: "right" }}></td>
                              <td style={{ textAlign: "right" }}></td>
                              <td style={{ textAlign: "right" }}></td>
                              <td style={{ textAlign: "right" }}></td>
                              <td style={{ textAlign: "right", color: "var(--success)" }}>{(sumTotal - Math.abs(cotejoPenalizacionImporte)).toLocaleString()} €</td>
                              <td></td>
                            </tr>
                          )}
                        </tfoot>
                      )}
                    </table>
                  </div>

                  {/* Dashboard resumen de validación / cobros */}
                  {(() => {
                    let totalCobradoVnBase = 0;
                    let totalPendienteVnBase = 0;
                    let totalCobradoUsado = 0;
                    let totalPendienteUsado = 0;
                    let totalCobradoFinan = 0;
                    let totalPendienteFinan = 0;
                    let totalCobradoPref = 0;
                    let totalPendientePref = 0;
                    let totalCobradoBonus = 0;
                    let totalPendienteBonus = 0;
                    let totalCobradoExtra = 0;
                    let totalPendienteExtra = 0;

                    sortedLines.forEach((l: any) => {
                      const hasCocheOverride = l.comision_coche_real !== null && l.comision_coche_real !== undefined;
                      const hasFinanOverride = l.comision_financiacion_real !== null && l.comision_financiacion_real !== undefined;
                      const comVnBase = hasCocheOverride ? Number(l.comision_coche_real) : (l.comision_base_vn || 0);
                      const comUsado = hasCocheOverride ? 0 : (l.comision_usado || 0);
                      const comFinan = hasFinanOverride ? Number(l.comision_financiacion_real) : (l.comision_financiacion || 0);
                      const comPref = hasFinanOverride ? 0 : (l.comision_preference || 0);
                      const comBonus = l.bonus_acumulado || 0;
                      
                      let customConcepts: any[] = [];
                      if (l.conceptos_adicionales) {
                        try {
                          customConcepts = JSON.parse(l.conceptos_adicionales);
                        } catch (e) {}
                      }

                      // VN Base
                      if (l.comision_coche_cobrada) {
                        totalCobradoVnBase += comVnBase;
                      } else {
                        totalPendienteVnBase += comVnBase;
                      }

                      // Usado
                      if (l.comision_usado_cobrada) {
                        totalCobradoUsado += comUsado;
                      } else {
                        totalPendienteUsado += comUsado;
                      }

                      // Finan
                      if (l.comision_financiacion_cobrada) {
                        totalCobradoFinan += comFinan;
                      } else {
                        totalPendienteFinan += comFinan;
                      }

                      // Pref
                      if (l.comision_preference_cobrada) {
                        totalCobradoPref += comPref;
                      } else {
                        totalPendientePref += comPref;
                      }

                      // Bonus
                      if (l.comision_bonus_cobrada) {
                        totalCobradoBonus += comBonus;
                      } else {
                        totalPendienteBonus += comBonus;
                      }

                      // Extra
                      customConcepts.forEach(cc => {
                        if (cc.cobrado) {
                          totalCobradoExtra += (cc.valor || 0);
                        } else {
                          totalPendienteExtra += (cc.valor || 0);
                        }
                      });
                    });

                    // Obtener la penalización del plan si aplica para este mes
                    const penalizacionPlan = Math.abs(cotejoPenalizacionImporte);
                    const penalizacionPlanTitulo = cotejoPenalizacionTitulo;

                    const granTotalCobrado = totalCobradoVnBase + totalCobradoUsado + totalCobradoFinan + totalCobradoPref + totalCobradoBonus + totalCobradoExtra;
                    const granTotalCalculado = sumTotal; // comisiones calculadas

                    // El neto cobrado descuenta la penalización si la hay
                    const finalNetoCobrado = granTotalCobrado - penalizacionPlan;
                    const finalNetoCalculado = granTotalCalculado - penalizacionPlan;
                    
                    const ratioValidacion = granTotalCalculado > 0 ? Math.round((granTotalCobrado / granTotalCalculado) * 100) : 0;

                    return (
                      <div className="glass-panel" style={{
                        padding: "20px",
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid var(--border-light)",
                        borderRadius: "8px",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: "20px",
                        marginTop: "8px"
                      }}>
                        {/* Tarjeta 1: Total General Cobrado/Validado */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ fontSize: "0.8rem", color: "var(--success)", fontWeight: 600 }}>💰 TOTAL VALIDADO / COBRADO</div>
                          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--success)" }}>
                            {granTotalCobrado.toLocaleString()} €
                          </div>
                          {penalizacionPlan > 0 && (
                            <div style={{ fontSize: "0.85rem", color: "var(--danger)", fontWeight: 600 }}>
                              Neto Final: {finalNetoCobrado.toLocaleString()} € (Penalización aplicada)
                            </div>
                          )}
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                            <span>• VN Base: {totalCobradoVnBase.toLocaleString()} €</span>
                            <span>• Usado: {totalCobradoUsado.toLocaleString()} €</span>
                            <span>• Finan: {totalCobradoFinan.toLocaleString()} €</span>
                            <span>• Pref/Box: {totalCobradoPref.toLocaleString()} €</span>
                            <span>• Bonus VN/VO: {totalCobradoBonus.toLocaleString()} €</span>
                            <span>• Extras: {totalCobradoExtra.toLocaleString()} €</span>
                          </div>
                        </div>

                        {/* Tarjeta 2: Total General Pendiente */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ fontSize: "0.8rem", color: "var(--warning)", fontWeight: 600 }}>🕒 TOTAL PENDIENTE DE COBRO</div>
                          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--warning)" }}>
                            {(granTotalCalculado - granTotalCobrado).toLocaleString()} €
                          </div>
                          {penalizacionPlan > 0 && (
                            <div style={{ fontSize: "0.85rem", color: "var(--danger)", fontWeight: 600 }}>
                              Neto Final: {Math.max(0, finalNetoCalculado - granTotalCobrado).toLocaleString()} € (Penalización aplicada)
                            </div>
                          )}
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                            <span>• VN Base: {totalPendienteVnBase.toLocaleString()} €</span>
                            <span>• Usado: {totalPendienteUsado.toLocaleString()} €</span>
                            <span>• Finan: {totalPendienteFinan.toLocaleString()} €</span>
                            <span>• Pref/Box: {totalPendientePref.toLocaleString()} €</span>
                            <span>• Bonus VN/VO: {totalPendienteBonus.toLocaleString()} €</span>
                            <span>• Extras: {totalPendienteExtra.toLocaleString()} €</span>
                          </div>
                        </div>

                        {/* Tarjeta 3: Ratio de Conciliación */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", borderLeft: "1px solid var(--border-light)", paddingLeft: "20px" }}>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>📊 RATIO DE VALIDACIÓN</div>
                          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-primary)" }}>
                            {ratioValidacion} %
                          </div>
                          {penalizacionPlan > 0 && (
                            <div style={{ fontSize: "0.8rem", color: "var(--danger)", padding: "4px 8px", background: "rgba(239, 68, 68, 0.1)", borderRadius: "4px", margin: "4px 0" }}>
                              ⚠️ <strong>{penalizacionPlanTitulo}:</strong> -{penalizacionPlan} €
                            </div>
                          )}
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                            Has validado {granTotalCobrado.toLocaleString()} € de un total de {granTotalCalculado.toLocaleString()} € calculados.
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* VISTA 2: EDICIÓN Y DETALLE DEL PLAN SELECCIONADO */}
      {selectedPlanId && planData && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* HEADER DEL PLAN */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <button
                onClick={() => {
                  setSelectedPlanId(null);
                  setPlanData(null);
                  refreshPlanes();
                }}
                className="btn btn-secondary"
                style={{ padding: "6px 12px", fontSize: "0.8rem", marginBottom: "12px" }}
              >
                ← Volver a Planes
              </button>
              {isAdmin ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", width: "70px", fontWeight: 600 }}>Nombre:</label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontSize: "1.1rem", fontWeight: 700, padding: "6px 12px", width: "320px", height: "36px" }}
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", width: "70px", fontWeight: 600 }}>F. Inicio:</label>
                      <input
                        type="date"
                        className="form-input"
                        style={{ padding: "4px 8px", width: "150px", height: "30px", fontSize: "0.85rem" }}
                        value={planStart}
                        onChange={(e) => setPlanStart(e.target.value)}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>F. Fin:</label>
                      <input
                        type="date"
                        className="form-input"
                        style={{ padding: "4px 8px", width: "150px", height: "30px", fontSize: "0.85rem" }}
                        value={planEnd}
                        onChange={(e) => setPlanEnd(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <h1 style={{ fontSize: "1.85rem" }}>{planName}</h1>
                  </div>
                  <p style={{ color: "var(--text-secondary)", marginTop: "4px", fontSize: "0.9rem" }}>
                    Periodo: <strong>{formatDate(planStart)}</strong> al <strong>{formatDate(planEnd)}</strong>
                  </p>
                </>
              )}
            </div>
            {isAdmin && (
              <button
                onClick={handleSavePlan}
                disabled={saving}
                className="btn btn-primary"
                style={{ padding: "12px 24px" }}
              >
                💾 {saving ? "Guardando..." : "Guardar Cambios"}
              </button>
            )}
          </div>

          {/* TABS DE CONFIGURACIÓN */}
          <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-light)", paddingBottom: "1px", flexWrap: "wrap" }}>
            {[
              { id: "resumen", label: "📋 Resumen" },
              { id: "objetivo", label: "🎯 Objetivo" },
              { id: "modelos", label: "🚗 VN" },
              { id: "usados", label: "🚙 Usados / VO" },
              { id: "reglas", label: "⚙️ Financ/Reglas" },
              { id: "bonus", label: "🎁 Bonus" },
              { id: "penalizaciones", label: "⚠️ Penalizaciones" },
              { id: "liquidacion", label: "💰 Liquidación" },
              { id: "notas", label: "📝 Notas" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  background: activeTab === tab.id ? "rgba(255, 255, 255, 0.05)" : "transparent",
                  color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-secondary)",
                  border: "none",
                  borderBottom: activeTab === tab.id ? "2px solid var(--primary)" : "2px solid transparent",
                  padding: "12px 18px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* CONTENIDOS DE LAS PESTAÑAS */}
          <div className="glass-panel" style={{ padding: "28px" }}>
            
            {/* TAB: RESUMEN */}
            {activeTab === "resumen" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>Resumen del Plan</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
                  <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>OBJETIVO BASE</div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: "4px" }}>{objetivoBase}</div>
                  </div>
                  <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>ARRASRE</div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: "4px" }}>{arrastre}</div>
                  </div>
                  <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>OBJETIVO AJUSTADO (X)</div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--primary)", marginTop: "4px" }}>{objetivoBase + arrastre}</div>
                  </div>
                  <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>MÍNIMO MATRICULACIONES</div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: "4px" }}>{minMatriculaciones}</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px", fontSize: "0.95rem" }}>
                  <div>• Modelos VN configurados en el plan: <strong>{rates.filter(r => r.activo).length}</strong> de {rates.length} totales.</div>
                  <div>• Tarifas de usados configuradas: <strong>{usedRates.filter(u => u.activo).length}</strong></div>
                  <div>• Financiación por marca parametrizada: <strong>{financeRates.length} tarifas</strong></div>
                  <div>• Reglas de Preference/BOX3 configuradas: <strong>{preferenceRules.filter(p => p.activa).length}</strong></div>
                  <div>• Reglas especiales creadas: <strong>{rules.length}</strong></div>
                  <div>• Bonus de campaña configurados: <strong>{bonusRules.length}</strong></div>
                  <div>• Financiamiento parametrizado: Normal: <strong>{financeNormal} €</strong> / Preference: <strong>{financePref} €</strong></div>
                  <div>• Liquidación activa: {planData.liquidations?.[0] ? (
                    <strong style={{ color: "var(--success)" }}>✓ Calculada el {formatDate(planData.liquidations[0].fecha_calculo)}</strong>
                  ) : (
                    <strong style={{ color: "var(--danger)" }}>⏳ Pendiente calcular</strong>
                  )}</div>
                </div>
              </div>
            )}

            {/* TAB: OBJETIVO */}
            {activeTab === "objetivo" && (
              <div style={{ display: "flex", gap: "40px", flexWrap: "wrap", alignItems: "flex-start" }}>
                {/* Bloque Izquierdo: Cálculo de Objetivo */}
                <div style={{ display: "flex", flexDirection: "column", gap: "20px", flex: 1, minWidth: "300px", maxWidth: "450px" }}>
                  <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>Cálculo del Objetivo X</h3>
                  
                  <div className="form-group">
                    <label className="form-label">Objetivo Base del Periodo</label>
                    <input
                      type="number"
                      className="form-input"
                      value={objetivoBase}
                      onChange={(e) => setObjetivoBase(Number(e.target.value))}
                      disabled={!isAdmin}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Arrastre (Unidades adicionales)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={arrastre}
                      onChange={(e) => setArrastre(Number(e.target.value))}
                      disabled={!isAdmin}
                    />
                  </div>

                    <div className="form-group">
                    <label className="form-label">Mínimo de Matriculaciones Reales (Derecho a cobro)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={minMatriculaciones}
                      onChange={(e) => setMinMatriculaciones(Number(e.target.value))}
                      disabled={!isAdmin}
                    />
                  </div>

                  <div style={{
                    padding: "16px 20px",
                    background: "rgba(124, 58, 237, 0.05)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-focus)",
                    marginTop: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <span style={{ fontWeight: 600 }}>Objetivo Resultante (X = Base + Arrastre)</span>
                    <strong style={{ fontSize: "1.6rem", color: "var(--primary)" }}>{objetivoBase + arrastre}</strong>
                  </div>
                </div>

                {/* Bloque Derecho: Tasa de Intervención por Marca */}
                <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px", flex: 1, minWidth: "300px", maxWidth: "450px", padding: "24px", background: "rgba(255, 255, 255, 0.01)" }}>
                  <h4 style={{ fontSize: "1.05rem", color: "var(--text-primary)", margin: 0 }}>Tasa de Intervención Objetiva por Marca</h4>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", margin: 0 }}>
                    Establece el porcentaje objetivo de financiamientos sobre las matriculaciones de cada marca en el mes.
                  </p>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
                    {marcas.filter(m => !!m.sistema_comisiones).map((brand) => {
                      const rateObj = brandInterventionRates.find(r => r.id_marca === brand.id) || {
                        id_marca: brand.id,
                        tasa_intervencion: 70,
                        tipo_tasa: "porcentaje"
                      };

                      const handleInterventionChange = (newVal: number) => {
                        const existingIdx = brandInterventionRates.findIndex(r => r.id_marca === brand.id);
                        if (existingIdx !== -1) {
                          const updated = [...brandInterventionRates];
                          updated[existingIdx] = { ...updated[existingIdx], tasa_intervencion: newVal };
                          setBrandInterventionRates(updated);
                        } else {
                          setBrandInterventionRates([...brandInterventionRates, { id_marca: brand.id, tasa_intervencion: newVal, tipo_tasa: "porcentaje" }]);
                        }
                      };

                      const handleTipoTasaChange = (newTipo: string) => {
                        const existingIdx = brandInterventionRates.findIndex(r => r.id_marca === brand.id);
                        if (existingIdx !== -1) {
                          const updated = [...brandInterventionRates];
                          updated[existingIdx] = { ...updated[existingIdx], tipo_tasa: newTipo };
                          setBrandInterventionRates(updated);
                        } else {
                          setBrandInterventionRates([...brandInterventionRates, { id_marca: brand.id, tasa_intervencion: 70, tipo_tasa: newTipo }]);
                        }
                      };

                      return (
                        <div key={brand.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderBottom: "1px solid var(--border-light)", paddingBottom: "12px" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text-primary)" }}>{brand.nombre}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <input
                              type="number"
                              className="form-input"
                              value={rateObj.tasa_intervencion}
                              onChange={(e) => handleInterventionChange(Number(e.target.value))}
                              disabled={!isAdmin}
                              style={{ width: "70px", textAlign: "right", padding: "6px" }}
                              min={0}
                            />
                            <select
                              className="form-select"
                              value={rateObj.tipo_tasa || "porcentaje"}
                              onChange={(e) => handleTipoTasaChange(e.target.value)}
                              disabled={!isAdmin}
                              style={{ width: "80px", padding: "4px", fontSize: "0.82rem" }}
                            >
                              <option value="porcentaje">%</option>
                              <option value="unidades">uds</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bloque Derecho (Extremo): Valor Objetivo por Defecto */}
                <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px", flex: 1, minWidth: "300px", maxWidth: "450px", padding: "24px", background: "rgba(255, 255, 255, 0.01)" }}>
                  <h4 style={{ fontSize: "1.05rem", color: "var(--text-primary)", margin: 0 }}>Valor Objetivo por Defecto por Marca</h4>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", margin: 0 }}>
                    Establece el valor objetivo / multiplicador por defecto que se asignará a cada expediente nuevo según su marca.
                  </p>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
                    {marcas.filter(m => !!m.sistema_comisiones).map((brand) => {
                      const rateObj = brandInterventionRates.find(r => r.id_marca === brand.id) || {
                        id_marca: brand.id,
                        valor_objetivo_defecto: 1.0
                      };

                      const handleDefaultObjectiveChange = (newVal: number) => {
                        const existingIdx = brandInterventionRates.findIndex(r => r.id_marca === brand.id);
                        if (existingIdx !== -1) {
                          const updated = [...brandInterventionRates];
                          updated[existingIdx] = { ...updated[existingIdx], valor_objetivo_defecto: newVal };
                          setBrandInterventionRates(updated);
                        } else {
                          setBrandInterventionRates([...brandInterventionRates, { id_marca: brand.id, valor_objetivo_defecto: newVal }]);
                        }
                      };

                      return (
                        <div key={brand.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderBottom: "1px solid var(--border-light)", paddingBottom: "12px" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text-primary)" }}>{brand.nombre}</span>
                          <select
                            className="form-select"
                            value={rateObj.valor_objetivo_defecto !== undefined ? rateObj.valor_objetivo_defecto : 1.0}
                            onChange={(e) => handleDefaultObjectiveChange(Number(e.target.value))}
                            disabled={!isAdmin}
                            style={{ width: "90px", padding: "4px 8px" }}
                          >
                            <option value={0}>0</option>
                            <option value={0.5}>0.5</option>
                            <option value={1}>1</option>
                            <option value={1.5}>1.5</option>
                            <option value={2}>2</option>
                            <option value={2.5}>2.5</option>
                            <option value={3}>3</option>
                            <option value={3.5}>3.5</option>
                            <option value={4}>4</option>
                          </select>
                        </div>
                      );
                    })}

                    <div style={{ borderBottom: "1px solid var(--border-light)", margin: "12px 0 8px 0" }} />

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                        Cupo Ventas Multiplicadas Requerido (Mes)
                      </label>
                      <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", margin: "2px 0 8px 0", lineHeight: "1.25" }}>
                        Número mínimo de ventas con multiplicador &gt; 1 en el mes necesarias para mantener los multiplicadores en las liquidaciones.
                      </p>
                      <input
                        type="number"
                        className="form-input"
                        value={minCochesMultiplicador}
                        onChange={(e) => setMinCochesMultiplicador(Number(e.target.value))}
                        disabled={!isAdmin}
                        min={0}
                        style={{ width: "100%" }}
                      />
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setBulkModalOpen(true)}
                          className="btn btn-secondary"
                          style={{
                            marginTop: "12px",
                            width: "100%",
                            padding: "8px 12px",
                            fontSize: "0.8rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px"
                          }}
                        >
                          🔄 Aplicar este cupo a expedientes en lote
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: VN MODEL RATES */}
            {activeTab === "modelos" && (() => {
              const activeBrands = marcas.filter(m => !!m.sistema_comisiones);

              if (activeBrands.length === 0) {
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>Tarifas de Modelos VN por Tramo</h3>
                    <div className="glass-panel" style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>
                      ⚠️ No hay ninguna marca configurada en el sistema de comisionamiento. 
                      Ve a <strong>Configuración &gt; Marcas</strong> para activar al menos una marca.
                    </div>
                  </div>
                );
              }

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
                  <div>
                    <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>Tarifas de Modelos VN por Tramo</h3>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px" }}>
                      Define las tarifas de comisiones de coches nuevos agrupados por marcas. Cada modelo tiene 2 líneas: una para cuando la tasa de intervención real del mes sea inferior a la establecida y otra para cuando sea superior o igual.
                    </p>
                  </div>

                  {activeBrands.map(brand => {
                    const brandRates = rates.filter(r => {
                      const mId = r.id_modelo ? modelos.find(m => m.id === r.id_modelo)?.marca_id : null;
                      return mId === brand.id;
                    });

                    // Clipboard: copiar valores de una línea
                    const handleCopyRate = (r: any) => {
                      setRateClipboard({
                        rate_x_minus_4: r.rate_x_minus_4 || 0,
                        rate_x_minus_3: r.rate_x_minus_3 || 0,
                        rate_x_minus_2: r.rate_x_minus_2 || 0,
                        rate_x_minus_1: r.rate_x_minus_1 || 0,
                        rate_x: r.rate_x || 0,
                        rate_x_plus_1: r.rate_x_plus_1 || 0,
                        rate_x_plus_2: r.rate_x_plus_2 || 0,
                        rate_x_plus_3: r.rate_x_plus_3 || 0,
                        activo: r.activo !== false,
                      });
                      showNotification("Valores copiados al portapapeles. Usa 📋 Pegar en otra línea.", "success");
                    };

                    const handlePasteRate = (targetRate: any) => {
                      if (!rateClipboard) {
                        showNotification("No hay valores en el portapapeles. Copia primero con 📄 Copiar.", "error");
                        return;
                      }
                      const updated = rates.map(item => {
                        if (item === targetRate) {
                          return { ...item, ...rateClipboard };
                        }
                        return item;
                      });
                      setRates(updated);
                      showNotification("Valores pegados correctamente.", "success");
                    };

                    const handleCopyModel = (less: any, more: any) => {
                      setModelClipboard({
                        rate_x_minus_4_less: less.rate_x_minus_4 || 0,
                        rate_x_minus_3_less: less.rate_x_minus_3 || 0,
                        rate_x_minus_2_less: less.rate_x_minus_2 || 0,
                        rate_x_minus_1_less: less.rate_x_minus_1 || 0,
                        rate_x_less: less.rate_x || 0,
                        rate_x_plus_1_less: less.rate_x_plus_1 || 0,
                        rate_x_plus_2_less: less.rate_x_plus_2 || 0,
                        rate_x_plus_3_less: less.rate_x_plus_3 || 0,
                        
                        rate_x_minus_4_more: more.rate_x_minus_4 || 0,
                        rate_x_minus_3_more: more.rate_x_minus_3 || 0,
                        rate_x_minus_2_more: more.rate_x_minus_2 || 0,
                        rate_x_minus_1_more: more.rate_x_minus_1 || 0,
                        rate_x_more: more.rate_x || 0,
                        rate_x_plus_1_more: more.rate_x_plus_1 || 0,
                        rate_x_plus_2_more: more.rate_x_plus_2 || 0,
                        rate_x_plus_3_more: more.rate_x_plus_3 || 0,
                      });
                      showNotification("Valores de tasas (ambas filas) del modelo copiados al portapapeles.", "success");
                    };

                    const handlePasteModel = (targetModelId: number) => {
                      if (!modelClipboard) {
                        showNotification("No hay valores de modelo en el portapapeles. Copia primero con 📦 Copiar Modelo.", "error");
                        return;
                      }
                      const updated = rates.map(item => {
                        if (item.id_modelo === targetModelId) {
                          if (!item.tasa_intervencion_cumplida) {
                            return {
                              ...item,
                              rate_x_minus_4: modelClipboard.rate_x_minus_4_less,
                              rate_x_minus_3: modelClipboard.rate_x_minus_3_less,
                              rate_x_minus_2: modelClipboard.rate_x_minus_2_less,
                              rate_x_minus_1: modelClipboard.rate_x_minus_1_less,
                              rate_x: modelClipboard.rate_x_less,
                              rate_x_plus_1: modelClipboard.rate_x_plus_1_less,
                              rate_x_plus_2: modelClipboard.rate_x_plus_2_less,
                              rate_x_plus_3: modelClipboard.rate_x_plus_3_less,
                            };
                          } else {
                            return {
                              ...item,
                              rate_x_minus_4: modelClipboard.rate_x_minus_4_more,
                              rate_x_minus_3: modelClipboard.rate_x_minus_3_more,
                              rate_x_minus_2: modelClipboard.rate_x_minus_2_more,
                              rate_x_minus_1: modelClipboard.rate_x_minus_1_more,
                              rate_x: modelClipboard.rate_x_more,
                              rate_x_plus_1: modelClipboard.rate_x_plus_1_more,
                              rate_x_plus_2: modelClipboard.rate_x_plus_2_more,
                              rate_x_plus_3: modelClipboard.rate_x_plus_3_more,
                            };
                          }
                        }
                        return item;
                      });
                      setRates(updated);
                      showNotification("Comisiones del modelo pegadas correctamente.", "success");
                    };

                    const handleApplyRatesToAllBelow = (firstModelId: number) => {
                      const firstModelRates = brandRates.filter(r => r.id_modelo === firstModelId);
                      const lessSrc = firstModelRates.find(r => !r.tasa_intervencion_cumplida);
                      const moreSrc = firstModelRates.find(r => !!r.tasa_intervencion_cumplida);

                      if (!lessSrc || !moreSrc) {
                        showNotification("El primer modelo no tiene sus tarifas configuradas", "error");
                        return;
                      }

                      const firstModelName = modelos.find(m => m.id === firstModelId)?.nombre || "";
                      if (!confirm(`¿Estás seguro de aplicar las tarifas del modelo "${firstModelName}" a todos los demás modelos de la marca ${brand.nombre}?`)) return;

                      const updated = rates.map(item => {
                        const itemModelObj = modelos.find(m => m.id === item.id_modelo);
                        if (itemModelObj && itemModelObj.marca_id === brand.id && item.id_modelo !== firstModelId) {
                          if (!item.tasa_intervencion_cumplida) {
                            return {
                              ...item,
                              rate_x_minus_4: lessSrc.rate_x_minus_4 || 0,
                              rate_x_minus_3: lessSrc.rate_x_minus_3 || 0,
                              rate_x_minus_2: lessSrc.rate_x_minus_2 || 0,
                              rate_x_minus_1: lessSrc.rate_x_minus_1 || 0,
                              rate_x: lessSrc.rate_x || 0,
                              rate_x_plus_1: lessSrc.rate_x_plus_1 || 0,
                              rate_x_plus_2: lessSrc.rate_x_plus_2 || 0,
                              rate_x_plus_3: lessSrc.rate_x_plus_3 || 0,
                            };
                          } else {
                            return {
                              ...item,
                              rate_x_minus_4: moreSrc.rate_x_minus_4 || 0,
                              rate_x_minus_3: moreSrc.rate_x_minus_3 || 0,
                              rate_x_minus_2: moreSrc.rate_x_minus_2 || 0,
                              rate_x_minus_1: moreSrc.rate_x_minus_1 || 0,
                              rate_x: moreSrc.rate_x || 0,
                              rate_x_plus_1: moreSrc.rate_x_plus_1 || 0,
                              rate_x_plus_2: moreSrc.rate_x_plus_2 || 0,
                              rate_x_plus_3: moreSrc.rate_x_plus_3 || 0,
                            };
                          }
                        }
                        return item;
                      });

                      setRates(updated);
                      showNotification("Tarifas aplicadas a todos los modelos de la marca correctamente.", "success");
                    };

                    // Reordering helpers
                    const handleMoveModel = (currentModelIds: number[], modelId: number, direction: "up" | "down") => {
                      const idx = currentModelIds.indexOf(modelId);
                      if (idx === -1) return;
                      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
                      if (swapIdx < 0 || swapIdx >= currentModelIds.length) return;
                      const newOrder = [...currentModelIds];
                      [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
                      setModelOrder(prev => ({ ...prev, [brand.id]: newOrder }));
                    };

                    // Model change handler
                    const handleChangeModel = (oldModelId: number, newModelId: number) => {
                      const updated = rates.map(item => {
                        if (item.id_modelo === oldModelId) {
                          return { ...item, id_modelo: newModelId };
                        }
                        return item;
                      });
                      setRates(updated);
                      // Update model order if exists
                      if (modelOrder[brand.id]) {
                        setModelOrder(prev => ({
                          ...prev,
                          [brand.id]: prev[brand.id].map(id => id === oldModelId ? newModelId : id)
                        }));
                      }
                      const newModelName = modelos.find(m => m.id === newModelId)?.nombre || "modelo";
                      showNotification(`Modelo cambiado a ${newModelName} correctamente.`, "success");
                    };

                    return (
                      <div key={brand.id} className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", background: "rgba(255, 255, 255, 0.01)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                          <h4 style={{ margin: 0, fontSize: "1.05rem", color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            📦 Modelos de {brand.nombre}
                          </h4>
                          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                            {rateClipboard && (
                              <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 600 }}>📋 Línea copiada</span>
                            )}
                            {modelClipboard && (
                              <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 600 }}>📦 Modelo copiado</span>
                            )}
                          </div>
                        </div>

                        <div className="table-container">
                          <table className="table-premium" style={{ fontSize: "0.9rem" }}>
                            <thead>
                              <tr>
                                {isAdmin && <th style={{ width: "50px", textAlign: "center" }}>Orden</th>}
                                <th style={{ minWidth: "140px" }}>Modelo</th>
                                <th>Tasa Intervención</th>
                                <th style={{ width: "80px" }}>X - 4</th>
                                <th style={{ width: "80px" }}>X - 3</th>
                                <th style={{ width: "80px" }}>X - 2</th>
                                <th style={{ width: "80px" }}>X - 1</th>
                                <th style={{ width: "80px" }}>X</th>
                                <th style={{ width: "80px" }}>X + 1</th>
                                <th style={{ width: "80px" }}>X + 2</th>
                                <th style={{ width: "80px" }}>X + 3</th>
                                <th style={{ width: "70px", textAlign: "center" }}>Activo</th>
                                {isAdmin && <th style={{ width: "150px" }}>Acciones</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                // Get all unique model IDs for this brand in the rates
                                let sortedModelIds = Array.from(new Set(brandRates.map(r => r.id_modelo).filter(Boolean)));
                                
                                // Use custom order if set, otherwise alphabetical
                                if (modelOrder[brand.id] && modelOrder[brand.id].length > 0) {
                                  const customOrder = modelOrder[brand.id];
                                  // Keep models that exist in rates, in custom order, then any new ones appended
                                  const ordered = customOrder.filter(id => sortedModelIds.includes(id));
                                  const remaining = sortedModelIds.filter(id => !ordered.includes(id));
                                  remaining.sort((a, b) => {
                                    const na = modelos.find(m => m.id === a)?.nombre || "";
                                    const nb = modelos.find(m => m.id === b)?.nombre || "";
                                    return na.localeCompare(nb);
                                  });
                                  sortedModelIds = [...ordered, ...remaining];
                                } else {
                                  sortedModelIds.sort((idA, idB) => {
                                    const nameA = modelos.find(m => m.id === idA)?.nombre || "";
                                    const nameB = modelos.find(m => m.id === idB)?.nombre || "";
                                    return nameA.localeCompare(nameB);
                                  });
                                }

                                if (sortedModelIds.length === 0) {
                                  return (
                                    <tr>
                                      <td colSpan={15} style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px" }}>
                                        No hay modelos de {brand.nombre} configurados en este plan.
                                      </td>
                                    </tr>
                                  );
                                }

                                const rateObj = brandInterventionRates.find(ir => ir.id_marca === brand.id) || { tasa_intervencion: 70, tipo_tasa: "porcentaje" };
                                const targetIntervention = rateObj.tasa_intervencion;
                                const isUnits = rateObj.tipo_tasa === "unidades";
                                const suffix = isUnits ? " uds" : "%";

                                // Models already used in this brand's rates (for dropdown filtering)
                                const usedModelIds = new Set(sortedModelIds);
                                const availableModelsForSwap = modelos.filter(m => m.marca_id === brand.id);

                                return sortedModelIds.map((modelId, modelIdx) => {
                                  const modelRates = brandRates.filter(r => r.id_modelo === modelId);
                                  
                                  let rateLess = modelRates.find(r => !r.tasa_intervencion_cumplida);
                                  let rateMore = modelRates.find(r => !!r.tasa_intervencion_cumplida);

                                  const modelName = modelos.find(m => m.id === modelId)?.nombre || "Sin Nombre";

                                  if (!rateLess) {
                                    rateLess = {
                                      id_modelo: modelId,
                                      tasa_intervencion_cumplida: false,
                                      rate_x_minus_4: 70, rate_x_minus_3: 80, rate_x_minus_2: 90, rate_x_minus_1: 100,
                                      rate_x: 120, rate_x_plus_1: 140, rate_x_plus_2: 160, rate_x_plus_3: 180,
                                      valor_objetivo: 1, activo: true,
                                    };
                                  }
                                  if (!rateMore) {
                                    rateMore = {
                                      id_modelo: modelId,
                                      tasa_intervencion_cumplida: true,
                                      rate_x_minus_4: 90, rate_x_minus_3: 100, rate_x_minus_2: 110, rate_x_minus_1: 120,
                                      rate_x: 140, rate_x_plus_1: 160, rate_x_plus_2: 180, rate_x_plus_3: 200,
                                      valor_objetivo: rateLess.valor_objetivo || 1,
                                      activo: rateLess.activo !== undefined ? rateLess.activo : true,
                                    };
                                  }

                                  const handleSpecificChange = (targetRate: any, field: string, val: any) => {
                                    const updated = rates.map(item => {
                                      if (item === targetRate || (item.id_modelo === modelId && item.tasa_intervencion_cumplida === targetRate.tasa_intervencion_cumplida && item.id_rate === targetRate.id_rate)) {
                                        return { ...item, [field]: val };
                                      }
                                      return item;
                                    });
                                    setRates(updated);
                                  };

                                  const handleDeleteModel = () => {
                                    setRates(rates.filter(item => item.id_modelo !== modelId));
                                    showNotification(`Modelo ${modelName} y sus tarifas eliminados con éxito`, "success");
                                  };

                                  // Dropdown options: current model + any unused models of this brand
                                  const dropdownOptions = availableModelsForSwap.filter(m => m.id === modelId || !usedModelIds.has(m.id));

                                  const isFirst = modelIdx === 0;
                                  const isLast = modelIdx === sortedModelIds.length - 1;

                                  return (
                                    <Fragment key={modelId}>
                                      {/* Fila 1: Tasa >= Target */}
                                      <tr style={{ borderBottom: "none" }}>
                                        {isAdmin && (
                                          <td rowSpan={2} style={{ textAlign: "center", verticalAlign: "middle", borderBottom: "1px solid var(--border-light)", padding: "4px" }}>
                                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}>
                                              <button
                                                type="button"
                                                onClick={() => handleMoveModel(sortedModelIds, modelId, "up")}
                                                disabled={isFirst}
                                                style={{
                                                  border: "none", background: isFirst ? "transparent" : "rgba(255,255,255,0.05)",
                                                  cursor: isFirst ? "default" : "pointer", padding: "2px 6px", borderRadius: "4px",
                                                  fontSize: "0.9rem", color: isFirst ? "var(--text-muted)" : "var(--text-primary)",
                                                  opacity: isFirst ? 0.3 : 1, transition: "all 0.15s"
                                                }}
                                                title="Subir"
                                              >▲</button>
                                              <button
                                                type="button"
                                                onClick={() => handleMoveModel(sortedModelIds, modelId, "down")}
                                                disabled={isLast}
                                                style={{
                                                  border: "none", background: isLast ? "transparent" : "rgba(255,255,255,0.05)",
                                                  cursor: isLast ? "default" : "pointer", padding: "2px 6px", borderRadius: "4px",
                                                  fontSize: "0.9rem", color: isLast ? "var(--text-muted)" : "var(--text-primary)",
                                                  opacity: isLast ? 0.3 : 1, transition: "all 0.15s"
                                                }}
                                                title="Bajar"
                                              >▼</button>
                                            </div>
                                          </td>
                                        )}
                                        <td rowSpan={2} style={{ fontWeight: 600, color: "var(--text-primary)", verticalAlign: "middle", borderBottom: "1px solid var(--border-light)" }}>
                                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                            {isAdmin && dropdownOptions.length > 1 ? (
                                              <select
                                                className="form-select"
                                                value={modelId}
                                                onChange={(e) => handleChangeModel(modelId, Number(e.target.value))}
                                                style={{ fontWeight: 600, fontSize: "0.85rem", padding: "4px 8px", width: "100%" }}
                                              >
                                                {dropdownOptions.map(m => (
                                                  <option key={m.id} value={m.id}>{m.nombre}</option>
                                                ))}
                                              </select>
                                            ) : (
                                              <span>{modelName}</span>
                                            )}

                                            {isAdmin && (
                                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                                <button
                                                  type="button"
                                                  onClick={() => handleCopyModel(rateLess, rateMore)}
                                                  style={{
                                                    border: "none", background: "rgba(124, 58, 237, 0.08)",
                                                    cursor: "pointer", padding: "4px 8px", borderRadius: "4px",
                                                    fontSize: "0.7rem", color: "var(--primary)", fontWeight: 600,
                                                    display: "flex", alignItems: "center", justifyContent: "center", gap: "4px"
                                                  }}
                                                  title="Copiar comisiones de este modelo (ambas tasas)"
                                                >
                                                  📦 Copiar Modelo
                                                </button>
                                                {modelClipboard && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handlePasteModel(modelId)}
                                                    style={{
                                                      border: "none", background: "rgba(16, 185, 129, 0.1)",
                                                      cursor: "pointer", padding: "4px 8px", borderRadius: "4px",
                                                      fontSize: "0.7rem", color: "var(--success)", fontWeight: 600,
                                                      display: "flex", alignItems: "center", justifyContent: "center", gap: "4px"
                                                    }}
                                                    title="Pegar comisiones del modelo copiado"
                                                  >
                                                    📋 Pegar Modelo
                                                  </button>
                                                )}
                                                {isFirst && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleApplyRatesToAllBelow(modelId)}
                                                    style={{
                                                      border: "none", background: "rgba(59, 130, 246, 0.08)",
                                                      cursor: "pointer", padding: "4px 8px", borderRadius: "4px",
                                                      fontSize: "0.7rem", color: "#2563eb", fontWeight: 600,
                                                      display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                                                      marginTop: "2px"
                                                    }}
                                                    title="Aplicar tarifas de este modelo a todos los inferiores de esta marca"
                                                  >
                                                    👇 Aplicar a los de abajo
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                        <td style={{ color: "var(--success)", fontWeight: 600, verticalAlign: "middle" }}>
                                          Tasa ≥ {targetIntervention}{suffix}
                                        </td>
                                        {["rate_x_minus_4", "rate_x_minus_3", "rate_x_minus_2", "rate_x_minus_1", "rate_x", "rate_x_plus_1", "rate_x_plus_2", "rate_x_plus_3"].map((col) => (
                                          <td key={col} style={{ borderBottom: "none" }}>
                                            <input
                                              type="number"
                                              className="form-input"
                                              value={rateMore[col] || 0}
                                              onChange={(e) => handleSpecificChange(rateMore, col, Number(e.target.value))}
                                              disabled={!isAdmin}
                                              style={{ padding: "4px 8px", fontSize: "0.85rem", width: "75px" }}
                                            />
                                          </td>
                                        ))}
                                        <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                                          <input
                                            type="checkbox"
                                            checked={rateMore.activo !== false}
                                            onChange={(e) => handleSpecificChange(rateMore, "activo", e.target.checked)}
                                            disabled={!isAdmin}
                                          />
                                        </td>
                                        {isAdmin && (
                                          <td style={{ verticalAlign: "middle" }}>
                                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                                              <button type="button" onClick={() => handleCopyRate(rateMore)}
                                                style={{ border: "none", background: "rgba(124,58,237,0.06)", cursor: "pointer", padding: "3px 7px", borderRadius: "4px", fontSize: "0.7rem", color: "var(--primary)", fontWeight: 600 }}
                                                title="Copiar valores de esta línea">📄 Copiar</button>
                                              {rateClipboard && (
                                                <button type="button" onClick={() => handlePasteRate(rateMore)}
                                                  style={{ border: "none", background: "rgba(16,185,129,0.08)", cursor: "pointer", padding: "3px 7px", borderRadius: "4px", fontSize: "0.7rem", color: "var(--success)", fontWeight: 600 }}
                                                  title="Pegar valores del portapapeles">📋 Pegar</button>
                                              )}
                                            </div>
                                          </td>
                                        )}
                                      </tr>
                                      {/* Fila 2: Tasa < Target */}
                                      <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                                        <td style={{ color: "var(--danger)", fontWeight: 600, verticalAlign: "middle", borderBottom: "1px solid var(--border-light)" }}>
                                          Tasa {"<"} {targetIntervention}{suffix}
                                        </td>
                                        {["rate_x_minus_4", "rate_x_minus_3", "rate_x_minus_2", "rate_x_minus_1", "rate_x", "rate_x_plus_1", "rate_x_plus_2", "rate_x_plus_3"].map((col) => (
                                          <td key={col} style={{ borderBottom: "1px solid var(--border-light)" }}>
                                            <input
                                              type="number"
                                              className="form-input"
                                              value={rateLess[col] || 0}
                                              onChange={(e) => handleSpecificChange(rateLess, col, Number(e.target.value))}
                                              disabled={!isAdmin}
                                              style={{ padding: "4px 8px", fontSize: "0.85rem", width: "75px" }}
                                            />
                                          </td>
                                        ))}
                                        <td style={{ textAlign: "center", verticalAlign: "middle", borderBottom: "1px solid var(--border-light)" }}>
                                          <input
                                            type="checkbox"
                                            checked={rateLess.activo !== false}
                                            onChange={(e) => handleSpecificChange(rateLess, "activo", e.target.checked)}
                                            disabled={!isAdmin}
                                          />
                                        </td>
                                        {isAdmin && (
                                          <td style={{ verticalAlign: "middle", borderBottom: "1px solid var(--border-light)" }}>
                                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                                              <button type="button" onClick={() => handleCopyRate(rateLess)}
                                                style={{ border: "none", background: "rgba(124,58,237,0.06)", cursor: "pointer", padding: "3px 7px", borderRadius: "4px", fontSize: "0.7rem", color: "var(--primary)", fontWeight: 600 }}
                                                title="Copiar valores de esta línea">📄 Copiar</button>
                                              {rateClipboard && (
                                                <button type="button" onClick={() => handlePasteRate(rateLess)}
                                                  style={{ border: "none", background: "rgba(16,185,129,0.08)", cursor: "pointer", padding: "3px 7px", borderRadius: "4px", fontSize: "0.7rem", color: "var(--success)", fontWeight: 600 }}
                                                  title="Pegar valores del portapapeles">📋 Pegar</button>
                                              )}
                                            </div>
                                          </td>
                                        )}
                                      </tr>
                                    </Fragment>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* TAB: USADOS / VO */}
            {activeTab === "usados" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>Tarifas de Vehículos Usados (BB / KM0 / etc.)</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>
                    Parámetros generales de cobro para vehículos usados no progresivos (Buyback, KM0, etc.). Las comisiones se pagan de forma diferencial: primera unidad vs unidades siguientes (resto), si se cumple con el mínimo de unidades a aplicar en el mes.
                  </p>

                  <div className="table-container">
                    <table className="table-premium" style={{ fontSize: "0.9rem" }}>
                      <thead>
                        <tr>
                          <th>Tipo de Usado</th>
                          <th style={{ width: "120px", textAlign: "center" }}>Valor Objetivo</th>
                          <th style={{ width: "150px" }}>1ª Unidad (€)</th>
                          <th style={{ width: "150px" }}>Siguientes (€)</th>
                          <th style={{ width: "120px", textAlign: "center" }}>Mín. Aplicar</th>
                          <th style={{ width: "100px", textAlign: "center" }}>Activo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usedRates.map((u, idx) => {
                          const handleChange = (field: string, val: any) => {
                            const updated = [...usedRates];
                            updated[idx] = { ...updated[idx], [field]: val };
                            setUsedRates(updated);
                          };

                          return (
                            <tr key={u.id_used_rate || idx}>
                              <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{u.tipo_usado}</td>
                              <td style={{ textAlign: "center" }}>
                                <input
                                  type="number"
                                  className="form-input"
                                  value={u.valor_objetivo}
                                  onChange={(e) => handleChange("valor_objetivo", Number(e.target.value))}
                                  disabled={!isAdmin}
                                  style={{ padding: "4px 8px", width: "80px", margin: "0 auto" }}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="form-input"
                                  value={u.importe_primera}
                                  onChange={(e) => handleChange("importe_primera", Number(e.target.value))}
                                  disabled={!isAdmin}
                                  style={{ padding: "4px 8px", width: "120px" }}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="form-input"
                                  value={u.importe_resto}
                                  onChange={(e) => handleChange("importe_resto", Number(e.target.value))}
                                  disabled={!isAdmin}
                                  style={{ padding: "4px 8px", width: "120px" }}
                                />
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <input
                                  type="number"
                                  className="form-input"
                                  value={u.min_aplicar}
                                  onChange={(e) => handleChange("min_aplicar", Number(e.target.value))}
                                  disabled={!isAdmin}
                                  style={{ padding: "4px 8px", width: "80px", margin: "0 auto" }}
                                />
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={u.activo}
                                  onChange={(e) => handleChange("activo", e.target.checked)}
                                  disabled={!isAdmin}
                                />
                              </td>
                            </tr>
                          );
                        })}
                        {usedRates.length === 0 && (
                          <tr>
                            <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px" }}>
                              No hay tarifas de vehículos usados configuradas en el plan.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginTop: "32px", borderTop: "1px solid var(--border-light)", paddingTop: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                    <div>
                      <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>Patrones de Comisionamiento Progresivos VO</h3>
                      <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px" }}>
                        Define esquemas progresivos para vendedores de VO. Cada patrón indica cuánto se comisiona y cuántos puntos aporta cada unidad vendida en orden secuencial (unidad 1, unidad 2, etc.).
                      </p>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          const newPattern = {
                            nombre: `Patrón VO ${voPatterns.length + 1}`,
                            aplica_a_vn: false,
                            activo: true,
                            tiers: [
                              { unidad: 1, importe: 150, valor_objetivo: 1 },
                              { unidad: 2, importe: 180, valor_objetivo: 1 },
                              { unidad: 3, importe: 200, valor_objetivo: 1 }
                            ]
                          };
                          setVoPatterns([...voPatterns, newPattern]);
                        }}
                      >
                        ➕ Añadir Nuevo Patrón VO
                      </button>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    {voPatterns.map((pat, pIdx) => {
                      let tiersList: any[] = [];
                      try {
                        tiersList = typeof pat.tiers === "string" ? JSON.parse(pat.tiers) : (pat.tiers || []);
                      } catch (e) {
                        tiersList = [];
                      }

                      const updatePatternName = (newName: string) => {
                        const updated = [...voPatterns];
                        updated[pIdx] = { ...updated[pIdx], nombre: newName };
                        setVoPatterns(updated);
                      };

                      const updateTiers = (newTiers: any[]) => {
                        const updated = [...voPatterns];
                        updated[pIdx] = { ...updated[pIdx], tiers: newTiers };
                        setVoPatterns(updated);
                      };

                      const handleAddTier = () => {
                        const nextUnit = tiersList.length + 1;
                        const lastTier = tiersList[tiersList.length - 1] || { importe: 150, valor_objetivo: 1 };
                        const newTiers = [...tiersList, { unidad: nextUnit, importe: lastTier.importe, valor_objetivo: lastTier.valor_objetivo }];
                        updateTiers(newTiers);
                      };

                      const handleRemoveTier = (tIdx: number) => {
                        const newTiers = tiersList.filter((_, i) => i !== tIdx).map((t, idx) => ({
                          ...t,
                          unidad: idx + 1
                        }));
                        updateTiers(newTiers);
                      };

                      const handleTierChange = (tIdx: number, field: string, val: any) => {
                        const newTiers = [...tiersList];
                        newTiers[tIdx] = { ...newTiers[tIdx], [field]: val };
                        updateTiers(newTiers);
                      };

                      const handleRemovePattern = () => {
                        if (!confirm(`¿Estás seguro de eliminar el patrón "${pat.nombre}"?`)) return;
                        setVoPatterns(voPatterns.filter((_, i) => i !== pIdx));
                      };

                      return (
                        <div key={pIdx} className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", background: "rgba(255, 255, 255, 0.02)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1, minWidth: "200px" }}>
                              <span style={{ fontSize: "1.1rem" }}>📋</span>
                              <input
                                type="text"
                                className="form-input"
                                value={pat.nombre}
                                onChange={(e) => updatePatternName(e.target.value)}
                                disabled={!isAdmin}
                                style={{ fontWeight: 600, fontSize: "1rem", border: "none", background: "transparent", borderBottom: "1px dashed var(--border-light)", padding: "2px 6px", width: "220px" }}
                              />
                              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: isAdmin ? "pointer" : "default", color: pat.aplica_a_vn ? "var(--primary-light, #60a5fa)" : "var(--text-secondary)", background: "rgba(255, 255, 255, 0.03)", padding: "4px 12px", borderRadius: "6px", border: pat.aplica_a_vn ? "1px solid rgba(96, 165, 250, 0.4)" : "1px solid var(--border-light)" }}>
                                <input
                                  type="checkbox"
                                  checked={!!pat.aplica_a_vn}
                                  onChange={(e) => {
                                    const updated = [...voPatterns];
                                    updated[pIdx] = { ...updated[pIdx], aplica_a_vn: e.target.checked };
                                    setVoPatterns(updated);
                                  }}
                                  disabled={!isAdmin}
                                  style={{ width: "16px", height: "16px", cursor: isAdmin ? "pointer" : "default" }}
                                />
                                <span>Afecta / Aplica a Vendedores de VN al vender VO</span>
                              </label>
                            </div>
                            {isAdmin && (
                              <button
                                type="button"
                                className="btn"
                                onClick={handleRemovePattern}
                                style={{
                                  padding: "4px 8px", fontSize: "0.75rem", color: "var(--danger)",
                                  background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)",
                                  borderRadius: "var(--radius-sm)", cursor: "pointer"
                                }}
                              >
                                🗑️ Eliminar Patrón
                              </button>
                            )}
                          </div>

                          <div className="table-container">
                            <table className="table-premium" style={{ fontSize: "0.85rem" }}>
                              <thead>
                                <tr>
                                  <th style={{ width: "80px", textAlign: "center" }}>Secuencia</th>
                                  <th>Unidad Vendida</th>
                                  <th style={{ width: "150px" }}>Comisión (€)</th>
                                  <th style={{ width: "150px", textAlign: "center" }}>Valor Objetivo (Puntos)</th>
                                  {isAdmin && <th style={{ width: "80px" }}>Acción</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {tiersList.map((t, tIdx) => (
                                  <tr key={tIdx}>
                                    <td style={{ textAlign: "center", fontWeight: 600, color: "var(--text-secondary)" }}>#{tIdx + 1}</td>
                                    <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                                      {t.unidad === 1 ? "1ª Unidad de VO" : `${t.unidad}ª Unidad de VO`}
                                    </td>
                                    <td>
                                      <input
                                        type="number"
                                        className="form-input"
                                        value={t.importe}
                                        onChange={(e) => handleTierChange(tIdx, "importe", Number(e.target.value))}
                                        disabled={!isAdmin}
                                        style={{ padding: "4px 8px", width: "100px" }}
                                      />
                                    </td>
                                    <td style={{ textAlign: "center" }}>
                                      <input
                                        type="number"
                                        className="form-input"
                                        value={t.valor_objetivo}
                                        onChange={(e) => handleTierChange(tIdx, "valor_objetivo", Number(e.target.value))}
                                        disabled={!isAdmin}
                                        style={{ padding: "4px 8px", width: "80px", margin: "0 auto" }}
                                      />
                                    </td>
                                    {isAdmin && (
                                      <td>
                                        <button
                                          type="button"
                                          className="btn"
                                          onClick={() => handleRemoveTier(tIdx)}
                                          style={{
                                            padding: "2px 6px", fontSize: "0.7rem", color: "var(--danger)",
                                            background: "transparent", border: "1px solid rgba(239, 68, 68, 0.15)",
                                            borderRadius: "var(--radius-sm)"
                                          }}
                                        >
                                          Quitar
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                                {tiersList.length === 0 && (
                                  <tr>
                                    <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: "16px" }}>
                                      No hay tramos configurados para este patrón. Añade el primer tramo.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          {isAdmin && (
                            <div style={{ display: "flex", justifyContent: "flex-start" }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleAddTier}
                                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                              >
                                ➕ Añadir Tramo (Unidad {tiersList.length + 1})
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {voPatterns.length === 0 && (
                      <div className="glass-panel" style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>
                        No hay patrones de comisionamiento de VO configurados. Haz clic en &quot;Añadir Nuevo Patrón VO&quot; para empezar.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* TAB: REGLAS */}
            {activeTab === "reglas" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>Financiación / Reglas del Plan</h3>
                
                {isAdmin && (
                  <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", background: "rgba(255, 255, 255, 0.02)" }}>
                    <h4 style={{ margin: 0, fontSize: "1rem" }}>Añadir Nueva Regla</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                      <div className="form-group">
                        <label className="form-label">Nombre de la Regla</label>
                        <input
                          type="text"
                          className="form-input"
                          value={newRuleName}
                          onChange={(e) => setNewRuleName(e.target.value)}
                          placeholder="Ej. Comisión Afectación Dacia"
                        />
                      </div>
                      
                      <div className="form-group">
                        <label className="form-label">Tipo de Evento / Trigger</label>
                        <select
                          className="form-select"
                          value={newRuleType}
                          onChange={(e) => setNewRuleType(e.target.value)}
                        >
                          <option value="pedido">Pedido (Fecha de Pedido)</option>
                          <option value="afectacion">Afectación (Fecha de Afectación)</option>
                          <option value="matriculacion">Matriculación (Fecha de Matriculación)</option>
                          <option value="credito">Crédito (Financiación Normal)</option>
                          <option value="preference">Preference (Financiación Preference)</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Filtrar por Marca (Opcional)</label>
                        <select
                          className="form-select"
                          value={newRuleMarca}
                          onChange={(e) => {
                            setNewRuleMarca(e.target.value);
                            setNewRuleModelo("");
                          }}
                        >
                          <option value="">Todas las marcas</option>
                          {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Filtrar por Modelo (Opcional)</label>
                        <select
                          className="form-select"
                          value={newRuleModelo}
                          onChange={(e) => setNewRuleModelo(e.target.value)}
                          disabled={!newRuleMarca}
                        >
                          <option value="">Todos los modelos</option>
                          {modelos.filter(m => m.marca_id === Number(newRuleMarca)).map(m => (
                            <option key={m.id} value={m.id}>{m.nombre}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Tasa Intervención Financiera</label>
                        <select
                          className="form-select"
                          value={newRuleTasaIntervencion}
                          onChange={(e) => setNewRuleTasaIntervencion(e.target.value)}
                        >
                          <option value="">Cualquiera / Siempre</option>
                          <option value="true">Tasa ≥ Objetivo (Tasa OK)</option>
                          <option value="false">Tasa &lt; Objetivo (Tasa Baja)</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ flexDirection: "row", alignItems: "center", gap: "8px", paddingTop: "28px" }}>
                        <input
                          type="checkbox"
                          id="ruleAfectaObj"
                          checked={newRuleAfectaObj}
                          onChange={(e) => setNewRuleAfectaObj(e.target.checked)}
                        />
                        <label htmlFor="ruleAfectaObj" style={{ cursor: "pointer", fontSize: "0.85rem" }}>Afecta al objetivo</label>
                      </div>

                      {newRuleAfectaObj && (
                        <div className="form-group">
                          <label className="form-label">Valor para objetivo</label>
                          <input
                            type="number"
                            className="form-input"
                            value={newRuleValObj}
                            onChange={(e) => setNewRuleValObj(e.target.value)}
                          />
                        </div>
                      )}

                      <div className="form-group" style={{ flexDirection: "row", alignItems: "center", gap: "8px", paddingTop: "28px" }}>
                        <input
                          type="checkbox"
                          id="ruleAfectaCom"
                          checked={newRuleAfectaCom}
                          onChange={(e) => setNewRuleAfectaCom(e.target.checked)}
                        />
                        <label htmlFor="ruleAfectaCom" style={{ cursor: "pointer", fontSize: "0.85rem" }}>Afecta comisión económica</label>
                      </div>

                      {newRuleAfectaCom && (
                        <div className="form-group">
                          <label className="form-label">Importe (€)</label>
                          <input
                            type="number"
                            className="form-input"
                            value={newRuleImporte}
                            onChange={(e) => setNewRuleImporte(e.target.value)}
                          />
                        </div>
                      )}
                      {newRuleType === "preference" && (
                        <div className="form-group" style={{ flexDirection: "row", alignItems: "center", gap: "8px", paddingTop: "28px" }}>
                          <input
                            type="checkbox"
                            id="newRuleLigarACredito"
                            checked={newRuleLigarACredito}
                            onChange={(e) => setNewRuleLigarACredito(e.target.checked)}
                          />
                          <label htmlFor="newRuleLigarACredito" style={{ cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, color: "var(--primary)" }}>🔗 Ligar a Crédito</label>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleAddRule}
                      className="btn btn-secondary"
                      style={{ alignSelf: "flex-end", padding: "10px 20px" }}
                    >
                      ➕ Añadir Regla al Plan
                    </button>
                  </div>
                )}

                <div className="table-container">
                  <table className="table-premium" style={{ fontSize: "0.9rem" }}>
                    <thead>
                      <tr>
                        <th>Nombre de la Regla</th>
                        <th>Trigger</th>
                        <th>Filtro Marca</th>
                        <th>Filtro Modelo</th>
                        <th>Tasa Financ.</th>
                        <th style={{ textAlign: "center" }}>Ligar a Crédito</th>
                        <th style={{ textAlign: "center" }}>Afecta Objetivo</th>
                        <th style={{ textAlign: "center" }}>Afecta Comisión</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((r, idx) => {
                        const isEditing = editingRuleIdx === idx;
                        const mName = r.id_marca ? marcas.find(m => m.id === r.id_marca)?.nombre : "Todas";
                        const modName = r.id_modelo ? modelos.find(m => m.id === r.id_modelo)?.nombre : "Todos";
                        
                        if (isEditing) {
                          return (
                            <tr key={idx}>
                              <td>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={editingRuleName}
                                  onChange={(e) => setEditingRuleName(e.target.value)}
                                  style={{ width: "100%", padding: "4px 8px" }}
                                />
                              </td>
                              <td>
                                <select
                                  className="form-select"
                                  value={editingRuleType}
                                  onChange={(e) => setEditingRuleType(e.target.value)}
                                  style={{ padding: "4px 6px", fontSize: "0.82rem" }}
                                >
                                  <option value="pedido">Pedido</option>
                                  <option value="afectacion">Afectación</option>
                                  <option value="matriculacion">Matriculación</option>
                                  <option value="credito">Crédito</option>
                                  <option value="preference">Preference</option>
                                </select>
                              </td>
                              <td>
                                <select
                                  className="form-select"
                                  value={editingRuleMarca}
                                  onChange={(e) => {
                                    setEditingRuleMarca(e.target.value);
                                    setEditingRuleModelo("");
                                  }}
                                  style={{ padding: "4px 6px", fontSize: "0.82rem" }}
                                >
                                  <option value="">Todas</option>
                                  {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                                </select>
                              </td>
                              <td>
                                <select
                                  className="form-select"
                                  value={editingRuleModelo}
                                  onChange={(e) => setEditingRuleModelo(e.target.value)}
                                  disabled={!editingRuleMarca}
                                  style={{ padding: "4px 6px", fontSize: "0.82rem" }}
                                >
                                  <option value="">Todos</option>
                                  {modelos.filter(m => m.marca_id === Number(editingRuleMarca)).map(m => (
                                    <option key={m.id} value={m.id}>{m.nombre}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  className="form-select"
                                  value={editingRuleTasaIntervencion}
                                  onChange={(e) => setEditingRuleTasaIntervencion(e.target.value)}
                                  style={{ padding: "4px 6px", fontSize: "0.82rem" }}
                                >
                                  <option value="">Cualquiera</option>
                                  <option value="true">Tasa ≥ Obj.</option>
                                  <option value="false">Tasa &lt; Obj.</option>
                                </select>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                {editingRuleType === "preference" ? (
                                  <input
                                    type="checkbox"
                                    checked={editingRuleLigarACredito}
                                    onChange={(e) => setEditingRuleLigarACredito(e.target.checked)}
                                  />
                                ) : (
                                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>-</span>
                                )}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                                  <input
                                    type="checkbox"
                                    checked={editingRuleAfectaObj}
                                    onChange={(e) => setEditingRuleAfectaObj(e.target.checked)}
                                  />
                                  {editingRuleAfectaObj && (
                                    <input
                                      type="number"
                                      className="form-input"
                                      value={editingRuleValObj}
                                      onChange={(e) => setEditingRuleValObj(e.target.value)}
                                      style={{ width: "60px", padding: "2px 4px", fontSize: "0.8rem", textAlign: "center" }}
                                    />
                                  )}
                                </div>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                                  <input
                                    type="checkbox"
                                    checked={editingRuleAfectaCom}
                                    onChange={(e) => setEditingRuleAfectaCom(e.target.checked)}
                                  />
                                  {editingRuleAfectaCom && (
                                    <input
                                      type="number"
                                      className="form-input"
                                      value={editingRuleImporte}
                                      onChange={(e) => setEditingRuleImporte(e.target.value)}
                                      style={{ width: "70px", padding: "2px 4px", fontSize: "0.8rem", textAlign: "center" }}
                                    />
                                  )}
                                </div>
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  <button
                                    onClick={() => handleSaveRuleEdit(idx)}
                                    className="btn btn-primary"
                                    style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "var(--radius-sm)" }}
                                  >
                                    OK
                                  </button>
                                  <button
                                    onClick={handleCancelRuleEdit}
                                    className="btn btn-secondary"
                                    style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "var(--radius-sm)" }}
                                  >
                                    X
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={idx}>
                            <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{r.nombre}</td>
                            <td><span className="badge badge-vendedor" style={{ fontSize: "0.7rem" }}>{r.tipo_evento === "credito" ? "crédito" : r.tipo_evento}</span></td>
                            <td>{mName}</td>
                            <td>{modName}</td>
                            <td>
                              {r.tasa_intervencion_cumplida === true ? (
                                <span className="badge badge-tienda" style={{ fontSize: "0.75rem", backgroundColor: "rgba(16, 185, 129, 0.1)", color: "var(--success)" }}>Tasa ≥ Obj.</span>
                              ) : r.tasa_intervencion_cumplida === false ? (
                                <span className="badge badge-admin" style={{ fontSize: "0.75rem", backgroundColor: "rgba(239, 68, 68, 0.1)", color: "var(--danger)" }}>Tasa &lt; Obj.</span>
                              ) : (
                                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Cualquiera</span>
                              )}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {r.tipo_evento === "preference" ? (
                                r.ligar_a_credito ? (
                                  <span style={{ color: "var(--primary)", fontWeight: 600 }}>🔗 Sí</span>
                                ) : (
                                  <span style={{ color: "var(--text-muted)" }}>❌ No</span>
                                )
                              ) : (
                                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>-</span>
                              )}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {r.afecta_objetivo ? `✅ (+${r.valor_objetivo})` : "❌ No"}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {r.afecta_comision ? `✅ (${r.importe} €)` : "❌ No"}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button
                                  onClick={() => handleStartEditRule(idx)}
                                  disabled={!isAdmin}
                                  className="btn btn-secondary"
                                  style={{
                                    padding: "4px 8px", fontSize: "0.75rem",
                                    borderRadius: "var(--radius-sm)", cursor: "pointer"
                                  }}
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleDeleteRule(idx)}
                                  disabled={!isAdmin}
                                  className="btn"
                                  style={{
                                    padding: "4px 8px", fontSize: "0.75rem", color: "var(--danger)",
                                    background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)",
                                    borderRadius: "var(--radius-sm)", cursor: "pointer"
                                  }}
                                >
                                  Quitar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {rules.length === 0 && (
                        <tr>
                          <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px" }}>
                            No hay reglas especiales configuradas en el plan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: BONUS */}
            {activeTab === "bonus" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>Bonus de Campaña Dinámicos</h3>
                
                {isAdmin && (
                  <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", background: "rgba(255, 255, 255, 0.02)" }}>
                    <h4 style={{ margin: 0, fontSize: "1rem" }}>Añadir Bonus Personalizado</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                      <div className="form-group">
                        <label className="form-label">Nombre del Bonus</label>
                        <input
                          type="text"
                          className="form-input"
                          value={newBonusName}
                          onChange={(e) => setNewBonusName(e.target.value)}
                          placeholder="Ej. Campaña Eléctricos verano"
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Descripción</label>
                        <input
                          type="text"
                          className="form-input"
                          value={newBonusDesc}
                          onChange={(e) => setNewBonusDesc(e.target.value)}
                          placeholder="Breve explicación"
                        />
                      </div>

                       <div className="form-group">
                        <label className="form-label">Trigger</label>
                        <select
                          className="form-select"
                          value={newBonusType}
                          onChange={(e) => setNewBonusType(e.target.value)}
                        >
                          <option value="afectacion">Afectación</option>
                          <option value="matriculacion">Matriculación</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Filtrar Marca (Opcional)</label>
                        <select
                          className="form-select"
                          value={newBonusMarca}
                          onChange={(e) => {
                            setNewBonusMarca(e.target.value);
                            setNewBonusModelo("");
                          }}
                        >
                          <option value="">Todas las marcas</option>
                          {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Filtrar Modelo (Opcional)</label>
                        <select
                          className="form-select"
                          value={newBonusModelo}
                          onChange={(e) => setNewBonusModelo(e.target.value)}
                          disabled={!newBonusMarca}
                        >
                          <option value="">Todos los modelos</option>
                          {modelos.filter(m => m.marca_id === Number(newBonusMarca)).map(m => (
                            <option key={m.id} value={m.id}>{m.nombre}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Tipo de Vehículo</label>
                        <select
                          className="form-select"
                          value={newBonusTypeVehiculo}
                          onChange={(e) => setNewBonusTypeVehiculo(e.target.value)}
                        >
                          <option value="cualquiera">Cualquiera</option>
                          <option value="nuevo">Nuevo</option>
                          <option value="usado">Usado / VO</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Importe Comisión (€)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={newBonusImporte}
                          onChange={(e) => setNewBonusImporte(e.target.value)}
                        />
                      </div>

                      <div className="form-group" style={{ flexDirection: "row", alignItems: "center", gap: "8px", paddingTop: "28px" }}>
                        <input
                          type="checkbox"
                          id="bonusAfectaObj"
                          checked={newBonusAfectaObj}
                          onChange={(e) => setNewBonusAfectaObj(e.target.checked)}
                        />
                        <label htmlFor="bonusAfectaObj" style={{ cursor: "pointer", fontSize: "0.85rem" }}>Suma al objetivo del mes</label>
                      </div>

                      {newBonusAfectaObj && (
                        <div className="form-group">
                          <label className="form-label">Valor Objetivo</label>
                          <input
                            type="number"
                            className="form-input"
                            value={newBonusValObj}
                            onChange={(e) => setNewBonusValObj(e.target.value)}
                          />
                        </div>
                      )}

                      <div className="form-group">
                        <label className="form-label">Fecha Inicio Venta (Opcional)</label>
                        <input
                          type="date"
                          className="form-input"
                          value={newBonusStart}
                          onChange={(e) => setNewBonusStart(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Fecha Fin Venta (Opcional)</label>
                        <input
                          type="date"
                          className="form-input"
                          value={newBonusEnd}
                          onChange={(e) => setNewBonusEnd(e.target.value)}
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleAddBonus}
                      className="btn btn-secondary"
                      style={{ alignSelf: "flex-end", padding: "10px 20px" }}
                    >
                      ➕ Añadir Bonus al Plan
                    </button>
                  </div>
                )}

                <div className="table-container">
                  <table className="table-premium" style={{ fontSize: "0.9rem" }}>
                    <thead>
                      <tr>
                        <th>Nombre / Descripción</th>
                        <th>Trigger</th>
                        <th>Marca/Modelo</th>
                        <th style={{ textAlign: "right" }}>Importe (€)</th>
                        <th style={{ textAlign: "center" }}>Afecta Objetivo</th>
                        <th style={{ textAlign: "center" }}>Fechas Validez</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bonusRules.map((b, idx) => {
                        if (b.es_penalizacion) return null;
                        const mName = b.id_marca ? marcas.find(m => m.id === b.id_marca)?.nombre : "Todas";
                        const modName = b.id_modelo ? modelos.find(m => m.id === b.id_modelo)?.nombre : "Todos";
                        const isEditing = editingBonusIdx === idx;

                        if (isEditing) {
                          return (
                            <tr key={idx} style={{ background: "rgba(255, 255, 255, 0.02)" }}>
                              <td>
                                <input 
                                  type="text" 
                                  className="form-input" 
                                  value={editingBonusName} 
                                  onChange={e => setEditingBonusName(e.target.value)} 
                                  style={{ padding: "4px 8px", fontSize: "0.85rem", width: "100%", marginBottom: "4px" }} 
                                  placeholder="Nombre del bonus" 
                                />
                                <input 
                                  type="text" 
                                  className="form-input" 
                                  value={editingBonusDesc} 
                                  onChange={e => setEditingBonusDesc(e.target.value)} 
                                  style={{ padding: "4px 8px", fontSize: "0.75rem", width: "100%" }} 
                                  placeholder="Descripción" 
                                />
                              </td>
                              <td>
                                <select 
                                  className="form-select" 
                                  value={editingBonusType} 
                                  onChange={e => setEditingBonusType(e.target.value)} 
                                  style={{ padding: "4px 8px", fontSize: "0.8rem", width: "100%", marginBottom: "4px" }}
                                >
                                  <option value="afectacion">Afectación</option>
                                  <option value="matriculacion">Matriculación</option>
                                </select>
                                <select 
                                  className="form-select" 
                                  value={editingBonusTypeVehiculo} 
                                  onChange={e => setEditingBonusTypeVehiculo(e.target.value)} 
                                  style={{ padding: "4px 8px", fontSize: "0.8rem", width: "100%" }}
                                >
                                  <option value="cualquiera">Cualquiera</option>
                                  <option value="nuevo">Nuevo</option>
                                  <option value="usado">Usado</option>
                                </select>
                              </td>
                              <td>
                                <select 
                                  className="form-select" 
                                  value={editingBonusMarca} 
                                  onChange={e => {
                                    setEditingBonusMarca(e.target.value);
                                    setEditingBonusModelo("");
                                  }} 
                                  style={{ padding: "4px 8px", fontSize: "0.8rem", width: "100%", marginBottom: "4px" }}
                                >
                                  <option value="">Todas</option>
                                  {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                                </select>
                                <select 
                                  className="form-select" 
                                  value={editingBonusModelo} 
                                  onChange={e => setEditingBonusModelo(e.target.value)} 
                                  disabled={!editingBonusMarca} 
                                  style={{ padding: "4px 8px", fontSize: "0.8rem", width: "100%" }}
                                >
                                  <option value="">Todos</option>
                                  {modelos.filter(m => m.marca_id === Number(editingBonusMarca)).map(m => (
                                    <option key={m.id} value={m.id}>{m.nombre}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <input 
                                  type="number" 
                                  className="form-input" 
                                  value={editingBonusImporte} 
                                  onChange={e => setEditingBonusImporte(e.target.value)} 
                                  style={{ padding: "4px 8px", fontSize: "0.85rem", width: "80px", textAlign: "right", display: "inline-block" }} 
                                />
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                                  <label style={{ display: "flex", gap: "4px", fontSize: "0.8rem", cursor: "pointer", alignItems: "center" }}>
                                    <input 
                                      type="checkbox" 
                                      checked={editingBonusAfectaObj} 
                                      onChange={e => setEditingBonusAfectaObj(e.target.checked)} 
                                    />
                                    Sí
                                  </label>
                                  {editingBonusAfectaObj && (
                                    <input 
                                      type="number" 
                                      className="form-input" 
                                      value={editingBonusValObj} 
                                      onChange={e => setEditingBonusValObj(e.target.value)} 
                                      style={{ padding: "2px 6px", fontSize: "0.8rem", width: "60px", textAlign: "center" }} 
                                    />
                                  )}
                                </div>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  <input 
                                    type="date" 
                                    className="form-input" 
                                    value={editingBonusStart} 
                                    onChange={e => setEditingBonusStart(e.target.value)} 
                                    style={{ padding: "2px 4px", fontSize: "0.75rem", width: "110px" }} 
                                  />
                                  <input 
                                    type="date" 
                                    className="form-input" 
                                    value={editingBonusEnd} 
                                    onChange={e => setEditingBonusEnd(e.target.value)} 
                                    style={{ padding: "2px 4px", fontSize: "0.75rem", width: "110px" }} 
                                  />
                                </div>
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: "4px", flexDirection: "column" }}>
                                  <button 
                                    onClick={() => handleSaveBonusEdit(idx)} 
                                    className="btn" 
                                    style={{ padding: "4px 8px", fontSize: "0.75rem", backgroundColor: "var(--success)", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                  >
                                    Guardar
                                  </button>
                                  <button 
                                    onClick={() => setEditingBonusIdx(null)} 
                                    className="btn btn-secondary" 
                                    style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "4px", cursor: "pointer" }}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={idx}>
                            <td>
                              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{b.nombre}</div>
                              {b.descripcion && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{b.descripcion}</div>}
                            </td>
                            <td>
                              <span className="badge badge-tienda" style={{ fontSize: "0.7rem", marginRight: "4px" }}>{b.tipo_evento}</span>
                              <span className={`badge ${b.tipo_vehiculo === 'nuevo' ? 'badge-admin' : b.tipo_vehiculo === 'usado' ? 'badge-vendedor' : 'badge-tienda'}`} style={{ fontSize: "0.7rem" }}>
                                {b.tipo_vehiculo === 'nuevo' ? "VN" : b.tipo_vehiculo === 'usado' ? "VO" : "Cualquiera"}
                              </span>
                            </td>
                            <td>{mName} / {modName}</td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>{b.importe} €</td>
                            <td style={{ textAlign: "center" }}>
                              {b.afecta_objetivo ? `✅ (+${b.valor_objetivo})` : "❌ No"}
                            </td>
                            <td style={{ textAlign: "center", fontSize: "0.8rem" }}>
                              {b.fecha_inicio || b.fecha_fin ? (
                                <>
                                  {b.fecha_inicio ? formatDate(b.fecha_inicio) : " - "}
                                  {" al "}
                                  {b.fecha_fin ? formatDate(b.fecha_fin) : " - "}
                                </>
                              ) : "Siempre"}
                            </td>
                            <td>
                              {isAdmin && (
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button
                                    onClick={() => handleStartEditBonus(idx, b)}
                                    className="btn btn-secondary"
                                    style={{
                                      padding: "4px 8px", fontSize: "0.75rem", cursor: "pointer"
                                    }}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    onClick={() => handleDeleteBonus(idx)}
                                    className="btn"
                                    style={{
                                      padding: "4px 8px", fontSize: "0.75rem", color: "var(--danger)",
                                      background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)",
                                      borderRadius: "var(--radius-sm)", cursor: "pointer"
                                    }}
                                  >
                                    Quitar
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {bonusRules.filter(b => !b.es_penalizacion).length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px" }}>
                            No hay bonus de campaña dinámicos configurados en el plan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "penalizaciones" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <h3 style={{ fontSize: "1.1rem", color: "var(--text-primary)", margin: 0 }}>⚠️ Penalización Única Global</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>
                    Establece un importe fijo de penalización que se restará de forma directa a las comisiones del total liquidado del mes.
                  </p>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                    <div className="form-group">
                      <label className="form-label">Importe Fijo (se restará)</label>
                      <div style={{ position: "relative" }}>
                        <input
                          type="number"
                          className="form-input"
                          value={Math.abs(penalizacionImporte)}
                          onChange={(e) => setPenalizacionImporte(e.target.value ? -Math.abs(Number(e.target.value)) : 0)}
                          placeholder="Ej. 9"
                          disabled={!isAdmin}
                          style={{ paddingRight: "30px" }}
                        />
                        <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>€</span>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Título de la Penalización</label>
                      <input
                        type="text"
                        className="form-input"
                        value={penalizacionTitulo}
                        onChange={(e) => setPenalizacionTitulo(e.target.value)}
                        placeholder="Ej. Penalización retraso documentación"
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="form-group" style={{ gridColumn: "span 2" }}>
                      <label className="form-label">Descripción Detallada</label>
                      <input
                        type="text"
                        className="form-input"
                        value={penalizacionDescripcion}
                        onChange={(e) => setPenalizacionDescripcion(e.target.value)}
                        placeholder="Explicación del porqué de esta penalización que aparecerá al pasar el ratón"
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                </div>

                <hr style={{ border: "0", borderTop: "1px solid var(--border-light)", margin: "8px 0" }} />

                <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>Reglas de Penalización Dinámicas</h3>
                
                {isAdmin && (
                  <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", background: "rgba(255, 255, 255, 0.02)" }}>
                    <h4 style={{ margin: 0, fontSize: "1rem" }}>Añadir Regla de Penalización</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                      <div className="form-group">
                        <label className="form-label">Nombre del Descuento/Penalización</label>
                        <input
                          type="text"
                          className="form-input"
                          value={newPenaltyName}
                          onChange={(e) => setNewPenaltyName(e.target.value)}
                          placeholder="Ej. Penalización VN sin matricular"
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Descripción</label>
                        <input
                          type="text"
                          className="form-input"
                          value={newPenaltyDesc}
                          onChange={(e) => setNewPenaltyDesc(e.target.value)}
                          placeholder="Breve explicación"
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Tipo de Evento</label>
                        <select
                          className="form-select"
                          value={newPenaltyType}
                          onChange={(e) => setNewPenaltyType(e.target.value)}
                        >
                          <option value="pedido">Pedido</option>
                          <option value="afectacion">Afectación</option>
                          <option value="matriculacion">Matriculación</option>
                          <option value="financiacion">Financiación estándar (RCI)</option>
                          <option value="preference">Preference / BOX3</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Tipo de Vehículo</label>
                        <select
                          className="form-select"
                          value={newPenaltyTypeVehiculo}
                          onChange={(e) => setNewPenaltyTypeVehiculo(e.target.value)}
                        >
                          <option value="cualquiera">Cualquiera</option>
                          <option value="nuevo">Nuevo (VN)</option>
                          <option value="usado">Usado (VO)</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Marca (Opcional)</label>
                        <select
                          className="form-select"
                          value={newPenaltyMarca}
                          onChange={(e) => {
                            setNewPenaltyMarca(e.target.value);
                            setNewPenaltyModelo("");
                          }}
                        >
                          <option value="">Cualquier marca</option>
                          {marcas.map(m => (
                            <option key={m.id} value={m.id}>{m.nombre}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Modelo (Opcional)</label>
                        <select
                          className="form-select"
                          value={newPenaltyModelo}
                          onChange={(e) => setNewPenaltyModelo(e.target.value)}
                          disabled={!newPenaltyMarca}
                        >
                          <option value="">Cualquier modelo</option>
                          {modelos
                            .filter(m => m.marca_id === Number(newPenaltyMarca))
                            .map(m => (
                              <option key={m.id} value={m.id}>{m.nombre}</option>
                            ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Importe a Descontar (€)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={newPenaltyImporte}
                          onChange={(e) => setNewPenaltyImporte(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Fecha Inicio (Opcional)</label>
                        <input
                          type="date"
                          className="form-input"
                          value={newPenaltyStart}
                          onChange={(e) => setNewPenaltyStart(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Fecha Fin (Opcional)</label>
                        <input
                          type="date"
                          className="form-input"
                          value={newPenaltyEnd}
                          onChange={(e) => setNewPenaltyEnd(e.target.value)}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddPenalty}
                      className="btn btn-secondary"
                      style={{ alignSelf: "flex-end", marginTop: "16px", padding: "10px 20px" }}
                    >
                      ➕ Añadir Regla Penalización
                    </button>
                  </div>
                )}

                <div className="table-container">
                  <table className="table-premium" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>
                        <th style={{ padding: "12px 16px", textAlign: "left" }}>Nombre / Concepto</th>
                        <th style={{ padding: "12px 16px", textAlign: "left" }}>Trigger</th>
                        <th style={{ padding: "12px 16px", textAlign: "left" }}>Vehículo</th>
                        <th style={{ padding: "12px 16px", textAlign: "left" }}>Restricciones</th>
                        <th style={{ padding: "12px 16px", textAlign: "right" }}>Descuento (€)</th>
                        {isAdmin && <th style={{ padding: "12px 16px", textAlign: "center", width: "100px" }}>Acción</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {bonusRules.filter(b => b.es_penalizacion).length > 0 ? (
                        bonusRules
                          .map((b, idx) => ({ rule: b, originalIndex: idx }))
                          .filter(item => item.rule.es_penalizacion)
                          .map((item) => {
                            const b = item.rule;
                            const idx = item.originalIndex;
                            const marcaObj = b.id_marca ? marcas.find(m => m.id === b.id_marca) : null;
                            const modeloObj = b.id_modelo ? modelos.find(m => m.id === b.id_modelo) : null;
                            
                            return (
                              <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                <td style={{ padding: "12px 16px" }}>
                                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{b.nombre}</div>
                                  {b.descripcion && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{b.descripcion}</div>}
                                </td>
                                <td style={{ padding: "12px 16px" }}>
                                  <span className="badge badge-tienda" style={{ textTransform: "capitalize" }}>
                                    {b.tipo_evento === "financiacion" ? "Financiación estándar" : b.tipo_evento}
                                  </span>
                                </td>
                                <td style={{ padding: "12px 16px", textTransform: "capitalize" }}>{b.tipo_vehiculo || "cualquiera"}</td>
                                <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                                  {marcaObj && <div>Marca: {marcaObj.nombre}</div>}
                                  {modeloObj && <div>Modelo: {modeloObj.nombre}</div>}
                                  {b.fecha_inicio && <div>Desde: {b.fecha_inicio}</div>}
                                  {b.fecha_fin && <div>Hasta: {b.fecha_fin}</div>}
                                  {!marcaObj && !modeloObj && !b.fecha_inicio && !b.fecha_fin && <span>Sin restricciones adicionales</span>}
                                </td>
                                <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "var(--danger)" }}>
                                  -{Math.abs(b.importe)} €
                                </td>
                                {isAdmin && (
                                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteBonus(idx)}
                                      className="btn"
                                      style={{
                                        padding: "4px 8px", fontSize: "0.75rem", color: "var(--danger)",
                                        background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)",
                                        borderRadius: "var(--radius-sm)", cursor: "pointer"
                                      }}
                                    >
                                      Quitar
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                      ) : (
                        <tr>
                          <td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
                            No hay reglas de penalización dinámicas configuradas para este plan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: LIQUIDACIÓN */}
            {activeTab === "liquidacion" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                  <div>
                    <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>Liquidación Consolidada</h3>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px" }}>
                      Analiza y consolida la liquidación económica cruzando los expedientes del mes.
                    </p>
                  </div>
                  
                  {isAdmin && (
                    <button
                      onClick={handleCalculateLiquidation}
                      disabled={calculating}
                      className="btn btn-primary"
                      style={{ padding: "12px 24px" }}
                    >
                      🔄 {calculating ? "Calculando..." : "Calcular / Recalcular Liquidación"}
                    </button>
                  )}
                </div>

                {/* SI YA TIENE LIQUIDACIÓN CALCULADA */}
                {planData.liquidations?.[0] ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    {/* METRICAS DE LA LIQUIDACIÓN */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
                      <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>UNIDADES COMPUTABLES</div>
                        <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--primary)", marginTop: "4px" }}>
                          {planData.liquidations[0].total_computables_snapshot} uds
                        </div>
                      </div>
                      <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>TRAMO PREDOMINANTE</div>
                        <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--secondary)", marginTop: "4px" }}>
                          Tramo {planData.liquidations[0].tramo_alcanzado_snapshot}
                        </div>
                      </div>
                      <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>MATRICULACIONES REALES</div>
                        <div style={{ fontSize: "1.6rem", fontWeight: 800, marginTop: "4px" }}>
                          {planData.liquidations[0].matriculaciones_reales_snapshot} uds
                        </div>
                      </div>
                      <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>MÍNIMO MATRICULACIONES</div>
                        <div style={{ fontSize: "1.6rem", fontWeight: 800, color: planData.liquidations[0].cumple_minimo_snapshot ? "var(--success)" : "var(--danger)", marginTop: "4px" }}>
                          {planData.liquidations[0].cumple_minimo_snapshot ? "✅ Cumple" : "❌ No Cumple"}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      padding: "20px 24px",
                      background: planData.liquidations[0].cumple_minimo_snapshot ? "rgba(16, 185, 129, 0.06)" : "rgba(239, 68, 68, 0.06)",
                      border: planData.liquidations[0].cumple_minimo_snapshot ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid rgba(239, 68, 68, 0.2)",
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "16px"
                    }}>
                      <div>
                        <span style={{ fontSize: "0.95rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                          {planData.liquidations[0].cumple_minimo_snapshot
                            ? "Comisión liquidable a pagar en el mes siguiente:"
                            : "⚠️ Penalización: Comisión económica reducida a 0 € por no alcanzar el mínimo de matriculaciones reales del periodo."}
                        </span>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
                          Calculada el {formatDate(planData.liquidations[0].fecha_calculo)}
                        </div>
                      </div>
                      {(() => {
                        const lines = planData.liquidations[0].lines || [];
                        const totalGeneradoTeorico = lines.reduce((sum: number, l: any) => sum + (l.total_generado || 0), 0);
                        const penaltyAmt = planData.liquidations[0].penalizacion_importe_snapshot || 0;
                        
                        if (penaltyAmt < 0 && planData.liquidations[0].cumple_minimo_snapshot) {
                          const penaltyTitle = planData.liquidations[0].penalizacion_titulo_snapshot || "Penalización";
                          const penaltyDesc = planData.liquidations[0].penalizacion_descripcion_snapshot || "Sin descripción";
                          const finalTotal = Math.max(0, totalGeneradoTeorico - Math.abs(penaltyAmt));
                          return (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "1.1rem" }}>
                              <span style={{ color: "var(--text-secondary)" }}>{totalGeneradoTeorico.toLocaleString()} €</span>
                              <span style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                                -
                              </span>
                              <span 
                                style={{ 
                                  color: "var(--danger)", 
                                  cursor: "help", 
                                  borderBottom: "1px dashed var(--danger)",
                                  fontSize: "0.95rem",
                                  paddingBottom: "1px"
                                }}
                                title={`${penaltyTitle}: ${penaltyDesc}`}
                              >
                                {Math.abs(penaltyAmt)} €
                              </span>
                              <span style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
                                =
                              </span>
                              <strong style={{ fontSize: "2rem", color: "var(--success)" }}>
                                {finalTotal.toLocaleString()} €
                              </strong>
                            </div>
                          );
                        }

                        return (
                          <strong style={{ fontSize: "2rem", color: "var(--text-primary)" }}>
                            {planData.liquidations[0].total_comision_economica.toLocaleString()} €
                          </strong>
                        );
                      })()}
                    </div>

                    {/* DETALLE INDIVIDUAL DE LINEAS */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                        <h4 style={{ fontSize: "1.05rem", color: "var(--text-primary)", margin: 0 }}>Desglose por Expediente</h4>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Filtrar Vendedor:</label>
                          <select
                            value={liqVendedorFilter}
                            onChange={(e) => setLiqVendedorFilter(e.target.value)}
                            className="form-select"
                            style={{ padding: "6px 12px", width: "200px", fontSize: "0.85rem" }}
                          >
                            <option value="">-- Todos --</option>
                            {uniqueSellersLiq.map((sellerName) => (
                              <option key={sellerName} value={sellerName}>
                                {sellerName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="table-container">
                        <table className="table-premium" style={{ fontSize: "0.85rem" }}>
                          <thead>
                            <tr>
                              <th>Cliente</th>
                              <th>Coche</th>
                              <th style={{ textAlign: "center" }}>Fecha Mat</th>
                              <th style={{ textAlign: "center" }}>Fecha RCI</th>
                              <th style={{ textAlign: "center" }}>Ingresa Por</th>
                              <th style={{ textAlign: "center" }}>Obj</th>
                              <th style={{ textAlign: "right" }}>VN Base</th>
                              <th style={{ textAlign: "right" }}>Usado</th>
                              <th style={{ textAlign: "right" }}>Finan</th>
                              <th style={{ textAlign: "right" }}>Pref/BOX3</th>
                              <th style={{ textAlign: "right" }}>Bonus</th>
                              <th style={{ textAlign: "right" }}>Total</th>
                              <th style={{ textAlign: "center" }}>Detalles</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredLiqLines.map((line: any) => {
                              const bonusTooltip = getBonusTooltip(line);
                              const matDateVal = line.fecha_matriculacion || line.expediente?.fecha_matriculacion;
                              const isCobradoOtraFecha = line.expediente?.cobrado_otra_fecha || false;
                              return (
                                <tr key={line.id_line}>
                                  <td>{line.cliente_nombre}</td>
                                  <td>
                                    <div style={{ fontWeight: 500 }}>{line.modelo_nombre}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{line.marca_nombre}</div>
                                  </td>
                                  <td style={{ textAlign: "center" }}>
                                    {isCobradoOtraFecha ? (
                                      <span
                                        style={{ textDecoration: "underline", cursor: "help" }}
                                        title={line.expediente?.fecha_cobrado ? `Cobrado en otra fecha: ${formatDate(line.expediente.fecha_cobrado)}` : undefined}
                                      >
                                        {formatDate(matDateVal)}
                                      </span>
                                    ) : (
                                      formatDate(matDateVal) || "-"
                                    )}
                                  </td>
                                  <td style={{ textAlign: "center" }}>
                                    {formatDate(line.expediente?.fecha_rci) || "-"}
                                  </td>
                                  <td style={{ textAlign: "center" }}>
                                    {line.entra_por_pedido && <span className="badge badge-vendedor" style={{ fontSize: "0.65rem", marginRight: "2px" }}>Pedido</span>}
                                    {line.entra_por_afectacion && <span className="badge badge-tienda" style={{ fontSize: "0.65rem", marginRight: "2px" }}>Afect.</span>}
                                    {line.entra_por_matriculacion && <span className="badge badge-admin" style={{ fontSize: "0.65rem" }}>Matric.</span>}
                                  </td>
                                  <td style={{ textAlign: "center", fontWeight: 700 }}>+{line.valor_para_objetivo}</td>
                                  <td style={{ textAlign: "right" }}>{(line.comision_base_vn || 0).toLocaleString()} €</td>
                                  <td style={{ textAlign: "right" }}>{(line.comision_usado || 0).toLocaleString()} €</td>
                                  <td style={{ textAlign: "right" }}>{(line.comision_financiacion || 0).toLocaleString()} €</td>
                                  <td style={{ textAlign: "right" }}>{(line.comision_preference || 0).toLocaleString()} €</td>
                                  <td 
                                    style={{ 
                                      textAlign: "right",
                                      cursor: line.bonus_acumulado > 0 ? "help" : "default"
                                    }}
                                    title={bonusTooltip}
                                  >
                                    {line.bonus_acumulado > 0 ? (
                                      <span style={{ borderBottom: "1px dashed rgba(255,255,255,0.4)", paddingBottom: "1px" }}>
                                        {(line.bonus_acumulado || 0).toLocaleString()} €
                                      </span>
                                    ) : (
                                      "0 €"
                                    )}
                                  </td>
                                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>{(line.total_generado || 0).toLocaleString()} €</td>
                                  <td style={{ textAlign: "center" }}>
                                    <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                                      <button
                                        onClick={() => setSelectedLineDetails(line)}
                                        className="btn btn-secondary"
                                        style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                                      >
                                        🔍 Conceptos
                                      </button>
                                      <button
                                        onClick={() => handleOpenEditExpediente(line.id_expediente)}
                                        className="btn btn-primary"
                                        style={{ 
                                          padding: "4px 8px", 
                                          fontSize: "0.75rem",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "4px",
                                          backgroundColor: "var(--primary)",
                                          border: "none",
                                          color: "white",
                                          cursor: "pointer",
                                          borderRadius: "var(--radius-sm)"
                                        }}
                                      >
                                        ✏️ Editar
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}

                            {filteredLiqLines.length > 0 && (() => {
                              const lines = filteredLiqLines;
                              const totalObj = lines.reduce((sum: number, l: any) => sum + (l.valor_para_objetivo || 0), 0);
                              const totalVN = lines.reduce((sum: number, l: any) => sum + (l.comision_base_vn || 0), 0);
                              const totalUsado = lines.reduce((sum: number, l: any) => sum + (l.comision_usado || 0), 0);
                              const totalFinan = lines.reduce((sum: number, l: any) => sum + (l.comision_financiacion || 0), 0);
                              const totalPref = lines.reduce((sum: number, l: any) => sum + (l.comision_preference || 0), 0);
                              const totalBonus = lines.reduce((sum: number, l: any) => sum + (l.bonus_acumulado || 0), 0);
                              const totalGenerado = lines.reduce((sum: number, l: any) => sum + (l.total_generado || 0), 0);

                              return (
                                <tr style={{ borderTop: "2px solid var(--border-light)", background: "rgba(255, 255, 255, 0.04)", fontWeight: 700 }}>
                                  <td colSpan={5} style={{ padding: "12px 16px", color: "var(--text-primary)" }}>TOTALES</td>
                                  <td style={{ textAlign: "center" }}>+{totalObj}</td>
                                  <td style={{ textAlign: "right" }}>{totalVN.toLocaleString()} €</td>
                                  <td style={{ textAlign: "right" }}>{totalUsado.toLocaleString()} €</td>
                                  <td style={{ textAlign: "right" }}>{totalFinan.toLocaleString()} €</td>
                                  <td style={{ textAlign: "right" }}>{totalPref.toLocaleString()} €</td>
                                  <td style={{ textAlign: "right", color: totalBonus >= 0 ? "var(--success)" : "var(--danger)" }}>{totalBonus.toLocaleString()} €</td>
                                  <td style={{ textAlign: "right", color: "var(--success)" }}>{totalGenerado.toLocaleString()} €</td>
                                  <td></td>
                                </tr>
                              );
                            })()}

                            {filteredLiqLines.length === 0 && (
                              <tr>
                                <td colSpan={13} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "30px" }}>
                                  No hay expedientes para el vendedor seleccionado.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>


                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                    La liquidación de este periodo aún no ha sido calculada. Haz clic en el botón de calcular arriba.
                  </div>
                )}
              </div>
            )}

            {activeTab === "notas" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                <div>
                  <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>📝 Notas y Comisiones Pendientes</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px" }}>
                    Administra notas generales de seguimiento y añade comisiones pendientes que se sumarán al listado general de este plan.
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "24px" }}>
                  
                  {/* Bloque Izquierdo: Notas Generales */}
                  <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", background: "rgba(255,255,255,0.01)" }}>
                    <h4 style={{ fontSize: "0.95rem", color: "var(--text-primary)", margin: 0 }}>Notas Generales ({planNotes.length})</h4>
                    
                    {/* Lista de notas */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "250px", overflowY: "auto" }}>
                      {planNotes.map(n => (
                        <div key={n.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "4px", border: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", gap: "10px" }}>
                          <div style={{ flex: 1, fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>{n.texto}</div>
                          <button 
                            type="button"
                            onClick={() => setPlanNotes(prev => prev.filter(x => x.id !== n.id))}
                            style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "0.85rem", alignSelf: "flex-start" }}
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                      {planNotes.length === 0 && (
                        <div style={{ color: "var(--text-muted)", fontSize: "0.8,rem", textAlign: "center", padding: "20px" }}>
                          No hay notas generales registradas.
                        </div>
                      )}
                    </div>

                    {/* Agregar Nota */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--border-light)", paddingTop: "12px" }}>
                      <textarea
                        className="form-input"
                        placeholder="Escribe una nota general de seguimiento..."
                        style={{ minHeight: "80px", fontSize: "0.85rem" }}
                        value={newNoteTexto}
                        onChange={e => setNewNoteTexto(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newNoteTexto.trim()) return;
                          const note = {
                            id: Math.random().toString(36).substr(2, 9),
                            texto: newNoteTexto.trim(),
                            fecha: new Date().toLocaleDateString()
                          };
                          setPlanNotes(prev => [...prev, note]);
                          setNewNoteTexto("");
                        }}
                        className="btn btn-secondary"
                        style={{ alignSelf: "flex-end", fontSize: "0.8rem", padding: "6px 12px" }}
                      >
                        ➕ Añadir Nota
                      </button>
                    </div>
                  </div>

                  {/* Bloque Derecho: Comisiones Pendientes */}
                  <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", background: "rgba(255,255,255,0.01)" }}>
                    <h4 style={{ fontSize: "0.95rem", color: "var(--text-primary)", margin: 0, display: "flex", justifyContent: "space-between" }}>
                      <span>Comisiones Pendientes ({planPendingComs.length})</span>
                      <span style={{ color: planPendingComs.reduce((acc, x) => acc + (x.valor || 0), 0) >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 700 }}>
                        Total: {planPendingComs.reduce((acc, x) => acc + (x.valor || 0), 0).toLocaleString()} €
                      </span>
                    </h4>

                    {/* Lista de comisiones pendientes */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "220px", overflowY: "auto" }}>
                      {planPendingComs.map(pc => (
                        <div key={pc.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "4px", border: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{pc.titulo}</div>
                            {pc.descripcion && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{pc.descripcion}</div>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <strong style={{ fontSize: "0.85rem", color: pc.valor >= 0 ? "var(--success)" : "var(--danger)" }}>
                              {pc.valor >= 0 ? "+" : ""}{pc.valor} €
                            </strong>
                            <button
                              type="button"
                              onClick={() => setPlanPendingComs(prev => prev.filter(x => x.id !== pc.id))}
                              style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "0.85rem" }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                      {planPendingComs.length === 0 && (
                        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "20px" }}>
                          No hay comisiones pendientes registradas.
                        </div>
                      )}
                    </div>

                    {/* Formulario Agregar Pendiente */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid var(--border-light)", paddingTop: "12px" }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>Añadir Comisión Pendiente</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "10px" }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Título (ej. Ajuste nómina anterior)"
                          value={newPendingTitulo}
                          onChange={e => setNewPendingTitulo(e.target.value)}
                        />
                        <input
                          type="number"
                          className="form-input"
                          placeholder="Comisión (€)"
                          value={newPendingValor}
                          onChange={e => setNewPendingValor(e.target.value)}
                        />
                      </div>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Descripción o nota (opcional)"
                        value={newPendingDescripcion}
                        onChange={e => setNewPendingDescripcion(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newPendingTitulo.trim()) {
                            showNotification("El título es obligatorio", "error");
                            return;
                          }
                          const val = parseFloat(newPendingValor);
                          if (isNaN(val)) {
                            showNotification("El valor de comisión debe ser un número", "error");
                            return;
                          }
                          const pc = {
                            id: Math.random().toString(36).substr(2, 9),
                            titulo: newPendingTitulo.trim(),
                            valor: val,
                            descripcion: newPendingDescripcion.trim()
                          };
                          setPlanPendingComs(prev => [...prev, pc]);
                          setNewPendingTitulo("");
                          setNewPendingValor("");
                          setNewPendingDescripcion("");
                        }}
                        className="btn btn-secondary"
                        style={{ alignSelf: "flex-end", fontSize: "0.8rem", padding: "6px 12px" }}
                      >
                        ➕ Añadir Comisión
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1.5: EDICIÓN DE EXPEDIENTE INDIVIDUAL */}
      {showEditExpedienteModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "var(--bg-overlay)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{
            width: "100%", maxWidth: "550px", maxHeight: "90vh", overflowY: "auto",
            padding: "32px", display: "flex", flexDirection: "column", gap: "20px",
            background: "var(--bg-card)"
          }}>
            <div>
              <h3 style={{ fontSize: "1.25rem", color: "var(--text-primary)", margin: 0 }}>
                Editar Expediente #EXP-{String(editingExpedienteId).padStart(4, "0")}
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "4px" }}>
                Modifique los campos correspondientes de este expediente de venta.
              </p>
            </div>

            {!catalogs ? (
              <div style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)" }}>
                Cargando catálogos...
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* NOMBRE DEL CLIENTE */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nombre del Cliente</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editClienteNombre}
                    onChange={e => setEditClienteNombre(e.target.value)}
                    placeholder="Escriba el nombre del cliente..."
                  />
                </div>

                {/* MARCA Y MODELO */}
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <div className="form-group" style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
                    <label className="form-label">Marca</label>
                    <select
                      className="form-select"
                      value={editMarca}
                      onChange={e => {
                        setEditMarca(e.target.value ? Number(e.target.value) : "");
                        setEditModelo("");
                      }}
                    >
                      <option value="">Selecciona Marca</option>
                      {catalogs.marcas.map(m => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
                    <label className="form-label">Modelo</label>
                    <select
                      className="form-select"
                      value={editModelo}
                      onChange={e => setEditModelo(e.target.value ? Number(e.target.value) : "")}
                      disabled={editMarca === ""}
                    >
                      <option value="">Selecciona Modelo</option>
                      {editMarca !== "" && catalogs.modelosPorMarca[Number(editMarca)]?.map(m => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* TIPO DE VENTA Y VENDEDOR (ADMIN ONLY) */}
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <div className="form-group" style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
                    <label className="form-label">Tipo de Venta</label>
                    <select
                      className="form-select"
                      value={editTipoVenta}
                      onChange={e => setEditTipoVenta(e.target.value ? Number(e.target.value) : "")}
                    >
                      <option value="">Selecciona Tipo de Venta</option>
                      {catalogs.tiposVenta.map(t => (
                        <option key={t.id} value={t.id}>{t.nombre}</option>
                      ))}
                    </select>
                  </div>
                  {isAdmin && (
                    <div className="form-group" style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
                      <label className="form-label">Vendedor</label>
                      <select
                        className="form-select"
                        value={editVendedor}
                        onChange={e => setEditVendedor(e.target.value ? Number(e.target.value) : "")}
                      >
                        <option value="">Selecciona Vendedor</option>
                        {catalogs.vendedores.map(v => (
                          <option key={v.id} value={v.id}>{v.nombre}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* FECHAS */}
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <div className="form-group" style={{ flex: 1, minWidth: "130px", marginBottom: 0 }}>
                    <label className="form-label">Fecha Exp.</label>
                    <input
                      type="date"
                      className="form-input"
                      value={editFExp}
                      onChange={e => setEditFExp(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: "130px", marginBottom: 0 }}>
                    <label className="form-label">Fecha Afect.</label>
                    <input
                      type="date"
                      className="form-input"
                      value={editFAfect}
                      onChange={e => setEditFAfect(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: "130px", marginBottom: 0 }}>
                    <label className="form-label">Fecha RCI</label>
                    <input
                      type="date"
                      className="form-input"
                      value={editFRci}
                      onChange={e => setEditFRci(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <div className="form-group" style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
                    <label className="form-label">Fecha Mat.</label>
                    <input
                      type="date"
                      className="form-input"
                      value={editFMat}
                      onChange={e => setEditFMat(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: "200px", marginBottom: 0 }}>
                    <label className="form-label">Fecha Entrega</label>
                    <input
                      type="date"
                      className="form-input"
                      value={editFEntrega}
                      onChange={e => setEditFEntrega(e.target.value)}
                    />
                  </div>
                </div>

                {/* COBRADO EN OTRA FECHA */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "rgba(255, 255, 255, 0.02)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-light)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input
                      type="checkbox"
                      id="editCobradoOtraFecha"
                      checked={editCobradoOtraFecha}
                      onChange={e => {
                        setEditCobradoOtraFecha(e.target.checked);
                        if (!e.target.checked) setEditFechaCobrado("");
                      }}
                      style={{ width: "16px", height: "16px", cursor: "pointer" }}
                    />
                    <label htmlFor="editCobradoOtraFecha" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer", userSelect: "none" }}>
                      Expediente cobrado en otra fecha
                    </label>
                  </div>

                  {editCobradoOtraFecha && (
                    <div className="form-group" style={{ marginBottom: 0, marginTop: "8px" }}>
                      <label className="form-label" style={{ fontSize: "0.78rem" }}>Fecha de Cobrado</label>
                      <input
                        type="date"
                        className="form-input"
                        value={editFechaCobrado}
                        onChange={e => setEditFechaCobrado(e.target.value)}
                        required={editCobradoOtraFecha}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "12px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCancelOrClose}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveEditExpediente}
                    disabled={saving}
                  >
                    {saving ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showConfirmUnsavedModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "var(--bg-overlay)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{
            width: "100%", maxWidth: "450px", padding: "30px",
            display: "flex", flexDirection: "column", gap: "20px",
            background: "var(--bg-card)"
          }}>
            <div>
              <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                ⚠️ Cambios sin guardar
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginTop: "10px", lineHeight: "1.4" }}>
                Tiene modificaciones pendientes en la ficha. Seleccione la opción que prefiera:
              </p>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => saveChanges({ saveClient: true, saveExp: true })}
                style={{ width: "100%", padding: "10px" }}
              >
                💾 Guardar cambios en Ambos
              </button>
              
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => saveChanges({ saveClient: false, saveExp: true })}
                  style={{ flex: 1, padding: "10px", fontSize: "0.8rem" }}
                >
                  Expediente sólo
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => saveChanges({ saveClient: true, saveExp: false })}
                  style={{ flex: 1, padding: "10px", fontSize: "0.8rem" }}
                >
                  Cliente sólo
                </button>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--border-light)", margin: "8px 0" }} />

              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setShowConfirmUnsavedModal(false);
                  setShowEditExpedienteModal(false);
                  setEditingExpedienteId(null);
                }}
                style={{ width: "100%", padding: "10px" }}
              >
                🚪 Salir sin Guardar
              </button>
              
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowConfirmUnsavedModal(false)}
                style={{ width: "100%", padding: "10px" }}
              >
                Volver a la Edición
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: DETALLE DE CONCEPTOS DE LÍNEA */}
      {selectedLineDetails && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "var(--bg-overlay)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{ width: "100%", maxWidth: "450px", padding: "32px", display: "flex", flexDirection: "column", gap: "20px", background: "var(--bg-card)" }}>
            <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
              Desglose de Conceptos: Expediente #EXP-{String(selectedLineDetails.id_expediente).padStart(4, "0")}
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "300px", overflowY: "auto" }}>
              {/* Cargar los items de la línea en un useEffect o directamente si están embebidos */}
              <LineDetailsItems lineId={selectedLineDetails.id_line} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border-light)", paddingTop: "12px", fontSize: "0.95rem" }}>
              <span style={{ fontWeight: 600 }}>Total Final Generado:</span>
              <strong style={{ color: "var(--primary)" }}>{selectedLineDetails.total_generado} €</strong>
            </div>

            <button
              onClick={() => setSelectedLineDetails(null)}
              className="btn btn-secondary"
              style={{ padding: "10px 20px", alignSelf: "flex-end" }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: CREACIÓN / CLONACIÓN DE PLAN */}
      {showCreateModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "var(--bg-overlay)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)"
        }}>
          <form onSubmit={handleCreatePlan} className="glass-panel" style={{ width: "100%", maxWidth: "450px", padding: "32px", display: "flex", flexDirection: "column", gap: "20px", background: "var(--bg-card)" }}>
            <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
              {cloneFromId ? "Clonar Plan de Comisión" : "Crear Plan de Comisión"}
            </h3>

            <div className="form-group">
              <label className="form-label">Nombre del Plan</label>
              <input
                type="text"
                className="form-input"
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
                placeholder="Ej. Plan Comisión Junio 2026"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Fecha de Inicio</label>
              <input
                type="date"
                className="form-input"
                value={newPlanStart}
                onChange={(e) => setNewPlanStart(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Fecha de Fin</label>
              <input
                type="date"
                className="form-input"
                value={newPlanEnd}
                onChange={(e) => setNewPlanEnd(e.target.value)}
                required
              />
            </div>

            {!cloneFromId && (
              <>
                <div className="form-group">
                  <label className="form-label">Objetivo Base (unidades)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={newPlanBase}
                    onChange={(e) => setNewPlanBase(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Arrastre (unidades)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={newPlanArrastre}
                    onChange={(e) => setNewPlanArrastre(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mínimo de Matriculaciones</label>
                  <input
                    type="number"
                    className="form-input"
                    value={newPlanMinMat}
                    onChange={(e) => setNewPlanMinMat(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Botones de navegación de mes para el plan */}
            <div style={{ display: "flex", justifyContent: "center", gap: "16px", margin: "8px 0", borderTop: "1px solid var(--border-light)", paddingTop: "16px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const prevDate = new Date(modalRefDate.getFullYear(), modalRefDate.getMonth() - 1, 1);
                  updateModalDate(prevDate);
                }}
                style={{ padding: "6px 16px", display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}
              >
                ← Mes Anterior
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const nextDate = new Date(modalRefDate.getFullYear(), modalRefDate.getMonth() + 1, 1);
                  updateModalDate(nextDate);
                }}
                style={{ padding: "6px 16px", display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}
              >
                Mes Siguiente →
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? "Procesando..." : cloneFromId ? "Clonar Plan" : "Crear Plan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE NOMBRE DUPLICADO */}
      {showDuplicateConfirmModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "var(--bg-overlay)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{ width: "100%", maxWidth: "420px", padding: "28px", display: "flex", flexDirection: "column", gap: "20px", background: "var(--bg-card)" }}>
            <h3 style={{ fontSize: "1.15rem", color: "var(--danger)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <span>⚠️ Plan ya existente</span>
            </h3>
            
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: 0, lineHeight: "1.4" }}>
              Ya existe un plan de comisiones con el nombre <strong style={{ color: "var(--text-primary)" }}>"{newPlanName}"</strong>.
            </p>
            
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
              ¿Qué deseas hacer? Si eliges <strong>Duplicar</strong>, se le asignará automáticamente un sufijo (ej. "{getUniquePlanName(newPlanName)}").
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", borderTop: "1px solid var(--border-light)", paddingTop: "16px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDuplicateConfirmModal(false)}
                style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  setShowDuplicateConfirmModal(false);
                  const uniqueName = getUniquePlanName(newPlanName);
                  await executePlanCreation(uniqueName);
                }}
                style={{ padding: "8px 16px", fontSize: "0.85rem", backgroundColor: "var(--success)" }}
              >
                Duplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ACTUALIZACIÓN MASIVA DE CUPO DE MULTIPLICADOR */}
      {bulkModalOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "var(--bg-overlay)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{ width: "100%", maxWidth: "450px", padding: "32px", display: "flex", flexDirection: "column", gap: "20px", background: "var(--bg-card)" }}>
            <h3 style={{ fontSize: "1.2rem", color: "var(--text-primary)", margin: 0 }}>
              Aplicar Cupo a Expedientes en Lote
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>
              Esta acción actualizará el campo de cupo requerido de todos los expedientes que coincidan con el mes, año y tipo de fecha seleccionados al valor actual ({minCochesMultiplicador}).
            </p>

            <div className="form-group">
              <label className="form-label">Año</label>
              <input
                type="number"
                className="form-input"
                value={bulkYear}
                onChange={(e) => setBulkYear(Number(e.target.value))}
                min={2000}
                max={2100}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Mes</label>
              <select
                className="form-select"
                value={bulkMonth}
                onChange={(e) => setBulkMonth(Number(e.target.value))}
                required
              >
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
            </div>

            <div className="form-group">
              <label className="form-label">Filtrar por Tipo de Fecha</label>
              <select
                className="form-select"
                value={bulkDateType}
                onChange={(e) => setBulkDateType(e.target.value)}
                required
              >
                <option value="fecha_expediente">Fecha de Creación (Expediente)</option>
                <option value="fecha_afectacion">Fecha de Afectación</option>
                <option value="fecha_matriculacion">Fecha de Matriculación</option>
                <option value="fecha_entrega">Fecha de Entrega</option>
                <option value="fecha_rci">Fecha RCI</option>
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setBulkModalOpen(false)}
                disabled={bulkSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExecuteBulkUpdate}
                disabled={bulkSaving}
              >
                {bulkSaving ? "Aplicando..." : "Aplicar en Lote"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 4: EDICIÓN MANUAL DE COMISIONES Y CONCEPTOS ADICIONALES */}
      {editingExp && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
          background: "var(--bg-overlay)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 9999, backdropFilter: "blur(4px)"
        }}>
          <div className="glass-panel" style={{ width: "100%", maxWidth: "600px", padding: "32px", display: "flex", flexDirection: "column", gap: "24px", maxHeight: "90vh", overflowY: "auto", background: "var(--bg-card)" }}>
            <div>
              <h3 style={{ fontSize: "1.25rem", color: "var(--text-primary)", margin: 0 }}>
                ✏️ Editar Expediente de Comisión: {editingExp.matricula || "S/M"}
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px" }}>
                Cliente: <strong>{editingExp.cliente_nombre}</strong> | Vendedor: <strong>{editingExp.vendedor_nombre}</strong>
              </p>
            </div>

            {/* Campos Estándar */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className="form-group">
                <label className="form-label">Matrícula</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editMatricula} 
                  onChange={e => setEditMatricula(e.target.value)} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">VIN (Bastidor)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={editVin} 
                  onChange={e => setEditVin(e.target.value)} 
                />
              </div>
            </div>

            {/* Comisión Coche y Comisión Financiación */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", borderTop: "1px solid var(--border-light)", paddingTop: "16px" }}>
              <div className="form-group">
                <label className="form-label">Comisión Coche (€)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  placeholder={`Calculado: ${((editingExp.comision_base_vn || 0) + (editingExp.comision_usado || 0))} €`}
                  value={editComisionCocheReal} 
                  onChange={e => setEditComisionCocheReal(e.target.value)} 
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Dejar en blanco para autocalcular</span>
                  <button
                    type="button"
                    onClick={() => setEditComisionCocheReal(String((editingExp.comision_base_vn || 0) + (editingExp.comision_usado || 0)))}
                    className="btn btn-secondary"
                    style={{ padding: "2px 6px", fontSize: "0.7rem", whiteSpace: "nowrap" }}
                  >
                    📋 Copiar Calculado
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Comisión Financiación (€)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  placeholder={`Calculado: ${((editingExp.comision_financiacion || 0) + (editingExp.comision_preference || 0))} €`}
                  value={editComisionFinanciacionReal} 
                  onChange={e => setEditComisionFinanciacionReal(e.target.value)} 
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Dejar en blanco para autocalcular</span>
                  <button
                    type="button"
                    onClick={() => setEditComisionFinanciacionReal(String((editingExp.comision_financiacion || 0) + (editingExp.comision_preference || 0)))}
                    className="btn btn-secondary"
                    style={{ padding: "2px 6px", fontSize: "0.7rem", whiteSpace: "nowrap" }}
                  >
                    📋 Copiar Calculado
                  </button>
                </div>
              </div>
            </div>

            {/* Estado de Cobro por Concepto */}
            <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <h4 style={{ fontSize: "0.95rem", color: "var(--text-primary)", margin: 0 }}>
                ✅ Estado de Cobro por Concepto
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer", color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={editComisionCocheCobrada}
                    onChange={(e) => setEditComisionCocheCobrada(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <span>VN Base Cobrado</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer", color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={editComisionUsadoCobrada}
                    onChange={(e) => setEditComisionUsadoCobrada(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <span>Usado Cobrado</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer", color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={editComisionFinanciacionCobrada}
                    onChange={(e) => setEditComisionFinanciacionCobrada(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <span>Financiación Cobrada</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer", color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={editComisionPreferenceCobrada}
                    onChange={(e) => setEditComisionPreferenceCobrada(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <span>Pref/Box Cobrado</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer", color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={editComisionBonusCobrada}
                    onChange={(e) => setEditComisionBonusCobrada(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <span>Bonus Cobrado</span>
                </label>
              </div>
            </div>

            {/* Conceptos Adicionales */}
            <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <h4 style={{ fontSize: "0.95rem", color: "var(--text-primary)", margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Bonificaciones / Penalizaciones Extra</span>
                <span style={{ fontSize: "0.8rem", color: "var(--success)" }}>
                  Total Extra: {editConceptosAdicionales.reduce((acc, c) => acc + (c.valor || 0), 0)} €
                </span>
              </h4>

              {/* Lista de conceptos actuales */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "150px", overflowY: "auto" }}>
                {editConceptosAdicionales.map(c => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "4px", border: "1px solid var(--border-light)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={c.cobrado || false}
                        onChange={() => handleToggleConceptCobradoInModal(c.id)}
                        style={{ cursor: "pointer" }}
                      />
                      <div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, textDecoration: c.cobrado ? "line-through" : "none", color: c.cobrado ? "var(--text-muted)" : "inherit" }}>{c.titulo}</div>
                        {c.descripcion && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{c.descripcion}</div>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <strong style={{ fontSize: "0.85rem", color: c.valor >= 0 ? "var(--success)" : "var(--danger)" }}>
                        {c.valor >= 0 ? "+" : ""}{c.valor} €
                      </strong>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveConcept(c.id)} 
                        style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "0.85rem" }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
                {editConceptosAdicionales.length === 0 && (
                  <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center", padding: "10px" }}>
                    No hay conceptos adicionales configurados.
                  </div>
                )}
              </div>

              {/* Formulario para añadir concepto */}
              <div style={{ background: "rgba(255,255,255,0.01)", padding: "12px", borderRadius: "6px", border: "1px dashed var(--border-light)", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>Añadir Concepto Especial</div>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "10px" }}>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Título (ej. Plus Campaña VN)" 
                    value={newConceptTitulo} 
                    onChange={e => setNewConceptTitulo(e.target.value)} 
                  />
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="Comisión (€)" 
                    value={newConceptValor} 
                    onChange={e => setNewConceptValor(e.target.value)} 
                  />
                </div>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Descripción / Nota aclaratoria (opcional)" 
                  value={newConceptDescripcion} 
                  onChange={e => setNewConceptDescripcion(e.target.value)} 
                />
                <button 
                  type="button" 
                  onClick={handleAddConcept}
                  className="btn btn-secondary"
                  style={{ alignSelf: "flex-end", fontSize: "0.8rem", padding: "6px 12px" }}
                >
                  ➕ Añadir Concepto
                </button>
              </div>
            </div>

            {/* Acciones del Modal */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", borderTop: "1px solid var(--border-light)", paddingTop: "16px", marginTop: "8px" }}>
              <button 
                type="button" 
                onClick={() => setEditingExp(null)} 
                className="btn btn-secondary"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleSaveExpedienteChanges} 
                className="btn btn-primary"
              >
                💾 Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponente interno para recuperar via API los items de una línea
function LineDetailsItems({ lineId }: { lineId: number }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await fetch(`/api/comisiones/liquidar?lineId=${lineId}`);
        const result = await res.json();
        if (result.success) {
          setItems(result.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [lineId]);

  if (loading) return <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Cargando desglose...</div>;

  return (
    <>
      {items.map((item, idx) => (
        <div
          key={item.id_line_item || idx}
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 12px", background: "rgba(255, 255, 255, 0.02)",
            borderRadius: "4px", border: "1px solid var(--border-light)"
          }}
        >
          <div>
            <div style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: "0.85rem" }}>{item.concepto}</div>
            {item.afecta_objetivo && (
              <div style={{ fontSize: "0.75rem", color: "var(--success)" }}>Suma al Objetivo: +{item.valor_objetivo} uds</div>
            )}
          </div>
          <span style={{ fontWeight: 700, color: "var(--text-secondary)", fontSize: "0.85rem" }}>{item.importe} €</span>
        </div>
      ))}
      {items.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center" }}>No hay conceptos aplicados.</div>
      )}
    </>
  );
}


