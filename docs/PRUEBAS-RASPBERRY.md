# Pruebas en la Raspberry Pi real (fase F7)

Lista de comprobación para el propietario (criterio de aceptación 16.3 del informe). Marca cada punto y anota el resultado. Si algo no se cumple, avisa: se optimiza antes de cerrar.

## 1. Instalación limpia con el instalador

- [ ] Pi 4 (8 GB) con Raspberry Pi OS Lite 64 bits recién instalado.
- [ ] `sudo ./gestorventas-X.Y.Z-instalador.run` termina sin errores y muestra «Instalación terminada».
- [ ] `cd /opt/gestorventas && ./gestorventas.sh --estado` → `app` y `db` en `healthy` y `{"ok":true}`.
- [ ] Entras con el administrador, activas el 2FA y guardas los códigos de recuperación.
- [ ] Desde el **móvil con datos** (sin wifi) abre la URL pública y entra.
- Tiempo total de instalación (cronómetro): ______ min

## 2. Mediciones (objetivos del informe 15.1, con 5.000 expedientes y 3.000 clientes)

La herramienta genera datos sintéticos en una base **aparte** (`gestorventas_test`), sin tocar tus datos:

```bash
cd /opt/gestorventas
. ./.env
docker compose exec db createdb -U "$POSTGRES_USER" gestorventas_test
docker compose exec -e DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@db:5432/gestorventas_test" app node dist/src/db/migrar.cjs
docker compose exec -e DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@db:5432/gestorventas_test" app node dist/scripts/medir-rendimiento.cjs
docker compose exec db dropdb -U "$POSTGRES_USER" gestorventas_test      # limpieza
```

| Medida | Objetivo en la Pi | Resultado |
|---|---|---|
| Carga del dashboard | < 1.000 ms | |
| Listado de expedientes (5.000) | < 1.500 ms | |
| Guardar un expediente (con recálculo) | < 300 ms | |
| Calcular una liquidación mensual | < 1.000 ms | |
| Inicio de sesión (hash) | < 600 ms | |
| RAM en reposo (app + BD): `docker stats --no-stream` | < 1,5 GB | |

(En un PC de sobremesa los tiempos salen muy por debajo de los objetivos; en la Pi serán varias veces mayores.)

Sensación real de uso (abre Expedientes, Comisiones y un expediente desde el móvil): ______

## 3. Prueba de corte de corriente

1. Con la aplicación en uso, crea o edita un expediente y comprueba que se guardó.
2. **Desenchufa la Pi** (sin apagarla) y vuelve a enchufarla.
- [ ] Arranca sola (Docker y los contenedores vuelven a levantarse).
- [ ] La URL pública vuelve a responder (Tailscale Funnel se republica solo; si no: `sudo tailscale funnel --bg 3000`).
- [ ] El expediente guardado sigue ahí; no hay pérdida de datos confirmados.
- [ ] `./gestorventas.sh --estado` en verde.

## 4. Reinstalación completa desde una copia (13.6) — con cronómetro

1. Crea una copia (Configuración → BBDD → «Crear copia ahora») y descárgala (o súbela a Drive).
2. Apunta el `.env` (o al menos `APP_SECRET`).
3. Prepara otra tarjeta (o la misma) y sigue la guía: instalador → copiar `.env` y la `.dump` → `docker compose up -d` → `./gestorventas.sh --restaurar backups/gv_….dump`.
- [ ] Entras con tu usuario de siempre (contraseña + 2FA).
- [ ] Están todos los expedientes, clientes, planes y liquidaciones.
- Tiempo total (objetivo < 30 min): ______ min

## 5. Notas

- Si la tarjeta SD se queda lenta, es normal: se recomienda un **SSD USB** (más vida útil y velocidad).
- Con la copia automática diaria a las 03:30 la Pi escribe poco; conviene subir las copias a Drive (fuera de la SD).
