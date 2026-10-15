import { hash, verify, type Algorithm } from "@node-rs/argon2";
import { randomInt } from "node:crypto";

/** 2 = Argon2id (el enum de la librería es `const enum` y no se puede importar con isolatedModules). */
const ARGON2ID = 2 as Algorithm;

/** Argon2id con parámetros moderados para la Raspberry Pi (19 MiB, 2 iteraciones, 1 hilo). */
const OPCIONES = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const LONGITUD_MINIMA = 12;
const TRIVIALES = new Set([
  "123456789012",
  "contraseña123",
  "contrasena123",
  "password1234",
  "passwordpassword",
  "qwertyuiop12",
  "administrador",
  "gestorventas1",
  "123456123456",
]);

export function hashPassword(clave: string): Promise<string> {
  return hash(clave, OPCIONES);
}

export async function verificarPassword(hashAlmacenado: string, clave: string): Promise<boolean> {
  try {
    return await verify(hashAlmacenado, clave);
  } catch {
    return false;
  }
}

/** Devuelve un mensaje de error en español o `null` si la contraseña es aceptable (5.7). */
export function validarPassword(clave: string): string | null {
  if (clave.length < LONGITUD_MINIMA) return `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`;
  if (TRIVIALES.has(clave.toLowerCase()) || /^(.)\1+$/.test(clave)) return "La contraseña es demasiado fácil de adivinar.";
  return null;
}

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Contraseña temporal aleatoria legible (16 caracteres, sin símbolos ambiguos). */
export function generarPasswordTemporal(): string {
  let r = "";
  for (let i = 0; i < 16; i++) r += ALFABETO[randomInt(ALFABETO.length)];
  return r;
}
