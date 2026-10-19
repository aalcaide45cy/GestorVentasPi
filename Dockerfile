# syntax=docker/dockerfile:1.7
# Imagen multi-arquitectura (linux/amd64 y linux/arm64) de GestorVentasPi.
# Se compila con GitHub Actions (docker buildx + QEMU); no se compila en la Raspberry Pi.

ARG NODE_VERSION=22-bookworm-slim

# ---------- 1. Dependencias ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# ONNX Runtime intentaria bajar las librerias CUDA (opcionales) al instalar; no hacen falta (el motor cae a CPU)
RUN npm ci --no-audit --no-fund --onnxruntime-node-install=skip

# ---------- 2. Compilación ----------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Valores ficticios solo para que Next pueda compilar (no se guardan en la imagen final)
RUN DATABASE_URL=postgres://u:p@localhost:5432/x APP_SECRET=compilacion-compilacion-compilacion-0000 npm run build \
 && npm run build:scripts

# ---------- 3. Ejecución ----------
FROM node:${NODE_VERSION} AS runner
ARG VERSION=desarrollo
ARG COMMIT=desconocido
LABEL org.opencontainers.image.title="GestorVentasPi" \
      org.opencontainers.image.source="https://github.com/aalcaide45cy/GestorVentasPi" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT}"

# Cliente de PostgreSQL 16 (pg_dump / pg_restore deben ser de versión >= la del servidor)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && apt-get purge -y --auto-remove curl gnupg \
 && rm -rf /var/lib/apt/lists/*

# «Llave» de Google Drive de la aplicación (se inyecta al construir la imagen; vacía si no se da). Para apps instaladas Google
# no la considera secreta: solo identifica a la aplicación, nunca da acceso a ningún Drive sin el permiso de su dueño.
ARG GOOGLE_CLIENT_ID=""
ARG GOOGLE_CLIENT_SECRET=""
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID \
    GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BACKUP_DIR=/backups \
    TZ=Europe/Madrid
WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/src/db/migrations ./src/db/migrations
COPY --from=build --chown=node:node /app/dist ./dist
# Modelos de RapidOCR (lectura de pedidos): se leen desde esta carpeta en tiempo de ejecución
COPY --from=build --chown=node:node /app/ocr-modelos ./ocr-modelos
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /backups && chown node:node /backups

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
