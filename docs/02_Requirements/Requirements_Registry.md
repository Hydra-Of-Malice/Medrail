# MedRail — Canonical Requirement ID Registry

> **Note.** This is the canonical ID registry the SRS, the traceability matrix, and the gap analysis
> are written against. The **IDs and the requirement statements are frozen** — they were fixed at the
> start of the 2026-08-21 review so that documents written in parallel could not drift apart, and
> they have not been renumbered or reworded since.
>
> **The status column is not frozen, and has been updated.** After the review, the code was fixed:
> the payer-identity binding landed (`api/src/x402Payer.ts`), the full consent-gated composition was
> executed on Algorand TestNet, address validation, rate limiting, error classification and CI were
> added, and one finding — the supposed lost-settled-payment defect behind **REL-002** — was shown to
> have been wrong in the first place. The statuses below reflect the code as it now stands.
>
> Two caveats that remain real: (a) roughly a dozen `path:line` citations below have drifted by a few
> lines as the code changed — the sibling documents cite re-verified line numbers and should be
> preferred for navigation; (b) two contract defects are **fixed in source but not deployed**, because
> redeploying via `OnUpdate.AppendApp` would mint a new App ID and invalidate the on-chain history
> every proof in this document set cites. Those rows say so explicitly.

**Every document that cites a requirement MUST use these exact IDs and these exact statements.**
Do not invent new IDs. Do not renumber. Do not reuse an ID for a different requirement.
If you believe a requirement is missing, add it only in the range reserved for your document
(see §9) and note it as newly added.

Status labels: **VALIDATED** / **IMPLEMENTED** / **UNVALIDATED** / **PARTIALLY IMPLEMENTED** /
**NOT IMPLEMENTED** / **PLANNED** / **RECOMMENDED** (definitions in VERIFIED_FACTS.md §0).

Evidence column is a repo path, a transaction ID, or an explicit "none".

---

## FR — Functional Requirements

