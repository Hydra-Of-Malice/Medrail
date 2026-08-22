# MedRail — Container Images


**Purpose:** analyse `api/Dockerfile` and `web/Dockerfile` line by line, state exactly what lands in each image, document defects D-1…D-6, and supply corrected files that can be committed as-is.

**Status of this document:** authored 2026-08-21 against commit `32ffd73`; both images **built and run on 2026-08-22**, which is what changed the status below from analysis to measurement.

| Image | Build command | Size | Layers | Boots? |
|---|---|---|---|---|
| `medrail-api` | `docker build -f api/Dockerfile -t medrail-api .` (context = **repo root**) | **109.4 MB** | 12 | yes |
| `medrail-web` | `docker build -f web/Dockerfile -t medrail-web ./web` (context = **`web/`**) | **285.0 MB** | 10 | yes |

The two contexts differ, and getting it wrong fails immediately: the API image needs the repo root so
it can copy `contracts/artifacts/MedRailConsent.arc56.json`, while the web image's `COPY` paths have
no `web/` prefix, so building it from the root fails on `"/package.json": not found`. Both
Dockerfiles now carry that instruction as a header comment.

Verified inside the running API container: `/v1/health` returns `consentAppId: 768743428` with a live
`chain` block; `GET /` advertises all 8 endpoints; `/v1/consent/arc56` returns 200; and
`POST /v1/triage` returns a 402 carrying `resource.tags` including `x402-global-challenge`,
`accepts[0].extra.tag`, and `extensions.bazaar.info.input.method: "POST"`. The web container serves
the page on port 3000 with HTTP 200.

**Still true:** `.github/workflows/ci.yml` contains no `docker build` step and no container registry
is referenced anywhere in the repo, so nothing *automatically* checks that these keep building —
NFR-007 is validated by hand, once, not by the pipeline. Everything in §1–§4 is derived by reading
the Dockerfiles against `api/src/config.ts`, `api/src/app.ts`, `api/src/services/interactionChecker.ts`
and `api/tsconfig.json`. Everything in §5–§8 is marked **RECOMMENDED** and is not in the repo.

---

## 1. `api/Dockerfile` — line by line

```dockerfile
 1  # Build from the REPO ROOT so this stage can reach contracts/artifacts:
 2  #   docker build -f api/Dockerfile -t medrail-api .
 3  # (not from inside api/ — see docs/DEPLOYMENT.md)
 4
 5  FROM node:20-slim AS build
 6  WORKDIR /app/api
 7  COPY api/package.json api/package-lock.json* ./
 8  RUN npm install
 9  COPY api/tsconfig.json ./
10  COPY api/src ./src
11  RUN npm run build
12
13  FROM node:20-slim
14  WORKDIR /app
15  ENV NODE_ENV=production
16  COPY api/package.json api/package-lock.json* ./api/
17  RUN cd api && npm install --omit=dev
18  COPY --from=build /app/api/dist ./api/dist
19  COPY api/src/data ./api/dist/data
20  COPY contracts/artifacts/MedRailConsent.arc56.json ./contracts/artifacts/MedRailConsent.arc56.json
21
22  WORKDIR /app/api
23  EXPOSE 4021
24  CMD ["node", "dist/index.js"]
```

