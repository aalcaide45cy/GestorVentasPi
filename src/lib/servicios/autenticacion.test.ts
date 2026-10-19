import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { codigosRecuperacion, loginIntentos, sesiones, usuarios } from "@/db/schema";
import { descifrar } from "@/lib/auth/cifrado";
import { hashPassword, verificarPassword } from "@/lib/auth/password";
import { HttpError } from "@/lib/auth/sesion";
import { codigoTotp } from "@/lib/auth/totp";
import { reiniciarBd } from "../../../tests/ayudas";
import {
  activarTotp,
  bloqueadoHasta,
  cambiarPassword,
  clavesLimite,
  contarSesionesActivas,
  iniciarLogin,
  limpiarCaducadas,
  minutosDeBloqueo,
  prepararTotp,
  resetear2fa,
  resetearPassword,
  verificarSegundoFactor,
} from "./autenticacion";

beforeEach(reiniciarBd);

const PASSWORD = "una-clave-muy-larga-1";

async function crearUsuario(parcial: Partial<typeof usuarios.$inferInsert> = {}) {
  const [u] = await db
    .insert(usuarios)
    .values({
      loginEmail: `u${Math.random().toString(36).slice(2, 8)}@prueba.test`,
      passwordHash: await hashPassword(PASSWORD),
      nombre: "Usuario",
      rol: "vendedor",
      debeCambiarPassword: false,
      ...parcial,
    })
    .returning();
  return u;
}

async function crearSesionBd(idUsuario: number, mfa = true) {
  const [s] = await db
    .insert(sesiones)
    .values({ idUsuario, tokenHash: Math.random().toString(36), caducaEn: new Date(Date.now() + 3_600_000), mfaVerificado: mfa })
    .returning();
  return s;
}

async function codigoDe(idUsuario: number, ahora: Date): Promise<string> {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.idUsuario, idUsuario));
  return codigoTotp(descifrar(u.totpSecretoCifrado!, "totp"), ahora.getTime());
}

async function activar2fa(idUsuario: number, ahora = new Date()): Promise<string[]> {
  await prepararTotp(db, idUsuario);
  return activarTotp(db, idUsuario, await codigoDe(idUsuario, ahora), ahora.getTime());
}

