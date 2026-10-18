# The engine: one Bun process that owns the sockets. Nothing else ships in this image.
FROM oven/bun:1.4-slim AS base
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --production

COPY engine ./engine

ENV PORT=8787
EXPOSE 8787
USER bun
CMD ["bun", "run", "engine/server.ts"]
