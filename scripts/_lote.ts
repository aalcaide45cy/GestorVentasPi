import { db } from "@/db";
import { sql } from "drizzle-orm";
import { leerDocumentoPapelera } from "@/lib/servicios/papelera";
import { textoDeDocumento } from "@/lib/servicios/ocr";
import { parsearPedido } from "@/lib/documentos/pedido";
async function main() {
  const ids = (await db.execute(sql`select id, nombre, tamano from adjuntos where ambito = 'pendiente' and tipo = 'pedido' and tamano < 5000000 order by id`)).rows as { id: number; nombre: string; tamano: number }[];
  let n = 0, sinDni = 0, sinTel = 0, sinTipo = 0;
  for (const f of ids) {
    try {
      const d = await leerDocumentoPapelera(db, f.id);
      const t = await textoDeDocumento(d.datos, { cribar: true });
      if (t.descartado) continue;
      const p = parsearPedido(t.texto, { modelos: [], tiposVenta: [], aliasModelos: [], marcas: ["Renault", "Dacia"] });
      if (!p.cliente && !p.dni) continue;
      n++;
      const faltas = [!p.dni ? "DNI" : "", !p.telefono ? "TEL" : "", !p.tipoPedido ? "TIPO" : "", !p.modeloTexto ? "MODELO" : ""].filter(Boolean);
      if (!p.dni) sinDni++;
      if (!p.telefono) sinTel++;
      if (!p.tipoPedido) sinTipo++;
      if (faltas.length) console.log(f.id, f.nombre, t.metodo, "falta:", faltas.join(","), "| cliente:", p.cliente);
    } catch (e) {
      console.log(f.id, f.nombre, "ERROR", e instanceof Error ? e.message.slice(0, 80) : e);
    }
  }
  console.log("pedidos leidos", n, "sinDni", sinDni, "sinTel", sinTel, "sinTipo", sinTipo);
}
void main().then(() => process.exit(0)).catch((e) => { console.error("ERR", e); process.exit(1); });
