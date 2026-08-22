# MedRail — Environment Setup Runbook


**Purpose:** take a machine with nothing installed to a running MedRail stack that has deployed a contract, exercised it on Algorand TestNet, and settled a real x402 payment.

**Status of this document:** authored 2026-08-21 against commit `32ffd73`. Every command was reconstructed from the actual scripts (`contracts/scripts/*.py`, `api/scripts/e2e-proof.ts`) and the pinned manifests (`contracts/requirements*.txt`, `api/package.json`, `web/package.json`). The repo is developed on **Windows 11**; the `.venv` interpreter path differs on macOS/Linux and both forms are given throughout. This runbook covers **local development and TestNet only**. No public hosting exists — see `Deployment_Architecture.md` §0.

---

## 0. Before you start

| You need | Why | Cost |
|---|---|---|
| ~30 minutes | Toolchain install dominates | — |
| An email address | The Lora TestNet dispenser requires a login | free |
| Nothing else | No wallet extension, no cloud account, no credit card | TestNet ALGO and TestNet USDC are play money |

**You do not need**, and this runbook will not ask you for: a database, Docker, a cloud provider, MainNet funds, or a hardware wallet.

**Never paste a mnemonic into a chat, a ticket, a log, a screenshot, or a document.** The three `.env` files this runbook creates are gitignored (`.gitignore:1-5`, verified: `git ls-files` shows no `.env` tracked). Keep it that way.

---

## 1. Prerequisites — exact pinned versions

| Tool | Version | Where the pin lives | Check |
|---|---|---|---|
| Node.js | **20.x** | `.github/workflows/ci.yml:34, 58`; `FROM node:20-slim` in both Dockerfiles | `node -v` → `v20.*` |
| npm | ships with Node 20 | — | `npm -v` |
| Python | **3.12+** | `contracts/pyproject.toml:4` `requires-python = ">=3.12"`; `ci.yml:16` uses `3.12` | `python --version` |
| git | any recent | — | `git --version` |
| `puyapy` | **5.9.0** | `contracts/requirements-dev.txt:2`, `pyproject.toml:14` | installed into the venv in §2 |
| `algorand-python` | **3.5.1** | `contracts/requirements.txt:1` | venv |
| `algokit-utils` | **4.2.3** | `contracts/requirements.txt:2` | venv |
| `py-algorand-sdk` | **2.11.1** | `contracts/requirements.txt:3` | venv |
| `algorand-python-testing` | **1.1.0** | `contracts/requirements-dev.txt:3` | venv |
| TypeScript | **^5.7.2** (api) / **^5** (web) | `api/package.json`, `web/package.json` | `npx tsc -v` |

> `docs/IMPLEMENTATION_PLAN.md` §1 lists "puya 0.6.0" as the compiler. **That entry is stale and wrong.** The authoritative pin is `puyapy==5.9.0` in `contracts/requirements-dev.txt` and `contracts/pyproject.toml`, which is what `docs/PROOF.md` §1 also records.

### 1.1 The one platform difference that matters

Everything else in this runbook is identical across platforms. This is not:

| | Windows (PowerShell or Git Bash) | macOS / Linux |
|---|---|---|
| venv creation | `python -m venv .venv` | `python3 -m venv .venv` |
| venv interpreter | `.venv/Scripts/python.exe` | `.venv/bin/python` |
| activate (optional) | `.venv\Scripts\Activate.ps1` | `source .venv/bin/activate` |

Every `contracts/` command below is written as `<PY>`. Substitute:

```bash
# Windows
PY=".venv/Scripts/python.exe"
# macOS / Linux
PY=".venv/bin/python"
```

The repo's own docs and script docstrings (`deploy_testnet.py:16-17`, `opt_in_usdc.py:10-11`, `exercise_contract.py:12-13`) show only the Windows form because that is where they were run. **They work identically with `.venv/bin/python` on macOS/Linux.** Nothing in the scripts is Windows-specific.

---

## 2. Contract toolchain