| ID | Requirement (atomic, testable) | Status | Primary evidence | Test |
|---|---|---|---|---|
| FR-001 | The API shall respond `402 Payment Required` with an `x402Version: 2` `PAYMENT-REQUIRED` header to any unpaid request to a priced route. | **VALIDATED** | `api/src/app.ts:36-48`, `api/src/x402.ts:12-16` | `api/test/x402-flow.spec.ts` (3 cases) |
| FR-002 | The `402` challenge shall advertise scheme `exact`, the configured CAIP-2 network, the resolved USDC asset id, and the configured `payTo` address. | **VALIDATED** | `api/src/x402.ts:19-33`; live capture in VERIFIED_FACTS §4 | `api/test/x402-flow.spec.ts` asserts `amount`/`network` |
| FR-003 | The API shall settle a presented `exact`-scheme AVM payment through the configured facilitator and return the resource on success. | **VALIDATED** | `api/src/x402.ts:6-16`; tx `OYRQRKYA7WUKBVLWTOFJSJMZFBW7VCNGP5VGH5EBUJGRCVFQFJRQ` | `api/scripts/e2e-proof.ts` (manual script, not CI) |
| FR-004 | `POST /v1/triage` shall accept `{symptoms: string}` (1–2000 chars) and return `{score, band, matchedFlags, disclaimer}`. | **VALIDATED** | `api/src/routes/triage.ts`, `api/src/services/triageScorer.ts` | `api/test/triageScorer.spec.ts` (7 cases) |
| FR-005 | The triage score shall be the capped (≤100) sum of the weights of all matched red-flag keyword groups. | **VALIDATED** | `api/src/services/triageScorer.ts:63-75` | `triageScorer.spec.ts` "caps the score at 100" |
| FR-006 | The triage urgency band shall be `emergency ≥60`, `urgent ≥30`, `soon ≥10`, else `routine`. | **VALIDATED** | `api/src/services/triageScorer.ts:55-60` | `triageScorer.spec.ts` (4 band cases) |
| FR-007 | `POST /v1/interaction-check` shall accept `{medications: string[]}` (2–20 items) and return `{flagged, matches, source, disclaimer}`. | **VALIDATED** | `api/src/routes/interaction.ts`, `api/src/services/interactionChecker.ts` | `api/test/interactionChecker.spec.ts` (6 cases) |
| FR-008 | Interaction matching shall be case-insensitive and tolerate partial medication names. | **VALIDATED** | `api/src/services/interactionChecker.ts:38-52` | `interactionChecker.spec.ts` "matches case-insensitively" |
| FR-009 | Every intelligence-endpoint response shall carry a non-diagnostic `disclaimer` field. | **VALIDATED** | `triageScorer.ts:20-24`, `interactionChecker.ts:22-25` | both spec files assert it |
| FR-010 | `POST /v1/records/summary` shall require a settled x402 payment **and** a currently-valid on-chain consent grant before returning a record summary. | **VALIDATED** | `api/src/routes/records.ts` | `api/test/x402Payer.spec.ts`, `api/test/app.spec.ts`; live run `contracts/artifacts/e2e-consent-proof.json` |
| FR-011 | When no valid grant exists, `/v1/records/summary` shall return `403` and shall still attempt an on-chain audit entry. **The caller is not charged**: a 403 cancels x402 settlement, so the response carries `charged: false` and a pointer to the free pre-flight check. | **VALIDATED** | `api/src/routes/records.ts:54-71` | `api/test/x402Payer.spec.ts` (403 shape); mechanism shared with FR-012 |
| FR-012 | On a granted access, `/v1/records/summary` shall append an on-chain audit entry and return its `auditTxId` and `auditSequence`, together with an `auditStatus` of `"recorded"` or `"pending"`. | **VALIDATED** | `api/src/routes/records.ts:83-111` | audit tx `4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ` seq 1; `total_audit_entries = 5` on-chain |
| FR-013 | `GET /v1/consent/status` shall return the live on-chain grant validity for a `(patient, requester, scope)` triple, free of charge. | **IMPLEMENTED** | `api/src/routes/consent.ts:19-33` | `api/test/app.spec.ts` exercises the route structurally; **no test asserts the granted/not-granted verdict** |
| FR-014 | `GET /v1/consent/app-info` shall return the network, CAIP-2 id, App ID and ARC-56 spec URL. | **IMPLEMENTED** | `api/src/routes/consent.ts:35-42` | `api/test/app.spec.ts` "points integrators at the ARC-56 spec and the App ID" |
| FR-015 | `GET /v1/consent/arc56` shall serve the compiled ARC-56 application spec so third parties can build their own ABI calls. | **IMPLEMENTED** | `api/src/app.ts:141-147` | none directly; CI gates artefact freshness by recompiling and diffing `contracts/artifacts/` |
| FR-016 | `GET /v1/health` shall report service liveness, active network and configured App ID. | **VALIDATED** | `api/src/routes/health.ts` | `x402-flow.spec.ts` "health check is free and unpaid"; `app.spec.ts` "does not throttle the health endpoint" |
| FR-017 | `GET /` shall return a machine-readable service index listing the public endpoints. | **VALIDATED** | `api/src/app.ts:149-177` — all 8 routes with `method`/`path`/`price`/`gate`, plus `contract` and `x402` blocks | `api/test/app.spec.ts` "advertises every mounted route, not a stale subset" |
| FR-018 | The contract shall let a patient grant a requester a named scope, optionally time-limited, signed by the patient's own key. | **VALIDATED** | `contract.py:grant_access`; tx `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA` | `test_consent.py::test_grant_then_check_access` |
| FR-019 | A grant with `duration_seconds == 0` shall never expire; otherwise it shall expire at `latest_timestamp + duration_seconds`. | **VALIDATED** | `contract.py:grant_access`, `check_access` | `test_consent.py::test_grant_with_expiry_becomes_invalid_after_expiry` |
| FR-020 | The contract shall let a patient revoke a previously granted scope. | **VALIDATED** | `contract.py:revoke_access`; tx `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A` | `test_consent.py::test_revoke_access` |
| FR-021 | Revoking a non-existent grant shall fail atomically. | **VALIDATED** | `contract.py:revoke_access` assert | `test_consent.py::test_revoke_nonexistent_grant_asserts` |
| FR-022 | Re-granting after a revocation shall reactivate the grant and restore the active-grant counter exactly once. | **VALIDATED** | `contract.py:grant_access` `was_active_before` logic | `test_consent.py::test_regrant_after_revoke_reactivates` |
| FR-023 | `check_access` shall return true only for a grant that is present, `STATUS_GRANTED`, and unexpired. | **VALIDATED** | `contract.py:check_access` | `test_consent.py` (3 cases) + live `exercise_contract.py` run |
| FR-024 | A requester shall be able to signal interest in a scope via `request_access`, incrementing a global counter and emitting an event. | **IMPLEMENTED in source** — the deployed application retains the defect | `contract.py:request_access` now emits `AccessRequested(patient, Txn.sender, scope)`; tx `5XIADMCGFP5I7H7AS656RXZS7MFEEPCVJGLA7T3SVE6XDEYSGFFA` | `test_consent.py` — a regression test now inspects the emitted payload, verified to fail against the old code. **App `768743428` still runs pre-fix bytecode (G-12): redeploy deferred by design** |
| FR-025 | `log_access` shall append an immutable, per-patient, monotonically sequenced audit entry and return its sequence number. | **VALIDATED on-chain** | `contract.py:log_access`; tx `4YLKLQKKWXXFW3UT5APJVYKXI7T7A6OACTAWCC5YBAN3XGOGHRVQ` | `test_consent.py` (simulator) + live execution: `total_audit_entries = 5`, `s`- and `a`-prefixed boxes present |
| FR-026 | `log_access` shall be callable only by the contract admin. | **VALIDATED** | `contract.py:log_access` assert | `test_consent.py::test_log_access_rejects_non_admin` |
| FR-027 | Audit sequences shall be independent per patient. | **VALIDATED** | `contract.py:log_access` via `audit_seq` BoxMap | `test_consent.py::test_audit_log_sequence_increments_per_patient` |
| FR-028 | The contract shall expose read-only audit queries (`get_audit_count`, `get_audit_entry`). | **VALIDATED** | `contract.py` | `test_consent.py` (2 cases) |
| FR-029 | The contract admin shall be rotatable without redeployment. | **VALIDATED** | `contract.py:set_admin` | `test_consent.py::test_set_admin_only_admin` |
| FR-030 | Anyone shall be able to top up the application account's box-MBR reserve via `fund_mbr`. | **IMPLEMENTED** | `contract.py:fund_mbr` | none — no test covers `fund_mbr` (G-25) |
| FR-031 | The admin shall be able to reclaim ALGO above the app's minimum balance via `withdraw_excess`. | **PARTIALLY IMPLEMENTED** | `contract.py:withdraw_excess` | `test_consent.py::test_withdraw_excess_admin_only` — **negative case only; the successful withdrawal path is untested** (G-25). The method is also unbounded in-contract (G-31) |
| FR-032 | The contract shall expose the per-grant box MBR as a queryable constant. | **IMPLEMENTED in source** — the deployed application returns the old value | `contract.py:get_grant_box_mbr`; `GRANT_BOX_MBR = 2_500 + 400 * (33 + 17)` = 22,500 µALGO, the BoxMap key prefix now counted | `test_consent.py` regression test, verified to fail against the old constant. **Redeploy deferred by design (G-20)** |
| FR-033 | The web client shall generate a session-scoped TestNet keypair in the browser so a visitor can transact without installing a wallet. | **IMPLEMENTED** | `web/lib/demoWallet.ts:14-31` | none — no frontend tests |
| FR-034 | The web client shall construct, sign and submit a real x402 payment from the browser and display the settled transaction id. | **IMPLEMENTED** | `web/lib/x402Client.ts`, `web/components/LiveDemoPanel.tsx` | none automated; manually captured in `docs/PROOF.md` §4 |
| FR-035 | The web client shall let a patient grant and revoke consent by signing directly against Algorand, without the backend holding or proxying the key. | **IMPLEMENTED** | `web/lib/consent.ts:40-95` | none automated |
| FR-036 | The web client shall display live backend health and the active network. | **IMPLEMENTED** | `web/components/NetworkBadge.tsx` | none |
| FR-037 | The web client shall publish the endpoint/price/gate table. | **IMPLEMENTED** | `web/components/PricingTable.tsx` | none |
| FR-038 | All request bodies and query parameters shall be schema-validated before use. | **IMPLEMENTED** | zod schemas in all 4 routes; addresses validated by checksum via `api/src/validation.ts` (`algosdk.isValidAddress`) | `api/test/app.spec.ts` — bad checksum ⇒ 400, wrong length ⇒ 400 |
| FR-039 | The API shall bind the identity that paid to the `requesterAddress` used for the consent check. | **VALIDATED** | `api/src/x402Payer.ts` recovers the sender of `paymentGroup[paymentIndex]` from the verified `PAYMENT-SIGNATURE` header; `api/src/routes/records.ts:41-51` returns 403 on a mismatch and treats a `null` recovery as a mismatch | `api/test/x402Payer.spec.ts` (6 cases); live attack **and** control in `api/scripts/verify-g01-fix.ts` → `contracts/artifacts/g01-verification.json` |
| FR-040 | The system shall provide a reproducible end-to-end payment proof script that records the settled transaction id to disk. | **IMPLEMENTED** | `api/scripts/e2e-proof.ts` → `e2e-proof.json`; `api/scripts/e2e-consent-proof.ts` → `e2e-consent-proof.json`; `api/scripts/verify-g01-fix.ts` → `g01-verification.json` | none run in CI |

