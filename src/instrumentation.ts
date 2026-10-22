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
    // Centro de incidencias: guarda en un solo sitio los errores y avisos del servidor, del navegador y del equipo (Configuración › Incidencias)
    const { db: bdIncidencias } = await import("./db");
    const { instalarIncidencias } = await import("./lib/servicios/incidencias");
    instalarIncidencias(bdIncidencias, process.env.npm_package_version ?? null);
    // Interruptor del cifrado de datos (Configuración › Base de datos): se lee de la base; sin dato guardado, desactivado. Si quedara algo cifrado de antes
    // estando desactivado, se deja en claro una vez, en segundo plano, con copia previa y avance.
    const cifrado = await import("./lib/servicios/cifrado-datos");
    await cifrado.cargarInterruptorCifrado(bdIncidencias).catch(() => undefined);
    setTimeout(() => {
      void (async () => {
        if (!(await cifrado.pendienteDeDejarEnClaro(bdIncidencias))) return;
        const intentos = (await cifrado.intentosAuto(bdIncidencias)) + 1;
        await cifrado.anotarIntentoAuto(bdIncidencias, intentos);
        const { encolar } = await import("./lib/servicios/tareas");
        encolar({ tipo: "cifrado", titulo: "Dejar los datos sin cifrar (una sola vez)", idUsuario: 0 }, async (ctx) => {
          const r = await cifrado.cambiarCifrado(bdIncidencias, false, null, ctx);
          await cifrado.anotarIntentoAuto(bdIncidencias, 3);
          return { ...r, detalle: [`${r.convertidos.toLocaleString("es-ES")} datos convertidos${r.ilegibles > 0 ? `, ${r.ilegibles.toLocaleString("es-ES")} no se pueden abrir con la clave de esta instalación y se han dejado como estaban` : ""}`] };
        });
      })().catch(() => undefined);
    }, 45_000).unref?.();
    // Si este equipo reenvía sus reportes de fallo a un servidor principal, cada minuto reintenta los que no hayan llegado (cola con reintentos)
    const { reenviarPendientes } = await import("./lib/servicios/incidencias-remotas");
    setInterval(() => void reenviarPendientes(bdIncidencias), 60_000).unref?.();
    // En el PC con Windows se anota el modo en que arranca el servidor para que start.bat lo arranque igual la proxima vez
    if (process.platform === "win32") {
      try {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(".ultimo-modo", process.env.NODE_ENV === "production" ? "normal" : "dev", "utf8");
      } catch {
        /* sin permiso de escritura: no pasa nada, start.bat usara el modo desarrollo */
      }
    }
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
