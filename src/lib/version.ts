import { version as versionDelPaquete } from "../../package.json";

/**
 * Versión que se muestra en la aplicación. En el contenedor es `APP_VERSION` (el instalador la fija al instalar o actualizar);
 * en desarrollo, la del paquete. Las etiquetas «latest» o «local» no son una versión, así que también se usa la del paquete.
 */
export function versionDeLaApp(): string {
  const v = process.env.APP_VERSION?.trim();
  return v && /^\d+\.\d+\.\d+/.test(v) ? v : versionDelPaquete;
}