## NFR — Non-Functional Requirements

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| NFR-001 | The API process shall hold no server-side session, user account, or persistent request state. | **IMPLEMENTED** | no datastore anywhere in `api/src` |
| NFR-002 | The resource server shall register only the CAIP-2 network it is configured for, so a payment signed for the other network is not accepted. | **IMPLEMENTED** | `api/src/x402.ts:12-16` + comment |
| NFR-003 | All environment-specific values shall be supplied by environment variables with documented defaults. | **VALIDATED** | `api/src/config.ts`, `api/.env.example`, `web/.env.example` |
| NFR-004 | When `CONSENT_APP_ID` is unset, the API shall fall back to the deploy script's recorded App ID for the active network. | **IMPLEMENTED** | `api/src/config.ts:26-36`. `api/fly.toml` now sets `CONSENT_APP_ID = "768743428"` explicitly, so the fallback is a local-development convenience rather than a deployment dependency |
| NFR-005 | All TypeScript shall compile under `strict` with zero errors. | **VALIDATED** | `api/tsconfig.json:"strict": true`; `npx tsc --noEmit` passes in both `api/` and `web/` |
| NFR-006 | The API shall be callable cross-origin by any browser client without pre-registration. | **IMPLEMENTED** | `api/src/app.ts:19-30` (`origin: "*"`) |
| NFR-007 | The API and web app shall each be buildable into a container image from a committed Dockerfile. | **UNVALIDATED** | `api/Dockerfile`, `web/Dockerfile` — both now use `npm ci` against committed lockfiles, with `.dockerignore` at the repo root and in `web/`, but **neither has ever been built in CI** |
| NFR-008 | The backend shall never hold, receive, or proxy a patient's private key. | **IMPLEMENTED** | `web/lib/consent.ts` signs client-side; no key ingress path in `api/src` |
| NFR-009 | The intelligence endpoints shall be deterministic and fully inspectable — same input, same output, with the decision rule readable in source. | **VALIDATED** | `triageScorer.ts` (11 static rules), `interactionChecker.ts` (14 static pairs) |
| NFR-010 | Documentation claims shall be traceable to a file path, transaction id, or reproducible command. | **IMPLEMENTED** | `docs/PROOF.md` is built on this principle |
| NFR-011 | Box-key derivation shall be byte-identical across the contract, the Node backend, and the browser client. | **VALIDATED** | 3 independent implementations pinned to one shared golden-vector fixture, `api/test/fixtures/box-key-vectors.json`, asserted by `api/test/boxKeyParity.spec.ts` (Node `createHash` **and** browser `crypto.subtle`) and `contracts/tests/test_box_keys.py` (Python) |
| NFR-012 | The system shall run against TestNet or MainNet by configuration change only, with no code edit. | **IMPLEMENTED** | `api/src/config.ts` network maps; `NETWORK` env in all three deploy scripts |

