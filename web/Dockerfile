# Build from THIS directory, not the repo root — the opposite of api/Dockerfile,
# which needs the root so it can reach contracts/artifacts:
#   docker build -f web/Dockerfile -t medrail-web ./web
# Building from the root fails on "/package.json": not found.
#
# The two NEXT_PUBLIC_* variables are inlined at build time, so changing either
# means rebuilding the image, not just restarting the container.

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .

# NEXT_PUBLIC_* vars must be declared as build ARGs to reach `npm run build` —
# a platform env var set only at container runtime is too late; Next.js
# inlines these into the JS bundle during the build, not on container start.
ARG NEXT_PUBLIC_API_BASE
ARG NEXT_PUBLIC_NETWORK
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_NETWORK=$NEXT_PUBLIC_NETWORK

RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000
CMD ["npm", "start"]