```bash
git clone <your fork or the repo> MedRail
cd MedRail/contracts

# Windows
python -m venv .venv
.venv/Scripts/python.exe -m pip install --upgrade pip
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt

# macOS / Linux
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements-dev.txt
```

`requirements-dev.txt` pulls `requirements.txt` transitively (`-r requirements.txt` on line 1), so this one command installs both the runtime and the compiler/test toolchain.

Verify:

```bash
$PY -m pip show puyapy | head -2       # expect Version: 5.9.0
$PY -c "import algopy, algokit_utils; print('ok')"
```

---

## 3. Compile the contract

> ### ⚠ The documented compile command writes to the wrong directory — defect **G-28**
>
> The command published in `README.md:142`, `docs/DEPLOYMENT.md:12`, `docs/PROOF.md:11` and **`.github/workflows/ci.yml:22`** is:
>
> ```bash
> python -m puyapy smart_contracts/consent/contract.py --out-dir artifacts
> ```
>
> `puyapy` resolves `--out-dir` **relative to the source file**, not to the working directory. That command therefore writes to `contracts/smart_contracts/consent/artifacts/` — **not** `contracts/artifacts/`, which is the directory `contracts/scripts/deploy_testnet.py:38` and `api/src/app.ts:64` actually read.
>
> **It only appears to work because the correct artifacts are committed.** Delete `contracts/artifacts/` and follow the published Quickstart and you will not get a deployable spec. And because CI never compares its compile output against the committed artifacts, contract source and deployed spec can diverge silently — see `CI_CD.md` §1.1.
>
> **Use this instead:**

```bash
cd contracts
$PY -m puyapy smart_contracts/consent/contract.py --out-dir ../../artifacts
```

Verify it landed in the right place before continuing:

```bash
ls -la contracts/artifacts/MedRailConsent.arc56.json     # should be freshly modified
git status --short contracts/artifacts/                  # should be EMPTY — see below
```

**`git status` being empty is the point.** The build is **byte-reproducible**: recompiling with `puyapy` 5.9.0 produces output identical to the committed artifacts — approval TEAL, clear TEAL, ARC-56 JSON and both source maps all match. That reproducibility is a genuine strength, and it is what makes the one-line CI guard in `CI_CD.md` §5 (`git diff --exit-code -- contracts/artifacts/`) both reliable and cheap.

**Expected outputs in `contracts/artifacts/`:**

| File | What it is |
|---|---|
| `MedRailConsent.arc56.json` | ARC-56 app spec — **the API serves this at `/v1/consent/arc56`** (`api/src/app.ts:63-69`) and the deploy script reads it (`deploy_testnet.py:38, 87`) |
| `MedRailConsent.approval.teal` | approval program |
| `MedRailConsent.clear.teal` | clear-state program |
| `*.puya.map` | source maps |

`contracts/artifacts/` is **tracked in git** (it is not covered by `.gitignore`), so a fresh clone already has a compiled spec. Recompiling is still worth doing — it proves your toolchain matches.

---

## 4. Run the contract tests

```bash
cd contracts
$PY -m pytest tests/ -q
```

**Expected: `28 passed`** (reviewer-measured wall time 0.41 s). These run entirely against the `algorand-python-testing` 1.1.0 AVM simulator — **no network, no funds, no accounts needed**. You can and should run this before you have any wallet at all.

---

## 5. API setup

```bash
cd api
npm install          # or `npm ci` — a package-lock.json is committed; ci is what the pipeline uses
cp .env.example .env # Windows PowerShell: Copy-Item .env.example .env
```

Edit `api/.env`. The keys, from `api/.env.example`:

```ini
NETWORK=testnet
PORT=4021
FACILITATOR_URL=https://facilitator.goplausible.xyz
PAY_TO_ADDRESS=          # your TestNet address that receives USDC
CONSENT_APP_ID=          # leave EMPTY on testnet — see the note below
OPERATOR_MNEMONIC=       # 25 words. NEVER commit. NEVER paste anywhere else.
OPERATOR_ADDRESS=        # the address for the mnemonic above
```