## SEC — Security Requirements

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| SEC-001 | Only the contract admin shall be able to write audit entries. | **VALIDATED** | `contract.py:log_access`; `test_log_access_rejects_non_admin` |
| SEC-002 | Only the contract admin shall be able to withdraw application funds or rotate the admin. | **VALIDATED** | `contract.py:withdraw_excess`, `set_admin`; 2 negative tests |
| SEC-003 | Only the patient (as `Txn.sender`) shall be able to grant or revoke consent on their own behalf. | **VALIDATED** | `contract.py` uses `Txn.sender` as the patient identity in both methods |
| SEC-004 | No protected health information shall be written to the public ledger. | **IMPLEMENTED** | only address, sha256 key, status byte, 2 timestamps, constant strings — VERIFIED_FACTS §14 |
| SEC-005 | Secrets shall never be committed to version control. | **VALIDATED** | `.gitignore` covers `.env`, `.env.local`, `*.mnemonic`, `contracts/.env`; `git ls-files` confirms none tracked |
| SEC-006 | Access to a patient's record summary shall be authorised against an on-chain grant. | **VALIDATED** | `api/src/routes/records.ts:53` — the grant is checked against an identity recovered from the payment signature, not one asserted by the caller |
| SEC-007 | The paying identity shall be cryptographically bound to the asserted requester identity. | **VALIDATED** | `api/src/x402Payer.ts` (`decodePaymentSignatureHeader` + `getSenderFromTransaction`); `records.ts:41-51`; 6 unit cases plus a live attack-and-control run |
| SEC-008 | The audit trail shall accurately attribute each access to the party that actually made it. | **VALIDATED** | consequence of SEC-007 — a mismatched `requesterAddress` is rejected with 403 before `check_access` runs, so no entry naming a non-caller can be written through this endpoint |
| SEC-009 | Consent reads shall not require a fee or submit a transaction. | **IMPLEMENTED** | `api/src/services/algorand.ts` uses `atc.simulate()` for `check_access`/`get_audit_count` |
| SEC-010 | Address-shaped inputs shall be validated for checksum, not merely for length. | **IMPLEMENTED** | `api/src/validation.ts` exports `algorandAddress`, a zod schema wrapping `algosdk.isValidAddress`, used by `records.ts` and `consent.ts`; a 58-char invalid address ⇒ **400** |
| SEC-011 | Internal exception messages shall not be returned to unauthenticated callers. | **IMPLEMENTED** | `api/src/app.ts:113-139` logs the detail server-side against a generated `requestId` and returns a generic `INTERNAL_ERROR` body |
| SEC-012 | The operator/admin key shall be protected commensurate with its authority (audit forgery + fund withdrawal + admin rotation). | **NOT IMPLEMENTED** | single hot mnemonic in an env var; acknowledged in `docs/SECURITY.md` |
| SEC-013 | Public endpoints shall be rate-limited to prevent resource exhaustion and third-party amplification. | **IMPLEMENTED** | `api/src/rateLimit.ts` — fixed-window, in-memory: `/v1/consent/status` 60/min, `/v1/consent/arc56` 30/min, `/v1/records/summary` 30/min ⇒ **429** + `Retry-After`. Priced happy paths deliberately unthrottled. In-memory and keyed on a spoofable `X-Forwarded-For`: a courtesy guard, not a security boundary |
| SEC-014 | Dependencies shall be scanned for known vulnerabilities on every change. | **PARTIALLY IMPLEMENTED** | `npm audit --audit-level=high` on both packages in `.github/workflows/ci.yml`; both report **0 vulnerabilities**. No `pip-audit`, Dependabot, or CodeQL |
| SEC-015 | Container build contexts shall exclude secret material. | **IMPLEMENTED** | `.dockerignore` at the repository root and in `web/`, so `api/.env` and `contracts/.env` no longer enter the build context |
| SEC-016 | Transport to the public API shall be HTTPS-only. | **PARTIALLY IMPLEMENTED** | `api/fly.toml:force_https = true`; no HSTS/CSP/security headers set by the app |

