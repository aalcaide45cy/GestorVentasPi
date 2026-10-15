/** Arranque del servidor: inicia el planificador de copias automáticas (solo en el runtime de Node). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DISABLE_SCHEDULER !== "true") {
    const { iniciarPlanificador } = await import("./lib/servicios/planificador");
    iniciarPlanificador();
  }
}