**`CONSENT_APP_ID` may be left empty for local TestNet dev**, and only there. `api/src/config.ts:56` falls back to `readDeployedAppId(network)`, which resolves `process.cwd()/../contracts/artifacts/deploy_testnet.json` (`config.ts:32`). Because you run the API from `api/`, `cwd` is `<repo>/api` and the path lands on the real file. **This fallback does not work inside a container** — see §10 troubleshooting item D-1.

**`OPERATOR_MNEMONIC` is not optional if you intend to call any chain-touching route**, including the free one. See §10.

Verify:

```bash
cd api
npx tsc --noEmit       # expect: 0 errors
npm run build          # expect: PASS, emits api/dist
npx vitest run         # expect: 93 passed  — NOTE: makes a live call to the facilitator
```

> The API test suite is **not hermetic**. `api/test/x402-flow.spec.ts` imports `api/src/app.ts`, which initialises `x402ResourceServer` against `FACILITATOR_URL` and fetches `/supported` at first priced request. If `facilitator.goplausible.xyz` is unreachable, these tests fail with a misleading error. This is finding CI-2; see `CI_CD.md`.

Run it:

```bash
cd api
npm run dev            # tsx watch src/index.ts
# expect: MedRail API listening on http://localhost:4021 (network: testnet)
curl http://localhost:4021/v1/health
# {"ok":true,"service":"medrail-api","network":"testnet","consentAppId":768743428,"time":"..."}
```

`consentAppId: null` in that response means the fallback did not resolve. Go to §10, item D-1.

---

## 6. Web setup

```bash
cd web
npm install
cp .env.example .env.local     # Windows: Copy-Item .env.example .env.local
```

`web/.env.example` contains exactly two lines:

```ini
NEXT_PUBLIC_API_BASE=http://localhost:4021
NEXT_PUBLIC_NETWORK=testnet
```

Both are **build-time** values: Next.js inlines `NEXT_PUBLIC_*` into the client bundle. Changing either requires a rebuild, not a restart.

```bash
npx tsc --noEmit -p tsconfig.json    # expect: 0 errors
npm run dev                          # http://localhost:3000
# or:
npm run build                        # expect PASS; 2 static routes: / and /_not-found
```

The web app has **exactly one route** (`/`). It has **zero automated tests** — no Vitest, Jest, Playwright or Cypress config exists anywhere in `web/`.

---

## 7. Fund a TestNet account

You need one dedicated TestNet keypair. **Generate a fresh one for this project — never reuse a personal wallet.** The web demo's `DemoWalletCard` will generate a throwaway browser keypair for you, or use any Algorand keypair generator; record the address and mnemonic into `contracts/.env`:

```ini
DEPLOYER_ADDRESS=<58-char address>
DEPLOYER_MNEMONIC=<25 words>
```

`contracts/.env` is gitignored explicitly (`.gitignore:5`).

### 7.1 ALGO — for fees and box MBR

**https://lora.algokit.io/testnet/fund** — free email login, no wallet extension needed. Every legacy unauthenticated Algorand TestNet faucet is dead as of this writing.

You need enough for: contract creation, the 5 ALGO app funding (`deploy_testnet.py:50` `APP_FUNDING_ALGO = 5`), and 1 ALGO each for the two throwaway accounts `exercise_contract.py:61-65` funds. The script enforces its own floors: `require_algo(300_000, ...)` before deploying (`deploy_testnet.py:81`) and `require_algo(5_200_000, ...)` before funding a freshly created app (`deploy_testnet.py:119`), and it tells you the dispenser URL and your address if you are short.

### 7.2 USDC — to actually pay an endpoint

Lora's USDC option forwards to **https://faucet.circle.com**. **Pick network "Algorand Testnet" specifically — it defaults to a different chain.** Circle rate-limits per IP; the independent alternative is **https://testnet.folks.finance/faucet**, which needs a connected Algorand wallet and a CAPTCHA — a human-in-the-loop step, not something to script.

### 7.3 ⚠ Opt in to the USDC ASA FIRST — this is the step that trips everyone

