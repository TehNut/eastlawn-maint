FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 BODY_SIZE_LIMIT=100M
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/build build
COPY package.json ./
COPY drizzle drizzle
VOLUME /data
EXPOSE 3000
CMD ["node", "build"]