| Line | What it does | Assessment |
|---|---|---|
| 1–3 | Header comment documenting that the build context must be the repo root. | **Correct and necessary.** Explained in §1.1. Good practice — the constraint is non-obvious and it is stated in the file itself. |
| 5 | Build stage on `node:20-slim`. | Matches CI's Node 20 (`ci.yml:34`). Tag is **floating** — `node:20-slim` moves. Not pinned to a minor or a digest. |
| 6 | `WORKDIR /app/api`. | Chosen so `process.cwd()` in the running container is `/app/api`, which matters for `config.ts:32`. See §1.2. |
| 7 | Copies `package.json` + lockfile first. | **Correct layer ordering** — dependency layer is cached independently of source. The `*` glob makes the lockfile optional, which is the enabling condition for D-4. |
| 8 | `RUN npm install` | **D-4.** A `package-lock.json` is committed (`api/package-lock.json`, 81,985 bytes). `npm install` may resolve differently from the lock; `npm ci` — which CI uses at `ci.yml:37` — would not. **The image build and the CI build can install different trees.** |
| 9–10 | Copies `tsconfig.json` then `src`. | **Correct ordering** — a source-only change does not invalidate the `npm install` layer. |
| 11 | `npm run build` → `tsc -p tsconfig.json` → emits `dist/` (`api/tsconfig.json`: `outDir: "dist"`, `rootDir: "src"`). | Correct. Note `tsc` emits `.js` only; **it does not copy `src/data/*.json`** — which is why line 19 exists. |
| 13 | Runtime stage, fresh `node:20-slim`. | Correct multi-stage: TypeScript, `tsx`, `vitest` and `@types/*` never reach the runtime image. |
| 15 | `ENV NODE_ENV=production` | Correct. |
| 16–17 | Reinstall production-only deps in the runtime stage. | Correct approach; **D-4 again** — should be `npm ci --omit=dev`. |
| 18 | Copies compiled `dist` from the build stage. | Correct. |
| 19 | `COPY api/src/data ./api/dist/data` | **Correct and load-bearing.** `interactionChecker.ts:5,18` does `readFileSync(path.join(__dirname, "..", "data", "interactions.json"))`. In the image `__dirname` is `/app/api/dist/services`, so it resolves to `/app/api/dist/data/interactions.json` — exactly where line 19 puts it. **Verified path-by-path. Credit this.** |
| 20 | `COPY contracts/artifacts/MedRailConsent.arc56.json ./contracts/artifacts/...` | **Correct and load-bearing.** `app.ts:16,64` resolves `path.resolve(__dirname, "..", "..", "contracts", "artifacts", "MedRailConsent.arc56.json")`. In the image `__dirname` is `/app/api/dist`, so `../../contracts/artifacts/...` = `/app/contracts/artifacts/...` — exactly where line 20 puts it. `GET /v1/consent/arc56` will work. **Verified. Credit this too.** |
| 22 | `WORKDIR /app/api` | Sets `process.cwd()` = `/app/api`. This is precisely what makes D-1 a silent failure rather than an obvious one — see §1.2. |
| 23 | `EXPOSE 4021` | Matches `config.ts:46` default and `api/fly.toml:15` `internal_port = 4021`. Consistent. |
| 24 | `CMD ["node", "dist/index.js"]` | Correct — exec form, matches `api/package.json` `"start"`. |
| — | **No `HEALTHCHECK`** | **D-6.** `/v1/health` exists and is purpose-built for one (`api/src/routes/health.ts`), and OPS-001 asks for it. |
| — | **Runs as `root`** | The `node:20-slim` image ships an unprivileged `node` user; this Dockerfile never switches to it. Not in the ledger's D-list, but it is a real hardening gap and the corrected file fixes it. |
| — | **No `.dockerignore`** | **D-3.** See §3. |

### 1.1 Why the API image builds from the repo root

The image needs one file from outside `api/`: `contracts/artifacts/MedRailConsent.arc56.json` (line 20). Docker cannot `COPY` from outside the build context, so the context must be a directory containing both `api/` and `contracts/`. That is the repo root. This is why every path in the Dockerfile is prefixed `api/`, and why the build command is:

```bash
docker build -f api/Dockerfile -t medrail-api .      # note the trailing "." — repo root
```

Building from inside `api/` fails at line 20. `api/fly.toml:6-7` sets `dockerfile = "api/Dockerfile"` for the same reason, and its own header comment says so.

**The consequence is D-3**: the build context is the entire repository, including `api/.env`, `contracts/.env`, `contracts/.venv/`, `api/node_modules/` and `web/node_modules/`.

### 1.2 Exactly what happens to `CONSENT_APP_ID` in the image — defect **D-1** (HIGH)

Trace it:

```
api/src/config.ts:56   consentAppId: Number(process.env.CONSENT_APP_ID || readDeployedAppId(network) || 0)
api/src/config.ts:32   const path = resolve(process.cwd(), "..", "contracts", "artifacts", `deploy_${network}.json`)
api/Dockerfile:22      WORKDIR /app/api                    ⇒ process.cwd() === "/app/api"
                       ⇒ resolved path === "/app/contracts/artifacts/deploy_testnet.json"
api/Dockerfile:20      copies ONLY MedRailConsent.arc56.json into /app/contracts/artifacts/
                       ⇒ deploy_testnet.json is NOT in the image
api/src/config.ts:33   existsSync(path) === false ⇒ returns undefined
                       ⇒ consentAppId === 0
api/src/config.ts:62   requireConsentAppId() throws
api/src/app.ts:58-61   app.onError ⇒ HTTP 500, internal message echoed to the caller
```

**Observable behaviour of a container started with no `CONSENT_APP_ID`:**

| Endpoint | Result |
|---|---|
| `GET /v1/health` | **200** — `{"ok":true,...,"consentAppId":null}`. The service looks healthy. |
| `GET /` | 200 |
| `GET /v1/consent/app-info` | 200, `consentAppId: null` |
| `GET /v1/consent/arc56` | 200 — the spec file *is* in the image |
| `GET /v1/consent/status` | **500** |
| `POST /v1/records/summary` | **402** unpaid; **500 after the payment settles** — money taken, nothing delivered (R-2 / REL-002) |
| `POST /v1/triage`, `/v1/interaction-check` | 402 → 200. Unaffected — they never touch the chain |

