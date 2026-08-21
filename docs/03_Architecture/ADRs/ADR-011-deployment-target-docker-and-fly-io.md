# ADR-011: Deployment target — a root-context Docker image on Fly.io

**Status:** Accepted (rationale reconstructed)
**Date:** Not recorded as a decision date. `api/Dockerfile`, `api/fly.toml` and `web/Dockerfile` first appear in commit `d2a5f7f`, 2026-08-07.
**Deciders:** Not recorded in repository
**Evidence:** `api/Dockerfile:1-24`; `api/fly.toml:1-24`; `web/Dockerfile:1-17`; `api/src/config.ts:31-40, 56`; `api/src/app.ts:63-69`; `docs/IMPLEMENTATION_PLAN.md:74-77` (§5); `.github/workflows/ci.yml`

## Context

The API is a stateless Node process with no datastore (ADR-002). It needs to be reachable at a public HTTPS URL for the competition entry, and it needs one file from outside its own directory: the compiled ARC-56 application spec at `contracts/artifacts/MedRailConsent.arc56.json`, which `api/src/app.ts:63-69` serves at `GET /v1/consent/arc56` so third parties can build their own ABI calls (FR-015).

`docs/IMPLEMENTATION_PLAN.md:75` records a boundary that shapes this decision: standing up the public endpoint requires an account and possibly billing details belonging to the user, so the deliverable is "complete, ready-to-deploy configs (`Dockerfile`, `fly.toml`) so this is a login-and-click step, not a code-writing step." The configs are prepared but were never executed, and — critically — **never built by CI** (CI-3). `api/Dockerfile` has never been proven to build. NFR-007 is **UNVALIDATED**.

## Problem

How should the API be packaged and where should it run, given that (a) it must reach a file two directories up from its own root, (b) the person deploying it is not the person who wrote it, and (c) nothing in CI will catch a mistake in the configuration?

## Options considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **Multi-stage Docker image built from the repo root, deployed to Fly.io** (chosen) | The root build context is the only way a single image can carry both `api/dist` and `contracts/artifacts/…`. Fly is a `fly deploy` away from a public HTTPS URL with `force_https`, and it is language-agnostic so the same file works for a long-lived Node process. `[[vm]]` sizing is explicit and small. | Root context drags the entire repo — including `.env` files and both `node_modules` trees — into the build daemon. Fly requires an account and, in practice, a card. Two config files (`Dockerfile`, `fly.toml`) that CI never exercises. | — |
| **Docker built from `api/` as context** | Small context, conventional, no repo-wide exposure. | Cannot reach `contracts/artifacts/MedRailConsent.arc56.json`; `/v1/consent/arc56` would 404 (`api/src/app.ts:65-67`) and FR-015 would be **NOT IMPLEMENTED**. Would need the artifact copied or vendored into `api/`, duplicating a generated file. | The ARC-56 spec is a genuine product surface; losing it to build hygiene is the wrong trade. **The build-context choice is recorded and correct.** |
| **Vercel / serverless functions** | Zero-config for the Next.js frontend; generous free tier; no container to maintain. | The API keeps a long-lived operator key in memory and an in-process per-patient lock (ADR-009) — both are hostile to a function-per-request model, where every cold start reloads the key and the lock protects nothing. Also re-triggers the facilitator `/supported` fetch per cold start (R-1, PERF-001). | Structurally wrong for this process. `web/` is a different question — the runbook suggests `vercel --prod` there, and there is no `vercel.json`. |
| **Render / Railway / a plain VPS** | Comparable to Fly; a VPS gives full control. | A VPS adds OS patching, TLS termination and process supervision to a project with no operations coverage (OPS-002…OPS-005 **NOT IMPLEMENTED**). Render/Railway are near-equivalent to Fly and would trade one account requirement for another. | No differentiator either way. See Rationale — the platform choice is not recorded. |
| **No deployment config; document manual steps** | Nothing to get wrong. | Leaves the user writing deployment code, which is exactly what `docs/IMPLEMENTATION_PLAN.md:75` set out to avoid. | Contradicts a recorded goal. |

## Decision

Package the API as a two-stage `node:20-slim` image built from the **repository root** (`api/Dockerfile:1-3`), copying `api/dist`, `api/src/data` → `dist/data`, and `contracts/artifacts/MedRailConsent.arc56.json` → `/app/contracts/artifacts/`. Deploy with `fly deploy -c api/fly.toml` from the repo root (`api/fly.toml:1-2`).

## Rationale

### What is recorded

Two things, both narrow:

1. **The build context**, recorded in the Dockerfile's own header (`api/Dockerfile:1-3`):
   > "Build from the REPO ROOT so this stage can reach contracts/artifacts: `docker build -f api/Dockerfile -t medrail-api .` (not from inside api/ — see docs/DEPLOYMENT.md)"

   `api/fly.toml:1-2` repeats it. This is a correct decision, correctly documented at the point where someone would otherwise get it wrong, and the path arithmetic checks out: `app.ts` compiles to `/app/api/dist/app.js`, so `path.resolve(__dirname, "..", "..", "contracts", "artifacts", …)` (`api/src/app.ts:64`) resolves to `/app/contracts/artifacts/MedRailConsent.arc56.json`, exactly where `api/Dockerfile:20` puts it. Credit this — it is easy to get wrong and it was got right.

2. **Prepare-but-do-not-execute**, recorded at `docs/IMPLEMENTATION_PLAN.md:75`. That is a rationale for why the configs exist unexecuted, not for which platform they target.

### Reconstructed rationale

> **Decision rationale not documented in implementation; the reasoning below is reconstructed by review and should not be treated as historical fact.**

The repository never argues for Fly.io. `docs/IMPLEMENTATION_PLAN.md:75` writes "Vercel/Fly.io/etc." — an enumeration, not a selection. Reconstructing:

1. **A long-lived process, not a function.** The operator key is loaded once and memoised (`api/src/services/algorand.ts:12`), the facilitator's payment kinds are cached at initialise (PERF-001), and `withPatientLock` is process-local state (ADR-009). All three assume a process that stays up. Fly runs containers; Vercel runs functions. That distinction alone selects Fly over the frontend's platform.
2. **HTTPS with no work.** `force_https = true` (`api/fly.toml:16`) is the one transport-level security control the system has (SEC-016 **PARTIALLY IMPLEMENTED**), and it is one line.
3. **A Dockerfile is the portable artifact.** Whatever platform the user picks, the image works. `fly.toml` is nineteen lines of platform commitment on top of a portable base.
4. **Small, cheap sizing suits a stateless service.** `shared` CPU, 1 vCPU, 512 MB (`api/fly.toml:21-24`) is right for a process whose work is JSON parsing and outbound HTTP.

## Trade-offs and real defects

The packaging decision is sound. The configuration shipped with it is not. Four defects are verified.

**D-1 (HIGH) — the App ID fallback cannot work in a container, and `fly.toml` does not supply the alternative.**

`api/src/config.ts:56` resolves the consent App ID as `Number(process.env.CONSENT_APP_ID || readDeployedAppId(network) || 0)`. The fallback reads `resolve(process.cwd(), "..", "contracts", "artifacts", "deploy_${network}.json")` (`config.ts:32`). **That file is not copied into the image** — `api/Dockerfile:20` copies only `MedRailConsent.arc56.json`. So in a container the fallback always returns `undefined`, `consentAppId` is `0`, and `requireConsentAppId()` throws (`config.ts:61-69`), making `/v1/records/summary` and `/v1/consent/status` fail with HTTP 500.

`CONSENT_APP_ID` must therefore be set explicitly — and **`api/fly.toml:9-12` does not set it.** The `[env]` block carries `NETWORK`, `PORT` and `FACILITATOR_URL` only.

It is worse than a missing copy. With `WORKDIR /app/api` (`api/Dockerfile:22`), `process.cwd()` is `/app/api`, so the lookup path is `/app/contracts/artifacts/deploy_<network>.json` — and because `fly.toml` sets `NETWORK = "mainnet"`, the file it would look for is `deploy_mainnet.json`, which has never existed in any form. Copying `deploy_testnet.json` into the image would not fix this deployment. **NFR-004 is IMPLEMENTED (breaks in container).**

**D-2 (HIGH) — `fly.toml` hard-codes a network where the contract does not exist.**

`api/fly.toml:10`: `NETWORK = "mainnet"`. `MedRailConsent` is deployed on **TestNet** as App ID `768743428`. There is no MainNet deployment. A `fly deploy` today produces a live service pointed at a network with no contract, no App ID (D-1), and a `payToAddress` that would need MainNet USDC. The runbook tells the operator to set these as secrets, but the committed default is a broken production configuration, and the failure is silent at boot: nothing validates the pairing, and `/v1/health` returns 200 regardless (see ADR-012).

**D-3 (MEDIUM) — no `.dockerignore` anywhere in the repository.**

Verified: no `.dockerignore` at the repo root, in `api/`, or in `web/`. Because `api/Dockerfile` builds from the repo root, `api/.env` and `contracts/.env` — both containing live mnemonics — are transmitted into the Docker build context. **No secret lands in a published layer today**: `api/Dockerfile` copies only `package.json`, `package-lock.json*`, `tsconfig.json`, `src/`, `src/data`, and one artifact file. The margin is one careless `COPY api/ ./api/` wide, and that is exactly the kind of edit someone makes while debugging a missing file — see D-1, which invites precisely that edit. **SEC-015 NOT IMPLEMENTED.**