**Algorand protocol rule: an account cannot receive any ASA it has not explicitly opted in to.** This is not a MedRail quirk and not a faucet quirk — it is how Algorand Standard Assets work. A faucet send to a non-opted-in account fails; you will see the faucet succeed on its side and nothing arrive on yours.

Run this **once, before your first USDC transfer**:

```bash
cd contracts
$PY scripts/opt_in_usdc.py
# Opted in to USDC (ASA 10458941) on testnet: <txid>
```

`opt_in_usdc.py:36` sends a zero-value `AssetOptInParams` transaction. It costs one minimum fee and raises your account's minimum balance by 100,000 µALGO (the standard per-ASA MBR), so make sure §7.1 is done first.

MainNet uses a different asset id — `31566704` — and the same script handles it via `NETWORK=mainnet` (`opt_in_usdc.py:22-27`).

---

## 8. Deploy the contract

```bash
cd contracts
$PY scripts/deploy_testnet.py
```

Expected output shape:

```
Network:  testnet
Deployer: <address>
Balance:  <n> ALGO
App ID:      768743428
App address: CCO26Y6Z56DDZ3OELO2UKJMIPJVSIT52I23F2MPMR52JBM3HQZZNUZNOR4
Operation:   Create            (or: Nothing, on an idempotent re-run)
Create txn:  <txid>            (or: "(already existed — no new create txn)")
Funded app account: <txid>
Wrote deploy info to .../artifacts/deploy_testnet.json
```

**Safe to re-run.** `algokit_utils`' `factory.deploy` is idempotent per `(app_name, creator)` (`deploy_testnet.py:92-96`); a re-run detects the existing app rather than creating a second one, and skips re-funding (`deploy_testnet.py:118-126`). That is exactly why the committed `contracts/artifacts/deploy_testnet.json` has `"create_txid": null` — the recorded run was an idempotent re-run, so `operation_performed != Create` and the create txid was never captured (`deploy_testnet.py:100-101`). **The app genuinely exists; the create transaction id is simply not in the repo.**

**MainNet requires an explicit opt-in to the risk:**

```bash
NETWORK=mainnet $PY scripts/deploy_testnet.py    # real funds
```

`deploy_testnet.py:40-42` defaults to `testnet` and hard-rejects any value other than `testnet`/`mainnet`. **A bare run can never touch MainNet.** This is deliberate and correct.

The deploy writes `contracts/artifacts/deploy_{network}.json`:

```json
{ "network": "testnet", "app_id": 768743428, "app_address": "...", "deployer_address": "...",
  "create_txid": null, "fund_txid": "KYH3H5CG2CCUPUUTJIBX47WD4RWSUV3QWTEUJQRQFYLWO5YAO3QA",
  "explorer_app_url": "https://lora.algokit.io/testnet/application/768743428" }
```

The deployer becomes the contract `admin` (`contract.py:118-121` — `create` sets `admin = Txn.sender`). **If you use a different account for `OPERATOR_MNEMONIC` than the deployer, `log_access` will fail with `only admin`** (`contract.py:222`) until you rotate admin with `set_admin`.

---

## 9. Exercise and prove

### 9.1 Exercise the consent lifecycle on real TestNet

```bash
cd contracts
$PY scripts/exercise_contract.py
```

Funds two fresh throwaway accounts from the deployer (1 ALGO each), then runs `request_access` → `grant_access` → `check_access` → `revoke_access` → `check_access`, printing every transaction id, and asserts `check_access` is `True` after the grant and `False` after the revoke (`exercise_contract.py:127-128`).

Reference results from the recorded run, independently verified on the indexer:

| Step | Tx ID | Round |
|---|---|---|
| `request_access` | `5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA` | 66088670 |
| `grant_access` | `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA` | 66088672 |
| `revoke_access` | `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A` | 66088674 |

### 9.2 Prove the payment flow

```bash
# terminal 1
cd api && npm run dev

# terminal 2
cd api
API_BASE=http://localhost:4021 npx tsx scripts/e2e-proof.ts
```

