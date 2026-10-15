import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { commissionLiquidations, expedientes, tipoDeVenta } from "@/db/schema";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const idPlan = url.searchParams.get("id_plan");
    if (!idPlan) {
      return NextResponse.json({ message: "Falta id_plan" }, { status: 400 });
    }

    // Buscar liquidación del plan
    const liq = await db.query.commissionLiquidations.findFirst({
      where: eq(commissionLiquidations.id_plan, Number(idPlan)),
      with: {
        lines: true
      }
    });

    if (!liq) {
      return NextResponse.json({ 
        success: false, 
        message: "Este plan no tiene una liquidación calculada todavía. Por favor, abre el plan y haz clic en 'Calcular/Recalcular Liquidación' primero." 
      });
    }

    // Obtener todos los tipos de venta para mapear el modo de pago
    const allTiposVenta = await db.select({
      id_tipo_de_venta: tipoDeVenta.id_tipo_de_venta,
      nombre_tipo_venta: tipoDeVenta.nombre_tipo_venta,
      color: tipoDeVenta.color
    }).from(tipoDeVenta);

    const tipoVentaMap: Record<number, { nombre: string; color: string }> = {};
    allTiposVenta.forEach(t => {
      tipoVentaMap[t.id_tipo_de_venta] = {
        nombre: t.nombre_tipo_venta,
        color: t.color || "#3b82f6"
      };
    });

    // Obtener el estado real de comision_cobrada, la matrícula y overrides de los expedientes
    const expIds = liq.lines.map(l => l.id_expediente).filter(id => id !== null) as number[];
    let expedientesData: Record<number, { 
      comision_cobrada: boolean; 
      comision_coche_cobrada: boolean;
      comision_usado_cobrada: boolean;
      comision_financiacion_cobrada: boolean;
      comision_preference_cobrada: boolean;
      comision_bonus_cobrada: boolean;
      matricula: string | null;
      comision_coche_real: number | null;
      comision_financiacion_real: number | null;
      conceptos_adicionales: string | null;
      vin: string | null;
      id_tipo_de_venta: number | null;
      fecha_matriculacion: string | null;
      fecha_rci: string | null;
      cobrado_otra_fecha: boolean;
      fecha_cobrado: string | null;
    }> = {};

    if (expIds.length > 0) {
      const dbExps = await db.select({
        id_expediente: expedientes.id_expediente,
        comision_cobrada: expedientes.comision_cobrada,
        comision_coche_cobrada: expedientes.comision_coche_cobrada,
        comision_usado_cobrada: expedientes.comision_usado_cobrada,
        comision_financiacion_cobrada: expedientes.comision_financiacion_cobrada,
        comision_preference_cobrada: expedientes.comision_preference_cobrada,
        comision_bonus_cobrada: expedientes.comision_bonus_cobrada,
        matricula: expedientes.matricula,
        comision_coche_real: expedientes.comision_coche_real,
        comision_financiacion_real: expedientes.comision_financiacion_real,
        conceptos_adicionales: expedientes.conceptos_adicionales,
        vin: expedientes.vin,
        id_tipo_de_venta: expedientes.id_tipo_de_venta,
        fecha_matriculacion: expedientes.fecha_matriculacion,
        fecha_rci: expedientes.fecha_rci,
        cobrado_otra_fecha: expedientes.cobrado_otra_fecha,
        fecha_cobrado: expedientes.fecha_cobrado
      }).from(expedientes).where(inArray(expedientes.id_expediente, expIds));

      dbExps.forEach(e => {
        expedientesData[e.id_expediente] = {
          comision_cobrada: e.comision_cobrada,
          comision_coche_cobrada: e.comision_coche_cobrada,
          comision_usado_cobrada: e.comision_usado_cobrada,
          comision_financiacion_cobrada: e.comision_financiacion_cobrada,
          comision_preference_cobrada: e.comision_preference_cobrada,
          comision_bonus_cobrada: e.comision_bonus_cobrada,
          matricula: e.matricula,
          comision_coche_real: e.comision_coche_real,
          comision_financiacion_real: e.comision_financiacion_real,
          conceptos_adicionales: e.conceptos_adicionales,
          vin: e.vin,
          id_tipo_de_venta: e.id_tipo_de_venta,
          fecha_matriculacion: e.fecha_matriculacion,
          fecha_rci: e.fecha_rci,
          cobrado_otra_fecha: e.cobrado_otra_fecha,
          fecha_cobrado: e.fecha_cobrado
        };
      });
    }

    const linesWithCobrado = liq.lines.map(l => {
      const exp = l.id_expediente ? expedientesData[l.id_expediente] : null;
      const tipoVentaInfo = exp?.id_tipo_de_venta ? tipoVentaMap[exp.id_tipo_de_venta] : null;
      return {
        ...l,
        comision_cobrada: exp ? exp.comision_cobrada : false,
        comision_coche_cobrada: exp ? exp.comision_coche_cobrada : false,
        comision_usado_cobrada: exp ? exp.comision_usado_cobrada : false,
        comision_financiacion_cobrada: exp ? exp.comision_financiacion_cobrada : false,
        comision_preference_cobrada: exp ? exp.comision_preference_cobrada : false,
        comision_bonus_cobrada: exp ? exp.comision_bonus_cobrada : false,
        matricula: exp ? exp.matricula : null,
        vin: exp ? exp.vin : null,
        comision_coche_real: exp ? exp.comision_coche_real : null,
        comision_financiacion_real: exp ? exp.comision_financiacion_real : null,
        conceptos_adicionales: exp ? exp.conceptos_adicionales : null,
        tipo_venta_nombre: tipoVentaInfo ? tipoVentaInfo.nombre : "Contado/Otro",
        tipo_venta_color: tipoVentaInfo ? tipoVentaInfo.color : "#3b82f6",
        fecha_matriculacion: exp ? exp.fecha_matriculacion : l.fecha_matriculacion,
        fecha_rci: exp ? exp.fecha_rci : null,
        cobrado_otra_fecha: exp ? exp.cobrado_otra_fecha : false,
        fecha_cobrado: exp ? exp.fecha_cobrado : null
      };
    });

    return NextResponse.json({ 
      success: true, 
      lines: linesWithCobrado,
      penalizacion_importe: liq.penalizacion_importe_snapshot,
      penalizacion_titulo: liq.penalizacion_titulo_snapshot || "Penalización",
      penalizacion_descripcion: liq.penalizacion_descripcion_snapshot || ""
    }, { status: 200 });
  } catch (error: any) {
    console.error("Error al obtener líneas de liquidación para verificación:", error);
    return NextResponse.json({ message: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
