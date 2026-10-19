/** Arranque del servidor: inicia el planificador de copias automáticas (solo en el runtime de Node). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Lo que sale por console se guarda también en un archivo, visible en Configuración › BBDD › Registro del servidor
    const { instalarRegistroServidor } = await import("./lib/registro-servidor");
    instalarRegistroServidor();
    console.info(`Servidor iniciado (GestorVentas v${process.env.npm_package_version ?? "?"}, Node ${process.version}, ${process.platform}/${process.arch})`);
    // Mide el equipo cada 30 s (CPU, memoria, temperatura, disco…) para la pestaña «Rendimiento» y avisa en el registro si algo va mal
    const { iniciarMuestreo } = await import("./lib/rendimiento");
    iniciarMuestreo();
    // Una instalación sin usuarios deja a la vista el código con el que crear al primer administrador
    const { db } = await import("./db");
    const { anunciarPrimerArranque } = await import("./lib/servicios/primer-arranque");
    void anunciarPrimerArranque(db);
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DISABLE_SCHEDULER !== "true") {
    const { iniciarPlanificador } = await import("./lib/servicios/planificador");
    iniciarPlanificador();
    // Un fallo suelto en un lector de OCR (hilos de Tesseract) no debe tumbar todo el servidor: se anota y se sigue
    process.on("unhandledRejection", (motivo) => console.error("Promesa rechazada sin tratar:", motivo instanceof Error ? motivo.message : motivo));
    process.on("uncaughtException", (e) => console.error("Error sin tratar:", e instanceof Error ? e.stack ?? e.message : e));
    // Lecturas de pedidos que quedaron pendientes (o a medias) antes de apagar o reiniciar
    const { reanudarLecturas } = await import("./lib/servicios/lecturas-pedidos");
    void reanudarLecturas();
  }
}