**`api/fly.toml` does not set `CONSENT_APP_ID`.** Combined with `NETWORK = "mainnet"` (D-2, `api/fly.toml:10`), for which no `MedRailConsent` exists, **a `fly deploy` of the committed configuration yields a service that passes its own health check and 500s on every chain-backed route.** That is the headline deployment finding.

> **The obvious fix does not work.** "Just copy the deploy artifact into the image" fails here: with `NETWORK = "mainnet"` the fallback looks for **`deploy_mainnet.json`**, and that file **has never existed in this repository** — the only deploy artifact ever produced is `deploy_testnet.json`. Adding `deploy_testnet.json` to the image changes nothing about this deployment. D-1 and D-2 compound, and the only correct remedy is to **set `CONSENT_APP_ID` explicitly** and point `NETWORK` at a network where the application actually exists. That is why §5 deliberately does **not** bake any artifact into the image and §7.1 excludes it structurally.

Note the asymmetry that makes this hard to catch: the health endpoint reports `consentAppId: null` (`health.ts:11` — `config.consentAppId || null`) but still returns `ok: true`. A naive uptime check goes green.

---

## 2. `web/Dockerfile` — line by line

```dockerfile
 1  FROM node:20-slim AS build
 2  WORKDIR /app
 3  COPY package.json package-lock.json* ./
 4  RUN npm install
 5  COPY . .
 6  RUN npm run build
 7
 8  FROM node:20-slim
 9  WORKDIR /app
10  ENV NODE_ENV=production
11  COPY --from=build /app/.next ./.next
12  COPY --from=build /app/public ./public
13  COPY --from=build /app/package.json ./package.json
14  COPY --from=build /app/node_modules ./node_modules
15
16  EXPOSE 3000
17  CMD ["npm", "start"]
```

Build context here is `web/` (paths are context-relative with no `web/` prefix), so the command is `docker build -f web/Dockerfile -t medrail-web ./web`. Confirmed 2026-08-22: building from the repo root fails on `"/package.json": not found`.

| Line | What it does | Assessment |
|---|---|---|
| 3 | Copies manifests first. | Correct ordering. |
| 4 | `npm install` | **D-4.** `web/package-lock.json` is committed (248,045 bytes); CI uses `npm ci` (`ci.yml:58`). |
| 5 | `COPY . .` with **no `.dockerignore`** | **D-5, and this is worse than it looks.** Three distinct problems: **(a)** it copies `web/.env.local` into the build stage — Docker does **not** honour `.gitignore`, so a gitignored secret-shaped file is copied anyway; **(b)** it copies the host `web/node_modules/` **over the tree just installed at line 4** — on this repo that tree was installed on Windows, so Linux-incompatible platform binaries (e.g. the Windows Next SWC package) would replace the correct Linux ones, and line 6 can fail or silently produce a broken build; **(c)** it copies `.next/` and `tsconfig.tsbuildinfo` from the host, so any local build state leaks into the image and busts the layer cache on every build. |
| 6 | `npm run build` → `next build` | **Bakes `NEXT_PUBLIC_*` at build time.** Because of (a) above, it bakes whatever the copied `web/.env.local` contains — on this repo that is `NEXT_PUBLIC_API_BASE=http://localhost:4021`. **The image would ship a frontend hard-pointed at localhost.** There is no `ARG` for these values anywhere in the file. |
| 11–14 | Copies `.next`, `public`, `package.json` and the **entire `node_modules`** into the runtime stage. | **D-5 (second half).** `web/next.config.ts` is empty (`nextConfig = {}`, lines 3-5), so there is no `output: "standalone"`. Without it, `next start` requires the full dependency tree at runtime, so the whole `node_modules` must ship — **including build-time-only transitive packages that have no business in a runtime image. See G-27 below: `nanoid@3.3.17` (GHSA-2v37-7h3g-55p8, severity HIGH) reaches this image through `next@16.3.0 → postcss`, as a production dependency.** |
| 16 | `EXPOSE 3000` | Correct — Next.js default. |
| 17 | `CMD ["npm", "start"]` | Works (`web/package.json` `"start": "next start"`), but adds an `npm` process in front of the server, which swallows signals unless `npm` forwards them. `node server.js` (standalone) or `npx next start` is preferable. |
| — | No `HEALTHCHECK`, runs as `root`, no `.dockerignore` | **D-6, D-3/D-5.** |

---

## 3. Build context — defect **D-3** (MEDIUM)

