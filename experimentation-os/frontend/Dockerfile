FROM node:24.22.1-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json biome.json ./
COPY frontend/package.json frontend/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/api-client/src packages/api-client/src
COPY backend/openapi.json backend/openapi.json
RUN pnpm install --frozen-lockfile --filter @experimentos/console...
RUN pnpm exec openapi-typescript backend/openapi.json -o packages/api-client/src/schema.ts
COPY frontend frontend
RUN pnpm exec biome format frontend packages/api-client/package.json \
    && pnpm exec biome lint frontend packages/api-client/package.json
RUN pnpm --filter @experimentos/console build

FROM node:24.22.1-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /workspace/frontend/.next/standalone ./
COPY --from=build /workspace/frontend/.next/static ./frontend/.next/static
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]

