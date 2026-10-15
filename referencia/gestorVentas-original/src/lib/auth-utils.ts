import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { usuarios, emailsUsuarios, telefonosUsuarios } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface UserWithDetails {
  id_usuario: number;
  clerk_id: string;
  nombre: string | null;
  rol: string | null;
  fecha_de_registro: string | null;
  bloqueado: boolean | null;
  tienda_predeterminada_id?: number | null;
}

/**
 * Sincroniza el usuario autenticado en Clerk con la base de datos local.
 * Si el usuario no existe en la base de datos, lo crea con el rol por defecto 'invitado'.
 */
export async function syncUser(): Promise<UserWithDetails | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    return null;
  }

  // Buscar el usuario en la base de datos local por su clerk_id
  const existingUser = await db.query.usuarios.findFirst({
    where: eq(usuarios.clerk_id, clerkUser.id),
  });

  if (existingUser) {
    return existingUser;
  }

  const emailPrincipal = clerkUser.emailAddresses[0]?.emailAddress || "";
  const telefonoPrincipal = clerkUser.phoneNumbers[0]?.phoneNumber || "";

  // Buscar si hay un usuario preregistrado por email
  let matchedUser = null;
  if (emailPrincipal) {
    const emailRecord = await db.query.emailsUsuarios.findFirst({
      where: eq(emailsUsuarios.email, emailPrincipal),
      with: {
        usuario: true
      }
    });
    if (emailRecord?.usuario) {
      matchedUser = emailRecord.usuario;
    }
  }

  if (matchedUser) {
    try {
      // Sincronizar el clerk_id del usuario preregistrado
      const [updatedUser] = await db.update(usuarios)
        .set({ clerk_id: clerkUser.id })
        .where(eq(usuarios.id_usuario, matchedUser.id_usuario))
        .returning();
      return updatedUser;
    } catch (err) {
      console.error("Error al sincronizar clerk_id con usuario preregistrado:", err);
    }
  }

  // Si no existe, creamos el usuario en la base de datos
  const nombreCompleto = [clerkUser.firstName, clerkUser.lastName]
    .filter(Boolean)
    .join(" ") || clerkUser.username || "Usuario";

  try {
    // 1. Insertar el usuario
    const [nuevoUsuario] = await db.insert(usuarios).values({
      clerk_id: clerkUser.id,
      nombre: nombreCompleto,
      rol: "invitado", // Rol por defecto
      fecha_de_registro: new Date().toISOString().split("T")[0], // YYYY-MM-DD
      bloqueado: false,
    }).returning();

    // 2. Insertar su email principal si tiene
    if (emailPrincipal) {
      await db.insert(emailsUsuarios).values({
        id_usuario: nuevoUsuario.id_usuario,
        email: emailPrincipal,
        tipo_email: "Principal",
      });
    }

    // 3. Insertar su teléfono si tiene
    if (telefonoPrincipal) {
      await db.insert(telefonosUsuarios).values({
        id_usuario: nuevoUsuario.id_usuario,
        telefono: telefonoPrincipal,
        tipo_telefono: "Principal",
      });
    }

    return nuevoUsuario;
  } catch (error) {
    console.error("Error al sincronizar el usuario con la base de datos:", error);
    return null;
  }
}

/**
 * Verifica si el usuario actual tiene alguno de los roles permitidos.
 */
export async function checkRole(allowedRoles: string[]): Promise<boolean> {
  const user = await syncUser();
  if (!user || !user.rol) {
    return false;
  }
  return allowedRoles.includes(user.rol.toLowerCase());
}

/**
 * Devuelve el rol del usuario actual.
 */
export async function getCurrentUserRole(): Promise<string | null> {
  const user = await syncUser();
  return user ? user.rol : null;
}
