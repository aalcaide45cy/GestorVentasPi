# Cómo empezar con Claude Code (paso a paso)

## 1. Preparar el repositorio (una sola vez)
1. Clona tu repo vacío en el PC (por ejemplo en `M:\apps`):
   `git clone https://github.com/aalcaide45cy/GestorVentasPi.git`
2. **Descomprime este paquete dentro de esa carpeta** (deben quedar en la raíz: `CLAUDE.md`, `DECISIONES.md`, `PROGRESO.md`, `PROMPT-INICIO.md`, `.gitignore`, `docs/` y `referencia/`).
3. Sube todo:
   ```
   git add .
   git commit -m "Paquete inicial: especificación, reglas y código de referencia"
   git push
   ```

## 2. Abrir Claude Code
- Abre **la carpeta `GestorVentasPi`** en la pestaña **Code** de Claude Desktop (o en terminal con `claude`).
- Claude Code leerá `CLAUDE.md` automáticamente.

## 3. Primer mensaje (copia y pega)

```
Lee CLAUDE.md y docs/informe/00-leyenda-vision-entorno.md.
Vas a construir GestorVentasPi COMPLETA y DESDE CERO (código nuevo; la app antigua de
referencia/ es solo para consultar), siguiendo el plan por fases F0–F8 de
docs/informe/16-20-pruebas-fases-guia.md.

Empieza por la fase F0. Antes de escribir código, dime en un resumen corto:
1) qué has entendido que vas a construir, 2) el plan de F0 en pasos, y 3) cualquier duda
bloqueante. Si no hay dudas bloqueantes, continúa con F0 y, al terminarla, actualiza
PROGRESO.md, haz commit en la rama fase/F0-preparacion y sigue con F1.

Recuerda: interfaz idéntica a la antigua, motor de comisiones según docs/anexos/A-reglas-comisiones.md,
decisiones pendientes [P] con su valor por defecto anotadas en DECISIONES.md, y para solo
si necesitas algo mío (credenciales de Google, Cloudflare, Tailscale o mi Raspberry).
```

## 4. Mientras trabaja
- Revisa `PROGRESO.md` al terminar cada fase y prueba lo que indique.
- Puntos que **te pedirá a ti**: cuenta de Google Cloud (fase F5), túnel de Cloudflare si compras dominio o login de Tailscale (fase F6), tu Raspberry para medir (fase F7), la copia JSON y las 4 liquidaciones antiguas (fase F8).
- Si algo se ve distinto a la app antigua, díselo con una captura: la interfaz debe ser idéntica.
