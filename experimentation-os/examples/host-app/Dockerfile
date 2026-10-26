FROM node:24.22.1-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY examples/host-app/package.json examples/host-app/package.json
COPY packages/sdk-node/package.json packages/sdk-node/package.json
COPY packages/sdk-node/tsconfig.json packages/sdk-node/tsconfig.json
COPY packages/sdk-node/tsconfig.build.json packages/sdk-node/tsconfig.build.json
COPY packages/sdk-node/src packages/sdk-node/src
RUN pnpm install --frozen-lockfile --filter @experimentos/host-app...
COPY examples/host-app examples/host-app
RUN pnpm --filter @experimentos/sdk-node build && pnpm --filter @experimentos/host-app build

FROM node:24.22.1-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3100
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /workspace/examples/host-app/.next/standalone ./
COPY --from=build /workspace/examples/host-app/.next/static ./examples/host-app/.next/static
USER node
EXPOSE 3100
CMD ["node", "examples/host-app/server.js"]