Requires `PROOF_MNEMONIC`, or it falls back to `DEPLOYER_MNEMONIC` from `contracts/.env` (`e2e-proof.ts:26`). That account needs **both** TestNet ALGO and TestNet USDC, and must have completed §7.3.

The script performs the real flow: request → `402` → construct + sign an Algorand payment → settle via GoPlausible → `200` + resource, then writes `contracts/artifacts/e2e-proof.json` with the settled transaction id (`e2e-proof.ts:80-97`).

Reference result already in the repo (`contracts/artifacts/e2e-proof.json`), independently verified on the indexer:

| Field | Value |
|---|---|
| Settled tx | `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ` |
| Type / asset / amount | `axfer`, ASA `10458941`, **20000** base units = exactly $0.02 at 6 decimals |
| Confirmed round | 66091768 |
| Fee | `0` — fee-sponsored by the facilitator's `extra.feePayer` |
| Endpoint | `/v1/triage`, HTTP 200 |

That run was a **self-payment** — sender and receiver are both the deployer address `2WDV2J2FTWF535SMSUVEBOF5IGXF2OTV7ZZTLTCRBXPVS32UMLOPTI64GE`, disclosed in `docs/PROOF.md` §6. It is a genuine facilitator-settled x402 payment, and it is no longer the only one. `scripts/provision-agent-wallet.ts` creates an **independent agent account** — `UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ`, whose key lives in `AGENT_MNEMONIC` and which the service does not control — and `scripts/agent-demo.ts` then settles from it to `payTo`, so sender ≠ receiver: `DOSKCNKJRXIMY2UDSDZ377LKPZQIZJW5JHCGUAGKOYV6KUCFYKIA` (round 66563930), `PLBFDDADW576IUCH62HGGYI4AJQNO3QXSENNDIBKAORWVMP7NVHQ`, `COMJ3TQOGTKP6LXDJS7HZY7B45QZJQWXXJ23HQ3IDDQYD7GRK36A` (round 66563944). That agent's TestNet USDC float was seeded from the project's own wallet, because TestNet USDC has no other practical source, so **no external party has paid for this service**. Do not describe any of it as payment volume.

### 9.3 What you cannot prove this way, and should know

`api/scripts/e2e-proof.ts` exercises `/v1/triage` only. **`POST /v1/records/summary` — the flagship consent-gated endpoint — has never completed its success path against the live contract.** The evidence: the deployed app's global state reads `total_audit_entries = 5`, and there are zero `s`- or `a`-prefixed boxes on App `768743428`. `log_access` has **never** executed on Algorand TestNet. FR-010 / FR-011 / FR-012 are all **UNVALIDATED**; see `../07_Testing/Test_Plan.md`.

To close that gap yourself, after §9.1 leaves you a live grant (re-grant if you revoked it), call:

```bash
curl -X POST http://localhost:4021/v1/records/summary \
  -H 'content-type: application/json' \
  -d '{"patientId":"<58-char patient>","requesterAddress":"<58-char requester>"}'
```

Unpaid this returns `402`. Paid — via the web demo's "Pay and call live", or by extending `e2e-proof.ts` to target this route — it will attempt `log_access` and, on success, return `auditTxId` and `auditSequence`. Verify afterwards that `total_audit_entries` on App `768743428` has incremented.

---

## 10. Troubleshooting — the real failure modes

Every entry below is either documented in the repo or was reproduced during review. Ordered by how likely you are to hit it.

### T-1 · `txn dead: round X outside of Y--Z`

| | |
|---|---|
| **Symptom** | A `contracts/scripts/*.py` call aborts with a validity-window error naming a round range. |
| **What it is** | An Algorand **transaction validity-window timeout**, not a logic bug. A transaction carries a first/last valid round; sequential network round-trips on a slow link can push submission past `last-valid`. |
| **Why the repo already guards it** | Every call in `exercise_contract.py` sets `validity_window=1000` (lines 80, 90, 101, 111, 121) for exactly this reason. `docs/DEPLOYMENT.md` documents the symptom. |
| **Fix** | Re-run the script. It is safe: `deploy_testnet.py` is idempotent, and `exercise_contract.py` generates fresh throwaway accounts each run (which is why the live counters read `total_requests = 2`, `total_revocations = 2` — it was run twice). If it recurs, raise `validity_window`. |

