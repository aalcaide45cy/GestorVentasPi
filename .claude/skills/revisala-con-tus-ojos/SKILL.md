---
name: revisala-con-tus-ojos
description: Revisión visual completa de GestorVentasPi en el navegador (copia de prueba aparte, sin doble factor): estructura, orden y aspecto de cada sección, pestaña y ventana, corrigiendo lo que esté mal. Úsala cuando el propietario diga «Revisala con tus ojos».
---

# Revisala con tus ojos

El propietario quiere que mires la aplicación **como la vería él**, sección por sección, y que corrijas lo que esté descolocado, desordenado o poco agradable. Se activa con la frase «Revisala con tus ojos». Todo en español de España.

## 0. Copia de seguridad en GitHub (siempre, antes de tocar nada)
1. Haz commit de tu trabajo pendiente (nunca `next.config.ts` si lo tocó otro hilo) y comprueba `git status`.
2. Sube una rama de copia: `git push origin HEAD:refs/heads/copia/antes-revision-AAAAMMDD-HHMM` (una rama, no una etiqueta: las etiquetas `v*` publican versiones).
3. Dile al propietario el nombre de la rama en el primer mensaje.

## 1. Copia de prueba nueva
Ejecuta `powershell -ExecutionPolicy Bypass -File scripts\prueba-interfaz.ps1 -Recrear` (sustituye la copia anterior por otra limpia: carpeta en `%TEMP%\gv-ui-prueba`, base propia `gestorventas_ui_prueba`, puerto 3100, nunca sube a GitHub, no toca los datos reales). Sin `-Recrear` solo la sincroniza. Entra con `prueba@prueba.test` / `Contrasena-de-prueba-123` y el código 2FA de `npx tsx scripts/prueba-interfaz-codigo.ts`.

Para revisar con los datos reales tal como están ahora, usa `powershell -ExecutionPolicy Bypass -File scripts\prueba-interfaz-real.ps1` (con `-Recrear` vuelve a clonar la base real): clona la base real en `gestorventas_ui_real`, la monta en otra copia (puerto 3101) con el mismo APP_SECRET y un administrador de prueba, y todo lo que se haga se hace sobre el clon (nunca sobre la base real).

Para subir archivos al navegador: cópialos a `public/` de la copia y, en la página, `fetch('/archivo')` → `DataTransfer` → `input.files` + evento `change`. Para ver la pantalla de escritorio: `resize_window` 1500x950 y, al terminar, `preset desktop`.

## 2. Qué revisar (todas, una a una)
Dashboard (zonas de pedidos y pagos de RCI, cola de pedidos, accesos rápidos), Expedientes (lista, filtros, columnas, nuevo, editar, modales de fechas), Clientes, Configuración (todas las pestañas: BBDD y sus paneles, catálogos, usuarios, sistema…), Comisiones (planes, simulador, liquidaciones, rejillas), Cotejo de pagos, Informes, Log Importación, Log Lecturas, Laboratorio, Perfil, y **todos los modales** (importar/exportar, completar datos desde listados, pagos de RCI, pedido leído, confirmaciones).

Para cada una, mira en escritorio (1500x950) y en móvil (390 de ancho), y comprueba:
- Estructura: título, subtítulo, bloques con el mismo aspecto, alineación y espaciado coherentes, nada cortado ni solapado, sin zonas vacías raras.
- Que lo que afecta a varias cosas se vea común (por ejemplo, un ajuste que vale para dos zonas no debe parecer de una sola).
- **Ayuda al pasar el ratón (`title`) en las cabeceras de columna** y en los botones poco evidentes.
- Textos en español de España, sin palabras escritas para confirmar (se usa doble clic), valores de diseño del Anexo C (sin librerías de UI nuevas).
- Consola del navegador sin errores (`read_console_messages`) y sin recargas en bucle.
- Datos: usa los Excel y PDF del propietario (carpeta de subidas de la sesión) para probar listados y pagos de RCI.

## 3. Corregir
Cambios pequeños y claros, un commit por tema en español. No cambies reglas de comisiones ni el aspecto «de marca» (Anexo C) sin preguntar. Tras corregir: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` (en segundo plano), vuelve a sincronizar la copia (`scripts\prueba-interfaz.ps1`) y mira otra vez lo corregido.

## 4. Entregar
Responde con lo que encontraste y arreglaste, agrupado por sección (pocas líneas, lo que cambia lo que él ve), y lo que dejaste sin tocar por necesitar su decisión. Si hay cambios, deja PR (o la rama) y pregunta si publica versión con el proceso habitual (`project-proceso-publicar-version`).