async function estado(p: Promise<unknown>): Promise<number> {
  try {
    await p;
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
  throw new Error("Se esperaba un HttpError");
}

describe("bloqueo progresivo", () => {
  it("15 min a los 5 fallos, el doble a los 10… con tope de 24 h", () => {
    expect([0, 4, 5, 9, 10, 15, 20].map(minutosDeBloqueo)).toEqual([0, 0, 15, 15, 30, 60, 120]);
    expect(minutosDeBloqueo(5 * 2 ** 10)).toBe(24 * 60);
  });
});

describe("inicio de sesión (paso de contraseña)", () => {
  it("con credenciales correctas pide activar el 2FA si no lo tiene, o el código si lo tiene", async () => {
    const sin = await crearUsuario();
    expect(await iniciarLogin(db, { email: sin.loginEmail, password: PASSWORD, ip: "1.1.1.1" })).toMatchObject({ estado: "ok", requiere: "activar_2fa" });
    await activar2fa(sin.idUsuario);
    expect(await iniciarLogin(db, { email: sin.loginEmail.toUpperCase(), password: PASSWORD, ip: "1.1.1.1" })).toMatchObject({ estado: "ok", requiere: "2fa" });
  });

  it("usuario inexistente y contraseña errónea dan el mismo resultado", async () => {
    const u = await crearUsuario();
    expect(await iniciarLogin(db, { email: "nadie@prueba.test", password: "x", ip: null })).toEqual({ estado: "credenciales" });
    expect(await iniciarLogin(db, { email: u.loginEmail, password: "incorrecta", ip: null })).toEqual({ estado: "credenciales" });
  });

  it("una cuenta suspendida no entra, aunque la contraseña sea correcta", async () => {
    const u = await crearUsuario({ bloqueado: true });
    expect(await iniciarLogin(db, { email: u.loginEmail, password: PASSWORD, ip: null })).toEqual({ estado: "suspendida" });
  });

  it("tras 5 fallos bloquea 15 min (incluso con la contraseña buena) y luego deja pasar", async () => {
    const u = await crearUsuario();
    const t0 = new Date("2026-05-01T10:00:00Z");
    for (let i = 0; i < 5; i++) await iniciarLogin(db, { email: u.loginEmail, password: "mala", ip: "9.9.9.9" }, new Date(t0.getTime() + i * 1000));

    const durante = await iniciarLogin(db, { email: u.loginEmail, password: PASSWORD, ip: "9.9.9.9" }, new Date(t0.getTime() + 10 * 60_000));
    expect(durante.estado).toBe("bloqueado");
    const despues = await iniciarLogin(db, { email: u.loginEmail, password: PASSWORD, ip: "9.9.9.9" }, new Date(t0.getTime() + 20 * 60_000));
    expect(despues.estado).toBe("ok");
  });

  it("el bloqueo por IP afecta también a otros correos desde la misma IP", async () => {
    const a = await crearUsuario();
    const b = await crearUsuario();
    const t0 = new Date("2026-05-01T10:00:00Z");
    for (let i = 0; i < 5; i++) await iniciarLogin(db, { email: a.loginEmail, password: "mala", ip: "7.7.7.7" }, t0);
    expect((await iniciarLogin(db, { email: b.loginEmail, password: PASSWORD, ip: "7.7.7.7" }, new Date(t0.getTime() + 60_000))).estado).toBe("bloqueado");
    expect((await iniciarLogin(db, { email: b.loginEmail, password: PASSWORD, ip: "8.8.8.8" }, new Date(t0.getTime() + 60_000))).estado).toBe("ok");
  });

  it("un acceso correcto olvida los fallos anteriores de esa combinación", async () => {
    const u = await crearUsuario();
    for (let i = 0; i < 4; i++) await iniciarLogin(db, { email: u.loginEmail, password: "mala", ip: "5.5.5.5" });
    await iniciarLogin(db, { email: u.loginEmail, password: PASSWORD, ip: "5.5.5.5" });
    const [clave] = clavesLimite("5.5.5.5", u.loginEmail);
    const fallos = await db.select().from(loginIntentos).where(eq(loginIntentos.clave, clave));
    expect(fallos.filter((f) => !f.exito)).toHaveLength(0);
    expect(await bloqueadoHasta(db, clavesLimite("5.5.5.5", u.loginEmail))).toBeNull();
  });
});

describe("activación del 2FA", () => {
  it("guarda el secreto cifrado y los códigos de recuperación solo como huella", async () => {
    const u = await crearUsuario();
    const { secreto } = await prepararTotp(db, u.idUsuario);
    const [pendiente] = await db.select().from(usuarios).where(eq(usuarios.idUsuario, u.idUsuario));
    expect(pendiente.totpActivo).toBe(false);
    expect(pendiente.totpSecretoCifrado).not.toContain(secreto);

    const codigos = await activarTotp(db, u.idUsuario, codigoTotp(secreto));
    expect(codigos).toHaveLength(10);
    const filas = await db.select().from(codigosRecuperacion).where(eq(codigosRecuperacion.idUsuario, u.idUsuario));
    expect(filas).toHaveLength(10);
    for (const c of codigos) expect(filas.some((f) => f.codigoHash.includes(c.replace("-", "")))).toBe(false);
    expect((await db.select().from(usuarios).where(eq(usuarios.idUsuario, u.idUsuario)))[0].totpActivo).toBe(true);
  });

  it("un código incorrecto no activa nada; y no se puede preparar dos veces", async () => {
    const u = await crearUsuario();
    await prepararTotp(db, u.idUsuario);
    expect(await estado(activarTotp(db, u.idUsuario, "000000"))).toBe(400);
    await activar2fa(u.idUsuario);
    expect(await estado(prepararTotp(db, u.idUsuario))).toBe(409);
  });
});

describe("segundo factor al iniciar sesión", () => {
  it("acepta el código vigente una sola vez (anti-reutilización)", async () => {
    const u = await crearUsuario();
    const ahora = new Date();
    await activar2fa(u.idUsuario, new Date(ahora.getTime() - 120_000));
    const codigo = await codigoDe(u.idUsuario, ahora);
    expect((await verificarSegundoFactor(db, u.idUsuario, codigo, null, ahora)).estado).toBe("ok");
    expect((await verificarSegundoFactor(db, u.idUsuario, codigo, null, ahora)).estado).toBe("incorrecto");
  });

  it("un código de recuperación vale una vez y descuenta del total", async () => {
    const u = await crearUsuario();
    const [c1] = await activar2fa(u.idUsuario);
    const r = await verificarSegundoFactor(db, u.idUsuario, c1.toLowerCase(), null);
    expect(r).toMatchObject({ estado: "ok", conRecuperacion: true, quedanCodigos: 9 });
    expect((await verificarSegundoFactor(db, u.idUsuario, c1, null)).estado).toBe("incorrecto");
  });

  it("5 códigos erróneos bloquean los intentos siguientes", async () => {
    const u = await crearUsuario();
    await activar2fa(u.idUsuario);
    const t0 = new Date();
    for (let i = 0; i < 5; i++) expect((await verificarSegundoFactor(db, u.idUsuario, "000000", "3.3.3.3", t0)).estado).toBe("incorrecto");
    const codigoBueno = await codigoDe(u.idUsuario, t0);
    expect((await verificarSegundoFactor(db, u.idUsuario, codigoBueno, "3.3.3.3", t0)).estado).toBe("bloqueado");
  });

  it("un usuario sin 2FA activo nunca pasa este paso", async () => {
    const u = await crearUsuario();
    expect((await verificarSegundoFactor(db, u.idUsuario, "123456", null)).estado).toBe("incorrecto");
  });
});

describe("contraseña y sesiones", () => {
  it("cambiar la contraseña revoca las demás sesiones pero conserva la actual", async () => {
    const u = await crearUsuario({ debeCambiarPassword: true });
    const actual = await crearSesionBd(u.idUsuario);
    await crearSesionBd(u.idUsuario);
    await crearSesionBd(u.idUsuario);
    expect(await contarSesionesActivas(db, u.idUsuario)).toBe(3);

    await cambiarPassword(db, u.idUsuario, PASSWORD, "otra-clave-larga-2", actual.id);
    expect(await contarSesionesActivas(db, u.idUsuario)).toBe(1);
    const [fila] = await db.select().from(usuarios).where(eq(usuarios.idUsuario, u.idUsuario));
    expect(fila.debeCambiarPassword).toBe(false);
    expect(await verificarPassword(fila.passwordHash, "otra-clave-larga-2")).toBe(true);
  });

  it("exige la contraseña actual, una nueva válida y distinta", async () => {
    const u = await crearUsuario();
    expect(await estado(cambiarPassword(db, u.idUsuario, "equivocada", "otra-clave-larga-2", null))).toBe(400);
    expect(await estado(cambiarPassword(db, u.idUsuario, PASSWORD, "corta", null))).toBe(400);
    expect(await estado(cambiarPassword(db, u.idUsuario, PASSWORD, "password1234", null))).toBe(400);
    expect(await estado(cambiarPassword(db, u.idUsuario, PASSWORD, PASSWORD, null))).toBe(400);
  });

  it("resetear el 2FA lo desactiva, borra los códigos y cierra todas las sesiones", async () => {
    const u = await crearUsuario();
    await activar2fa(u.idUsuario);
    await crearSesionBd(u.idUsuario);
    await resetear2fa(db, u.idUsuario);
    const [fila] = await db.select().from(usuarios).where(eq(usuarios.idUsuario, u.idUsuario));
    expect(fila).toMatchObject({ totpActivo: false, totpSecretoCifrado: null, totpUltimoContador: null });
    expect(await db.select().from(codigosRecuperacion).where(eq(codigosRecuperacion.idUsuario, u.idUsuario))).toHaveLength(0);
    expect(await contarSesionesActivas(db, u.idUsuario)).toBe(0);
    expect(await estado(resetear2fa(db, 99999))).toBe(404);
  });
});

describe("contrasena temporal de un administrador", () => {
  it("la nueva contrasena funciona, obliga a cambiarla, quita el bloqueo y cierra las sesiones", async () => {
    const u = await crearUsuario();
    await crearSesionBd(u.idUsuario);
    await db.update(usuarios).set({ intentosFallidos: 7, bloqueadoHasta: new Date(Date.now() + 3600_000) }).where(eq(usuarios.idUsuario, u.idUsuario));
    const temporal = await resetearPassword(db, u.idUsuario);
    expect(temporal.length).toBeGreaterThanOrEqual(12);
    const [fila] = await db.select().from(usuarios).where(eq(usuarios.idUsuario, u.idUsuario));
    expect(fila).toMatchObject({ debeCambiarPassword: true, intentosFallidos: 0, bloqueadoHasta: null });
    expect(await contarSesionesActivas(db, u.idUsuario)).toBe(0);
    expect(await iniciarLogin(db, { email: u.loginEmail, password: PASSWORD, ip: null })).toEqual({ estado: "credenciales" });
    expect(await iniciarLogin(db, { email: u.loginEmail, password: temporal, ip: null })).toMatchObject({ estado: "ok" });
    expect(await estado(resetearPassword(db, 99999))).toBe(404);
  });
});

describe("limpieza", () => {
  it("borra sesiones caducadas e intentos de más de 30 días y conserva lo vigente", async () => {
    const u = await crearUsuario();
    await db.insert(sesiones).values({ idUsuario: u.idUsuario, tokenHash: "vieja", caducaEn: new Date(Date.now() - 1000), mfaVerificado: true });
    await crearSesionBd(u.idUsuario);
    await db.insert(loginIntentos).values([{ clave: "a", exito: false, en: new Date(Date.now() - 40 * 86_400_000) }, { clave: "b", exito: false }]);
    expect(await limpiarCaducadas(db)).toEqual({ sesiones: 1, intentos: 1 });
    expect(await contarSesionesActivas(db, u.idUsuario)).toBe(1);
  });
});
