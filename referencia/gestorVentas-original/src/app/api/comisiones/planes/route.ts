import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
export const dynamic = 'force-dynamic';

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
  commissionVoPatterns,
  commissionBrandInterventionRates,
  modelos,
  usuarios,
  marcas
} from "@/db/schema";
import { eq, desc, or, ilike } from "drizzle-orm";

// Ayudante para verificar autorización de Administrador
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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
      // Obtener un plan específico con todas sus configuraciones
      const plan = await db.query.commissionPlans.findFirst({
        where: eq(commissionPlans.id_plan, Number(id)),
        with: {
          rates: {
            with: {
              modelo: {
                with: {
                  marca: true
                }
              }
            }
          },
          rules: {
            with: {
              marca: true,
              modelo: true
            }
          },
          bonusRules: {
            with: {
              marca: true,
              modelo: true
            }
          },
          financeRules: true,
          usedRates: true,
          financeRates: {
            with: {
              marca: true
            }
          },
          preferenceRules: {
            with: {
              marca: true,
              modelo: true
            }
          },
          voPatterns: true,
          brandInterventionRates: true,
          liquidations: {
            with: {
              lines: {
                with: {
                  items: true,
                  expediente: true
                }
              }
            }
          }
        }
      });

      if (!plan) {
        return NextResponse.json({ message: "Plan no encontrado" }, { status: 404 });
      }

      return NextResponse.json({ success: true, data: plan });
    }

    // Listar todos los planes
    const planes = await db.query.commissionPlans.findMany({
      orderBy: [desc(commissionPlans.fecha_inicio)],
      with: {
        liquidations: true
      }
    });

    return NextResponse.json({ success: true, data: planes });
  } catch (error: any) {
    console.error("Error al obtener planes de comisión:", error);
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
    const { nombre, fecha_inicio, fecha_fin, objetivo_base, arrastre, min_matriculaciones, min_coches_multiplicador, cloneFromId } = body;

    if (!nombre || !fecha_inicio || !fecha_fin) {
      return NextResponse.json({ message: "Faltan datos obligatorios (nombre, fecha de inicio y fin)" }, { status: 400 });
    }

    let nuevoPlanId: number = 0;

      if (cloneFromId) {
        // --- PROCESO DE CLONADO ---
        const sourcePlanId = Number(cloneFromId);
        const sourcePlan = await db.query.commissionPlans.findFirst({
          where: eq(commissionPlans.id_plan, sourcePlanId)
        });
        
        // 1. Insertar el nuevo plan copiando campos básicos
        const [insertedPlan] = await db.insert(commissionPlans).values({
          nombre,
          fecha_inicio,
          fecha_fin,
          objetivo_base: objetivo_base !== undefined ? Number(objetivo_base) : 0,
          arrastre: arrastre !== undefined ? Number(arrastre) : 0,
          min_matriculaciones: min_matriculaciones !== undefined ? Number(min_matriculaciones) : 6,
          min_coches_multiplicador: min_coches_multiplicador !== undefined ? Number(min_coches_multiplicador) : 0,
          penalizacion_importe: sourcePlan?.penalizacion_importe ?? 0,
          penalizacion_titulo: sourcePlan?.penalizacion_titulo ?? null,
          penalizacion_descripcion: sourcePlan?.penalizacion_descripcion ?? null,
          estado: "activo",
        }).returning();

        const newId = insertedPlan.id_plan;

        // 2. Clonar tarifas de modelos (rates)
        const sourceRates = await db.query.commissionPlanModelRates.findMany({
          where: eq(commissionPlanModelRates.id_plan, sourcePlanId)
        });
        if (sourceRates.length > 0) {
          await db.insert(commissionPlanModelRates).values(
            sourceRates.map(r => ({
              id_plan: newId,
              id_modelo: r.id_modelo,
              tasa_intervencion_cumplida: r.tasa_intervencion_cumplida,
              rate_x_minus_4: r.rate_x_minus_4,
              rate_x_minus_3: r.rate_x_minus_3,
              rate_x_minus_2: r.rate_x_minus_2,
              rate_x_minus_1: r.rate_x_minus_1,
              rate_x: r.rate_x,
              rate_x_plus_1: r.rate_x_plus_1,
              rate_x_plus_2: r.rate_x_plus_2,
              rate_x_plus_3: r.rate_x_plus_3,
              valor_objetivo: r.valor_objetivo,
              activo: r.activo,
            }))
          );
        }

        // 2b. Clonar tasas de intervención de marcas (brandInterventionRates)
        const sourceInterventions = await db.query.commissionBrandInterventionRates.findMany({
          where: eq(commissionBrandInterventionRates.id_plan, sourcePlanId)
        });
        if (sourceInterventions.length > 0) {
          await db.insert(commissionBrandInterventionRates).values(
            sourceInterventions.map(i => ({
              id_plan: newId,
              id_marca: i.id_marca,
              tasa_intervencion: i.tasa_intervencion,
              valor_objetivo_defecto: i.valor_objetivo_defecto,
              tipo_tasa: i.tipo_tasa || 'porcentaje',
            }))
          );
        }

        // 3. Clonar reglas generales (rules)
        const sourceRules = await db.query.commissionRules.findMany({
          where: eq(commissionRules.id_plan, sourcePlanId)
        });
        if (sourceRules.length > 0) {
          await db.insert(commissionRules).values(
            sourceRules.map(r => ({
              id_plan: newId,
              nombre: r.nombre,
              tipo_evento: r.tipo_evento,
              id_marca: r.id_marca,
              id_modelo: r.id_modelo,
              afecta_objetivo: r.afecta_objetivo,
              valor_objetivo: r.valor_objetivo,
              afecta_comision: r.afecta_comision,
              importe: r.importe,
              activa: r.activa,
              tasa_intervencion_cumplida: r.tasa_intervencion_cumplida,
              ligar_a_credito: r.ligar_a_credito,
            }))
          );
        }

        // 4. Clonar reglas de bonus (bonusRules)
        const sourceBonus = await db.query.commissionBonusRules.findMany({
          where: eq(commissionBonusRules.id_plan, sourcePlanId)
        });
        if (sourceBonus.length > 0) {
          await db.insert(commissionBonusRules).values(
            sourceBonus.map(b => ({
              id_plan: newId,
              nombre: b.nombre,
              descripcion: b.descripcion,
              tipo_evento: b.tipo_evento,
              id_marca: b.id_marca,
              id_modelo: b.id_modelo,
              importe: b.importe,
              afecta_objetivo: b.afecta_objetivo,
              valor_objetivo: b.valor_objetivo,
              fecha_inicio: fecha_inicio,
              fecha_fin: fecha_fin,
              activo: b.activo,
              tipo_vehiculo: b.tipo_vehiculo,
            }))
          );
        }

        // 5. Clonar reglas de financiación (financeRules)
        const sourceFinance = await db.query.commissionFinanceRules.findFirst({
          where: eq(commissionFinanceRules.id_plan, sourcePlanId)
        });
        await db.insert(commissionFinanceRules).values({
          id_plan: newId,
          importe_normal: sourceFinance ? sourceFinance.importe_normal : 80,
          importe_preference: sourceFinance ? sourceFinance.importe_preference : 120,
        });

        // 6. Clonar tarifas de usados (usedRates)
        const sourceUsedRates = await db.query.commissionUsedRates.findMany({
          where: eq(commissionUsedRates.id_plan, sourcePlanId)
        });
        if (sourceUsedRates.length > 0) {
          await db.insert(commissionUsedRates).values(
            sourceUsedRates.map(u => ({
              id_plan: newId,
              tipo_usado: u.tipo_usado,
              importe_primera: u.importe_primera,
              importe_resto: u.importe_resto,
              valor_objetivo: u.valor_objetivo,
              min_aplicar: u.min_aplicar,
              activo: u.activo,
            }))
          );
        }

        // 7. Clonar tarifas de financiación por marca (financeRates)
        const sourceFinanceRates = await db.query.commissionFinanceRates.findMany({
          where: eq(commissionFinanceRates.id_plan, sourcePlanId)
        });
        if (sourceFinanceRates.length > 0) {
          await db.insert(commissionFinanceRates).values(
            sourceFinanceRates.map(f => ({
              id_plan: newId,
              id_marca: f.id_marca,
              tipo_financiacion: f.tipo_financiacion,
              importe: f.importe,
            }))
          );
        }

        // 8. Clonar reglas de preference/box3
        const sourcePrefRules = await db.query.commissionPreferenceRules.findMany({
          where: eq(commissionPreferenceRules.id_plan, sourcePlanId)
        });
        if (sourcePrefRules.length > 0) {
          await db.insert(commissionPreferenceRules).values(
            sourcePrefRules.map(p => ({
              id_plan: newId,
              nombre: p.nombre,
              id_marca: p.id_marca,
              id_modelo: p.id_modelo,
              tipo_financiacion: p.tipo_financiacion,
              importe: p.importe,
              activa: p.activa,
            }))
          );
        }

        // 9. Clonar patrones de VO (voPatterns)
        const sourceVoPatterns = await db.query.commissionVoPatterns.findMany({
          where: eq(commissionVoPatterns.id_plan, sourcePlanId)
        });
        if (sourceVoPatterns.length > 0) {
          await db.insert(commissionVoPatterns).values(
            sourceVoPatterns.map(v => ({
              id_plan: newId,
              nombre: v.nombre,
              aplica_a_vn: v.aplica_a_vn,
              activo: v.activo,
              tiers: v.tiers,
            }))
          );
        }

        nuevoPlanId = newId;
      } else {
        // --- CREAR NUEVO PLAN VACÍO CON VALORES POR DEFECTO ---
        const [insertedPlan] = await db.insert(commissionPlans).values({
          nombre,
          fecha_inicio,
          fecha_fin,
          objetivo_base: objetivo_base ? Number(objetivo_base) : 12,
          arrastre: arrastre ? Number(arrastre) : 0,
          min_matriculaciones: min_matriculaciones ? Number(min_matriculaciones) : 6,
          min_coches_multiplicador: min_coches_multiplicador ? Number(min_coches_multiplicador) : 0,
          estado: "activo",
        }).returning();

        const newId = insertedPlan.id_plan;

        // Obtener marcas activas en el sistema de comisiones
        const dbBrands = await db.query.marcas.findMany({
          where: eq(marcas.sistema_comisiones, true)
        });
        const activeBrandIds = dbBrands.map(b => b.id_marca);

        // Cargar modelos de marcas activas del sistema
        let systemModels: any[] = [];
        if (activeBrandIds.length > 0) {
          systemModels = await db.query.modelos.findMany({
            where: (mod, { inArray }) => inArray(mod.marca_id, activeBrandIds)
          });
        }

        if (systemModels.length > 0) {
          const ratesToInsert: any[] = [];
          systemModels.forEach(m => {
            // Fila 1: Tasa de intervención inferior
            ratesToInsert.push({
              id_plan: newId,
              id_modelo: m.id_modelo,
              tasa_intervencion_cumplida: false,
              rate_x_minus_4: 70,
              rate_x_minus_3: 80,
              rate_x_minus_2: 90,
              rate_x_minus_1: 100,
              rate_x: 120,
              rate_x_plus_1: 140,
              rate_x_plus_2: 160,
              rate_x_plus_3: 180,
              valor_objetivo: 1,
              activo: true,
            });
            // Fila 2: Tasa de intervención superior/igual
            ratesToInsert.push({
              id_plan: newId,
              id_modelo: m.id_modelo,
              tasa_intervencion_cumplida: true,
              rate_x_minus_4: 90,
              rate_x_minus_3: 100,
              rate_x_minus_2: 110,
              rate_x_minus_1: 120,
              rate_x: 140,
              rate_x_plus_1: 160,
              rate_x_plus_2: 180,
              rate_x_plus_3: 200,
              valor_objetivo: 1,
              activo: true,
            });
          });
          await db.insert(commissionPlanModelRates).values(ratesToInsert);
        }

        // Inicializar tasa de intervención para marcas activas (70% por defecto)
        const interventionsToInsert = activeBrandIds.map(bId => ({
          id_plan: newId,
          id_marca: bId,
          tasa_intervencion: 70,
          valor_objetivo_defecto: 1.0
        }));
        if (interventionsToInsert.length > 0) {
          await db.insert(commissionBrandInterventionRates).values(interventionsToInsert);
        }

        // Inicializar regla de financiación plana vacía (compatibilidad)
        await db.insert(commissionFinanceRules).values({
          id_plan: newId,
          importe_normal: 80,
          importe_preference: 120,
        });

        // Inicializar tarifas de usados por defecto (VO, KM0, BB, Usado)
        await db.insert(commissionUsedRates).values([
          { id_plan: newId, tipo_usado: "VO", importe_primera: 150, importe_resto: 60, valor_objetivo: 1, min_aplicar: 1, activo: true },
          { id_plan: newId, tipo_usado: "KM0", importe_primera: 150, importe_resto: 60, valor_objetivo: 1, min_aplicar: 1, activo: true },
          { id_plan: newId, tipo_usado: "BB", importe_primera: 150, importe_resto: 60, valor_objetivo: 1, min_aplicar: 1, activo: true },
          { id_plan: newId, tipo_usado: "Usado", importe_primera: 120, importe_resto: 50, valor_objetivo: 1, min_aplicar: 1, activo: true }
        ]);

        // Inicializar financiación por marca para marcas activas
        const financeRatesToInsert: any[] = [];
        for (const bId of activeBrandIds) {
          financeRatesToInsert.push(
            { id_plan: newId, id_marca: bId, tipo_financiacion: "Crédito", importe: 80 },
            { id_plan: newId, id_marca: bId, tipo_financiacion: "Preference", importe: 120 },
            { id_plan: newId, id_marca: bId, tipo_financiacion: "Renting", importe: 80 },
            { id_plan: newId, id_marca: bId, tipo_financiacion: "Contado", importe: 0 }
          );
        }
        if (financeRatesToInsert.length > 0) {
          await db.insert(commissionFinanceRates).values(financeRatesToInsert);
        }

        // Inicializar un patrón de VO por defecto
        await db.insert(commissionVoPatterns).values({
          id_plan: newId,
          nombre: "Estándar VO",
          activo: true,
          tiers: JSON.stringify([
            { unidad: 1, importe: 150, valor_objetivo: 1 },
            { unidad: 2, importe: 180, valor_objetivo: 1 },
            { unidad: 3, importe: 200, valor_objetivo: 1 },
            { unidad: 4, importe: 250, valor_objetivo: 1 }
          ])
        });

        nuevoPlanId = newId;
      }

    return NextResponse.json({ success: true, message: "Plan creado con éxito", data: { id_plan: nuevoPlanId } }, { status: 201 });
  } catch (error: any) {
    console.error("Error al crear plan de comisión:", error);
    return NextResponse.json({ message: error.message || "Error interno al guardar plan" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return NextResponse.json({ message: "No autorizado. Se requieren permisos de administrador." }, { status: 403 });
    }

    const body = await req.json();
    const {
      id_plan,
      nombre,
      fecha_inicio,
      fecha_fin,
      estado,
      objetivo_base,
      arrastre,
      min_matriculaciones,
      min_coches_multiplicador,
      penalizacion_importe,
      penalizacion_titulo,
      penalizacion_descripcion,
      notas_adicionales,
      // Actualizaciones anidadas opcionales
      rates,
      financeRules,
      rules,
      bonusRules,
      usedRates,
      financeRates,
      preferenceRules,
      voPatterns,
      brandInterventionRates
    } = body;

    if (!id_plan) {
      return NextResponse.json({ message: "Falta el ID del plan" }, { status: 400 });
    }

    // 1. Campos generales del plan
    const updateData: any = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (fecha_inicio !== undefined) updateData.fecha_inicio = fecha_inicio;
    if (fecha_fin !== undefined) updateData.fecha_fin = fecha_fin;
    if (estado !== undefined) updateData.estado = estado;
    if (objetivo_base !== undefined) updateData.objetivo_base = Number(objetivo_base);
    if (arrastre !== undefined) updateData.arrastre = Number(arrastre);
    if (min_matriculaciones !== undefined) updateData.min_matriculaciones = Number(min_matriculaciones);
    if (min_coches_multiplicador !== undefined) updateData.min_coches_multiplicador = Number(min_coches_multiplicador);
    if (penalizacion_importe !== undefined) updateData.penalizacion_importe = Number(penalizacion_importe);
    if (penalizacion_titulo !== undefined) updateData.penalizacion_titulo = penalizacion_titulo;
    if (penalizacion_descripcion !== undefined) updateData.penalizacion_descripcion = penalizacion_descripcion;
    if (notas_adicionales !== undefined) updateData.notas_adicionales = notas_adicionales;

    if (Object.keys(updateData).length > 0) {
      await db.update(commissionPlans).set(updateData).where(eq(commissionPlans.id_plan, Number(id_plan)));
    }

    // 2. Actualizar tarifas de modelos (rates)
    if (rates && Array.isArray(rates)) {
      // Eliminar anteriores de este plan para soportar adición, edición, clonación y eliminación reactivas
      await db.delete(commissionPlanModelRates).where(eq(commissionPlanModelRates.id_plan, Number(id_plan)));
      
      const ratesToInsert = rates.map((r: any) => ({
        id_plan: Number(id_plan),
        id_modelo: Number(r.id_modelo),
        tasa_intervencion_cumplida: !!r.tasa_intervencion_cumplida,
        rate_x_minus_4: Number(r.rate_x_minus_4 ?? 0),
        rate_x_minus_3: Number(r.rate_x_minus_3 ?? 0),
        rate_x_minus_2: Number(r.rate_x_minus_2 ?? 0),
        rate_x_minus_1: Number(r.rate_x_minus_1 ?? 0),
        rate_x: Number(r.rate_x ?? 0),
        rate_x_plus_1: Number(r.rate_x_plus_1 ?? 0),
        rate_x_plus_2: Number(r.rate_x_plus_2 ?? 0),
        rate_x_plus_3: Number(r.rate_x_plus_3 ?? 0),
        valor_objetivo: Number(r.valor_objetivo ?? 1),
        activo: r.activo !== undefined ? !!r.activo : true,
      }));

      if (ratesToInsert.length > 0) {
        await db.insert(commissionPlanModelRates).values(ratesToInsert);
      }
    }

    // 3. Actualizar financiación
    if (financeRules) {
      await db.update(commissionFinanceRules).set({
        importe_normal: Number(financeRules.importe_normal),
        importe_preference: Number(financeRules.importe_preference),
      }).where(eq(commissionFinanceRules.id_plan, Number(id_plan)));
    }

    // 4. Actualizar reglas generales
    if (rules && Array.isArray(rules)) {
      // Eliminar reglas anteriores de este plan para simplificar sincronización
      await db.delete(commissionRules).where(eq(commissionRules.id_plan, Number(id_plan)));
      // Insertar las reglas vigentes
      const activeRules = rules.filter((r: any) => r.nombre);
      if (activeRules.length > 0) {
        await db.insert(commissionRules).values(
          activeRules.map((r: any) => ({
            id_plan: Number(id_plan),
            nombre: r.nombre,
            tipo_evento: r.tipo_evento,
            id_marca: r.id_marca ? Number(r.id_marca) : null,
            id_modelo: r.id_modelo ? Number(r.id_modelo) : null,
            afecta_objetivo: !!r.afecta_objetivo,
            valor_objetivo: Number(r.valor_objetivo || 0),
            afecta_comision: !!r.afecta_comision,
            importe: Number(r.importe || 0),
            activa: r.activa !== undefined ? !!r.activa : true,
            tasa_intervencion_cumplida: (r.tasa_intervencion_cumplida === undefined || r.tasa_intervencion_cumplida === null || r.tasa_intervencion_cumplida === "")
              ? null
              : (String(r.tasa_intervencion_cumplida) === "true" || r.tasa_intervencion_cumplida === true),
            ligar_a_credito: !!r.ligar_a_credito,
          }))
        );
      }
    }

    // 5. Actualizar reglas de bonus
    if (bonusRules && Array.isArray(bonusRules)) {
      // Eliminar bonus anteriores
      await db.delete(commissionBonusRules).where(eq(commissionBonusRules.id_plan, Number(id_plan)));
      // Insertar los bonus vigentes
      const activeBonus = bonusRules.filter((b: any) => b.nombre);
      if (activeBonus.length > 0) {
        await db.insert(commissionBonusRules).values(
          activeBonus.map((b: any) => ({
            id_plan: Number(id_plan),
            nombre: b.nombre,
            descripcion: b.descripcion || null,
            tipo_evento: b.tipo_evento,
            id_marca: b.id_marca ? Number(b.id_marca) : null,
            id_modelo: b.id_modelo ? Number(b.id_modelo) : null,
            importe: Number(b.importe || 0),
            afecta_objetivo: !!b.afecta_objetivo,
            valor_objetivo: Number(b.valor_objetivo || 0),
            fecha_inicio: b.fecha_inicio || null,
            fecha_fin: b.fecha_fin || null,
            activo: b.activo !== undefined ? !!b.activo : true,
            tipo_vehiculo: b.tipo_vehiculo || 'cualquiera',
          }))
        );
      }
    }

    // 6. Actualizar tarifas de usados (usedRates)
    if (usedRates && Array.isArray(usedRates)) {
      for (const u of usedRates) {
        if (u.id_used_rate) {
          await db.update(commissionUsedRates).set({
            importe_primera: Number(u.importe_primera || 0),
            importe_resto: Number(u.importe_resto || 0),
            valor_objetivo: Number(u.valor_objetivo || 0),
            min_aplicar: Number(u.min_aplicar || 0),
            activo: u.activo !== undefined ? !!u.activo : true,
          }).where(eq(commissionUsedRates.id_used_rate, Number(u.id_used_rate)));
        }
      }
    }

    // 7. Actualizar tarifas de financiación (financeRates)
    if (financeRates && Array.isArray(financeRates)) {
      for (const f of financeRates) {
        if (f.id_finance_rate) {
          await db.update(commissionFinanceRates).set({
            importe: Number(f.importe || 0)
          }).where(eq(commissionFinanceRates.id_finance_rate, Number(f.id_finance_rate)));
        }
      }
    }

    // 8. Actualizar reglas preference/box3 (preferenceRules)
    if (preferenceRules && Array.isArray(preferenceRules)) {
      // Eliminar reglas anteriores de este plan para simplificar sincronización
      await db.delete(commissionPreferenceRules).where(eq(commissionPreferenceRules.id_plan, Number(id_plan)));
      // Insertar las reglas vigentes
      const activePref = preferenceRules.filter((p: any) => p.nombre);
      if (activePref.length > 0) {
        await db.insert(commissionPreferenceRules).values(
          activePref.map((p: any) => ({
            id_plan: Number(id_plan),
            nombre: p.nombre,
            id_marca: p.id_marca ? Number(p.id_marca) : null,
            id_modelo: p.id_modelo ? Number(p.id_modelo) : null,
            tipo_financiacion: p.tipo_financiacion || null,
            importe: Number(p.importe || 0),
            activa: p.activa !== undefined ? !!p.activa : true,
          }))
        );
      }
    }

    // 9. Actualizar patrones de VO (voPatterns)
    if (voPatterns && Array.isArray(voPatterns)) {
      // Eliminar anteriores
      await db.delete(commissionVoPatterns).where(eq(commissionVoPatterns.id_plan, Number(id_plan)));
      // Insertar vigentes
      const activeVoPatterns = voPatterns.filter((v: any) => v.nombre);
      if (activeVoPatterns.length > 0) {
        await db.insert(commissionVoPatterns).values(
          activeVoPatterns.map((v: any) => ({
            id_plan: Number(id_plan),
            nombre: v.nombre,
            aplica_a_vn: !!v.aplica_a_vn,
            activo: v.activo !== undefined ? !!v.activo : true,
            tiers: typeof v.tiers === 'string' ? v.tiers : JSON.stringify(v.tiers || []),
          }))
        );
      }
    }

    // 9b. Actualizar tasas de intervención de marcas (brandInterventionRates)
    if (brandInterventionRates && Array.isArray(brandInterventionRates)) {
      await db.delete(commissionBrandInterventionRates).where(eq(commissionBrandInterventionRates.id_plan, Number(id_plan)));
      
      const activeInterventions = brandInterventionRates.filter((i: any) => i.id_marca);
      if (activeInterventions.length > 0) {
        await db.insert(commissionBrandInterventionRates).values(
          activeInterventions.map((i: any) => ({
            id_plan: Number(id_plan),
            id_marca: Number(i.id_marca),
            tasa_intervencion: Number(i.tasa_intervencion ?? 70),
            valor_objetivo_defecto: i.valor_objetivo_defecto !== undefined ? Number(i.valor_objetivo_defecto) : 1.0
          }))
        );
      }
    }

    return NextResponse.json({ success: true, message: "Plan de comisión actualizado con éxito" });
  } catch (error: any) {
    console.error("Error al actualizar plan de comisión:", error);
    return NextResponse.json({ message: error.message || "Error interno al actualizar plan" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return NextResponse.json({ message: "No autorizado. Se requieren permisos de administrador." }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ message: "Falta el ID del plan a eliminar" }, { status: 400 });
    }

    const planId = Number(id);

    // Verificar si el plan está cerrado
    const plan = await db.query.commissionPlans.findFirst({
      where: eq(commissionPlans.id_plan, planId)
    });

    if (!plan) {
      return NextResponse.json({ message: "Plan no encontrado" }, { status: 404 });
    }

    // Ejecutar eliminación en cascada (Drizzle onDelete cascade limpiará rates, rules, bonus, liquidations)
    await db.delete(commissionPlans).where(eq(commissionPlans.id_plan, planId));

    return NextResponse.json({ success: true, message: "Plan de comisionamiento eliminado correctamente" });
  } catch (error: any) {
    console.error("Error al eliminar plan de comisión:", error);
    return NextResponse.json({ message: error.message || "Error interno al eliminar plan" }, { status: 500 });
  }
}