## PERF — Performance Requirements

**No performance requirement in this system has an agreed target, a benchmark, or a measurement.**
The four IDs below exist so the gap is traceable, not because a target has been met.

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| PERF-001 | The `402` challenge for a priced route shall be served without a per-request outbound network call. | **IMPLEMENTED** | facilitator `/supported` is fetched once at initialise and cached; reviewer measured ~15 ms warm |
| PERF-002 | `GET /v1/consent/status` shall return within a defined latency budget under a defined workload. | **NOT IMPLEMENTED** | no budget defined; single cold observation 505 ms (2 sequential algod round-trips) |
| PERF-003 | Paid endpoint latency shall be measured and published (p50/p95/p99) under a defined concurrent workload. | **NOT IMPLEMENTED** | no load test, no measurement, no tooling in repo |
| PERF-004 | The audit-log write shall not block the paid response path. | **NOT IMPLEMENTED** | `records.ts:83-99` still awaits `logAccess` inline before responding — now inside a `try/catch`, so a failure degrades to `auditStatus: "pending"` rather than an error, but the latency is unchanged |

## REL — Reliability Requirements

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| REL-001 | A facilitator outage shall degrade priced endpoints gracefully (e.g. `503` + `Retry-After`), not as an opaque `500`. | **IMPLEMENTED** | `api/src/app.ts:73-105` — 503 + `Retry-After: 30` + `{"error":{"code":"PAYMENT_FACILITATOR_UNAVAILABLE","retryable":true,"facilitator":"…"}}`, matched narrowly on the initialise failure and re-throwing everything else |
| REL-002 | A settled payment shall never be consumed without either delivering the resource or recording a recoverable failure. | **VALIDATED — satisfied structurally by the SDK** | `@x402/hono` (`node_modules/@x402/hono/dist/esm/index.mjs:203-232`) calls `processSettlement` **only** when the handler returns a status below 400; any throw or any 4xx/5xx dispatches `cancellationDispatcher.cancel(...)` and returns first. **No error path in MedRail can consume a settled payment.** The earlier "R-2 money loss" finding was factually wrong and is withdrawn. Credit belongs to x402 v2, not to MedRail |
| REL-003 | Outbound calls to algod shall have an explicit timeout and bounded retry. | **NOT IMPLEMENTED** | `new algosdk.Algodv2("", server, "")` — no timeout, no retry |
| REL-004 | Concurrent audit writes for the same patient shall not collide on a predicted box key. | **PARTIALLY IMPLEMENTED** | `withPatientLock` in `api/src/services/algorand.ts:129-138` — in-process only; `api/fly.toml` sets `max_machines_running = 1` to match, which makes the constraint explicit rather than removing it (G-11). A collision yields a **rejected transaction**, not a corrupted log — availability, not integrity — and now surfaces as `auditStatus: "pending"` |
| REL-005 | The free endpoints shall remain available when the facilitator is unreachable. | **VALIDATED** | reviewer reproduced: `/v1/health`, `/`, `/v1/consent/app-info` all returned 200 with the facilitator down |
| REL-006 | The application account shall hold sufficient balance to cover box MBR for the grants and audit entries it must create. | **PARTIALLY IMPLEMENTED** | funded with 5 ALGO at deploy; `fund_mbr` exists and is untested (G-25); no monitoring and no alerting (G-15). The deployed `get_grant_box_mbr()` still under-reports by 400 µALGO/box (G-20, fixed in source) |