The context also carries `contracts/.venv/` and both `node_modules/` trees, which makes every build slow for no benefit.

**D-4 (MEDIUM) — `npm install`, not `npm ci`.**

`api/Dockerfile:8` and `:17`, and `web/Dockerfile:4`, all run `npm install` despite committed `package-lock.json` files — and despite CI running `npm ci` (`.github/workflows/ci.yml:36, 57`). The image can therefore resolve a different dependency tree from the one CI typecheck-and-tested. For a project pinning `@x402/*` at exactly `2.21.0` because integration correctness depends on it, non-reproducible builds are a poor fit. One-word fix in three places.

**Related, for completeness:**

- **D-5** — `web/Dockerfile:5` does `COPY . .` with no `.dockerignore`, copying `web/.env.local` and the host `node_modules` into the build stage. Today `.env.local` holds only `NEXT_PUBLIC_*` values, so nothing secret is exposed, but the pattern is unsafe. It also does not use Next.js `output: "standalone"` (`web/next.config.ts` is empty), so the runtime image carries the full `node_modules` (`web/Dockerfile:14`).
- **D-6** — no healthcheck in either Dockerfile and none in `fly.toml`, despite `/v1/health` existing and being ideal for one (OPS-001). See ADR-012.
- **CI-3** — CI has no image build, no deployment stage, no security scanning and no artifact publishing. `api/Dockerfile` and `api/fly.toml` are never exercised, which is why four config defects reached the repository unnoticed. **NFR-007 UNVALIDATED.**
- **CI-1** — the workflow triggers on `push: branches: [main]` while the only branch is `master`, so no push has ever run CI. Every job passes locally (VERIFIED_FACTS §18); the pipeline simply never fires. This is a trigger defect, not a broken build, and should be described that way.
- `scripts/` at the repo root is **empty**, though `docs/IMPLEMENTATION_PLAN.md:94` lists it as "repo-level orchestration (setup, smoke tests)" (**DOC-6**). `web/` has no `vercel.json`; the runbook suggests `vercel --prod`.

## Consequences

**Positive**
- FR-015 **IMPLEMENTED** — the root build context is what makes `/v1/consent/arc56` work in a container, and the path arithmetic is correct.
- SEC-016 **PARTIALLY IMPLEMENTED** — `force_https = true` is present; no HSTS/CSP/`X-Content-Type-Options` are set by the app.
- The image is small and stateless — no volumes, no migrations, no init containers, a direct dividend of ADR-002.

**Negative**
- NFR-004 **IMPLEMENTED (breaks in container)** — D-1.
- NFR-007 **UNVALIDATED** — D-2, D-4, CI-3. The committed production config is broken and has never been built.
- SEC-015 **NOT IMPLEMENTED** — D-3.
- OPS-001 **IMPLEMENTED but not wired** — D-6.
- OPS-006 **PARTIALLY IMPLEMENTED** — CI-1.

**Neutral**
- Fly.io is a reasonable default and not a lock-in: the Dockerfile is portable and `fly.toml` is the only platform-specific file.
- The "prepare, do not execute" boundary (`docs/IMPLEMENTATION_PLAN.md:74-77`) is a defensible operating rule. Its cost is precisely that nothing was exercised, and all four defects above are downstream of that.

## Conditions for future reconsideration

Ordered by cost-to-fix, ascending:

1. **Set `CONSENT_APP_ID` and `NETWORK = "testnet"` in `api/fly.toml`**, or add a boot-time assertion that `consentAppId != 0` and that the network matches a known deployment. Fixes D-1 and D-2 in two lines. Today the first `fly deploy` produces a service that 500s on two of its seven endpoints.
2. **Add a `.dockerignore`** at the repo root excluding `**/.env*`, `**/node_modules`, `contracts/.venv`, `.git`. Fixes D-3 and speeds every build (SEC-015).
3. **Change `npm install` → `npm ci`** in all three places. Fixes D-4 and aligns the image with what CI validated.
4. **Add a `HEALTHCHECK` and a `fly.toml` http check** against `/v1/health`. Fixes D-6 — but read ADR-012 first, because the endpoint as written returns 200 even when D-1 has broken the service.
5. **Fix CI-1** (`branches: [master]`, or rename the branch) and **add a docker build job**. Until CI builds the image, NFR-007 stays **UNVALIDATED** and there is no mechanism that would have caught any of D-1…D-4.
6. **Reconsider the platform** only if the process stops being long-lived, or if the operator key moves to a managed signer that changes the runtime shape.