### T-2 · `ApplicationArgs index` error during deploy

| | |
|---|---|
| **Symptom** | An AVM error mentioning `ApplicationArgs index` on the create transaction. |
| **Cause** | `MedRailConsent.create` is declared `@arc4.abimethod(create="require")` (`contract.py:118`). A bare create call with no ABI method selector has no application args, so the program's method dispatch indexes past the end. |
| **Fix** | The deploy call must target the `create` ABI method explicitly. `deploy_testnet.py:95` already does this: `create_params=AppClientMethodCallCreateParams(method="create")`. **If you write your own deploy path — including a MainNet one — you must keep that argument.** |

### T-3 · `CONSENT_APP_ID` unset in a container (defect **D-1**, HIGH)

| | |
|---|---|
| **Symptom** | `GET /v1/health` returns `200` with `"consentAppId": null`, but `/v1/consent/status` and `/v1/records/summary` return **HTTP 500** with `"CONSENT_APP_ID is not set and contracts/artifacts/deploy_testnet.json was not found."` |
| **Cause** | `config.ts:56` falls back to `readDeployedAppId(network)`, which resolves `process.cwd()/../contracts/artifacts/deploy_{network}.json` (`config.ts:32`). `api/Dockerfile` copies **only** `MedRailConsent.arc56.json` from `contracts/artifacts/` (line 20) — **the deploy artifact is not in the image**. With `WORKDIR /app/api`, the path resolves to `/app/contracts/artifacts/deploy_{network}.json`, which does not exist. `consentAppId` becomes `0` and `requireConsentAppId()` throws (`config.ts:61-67`). |
| **Aggravating factor** | `api/fly.toml` does not set `CONSENT_APP_ID` at all, and sets `NETWORK = "mainnet"` (line 10) for which no contract exists — defect **D-2**. |
| **⚠ The obvious fix does not work** | Copying the artifact into the image does **not** rescue the committed `fly.toml`. Because `NETWORK = "mainnet"`, the fallback looks for **`deploy_mainnet.json`** — a file that **has never existed in this repository**. The only deploy artifact ever produced is `deploy_testnet.json`. **`CONSENT_APP_ID` must be set explicitly**, and `NETWORK` must point at a network where the app exists. |
| **Fix now** | Always pass it explicitly when containerised: `docker run -e CONSENT_APP_ID=768743428 ...`, or `fly secrets set CONSENT_APP_ID=768743428`. |
| **Fix properly** | See the corrected Dockerfile in `Docker.md` §5. |

### T-4 · Facilitator unreachable ⇒ every priced route returns 500 (finding **R-1** / REL-001)

| | |
|---|---|
| **Symptom** | `POST /v1/triage`, `/v1/interaction-check`, `/v1/records/summary` all return **HTTP 500** with `"Failed to initialize: no supported payment kinds loaded from any facilitator."` — **not** a `402`, **not** a `503`, and with **no `PAYMENT-REQUIRED` header and no `Retry-After`**. Free routes (`/v1/health`, `/`, `/v1/consent/app-info`) still return `200`. |
| **Cause** | `accepts[].asset` and `extra.feePayer` are supplied by the facilitator's `/supported`, not by MedRail config (`api/src/x402.ts:6-14`, and `priced()` deliberately omits `asset` — see the comment at `x402.ts:17-19`). The `402` challenge cannot be constructed offline. There is no timeout, retry, circuit breaker, or cached-`/supported` fallback. |
| **Verify it is the facilitator** | `curl -sS https://facilitator.goplausible.xyz/supported` |
| **Workaround** | None in-process. Restart the API once the facilitator is reachable. If you run your own facilitator, point `FACILITATOR_URL` at it. |
| **Also causes** | Red CI builds — the `api` job runs `npx vitest run` and `x402-flow.spec.ts` needs the live facilitator (CI-2). |
| **Runbook** | `../10_Operations/Incident_Response.md` §A. |