```
$ find . -name ".dockerignore" -not -path "*/node_modules/*"
(nothing)
```

**There is no `.dockerignore` anywhere in the repository.** For `api/Dockerfile` the build context is the repo root, which means the Docker daemon receives:

| In the context today | Why it matters |
|---|---|
| `api/.env` — keys `NETWORK, PORT, FACILITATOR_URL, PAY_TO_ADDRESS, CONSENT_APP_ID, OPERATOR_MNEMONIC, OPERATOR_ADDRESS` | **Contains the live operator mnemonic** — the contract admin key |
| `contracts/.env` — `DEPLOYER_ADDRESS, DEPLOYER_MNEMONIC` | **Contains the live deployer mnemonic** |
| `web/.env.local` | `NEXT_PUBLIC_*` only today, no secret |
| `contracts/.venv/` | A full Python virtualenv |
| `api/node_modules/`, `web/node_modules/` | Two full dependency trees |
| `api/dist/`, `web/.next/`, `web/tsconfig.tsbuildinfo` | Stale build output |
| `.git/` | Full history |

**Be precise about the current exposure:** neither `.env` file is `COPY`'d into any layer by the Dockerfile as written, so **no secret currently lands in a published image**. The finding is not "secrets are in the image". The finding is:

1. **The margin is one careless line wide.** A future `COPY api/ ./api/`, `COPY . .`, or a debugging `COPY api/.env* ./` bakes an admin mnemonic into an image layer — and image layers are effectively immutable and often pushed to a registry. Deleting the file in a later layer does not remove it from the earlier one.
2. **Secrets are transmitted to the build daemon regardless.** With a remote or shared builder, the mnemonics leave the machine even though they never enter a layer.
3. **Build performance and cache behaviour are needlessly bad** — a virtualenv, two `node_modules` trees and `.git/` are streamed into the context on every build.

SEC-015 ("container build contexts shall exclude secret material") is **NOT IMPLEMENTED**. Corrected files in §7.

---

## 4. What actually lands in the API image

Reconstructed from the Dockerfile. No image has been built, so this is a reading of the file, not an inspection of a manifest.

```
/app
├── api
│   ├── package.json
│   ├── package-lock.json
│   ├── node_modules/          ← production deps only (npm install --omit=dev)
│   └── dist/
│       ├── index.js, app.js, config.js, x402.js
│       ├── routes/{health,triage,interaction,consent,records}.js
│       ├── services/{algorand,triageScorer,interactionChecker}.js
│       ├── data/interactions.json          ← from Dockerfile:19
│       └── *.js.map                        ← tsconfig sourceMap: true
└── contracts
    └── artifacts
        └── MedRailConsent.arc56.json       ← from Dockerfile:20 (54 KB)
```

**Not in the image, and each absence has a consequence:**

| Absent | Consequence |
|---|---|
| `contracts/artifacts/deploy_testnet.json` | **D-1** — `CONSENT_APP_ID` must be supplied explicitly or the chain routes 500. Note that adding this file would still not rescue the committed `fly.toml`, which looks for `deploy_mainnet.json` (§1.2) |
| `api/.env` | Correct — config must come from the runtime environment. This is the right design; it is only D-1 because nothing enforces it |
| `api/test/`, `api/scripts/` | Correct — `tsconfig.json` `include: ["src"]` |
| `contracts/`, `web/` (everything else) | Correct |

Two size notes, stated qualitatively because nothing has been measured: the runtime image carries **production dependencies only** (`--omit=dev` at line 17), which is right; and it carries `.js.map` source maps because `api/tsconfig.json` sets `"sourceMap": true` and nothing strips them. Source maps in a production image are a modest size cost and a mild information-disclosure surface. **Decision to make, not a defect.**

### 4.1 Layer-caching behaviour

`api/Dockerfile` gets this right. Cache invalidation cascades:

| Change | Invalidates from |
|---|---|
| `api/package.json` or lockfile | line 7 — full reinstall in both stages |
| `api/tsconfig.json` | line 9 |
| any file under `api/src/` | line 10 — recompile only, deps stay cached |
| `contracts/artifacts/MedRailConsent.arc56.json` | line 20 only — final layer |
| **anything else in the repo** | **nothing** — because no `COPY . .` exists in this file. This is the one place where the missing `.dockerignore` does not cost correctness, only context-transfer time |

`web/Dockerfile` gets it wrong: `COPY . .` at line 5 means **every** file under `web/` invalidates the build layer — including `.next/`, `node_modules/` and `tsconfig.tsbuildinfo`, all of which change on every local dev run. In practice line 5 will almost never hit cache.

---

## 5. **RECOMMENDED** — corrected `api/Dockerfile`

