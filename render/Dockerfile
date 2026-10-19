# The renderer: Playwright's Chromium plus Bun. Prints the report HTML to PDF; nothing else.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

COPY --from=oven/bun:1.4 /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
# Only what the renderer imports: playwright (the package; the browsers are in the base image) and the fonts.
RUN bun install --frozen-lockfile

COPY engine ./engine
COPY render ./render

ENV PORT=8790
EXPOSE 8790
CMD ["bun", "run", "render/server.ts"]