### T-5 · `OPERATOR_MNEMONIC` unset ⇒ even the **free** endpoint fails

| | |
|---|---|
| **Symptom** | `GET /v1/consent/status?...` returns **HTTP 500** with `"OPERATOR_MNEMONIC is not set — see docs/DEPLOYMENT.md"`, even though the endpoint is free and unauthenticated. |
| **Cause — this surprises people** | `checkAccess` uses `AtomicTransactionComposer.simulate()`, which submits nothing and costs nothing, but **still needs a `sender` and a `signer`** for the simulated call (`api/src/services/algorand.ts:84, 92-93`). `getOperator()` throws if the mnemonic is absent (`algorand.ts:8-14`). So the free, read-only consent lookup has a hard dependency on the operator **private key** being loaded into the process. |
| **Fix** | Set `OPERATOR_MNEMONIC` in `api/.env` (local) or as a platform secret (deployed). It is required for `/v1/consent/status`, `/v1/records/summary`, and any future chain read. |
| **Note** | The same account must be the contract `admin` for `log_access` to succeed (`contract.py:222` `assert Txn.sender == self.admin.value`). |

### T-6 · `only admin` on `log_access`

| | |
|---|---|
| **Symptom** | `POST /v1/records/summary` settles payment, then returns 500; the error mentions `only admin`. |
| **Cause** | `OPERATOR_MNEMONIC` is a different account from the one that created the app. `create` sets `admin = Txn.sender` (`contract.py:120`). |
| **Fix** | Either set `OPERATOR_MNEMONIC` to the deployer's mnemonic, or rotate admin: call `set_admin(<operator address>)` signed by the current admin (`contract.py:124-127`). |
| **Money impact** | This is a live instance of **R-2 / REL-002**: the caller paid $0.05 and got a 500. See `../10_Operations/Incident_Response.md` §B. |

### T-7 · 58-character but invalid address ⇒ 500 and an internal error leak (**R-3** / SEC-010, SEC-011)

| | |
|---|---|
| **Symptom** | `GET /v1/consent/status?patient=AAAA…(58 chars)&...` returns **HTTP 500** with body `{"error":"wrong checksum for address"}`. |
| **Cause** | zod validates **length only** (`consent.ts:6-10`, `records.ts:5-8` — `z.string().length(58)`). `algosdk.decodeAddress` then throws inside `grantBoxName` (`algorand.ts:49`), and `app.onError` returns `err.message` verbatim to an unauthenticated caller (`app.ts:58-61`). |
| **Two bugs, not one** | (a) a client input error reported as a server error; (b) internal exception text disclosed. |
| **Fix** | Add `.refine(algosdk.isValidAddress)` to all four address fields, and return a generic 500 body with the detail logged server-side. See `../10_Operations/Logging.md` §4. |

### T-8 · `npm ci` fails / lockfile out of sync

| | |
|---|---|
| **Symptom** | `npm ci` errors about the lockfile not matching `package.json`. |
| **Cause** | Someone edited `package.json` without regenerating the lock. Note that **both Dockerfiles use `npm install`, not `npm ci`** (`api/Dockerfile:8,17`; `web/Dockerfile:4`) — defect **D-4** — so an image build will silently succeed where CI's `npm ci` fails. |
| **Fix** | `npm install` locally to regenerate, commit the lockfile, then re-run `npm ci`. |

### T-9 · Web build succeeds but the deployed page calls `localhost`

| | |
|---|---|
| **Symptom** | The frontend loads but every API call fails with a connection error to `http://localhost:4021`. |
| **Cause** | `NEXT_PUBLIC_API_BASE` is inlined at **build** time. Setting it at runtime does nothing. And because there is no `.dockerignore`, `web/Dockerfile:5` `COPY . .` copies `web/.env.local` into the build stage, so a Docker build **bakes whatever your local `.env.local` says** — defect **D-5**. |
| **Fix** | Rebuild with the correct value: `NEXT_PUBLIC_API_BASE=https://your-api npm run build`. For images, see the corrected `web/Dockerfile` in `Docker.md` §6, which takes it as a build `ARG`. |