Fixes **D-1** (fail-fast + documented required env), **D-4** (`npm ci`), **D-6** (healthcheck), plus non-root execution and tag pinning. Drop-in replacement for `api/Dockerfile`.

```dockerfile
# syntax=docker/dockerfile:1
#
# Build from the REPO ROOT — this stage reads contracts/artifacts/:
#   docker build -f api/Dockerfile -t medrail-api:<tag> .
#
# REQUIRED at runtime (the image cannot supply these; see docs/08_Deployment/Docker.md §8):
#   CONSENT_APP_ID     — the deploy artifact is deliberately NOT baked in (D-1)
#   OPERATOR_MNEMONIC  — secret; needed even for the free /v1/consent/status
#   PAY_TO_ADDRESS     — appears in every 402 challenge
#   NETWORK            — must match the network CONSENT_APP_ID exists on (D-2)

# ---------- build ----------
FROM node:20.19-slim AS build
WORKDIR /app/api

# Lockfile is mandatory: npm ci fails loudly if it is missing or out of sync,
# which is exactly what we want (D-4). No "*" glob here — that made it optional.
COPY api/package.json api/package-lock.json ./
RUN npm ci

COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build

# ---------- runtime ----------
FROM node:20.19-slim
WORKDIR /app
ENV NODE_ENV=production

COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/api/dist ./api/dist
# tsc emits .js only — interactionChecker.ts:18 reads __dirname/../data/interactions.json
COPY api/src/data ./api/dist/data
# app.ts:64 resolves __dirname/../../contracts/artifacts — i.e. /app/contracts/artifacts
COPY contracts/artifacts/MedRailConsent.arc56.json ./contracts/artifacts/MedRailConsent.arc56.json

# Drop privileges. node:20-slim ships an unprivileged "node" user (uid 1000).
RUN chown -R node:node /app
USER node

WORKDIR /app/api
EXPOSE 4021

# D-6: wire the health endpoint that already exists (OPS-001, OPS-054).
# Node 20 has a global fetch, so no curl/wget needs to be installed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4021)+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
```

### 5.1 Companion code change for D-1 — **RECOMMENDED**, not implemented

The Dockerfile alone cannot fix D-1: a container that silently reports `consentAppId: null` and 500s later is the actual failure mode. Make it fail at boot instead, in `api/src/index.ts`:

```ts
// RECOMMENDED — not present in the repo today.
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./config.js";

// Fail fast rather than serving a half-configured process (D-1, OPS-050).
// The file fallback in config.ts:31-40 works for `npm run dev` from api/,
// but resolves to a path that does not exist inside a container.
if (!config.consentAppId) {
  console.error(
    JSON.stringify({
      level: "fatal",
      msg: "CONSENT_APP_ID is not set and no deploy artifact was found — refusing to start",
      network: config.network,
    }),
  );
  process.exit(1);
}
if (!config.operatorMnemonic) {
  console.error(JSON.stringify({ level: "fatal", msg: "OPERATOR_MNEMONIC is not set — refusing to start" }));
  process.exit(1);
}
if (!config.payToAddress) {
  console.error(JSON.stringify({ level: "fatal", msg: "PAY_TO_ADDRESS is not set — 402 challenges would advertise an empty payTo" }));
  process.exit(1);
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    JSON.stringify({
      level: "info",
      msg: "medrail-api listening",
      port: info.port,
      network: config.network,
      consentAppId: config.consentAppId,
    }),
  );
});
```

Fail-fast turns D-1 from "green health check, 500s in production, money lost on `/v1/records/summary`" into "the deploy does not come up" — which the platform's own rollout logic will catch.

Deliberately **not** recommended: baking `deploy_testnet.json` into the image. That would couple an image to one network's App ID and re-create D-2 in a new form. The App ID is deployment configuration; it belongs in the environment.

---

## 6. **RECOMMENDED** — corrected `web/Dockerfile`

Two variants. Variant A is the better image but requires a one-line change to `web/next.config.ts`. Variant B fixes everything that can be fixed without touching application code.

### 6.0 G-27 — a HIGH-severity advisory currently ships in the web image

Verified by running `npm audit`, which **CI does not run** (SEC-014, **NOT IMPLEMENTED** — see `CI_CD.md`):

| Package | Advisory | Severity | `api/` path | `web/` path |
|---|---|---|---|---|
| `nanoid@3.3.17` | GHSA-2v37-7h3g-55p8, **fix available** | **HIGH** | `vitest → vite → postcss` — **devDependency only** | `next@16.3.0 → postcss` — **production dependency** |

