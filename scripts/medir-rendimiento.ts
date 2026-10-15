import "dotenv/config";
import { performance } from "node:perf_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as relations from "../src/db/relations";
import * as schema from "../src/db/schema";
import { sembrar } from "../src/db/semilla";
import { hashPassword, verificarPassword } from "../src/lib/auth/password";
import { cargarDatosPanel } from "../src/lib/servicios/panel";
import { listarExpedientes, resumenPanel } from "../src/lib/servicios/expedientes-lectura";
import { listarClientes } from "../src/lib/servicios/clientes";
import { calcularVendedorMes, conRecalculo, recalcularMes } from "../src/lib/servicios/liquidaciones";
import { guardarPlan } from "../src/lib/servicios/planes";
import { generarInforme } from "../src/lib/servicios/informes";

/**
 * Mide los tiempos de 15.1 con datos sintéticos (5.000 expedientes, 3.000 clientes).
 * Uso:  DATABASE_URL=postgres://…/gestorventas_test npx tsx scripts/medir-rendimiento.ts
 * Solo funciona contra bases cuyo nombre acaba en `_test` (VACÍA las tablas y siembra los datos).
 */
const OBJETIVOS_MS: Record<string, number> = {
  "Dashboard (datos del panel)": 1000,
  "Listado de expedientes (5.000)": 1500,
  "Guardar un expediente (con recálculo)": 300,
  "Calcular una liquidación mensual": 1000,
  "Inicio de sesión (hash de contraseña)": 600,
  "Informe de 12 meses": 5000,
};