## OPS — Operability Requirements

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| OPS-001 | The service shall expose a health endpoint suitable for an orchestrator probe. | **IMPLEMENTED** | `api/src/routes/health.ts`, wired to a `/v1/health` check in `api/fly.toml` |
| OPS-002 | Application logs shall be structured and carry a request correlation id. | **PARTIALLY IMPLEMENTED** | `app.onError` emits structured JSON with a generated `requestId`, method, path, message and stack; `facilitator_unavailable` and `audit_write_failed` are structured events too. There is no correlation id threaded through a normal request, and **nothing consumes the output** (G-15) |
| OPS-003 | Metrics (request rate, error rate, latency, settlement outcomes) shall be exported. | **NOT IMPLEMENTED** | no metrics of any kind |
| OPS-004 | Distributed tracing shall span the API → facilitator → algod path. | **NOT IMPLEMENTED** | no tracing |
| OPS-005 | Alerting shall exist for operator-account balance, app-account MBR headroom, and settlement failure rate. | **NOT IMPLEMENTED** | no alerting |
| OPS-006 | CI shall verify every component on every change to the default branch. | **IMPLEMENTED** | `.github/workflows/ci.yml` triggers on `push: branches: [main, master]`, `pull_request`, and `workflow_dispatch`, with pip and npm caching, `npm audit --audit-level=high` on both packages, and an artifact-freshness gate (`git diff --exit-code -- contracts/artifacts/` after recompiling). The repository's branch is `main`. No image build and no coverage gate |
| OPS-007 | Backup and restore procedures shall be defined for all stateful components. | **NOT APPLICABLE / PARTIALLY ADDRESSED** | the only durable state is on Algorand (replicated by the network); the only irreplaceable local secret is the operator mnemonic, for which no backup/rotation procedure is documented |
| OPS-008 | RPO and RTO shall be defined. | **NOT IMPLEMENTED** | never established — state this explicitly, do not invent targets |