**The distinction is the whole finding.** In `api/` the advisory does **not** reach the runtime image, because the final stage installs with `--omit=dev` (`api/Dockerfile:17`). In `web/` it **does**: `postcss` is a production dependency of `next`, and `web/Dockerfile:14` copies the entire `node_modules` into the runtime stage.

Practical exploitability here is **low** — this is a build-time CSS toolchain package, not something a caller can drive through any MedRail endpoint. But it is a currently-shipping HIGH-severity advisory with a fix available, and **nothing in the repository would ever surface it**. Two independent remediations, both worth doing:

1. Upgrade the dependency (`npm audit fix` in `web/`, then re-run the build and typecheck).
2. Adopt `output: "standalone"` (§6.1) so the runtime tree contains only what the built application actually reaches — which shrinks both the image and the advisory surface.
3. Add `npm audit --audit-level=high` to CI so the next one is caught (`CI_CD.md` §5, job `security`).

### 6.1 Required companion change for Variant A

`web/next.config.ts` is currently empty:

```ts
// current — web/next.config.ts:3-5
const nextConfig: NextConfig = {
  /* config options here */
};
```

**RECOMMENDED:**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server.js and only the
  // dependencies actually reachable from the build — so the runtime image
  // does not need to carry the full node_modules tree (D-5).
  output: "standalone",
};

export default nextConfig;
```

### 6.2 Variant A — standalone output (**RECOMMENDED**)

```dockerfile
# syntax=docker/dockerfile:1
#
# Build context is web/:
#   docker build -t medrail-web:<tag> \
#     --build-arg NEXT_PUBLIC_API_BASE=https://your-api.example \
#     --build-arg NEXT_PUBLIC_NETWORK=testnet ./web
#
# NEXT_PUBLIC_* are INLINED INTO THE CLIENT BUNDLE AT BUILD TIME.
# They cannot be changed at runtime — a new URL means a new image.
# Requires output: "standalone" in web/next.config.ts (see Docker.md §6.1).

FROM node:20.19-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# .dockerignore (see §7) keeps .env.local, node_modules, .next and
# tsconfig.tsbuildinfo out of this copy — that is what makes D-5 go away.
COPY . .

ARG NEXT_PUBLIC_API_BASE
ARG NEXT_PUBLIC_NETWORK=testnet
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_NETWORK=$NEXT_PUBLIC_NETWORK
RUN test -n "$NEXT_PUBLIC_API_BASE" || (echo "NEXT_PUBLIC_API_BASE build-arg is required" && exit 1)

RUN npm run build

FROM node:20.19-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
```

### 6.3 Variant B — no application-code change

Use this if `web/next.config.ts` must stay as committed. It still fixes D-4, the `.env.local` leak, the host-`node_modules` overwrite, the missing build args, D-6, and root execution. It does **not** fix the full-`node_modules` runtime image, because that requires standalone output.

```dockerfile
# syntax=docker/dockerfile:1
# docker build -t medrail-web:<tag> --build-arg NEXT_PUBLIC_API_BASE=https://your-api ./web
FROM node:20.19-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_BASE
ARG NEXT_PUBLIC_NETWORK=testnet
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_NETWORK=$NEXT_PUBLIC_NETWORK
RUN test -n "$NEXT_PUBLIC_API_BASE" || (echo "NEXT_PUBLIC_API_BASE build-arg is required" && exit 1)
RUN npm run build

FROM node:20.19-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "next", "start"]
```

---

## 7. **RECOMMENDED** — `.dockerignore` files

Neither file exists today. Both are required to close D-3 and the D-5 build-context half. Docker does **not** read `.gitignore`; these must be written explicitly.

### 7.1 Repo root — `/.dockerignore` (used by `api/Dockerfile`)

```gitignore
# ---- secrets: never enter a build context (SEC-015, D-3) ----
**/.env
**/.env.*
!**/.env.example
*.mnemonic
contracts/.env

