import { asc, desc, eq } from "drizzle-orm";
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
  vendedores: { id_usuario: number; nombre: string }[];
}

/** Datos auxiliares del panel principal (todo acotado: 5 expedientes y catálogos). */
export async function cargarDatosPanel(ej: Ejecutor): Promise<DatosPanel> {
  const [filasRecientes, ts, tvs, ms, vendedores] = await Promise.all([
    ej.query.expedientes.findMany({
      orderBy: [desc(expedientes.idExpediente)],
      limit: 5,
      with: relacionesExpediente,
    }),
    ej.select().from(tiendas).orderBy(asc(tiendas.nombre)),
    ej.select().from(tipoDeVenta).orderBy(asc(tipoDeVenta.orden), asc(tipoDeVenta.nombreTipoVenta)),
    ej.query.marcas.findMany({
      where: eq(marcas.accesoRapido, true),
      with: {
        modelos: {
          where: eq(modelos.accesoRapido, true),
          orderBy: [asc(modelos.ordenAccesoRapido), asc(modelos.nombreModelo)],
        },
      },
      orderBy: [asc(marcas.nombre)],
    }),
    listarVendedores(ej),
  ]);

  return {
    recientes: filasRecientes.map(aDto),
    tiendas: ts.map(tiendaDto),
    tiposVenta: tvs.map(tipoVentaDto),
    marcasAccesoRapido: ms.map((m) => ({ ...marcaDto(m), modelos: m.modelos.map((mo) => modeloDto(mo)) })),
    vendedores,
  };
}
