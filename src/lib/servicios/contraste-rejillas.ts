import { and, eq, isNull } from "drizzle-orm";
import type { Ejecutor } from "@/db";
import { expedientes, rejillaFilas, rejillas, usuarios } from "@/db/schema";
import { contrastarRejillas, type CocheContraste, type RejillaContraste, type ResultadoContraste } from "@/lib/contraste-rejillas";
import { aCocheCotejo } from "./cotejo";
import { aDto, relacionesExpediente } from "./expedientes";

/**
 * Contraste de rejillas: todas las matrículas leídas de las rejillas guardadas (las del vendedor, o las de todos si `idUsuario` es null) frente a los
 * expedientes de la aplicación. Solo lee; la comparación está en `lib/contraste-rejillas.ts`.
 */
export async function datosContraste(ej: Ejecutor, idUsuario: number | null): Promise<ResultadoContraste> {
  const nombres = new Map((await ej.select({ id: usuarios.idUsuario, nombre: usuarios.nombre, email: usuarios.loginEmail }).from(usuarios)).map((u) => [u.id, u.nombre?.trim() || u.email]));
  const filasExp = await ej.query.expedientes.findMany({
    where: and(isNull(expedientes.eliminadoEn), idUsuario === null ? undefined : eq(expedientes.idUsuario, idUsuario)),
    with: relacionesExpediente,
  });
  const coches: CocheContraste[] = filasExp.map(aDto).map((e) => ({ ...aCocheCotejo(e), idUsuario: e.id_usuario ?? 0, vendedor: e.id_usuario === null ? "Sin vendedor" : (nombres.get(e.id_usuario) ?? `Usuario ${e.id_usuario}`) }));

  const hojas = await ej.select().from(rejillas).where(idUsuario === null ? undefined : eq(rejillas.idUsuario, idUsuario));
  const lista: RejillaContraste[] = [];
  for (const h of hojas) {
    const f = await ej.select().from(rejillaFilas).where(eq(rejillaFilas.idRejilla, h.id));
    lista.push({
      id: h.id,
      mes: h.mes,
      idUsuario: h.idUsuario,
      vendedor: nombres.get(h.idUsuario) ?? `Usuario ${h.idUsuario}`,
      nombreArchivo: h.nombreArchivo,
      filas: f.map((x) => ({ matricula: x.matricula, importe: x.importe, cliente: x.cliente, concepto: x.concepto, confirmada: (x.confianza ?? 0) >= 100 })),
    });
  }
  return contrastarRejillas(lista, coches);
}