### T-10 · Insufficient balance during deploy or exercise

| | |
|---|---|
| **Symptom** | `Deployer needs more testnet ALGO to deploy the contract. Fund it: https://lora.algokit.io/testnet/fund. Address: <addr>` |
| **Cause** | `require_algo()` pre-flight checks (`deploy_testnet.py:68-81, 119`). |
| **Fix** | Fund from the dispenser and re-run. Remember the ASA opt-in in §7.3 also raises your minimum balance by 100,000 µALGO. |

---

## 11. Verification checklist

Run top to bottom. Every expected result below was actually observed by the reviewer — steps 1–12 on 2026-08-21, steps 13–15 on 2026-08-22.

| # | Command | Expected | Requires funds? |
|---|---|---|---|
| 1 | `cd contracts && $PY -m puyapy smart_contracts/consent/contract.py --out-dir ../../artifacts` | artifacts written to `contracts/artifacts/`, and `git status --short contracts/artifacts/` is **empty** (byte-reproducible). Note the `--out-dir` — the published command is wrong, see §3 / G-28 | no |
| 2 | `cd contracts && $PY -m pytest tests/ -q` | **28 passed** | no |
| 3 | `cd api && npx tsc --noEmit` | 0 errors | no |
| 4 | `cd api && npm run build` | PASS | no |
| 5 | `cd api && npx vitest run` | **93 passed** — needs the facilitator reachable | no |
| 6 | `cd web && npx tsc --noEmit -p tsconfig.json` | 0 errors | no |
| 7 | `cd web && npm run build` | PASS, 2 static routes | no |
| 8 | `curl localhost:4021/v1/health` | `200`, `consentAppId: 768743428` | no |
| 9 | `cd contracts && $PY scripts/opt_in_usdc.py` | opt-in txid | **ALGO** |
| 10 | `cd contracts && $PY scripts/deploy_testnet.py` | App ID + `deploy_testnet.json` | **ALGO** |
| 11 | `cd contracts && $PY scripts/exercise_contract.py` | `Full cycle verified on real TestNet.` | **ALGO** |
| 12 | `cd api && npx tsx scripts/e2e-proof.ts` | HTTP 200 + settled txid in `e2e-proof.json` | **ALGO + USDC** |
| 13 | `cd api && npx tsx scripts/provision-agent-wallet.ts` | a new agent address + fund/opt-in/float txids, `agent-wallet.json` written; save the printed mnemonic to `api/.env` as `AGENT_MNEMONIC` | **ALGO + USDC** |
| 14 | `cd api && npx tsx scripts/grant-consent.ts <agent address>` | patient-signed `grant_access` txid; the backend is not in the path | **ALGO** |
| 15 | `cd api && npx tsx scripts/agent-demo.ts` | `$0.09` across 3 settled transactions, sender ≠ receiver on each | **agent's ALGO + USDC** |

Steps 1–8 are the complete CI-equivalent verification and need no wallet at all. **Every one of them passes today** — the pipeline problem is CI-1 (wrong branch trigger), not a broken build.

---

## 12. Cross-references

- `Deployment_Architecture.md` — topology, environment matrix, full env-var reference.
- `Docker.md` — why a container needs `CONSENT_APP_ID` explicitly (T-3), and corrected Dockerfiles.
- `CI_CD.md` — CI-1/CI-2 and why step 5 above is not hermetic.
- `Rollback_Strategy.md` — what to do after a bad deploy.
- `../10_Operations/Incident_Response.md` — runbooks for T-4, T-5, T-6.
- `../02_Requirements/SRS.md` — NFR-003, NFR-004, NFR-012, SEC-010, SEC-011, REL-001, REL-002.
- `../06_Security/Risk_Register.md` — R-1, R-3, SEC-012.
- `../07_Testing/Test_Plan.md` — the 14+18 test inventory and the FR-010/011/012 evidence gap.
- `../../docs/DEPLOYMENT.md` — the original runbook this expands on; accurate but does not cover D-1, D-2, or T-5.