## DATA — Data Requirements

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| DATA-001 | Consent state shall be keyed by a collision-resistant digest of `(patient, requester, scope)`. | **VALIDATED** | `contract.py:grant_key` — `sha256`, 32 B |
| DATA-002 | Audit entries shall be append-only and never mutated or deleted by any contract method. | **IMPLEMENTED** | no method writes an existing `audit_log` key; sequence only increments |
| DATA-003 | Consent scope shall be a free-form string, not an enumeration, so new endpoints need no contract change. | **IMPLEMENTED** | `scope: String` throughout `contract.py` |
| DATA-004 | The record payload returned by `/v1/records/summary` shall be synthetic and contain no real patient data. | **IMPLEMENTED** | `api/src/routes/records.ts:17-23` — one fixed constant, patient-independent |
| DATA-005 | The interaction reference table shall carry an explicit provenance statement in every response. | **VALIDATED** | `api/src/data/interactions.json:"source"`; asserted by `interactionChecker.spec.ts` |
| DATA-006 | Off-chain encrypted storage with on-chain content-address pointers shall hold real clinical payloads. | **PLANNED** | described as a design direction in `docs/SECURITY.md`; **no encryption pipeline exists** |

## AI — Intelligence-Layer Requirements

Use this prefix for the deterministic intelligence layer. **There is no ML model in this system**;
these requirements are about the rule engines, and several exist specifically to record that
conventional model-evaluation requirements are unmet and, in most cases, not applicable.

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| AI-001 | Clinical scoring logic shall be transparent and auditable — no opaque model in the decision path. | **VALIDATED** | `triageScorer.ts`, `interactionChecker.ts` are pure functions over static tables |
| AI-002 | Every intelligence response shall state that it is not a diagnosis and not a substitute for professional judgement. | **VALIDATED** | FR-009's disclaimers; asserted in both spec files |
| AI-003 | The system shall not present the triage score as a clinical severity measure or a diagnosis. | **IMPLEMENTED** | band names + disclaimer text; documented rationale in `docs/IMPLEMENTATION_PLAN.md` §4 |
| AI-004 | Interaction findings shall cite their reference class. | **VALIDATED** | `interactions.json:"source"` |
| AI-005 | Rule coverage, sensitivity and specificity shall be measured against a labelled clinical dataset. | **NOT IMPLEMENTED** | no dataset, no evaluation harness, no metric — and none is claimed |
| AI-006 | Matching shall not produce false positives on short or malformed medication names. | **NOT IMPLEMENTED** | unanchored bidirectional substring match in `interactionChecker.ts:42-43` (G-21) |
| AI-007 | Free-text clinical input shall never be written to the public ledger. | **IMPLEMENTED** | `records.ts` logs only constant `scope`/`endpoint`/`action` strings; triage/interaction bodies are never logged on-chain |
| AI-008 | The intelligence layer shall be swappable for a model-backed implementation without changing the payment or consent layers. | **IMPLEMENTED (by construction)** | both services are pure functions behind a route boundary |

---

## 9. Reserved ID ranges for newly-added requirements

If your document genuinely needs a requirement that is not above, allocate from your reserved block
and mark it `(new, added by <document name>)`:

| Document cluster | Reserved block |
|---|---|
| Security / Threat Model | SEC-050…SEC-069 |
| Testing | any prefix, ×-090…×-099 |
| Deployment / Operations | OPS-050…OPS-069 |
| Product / Use Cases | FR-100…FR-119 |
| Intelligence Layer | AI-050…AI-069 |

Do **not** allocate outside your block. Do **not** redefine an ID above.
