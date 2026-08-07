# Build from the REPO ROOT so this stage can reach contracts/artifacts:
#   docker build -f api/Dockerfile -t medrail-api .
# (not from inside api/ — see docs/DEPLOYMENT.md)

FROM node:20-slim AS build
WORKDIR /app/api
COPY api/package.json api/package-lock.json* ./
RUN npm install
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY api/package.json api/package-lock.json* ./api/
RUN cd api && npm install --omit=dev
COPY --from=build /app/api/dist ./api/dist
COPY api/src/data ./api/dist/data
COPY contracts/artifacts/MedRailConsent.arc56.json ./contracts/artifacts/MedRailConsent.arc56.json

WORKDIR /app/api
EXPOSE 4021
CMD ["node", "dist/index.js"]