const N_EXP = 5000;
const N_CLI = 3000;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!/_test(\?|$)/.test(url)) throw new Error("Por seguridad, solo se ejecuta contra una base de datos que acabe en _test.");
  const pool = new Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema: { ...schema, ...relations } });
  const { sql } = await import("drizzle-orm");

  const tablas = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  await db.execute(sql.raw(`truncate table ${tablas.rows.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`));
  await sembrar(db);

  console.log(`Generando ${N_CLI} clientes y ${N_EXP} expedientes...`);
  const vendedores = await db
    .insert(schema.usuarios)
    .values(Array.from({ length: 5 }, (_, i) => ({ loginEmail: `v${i}@t.test`, passwordHash: "x", nombre: `Vendedor ${i}`, rol: "vendedor", totpActivo: true, debeCambiarPassword: false, fechaDeRegistro: "2025-01-01" })))
    .returning();
  const [marca] = await db.insert(schema.marcas).values({ nombre: "Renault", accesoRapido: true }).returning();
  const modelos = await db.insert(schema.modelos).values(["Clio", "Captur", "Austral", "Megane", "Arkana"].map((n) => ({ marcaId: marca.idMarca, nombreModelo: n, accesoRapido: true }))).returning();
  const [tienda] = await db.insert(schema.tiendas).values({ nombre: "Madrid", ciudad: "Madrid" }).returning();
  const estados = await db.select().from(schema.estadoVehiculo);
  const tipos = await db.select().from(schema.tipoDeVenta);
  const nuevo = estados.find((e) => e.clase === "VN")!;

  const clientes: { id: number }[] = [];
  for (let i = 0; i < N_CLI; i += 500) {
    clientes.push(...(await db.insert(schema.clientes).values(Array.from({ length: Math.min(500, N_CLI - i) }, (_, k) => ({ clienteId: `c${i + k}`, dni: `${10000000 + i + k}A`, nombre: `Cliente Número ${i + k}`, tiendaId: tienda.idTienda }))).returning({ id: schema.clientes.id })));
  }
  const anio = new Date().getFullYear();
  const filas = Array.from({ length: N_EXP }, (_, i) => {
    const mes = String((i % 12) + 1).padStart(2, "0");
    const t = tipos[i % tipos.length];
    return {
      idUsuario: vendedores[i % 5].idUsuario,
      idCliente: clientes[i % N_CLI].id,
      idModelo: modelos[i % 5].idModelo,
      idTienda: tienda.idTienda,
      idTipoDeVenta: t.idTipoDeVenta,
      idEstadoVehiculo: nuevo.idEstadoVehiculo,
      fechaExpediente: `${anio}-${mes}-02`,
      fechaRci: t.categoria === "CONTADO" ? null : `${anio}-${mes}-10`,
      fechaMatriculacion: `${anio}-${mes}-${String((i % 27) + 1).padStart(2, "0")}`,
      matricula: `${1000 + (i % 9000)}ABC`,
      vin: `VF1${String(i).padStart(14, "0")}`,
    };
  });
  for (let i = 0; i < filas.length; i += 500) await db.insert(schema.expedientes).values(filas.slice(i, i + 500));
  await db.execute(sql`analyze`);

  const imp = Object.fromEntries([-4, -3, -2, -1, 0, 1, 2, 3].map((t) => [String(t), 20000 + t * 1000]));
  const { plan } = await guardarPlan(db as never, null, {
    nombre: "Plan medición",
    fechaInicio: `${anio}-01-01`,
    fechaFin: `${anio}-12-31`,
    estado: "activo",
    vendedores: vendedores.map((v) => ({ idUsuario: v.idUsuario, objetivoBase: 8000 })),
    tarifasVN: modelos.flatMap((m) => [true, false].map((c) => ({ idModelo: m.idModelo, tasaCumplida: c, importes: imp }))),
    financiacion: [{ idMarca: marca.idMarca, tipoFinanciacion: "CREDITO", importe: 12000 }],
  });
  void plan;

  const resultados: { nombre: string; ms: number }[] = [];
  const medir = async (nombre: string, fn: () => Promise<unknown>, repeticiones = 3) => {
    await fn(); // calentamiento
    const t: number[] = [];
    for (let i = 0; i < repeticiones; i++) {
      const a = performance.now();
      await fn();
      t.push(performance.now() - a);
    }
    resultados.push({ nombre, ms: Math.round(t.sort((x, y) => x - y)[Math.floor(t.length / 2)]) });
  };

  const v0 = vendedores[0].idUsuario;
  const mesTest = `${anio}-06`;
  await medir("Dashboard (datos del panel)", async () => {
    await Promise.all([resumenPanel(db as never), cargarDatosPanel(db as never)]);
  });
  await medir("Listado de expedientes (5.000)", () => listarExpedientes(db as never, { limite: N_EXP }));
  await medir("Clientes (3.000)", () => listarClientes(db as never));
  await medir("Calcular una liquidación mensual", () => db.transaction((tx) => recalcularMes(tx as never, v0, mesTest, "medición")));
  await medir("Cálculo del mes sin guardar", () => calcularVendedorMes(db as never, v0, mesTest));
  const [e0] = await db.select({ id: schema.expedientes.idExpediente }).from(schema.expedientes).limit(1);
  let n = 0;
  await medir("Guardar un expediente (con recálculo)", () =>
    conRecalculo(db as never, [e0.id], "medición", async (tx) => {
      await (tx as typeof db).update(schema.expedientes).set({ matricula: `M${n++}` }).where((await import("drizzle-orm")).eq(schema.expedientes.idExpediente, e0.id));
      return { valor: 0, idsDespues: [e0.id] };
    }),
  );
  const hash = await hashPassword("ClaveDePrueba-2026!");
  await medir("Inicio de sesión (hash de contraseña)", () => verificarPassword(hash, "ClaveDePrueba-2026!"));
  await medir("Informe de 12 meses", () => generarInforme(db as never, { desde: `${anio}-01`, hasta: `${anio}-12` }), 1);

  console.log("\nResultados (mediana, ms) — objetivo en la Pi 4 entre paréntesis:");
  for (const r of resultados) {
    const obj = OBJETIVOS_MS[r.nombre];
    console.log(`  ${r.nombre.padEnd(42)} ${String(r.ms).padStart(6)} ms${obj ? `  (objetivo ${obj} ms${r.ms <= obj ? " ✔" : " ✘"})` : ""}`);
  }
  await pool.end();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
