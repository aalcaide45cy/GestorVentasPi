import { neon } from '@neondatabase/serverless';
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

let _db: NeonHttpDatabase<typeof schema> | null = null;

function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    // Si la URL no está definida (ej. en el build), usamos una URL de prueba para evitar que neon() falle en la validación
    const databaseUrl = process.env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder";
    
    if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production") {
      console.warn("⚠️ DATABASE_URL no está definida. Se inicializará con un marcador de posición.");
    }
    
    const sql = neon(databaseUrl);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

// Exportamos un Proxy tipado correctamente que redirige las operaciones bajo demanda
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(target, prop, receiver) {
    const instance = getDb();
    return Reflect.get(instance, prop, receiver);
  }
});