# ---- dependency + build output: reinstalled/rebuilt inside the image ----
**/node_modules
contracts/.venv
api/dist
web/.next
web/out
**/*.tsbuildinfo

# ---- vcs, tooling, editor ----
.git
.github
**/.pytest_cache
**/__pycache__
**/*.pyc

# ---- not needed by the API image ----
web
docs
scripts
*.md
LICENSE

# ---- contracts: keep ONLY the ARC-56 spec the API serves ----
contracts/**
!contracts/artifacts/MedRailConsent.arc56.json
```

The last stanza is the important one and it is worth reading twice: it excludes the whole of `contracts/` — including `contracts/.env` and `contracts/.venv/` — then re-includes exactly the one file `api/Dockerfile:20` needs. It also excludes `contracts/artifacts/deploy_testnet.json`, which makes D-1 **structural rather than accidental**: the App ID **must** come from the environment, and the corrected `index.ts` in §5.1 refuses to start without it. That is the right outcome, because as §1.2 shows, the file-based fallback could not have saved the committed `fly.toml` anyway — it looks for a `deploy_mainnet.json` that has never existed.

### 7.2 `web/.dockerignore` (used by `web/Dockerfile`)

```gitignore
.env
.env.*
!.env.example
node_modules
.next
out
build
coverage
*.tsbuildinfo
.git
.vercel
npm-debug.log*
README.md
AGENTS.md
```

Excluding `node_modules` is what stops the host tree from overwriting the image's freshly-installed one; excluding `.env.local` is what stops `http://localhost:4021` being baked into a published frontend.

---

## 8. Build and run

### 8.1 Build

```bash
# API — from the REPO ROOT, note the trailing "."
docker build -f api/Dockerfile -t medrail-api:$(git rev-parse --short HEAD) .

# Web — context is web/
docker build -t medrail-web:$(git rev-parse --short HEAD) \
  --build-arg NEXT_PUBLIC_API_BASE=http://localhost:4021 \
  --build-arg NEXT_PUBLIC_NETWORK=testnet \
  ./web
```

Tag with the commit SHA, never `latest`. `latest` is unrollbackable; see `Rollback_Strategy.md` §3 and **OPS-059**.

### 8.2 Run the API

```bash
docker run --rm -p 4021:4021 \
  -e NETWORK=testnet \
  -e CONSENT_APP_ID=768743428 \
  -e PAY_TO_ADDRESS=<your 58-char address> \
  -e FACILITATOR_URL=https://facilitator.goplausible.xyz \
  -e OPERATOR_MNEMONIC="$(cat /path/to/operator.mnemonic)" \
  medrail-api:<tag>
```

**`CONSENT_APP_ID` is not optional here.** Omit it and you reproduce D-1 exactly.

Never put a mnemonic on the `docker run` command line in a shared shell — it lands in shell history and in `docker inspect`. Prefer `--env-file` with a file outside the build context, a platform secret store, or a mounted file read at boot.

Smoke test:

```bash
curl -s localhost:4021/v1/health | jq
# {"ok":true,"service":"medrail-api","network":"testnet","consentAppId":768743428,"time":"..."}
#                                                          ^^^^^^^^^ must NOT be null

curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4021/v1/triage \
  -H 'content-type: application/json' -d '{"symptoms":"chest pain"}'
# 402  ← correct. 500 means the facilitator is unreachable (R-1).
```

### 8.3 Run the web image

```bash
docker run --rm -p 3000:3000 medrail-web:<tag>
```

No runtime environment is accepted — the API base was fixed when the image was built.

### 8.4 Fly.io

```bash
fly deploy -c api/fly.toml                # from the repo root
```

**Do not run this against the committed `api/fly.toml` without fixing D-2 first.** Minimum safe change:

```toml
[env]
  NETWORK = "testnet"                     # was "mainnet" — D-2; no MainNet contract exists
  PORT = "4021"
  FACILITATOR_URL = "https://facilitator.goplausible.xyz"
  CONSENT_APP_ID = "768743428"            # D-1; not a secret, safe in the file

[http_service]
  internal_port = 4021
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
  max_machines_running = 1                # D-7 — see the note below

  [[http_service.checks]]                 # D-6 / OPS-054
    grace_period = "15s"
    interval = "30s"
    method = "get"
    path = "/v1/health"
    timeout = "5s"
```

then, separately and never in the file:

```bash
fly secrets set OPERATOR_MNEMONIC="..." PAY_TO_ADDRESS="..." -c api/fly.toml
```

`max_machines_running = 1` is the mitigation for **D-7**, and it is worth being precise about what it mitigates. The **contract** self-assigns the audit sequence (`contract.py:224-226` — `log_access` reads its own `audit_seq` box and computes `next_seq`). The client-side `predictedSeq` at `algorand.ts:159-172` exists only to populate the AVM **box-reference array**, which Algorand requires to be declared in advance. So a second machine does **not** corrupt or misorder the audit log — the losing racer's transaction is simply **rejected by the AVM**. But on the unguarded success path of `records.ts:49`, a rejection becomes **HTTP 500 after the payment has settled**: horizontal scaling silently converts a scaling win into lost payments (R-2 / REL-002).

Its cost is no redundancy and no gapless rolling deploy. **That is the correct trade** until `logAccess` retries on a box-reference rejection and `records.ts` guards its success path (`api/src/services/algorand.ts:123-138`, REL-002, REL-004).

---

## 9. Runtime configuration contract

What the image cannot supply and the platform must.

| Variable | Required | Secret | Consequence if missing | Where to set |
|---|---|---|---|---|
| `CONSENT_APP_ID` | **Yes, in a container** | No | **D-1** — `/v1/consent/status` and `/v1/records/summary` return 500; `/v1/health` still reports `ok:true` | `fly.toml [env]`, or `-e` |
| `OPERATOR_MNEMONIC` | **Yes** | **YES** | Every chain-touching route 500s — **including the free `/v1/consent/status`**, because `checkAccess` needs a signer for `atc.simulate` (`algorand.ts:8-14, 92-93`) | `fly secrets set` / secret store only |
| `PAY_TO_ADDRESS` | **Yes** | No — a public address | `402` challenges advertise an empty `payTo`; settlement cannot target anything | `fly secrets` or `[env]` |
| `NETWORK` | Yes | No | Defaults to `testnet` (`config.ts:42`). `api/fly.toml:10` overrides to `mainnet` — **D-2** | `fly.toml [env]` |
| `PORT` | No | No | Defaults to `4021`; must match `internal_port` and `EXPOSE` | `fly.toml [env]` |
| `FACILITATOR_URL` | No | No | Defaults to GoPlausible (`config.ts:47`). Unreachable ⇒ all priced routes 500 (R-1) | `fly.toml [env]` |
| `OPERATOR_ADDRESS` | No | No | Only a fallback for `PAY_TO_ADDRESS` (`config.ts:53`); the signer comes from the mnemonic | optional |
| `NEXT_PUBLIC_API_BASE` | **Yes (web)** | No | **Build-time only.** Wrong value ⇒ the shipped frontend calls the wrong host | `--build-arg` |
| `NEXT_PUBLIC_NETWORK` | **Yes (web)** | No | Build-time only | `--build-arg` |

There is **no** algod URL variable. `ALGOD_SERVER` is hardcoded per network at `api/src/config.ts:21-24` with no override — **OPS-057**, and a genuine single point of failure. See `../10_Operations/Disaster_Recovery.md` §6.

---

## 10. Defect summary and remediation status

| ID | Sev | Defect | Fixed by |
|---|---|---|---|
| **D-1** | **HIGH** | Deploy artifact not in the image; `CONSENT_APP_ID` fallback fails in a container; `fly.toml` does not set it | §5 header contract + §5.1 fail-fast + §7.1 (structural) + §8.4 `[env]` |
| **D-2** | **HIGH** | `fly.toml:10` `NETWORK = "mainnet"` with no MainNet contract | §8.4 |
| **D-3** | MEDIUM | No `.dockerignore`; `.env` files, `.venv/`, both `node_modules/` in the root build context | §7.1 |
| **D-4** | MEDIUM | `npm install` instead of `npm ci` in both images | §5, §6 |
| **D-5** | MEDIUM | `web` `COPY . .` copies `.env.local` and host `node_modules`; no standalone output | §6.1, §6.2, §7.2 |
| **D-6** | LOW | No `HEALTHCHECK` in either image or in `fly.toml` | §5, §6, §8.4 |
| **D-7** | MEDIUM | `fly.toml` permits >1 machine; `withPatientLock` is in-process only. Concurrent same-patient `logAccess` calls are **rejected** (not misordered) and become 500s after settlement | §8.4 `max_machines_running = 1` |
| **G-27** | **HIGH (advisory)** | `nanoid@3.3.17` — GHSA-2v37-7h3g-55p8, fix available. **Ships in the web runtime image** via `next@16.3.0 → postcss` and `web/Dockerfile:14` copying the full `node_modules`. In `api/` the same advisory is dev-only (`vitest → vite → postcss`) and does **not** reach the runtime image | §6.1 standalone output shrinks the tree; upgrade the dependency; add `npm audit` to CI (`CI_CD.md` §5) |

**Every fix in this document is RECOMMENDED. None of it is in the repo.** Applying §5–§8 does not make NFR-007 **VALIDATED** either — that requires CI to actually build both images on every change (**OPS-056**, see `CI_CD.md` §5).

---

## 11. Cross-references

- `Deployment_Architecture.md` — topology, environment matrix, full env-var reference, D-7 analysis.
- `Environment_Setup.md` §10 — troubleshooting entries T-3 (D-1) and T-9 (D-5) from an operator's point of view.
- `CI_CD.md` — the pipeline that should build these images and does not (CI-3, OPS-056).
- `Rollback_Strategy.md` — why untagged, unbuilt images make rollback impossible.
- `../02_Requirements/SRS.md` — NFR-007, SEC-015, SEC-016, OPS-001, REL-004.
- `../06_Security/Risk_Register.md` — SEC-012 operator-key concentration; the D-3 exposure path.
- `../07_Testing/Test_Plan.md` — what an image-build verification test would need to assert.
