import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { expedientes, marcas, modelos, tiendas, tipoDeVenta } from "@/db/schema";
import type { ExpedienteDto, TiendaDto, TipoVentaDto } from "@/lib/dto";
import type { MarcaConModelos } from "@/components/QuickExpedienteCreator";
import { aDto, relacionesExpediente } from "./expedientes";
import { marcaDto, modeloDto, tiendaDto, tipoVentaDto } from "./mapeos";
import { listarVendedores } from "./usuarios";

export interface DatosPanel {
  recientes: ExpedienteDto[];
  tiendas: TiendaDto[];
  tiposVenta: TipoVentaDto[];
  marcasAccesoRapido: MarcaConModelos[];
  /** Todo el catálogo de marcas y modelos (para elegir modelo al revisar un pedido leído, también los que no están en el acceso rápido). */
  marcasCatalogo: MarcaConModelos[];
  vendedores: { id_usuario: number; nombre: string }[];
}

/** Datos auxiliares del panel principal (todo acotado: 5 expedientes y catálogos). */
export async function cargarDatosPanel(ej: Ejecutor): Promise<DatosPanel> {
  const [filasRecientes, ts, tvs, ms, todasMarcas, vendedores] = await Promise.all([
    ej.query.expedientes.findMany({
      where: isNull(expedientes.eliminadoEn),
      orderBy: [desc(expedientes.idExpediente)],
      limit: 5,
      with: relacionesExpediente,
    }),
    ej.select().from(tiendas).where(isNull(tiendas.eliminadoEn)).orderBy(asc(tiendas.nombre)),
    ej.select().from(tipoDeVenta).where(isNull(tipoDeVenta.eliminadoEn)).orderBy(asc(tipoDeVenta.orden), asc(tipoDeVenta.nombreTipoVenta)),
    ej.query.marcas.findMany({
      where: and(eq(marcas.accesoRapido, true), isNull(marcas.eliminadoEn)),
      with: {
        modelos: {
          where: and(eq(modelos.accesoRapido, true), isNull(modelos.eliminadoEn)),
          orderBy: [asc(modelos.ordenAccesoRapido), asc(modelos.nombreModelo)],
        },
      },
      orderBy: [asc(marcas.nombre)],
    }),
    ej.query.marcas.findMany({
      where: isNull(marcas.eliminadoEn),
      with: { modelos: { where: isNull(modelos.eliminadoEn), orderBy: [asc(modelos.nombreModelo)] } },
      orderBy: [asc(marcas.nombre)],
    }),
    listarVendedores(ej),
  ]);

  return {
    recientes: filasRecientes.map(aDto),
    tiendas: ts.map(tiendaDto),
    tiposVenta: tvs.map(tipoVentaDto),
    marcasAccesoRapido: ms.map((m) => ({ ...marcaDto(m), modelos: m.modelos.map((mo) => modeloDto(mo)) })),
    marcasCatalogo: todasMarcas.map((m) => ({ ...marcaDto(m), modelos: m.modelos.map((mo) => modeloDto(mo)) })),
    vendedores,
  };
}
