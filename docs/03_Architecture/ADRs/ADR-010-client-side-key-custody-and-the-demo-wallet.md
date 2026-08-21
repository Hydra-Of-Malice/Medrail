# ADR-010: Client-side key custody, and the browser-generated demo wallet

**Status:** Accepted
**Date:** Not recorded as a decision date. `web/lib/demoWallet.ts`, `web/lib/consent.ts` and `docs/SECURITY.md` first appear in commit `d2a5f7f`, 2026-08-07.
**Deciders:** Not recorded in repository
**Evidence:** `docs/SECURITY.md:28-38` (key-management table); `docs/ARCHITECTURE.md:130-142`; `web/lib/consent.ts:43-68` (patient signs directly); `web/lib/demoWallet.ts:10-31`; `web/lib/demoWallet.ts:33-52` (`ClientAvmSigner`); `web/lib/x402Client.ts:6-12`; `api/src/` (no key-ingress path anywhere)

## Context

Three distinct keys exist in this system, with three different holders:

| Key | Held by | Signs |
|---|---|---|
| Deployer mnemonic (`contracts/.env`) | Local dev machine, gitignored | One-time deploy + funding |
| Operator / admin mnemonic (`api/.env`) | Backend process | `log_access`; also required for `simulate()` on read-only calls |
| Patient / requester keys | The user's own browser | `grant_access`, `revoke_access`, and x402 payments |

The third row is the interesting one. A patient granting consent is a signed on-chain action. Either the backend holds that key and signs on the patient's behalf, or the patient's own client signs and the backend never touches it.

## Problem

Where do patient keys live, and how does a judge try the flow in under a minute without installing a wallet extension?

## Options considered

| Option | Pros | Cons | Why rejected |
|---|---|---|---|
| **Patient keys stay in the browser; the backend never sees them** (chosen) | The patient-ownership claim becomes structurally true rather than promised — MedRail *cannot* forge a grant, because it has no key to sign one with. No custody liability. No key-ingress endpoint to attack. Grants are signed and submitted directly to AlgoNode with no backend proxy (`web/lib/consent.ts:55-67`). | The client needs `algosdk` and a signer. Onboarding friction: the visitor must have *some* key. Nothing recoverable — losing the key loses the grants. | — |
| **Backend-custodied patient keys** | Trivial UX: patient clicks "grant", server signs. Recoverable. | Destroys the thesis. If MedRail holds the patient's key, MedRail can grant itself access, and "the patient owns their data" is a UI convention. Creates a custody honeypot with regulatory weight. | Rejected by the product claim. NFR-008 exists specifically to forbid it. |
| **Backend proxies a client-signed transaction** | Slightly simpler client; backend can batch or retry. | Puts MedRail in the submission path for the patient's own action — it could withhold or delay a revoke, which is the one transition where timing matters. Adds a code path where a raw signed transaction transits MedRail. | Weakens the guarantee for a marginal convenience. |
| **Require a real wallet extension (Pera / Defly / `@txnlab/use-wallet`)** | Production-correct. Keys in a hardened, user-controlled wallet. Recoverable. | A judge with no Algorand wallet installed bounces before seeing anything. Extension install + TestNet network switch + funding is several minutes of friction on a demo whose whole point is immediacy. | Not rejected in principle — recorded as the intended production path. It is **NOT IMPLEMENTED** (see below). |
| **Browser-generated throwaway TestNet keypair in `sessionStorage`** (chosen for the demo) | One click, no install. Cleared when the tab closes. TestNet-only, so the key controls nothing of value. Funded from the public dispenser. | Plaintext mnemonic in `sessionStorage` — any XSS on the page exfiltrates it. Non-recoverable. Would be indefensible on MainNet. | — (chosen, with explicit scope limits) |

## Decision

1. **No patient key ever reaches the backend.** `grant_access` and `revoke_access` are constructed, signed and submitted entirely client-side against AlgoNode (`web/lib/consent.ts:44-89`). x402 payments are signed in the browser by a `ClientAvmSigner` (`web/lib/x402Client.ts:6-12`). The backend has no endpoint that accepts a key, a mnemonic, or an unsigned transaction to sign.
2. **For the demo, generate a TestNet-only keypair in the browser** and persist `{address, mnemonic}` as JSON in `sessionStorage` under `medrail-demo-wallet-v1` (`web/lib/demoWallet.ts:13-27`).

## Rationale

### This rationale is recorded in the implementation

`docs/SECURITY.md:28-38` records the key-management table, whose third row reads: patient/requester keys are "**never** held or proxied by the backend, ever." The same section records the demo wallet's scope:

> "The demo wallet (`web/lib/demoWallet.ts`) is explicitly TestNet-only, generated client-side, stored only in `sessionStorage` (cleared when the tab closes), and never sent to the backend in plaintext — only signed transaction bytes are ever transmitted. It exists purely so a judge can try the live flow in under a minute without installing a wallet extension first."

`web/lib/consent.ts:43` records it at the call site: *"Patient signs directly with their own key — the backend never sees or proxies this."*

`docs/ARCHITECTURE.md:133-138` records the forward-compatibility argument for the demo wallet:

> "a TestNet-only keypair generated in the browser (`lib/demoWallet.ts`), held in `sessionStorage`, implementing the SDK's `ClientAvmSigner` interface directly (`{address, signTransactions}`) — this is the same interface real wallet libraries like `@txnlab/use-wallet` implement, so swapping in a real wallet later is a signer-object change, not an architecture change."

**The custody claim is verified true.** There is no key-ingress path anywhere in `api/src`; the backend's only key is its own operator mnemonic. **NFR-008 IMPLEMENTED**, and it is one of the genuinely strong properties of this system. It should be credited without hedging.

## Trade-offs

**1. Plaintext mnemonic in `sessionStorage`.** `web/lib/demoWallet.ts:25` writes `JSON.stringify({address, mnemonic})` to `window.sessionStorage`. Any XSS on the demo page exfiltrates a signing key. The mitigations are real and bounded: TestNet only, dispenser-funded play money, cleared on tab close, disclosed in the UI ("has zero real-world value") and in `docs/SECURITY.md:35-38`. This is an acceptable trade for a TestNet demo and an unacceptable one for anything else. Nothing in the code enforces the TestNet-only restriction — it is a convention, not a guard.

**2. DOC-4 — the claimed production wallet path does not exist.**

`web/lib/demoWallet.ts:12`:

> `* MainNet — production usage goes through a real wallet (see lib/walletConnect.ts). */`

**`web/lib/walletConnect.ts` does not exist.** Verified: `web/lib/` contains exactly `api.ts`, `config.ts`, `consent.ts`, `demoWallet.ts`, `x402Client.ts`, and a repository-wide search for `walletConnect` returns nothing. There is no wallet-connect integration anywhere in `web/` — no `@txnlab/use-wallet`, no Pera connector, no Defly connector.

`docs/IMPLEMENTATION_PLAN.md:68` states it more strongly, and this is the overclaim:

> "Production/MainNet usage is via a real wallet (Pera/Defly) — **that code path is also implemented**, just not the one-click default."

**It is NOT IMPLEMENTED.** This is the single place in an otherwise scrupulously honest document set where a claim exceeds the code, and it must be corrected. The correct statement is: the demo wallet implements the `ClientAvmSigner` shape that a real wallet adapter would also implement, so the *integration point* exists; the adapter does not.

**3. The signer abstraction is real for payments and absent for consent — a qualification the recorded rationale does not make.**

*Analysis by review; not recorded in the repository.*

`docs/ARCHITECTURE.md:133-138` claims swapping in a real wallet is "a signer-object change, not an architecture change." That is **true for the payment path** and **false for the consent path**:

- Payments: `buildPaidFetch(signer: ClientAvmSigner)` (`web/lib/x402Client.ts:6`) and `callPaidEndpoint(signer, …)` (`:20-24`) take the *interface*. A real wallet adapter satisfying `{address, signTransactions}` drops straight in.
- Consent: `grantAccessOnChain(wallet: DemoWallet, …)` and `revokeAccessOnChain(wallet: DemoWallet, …)` (`web/lib/consent.ts:44-49, 70`) take a `DemoWallet` — a `{address, mnemonic}` object — and immediately do `algosdk.mnemonicToSecretKey(wallet.mnemonic)` (`:50, 71`), then sign with `makeBasicAccountTransactionSigner`. **A real wallet has no mnemonic to give.** Supporting one requires changing both function signatures to accept a signer and replacing the transaction signer construction.

So the effort to add a real wallet is small — perhaps a dozen lines plus an adapter — but it is not zero, and the two paths are not equally prepared. Any claim that the wallet swap is free should be scoped to payments.

**4. Non-recoverable by design.** A `sessionStorage` key vanishes with the tab, taking with it every grant the demo patient made. For a demo this is a feature. It also means the two grant boxes on the live deployment (`total_grants_active = 0`, `total_revocations = 2`) are permanently unmanageable by anyone — the throwaway patient key `S56WIB3XLUOX…` that created them is gone.

**5. Client-side signing means client-side chain access.** `web/lib/consent.ts:5` constructs its own `Algodv2` against AlgoNode. The browser talks to Algorand directly, so consent transactions do not depend on the MedRail API being up — genuinely good — but they do depend on the browser reaching AlgoNode, and they inherit the same no-timeout / no-retry posture as the backend (REL-003). `getAppId()` (`consent.ts:36-41`) does still call the API for the App ID, so the backend is a soft dependency for discovery, not for signing.

**6. Zero frontend tests.** No Vitest, Jest, Playwright or Cypress configuration exists in `web/`. FR-033, FR-034, FR-035, FR-036, FR-037 are all **IMPLEMENTED** with no automated coverage; FR-034 is evidenced only by a manual capture in `docs/PROOF.md` §4.

## Consequences

**Positive**
- NFR-008 **IMPLEMENTED** and verified — no key ingress path exists in `api/src`. This is a structural guarantee, not a policy.
- SEC-003 **VALIDATED** — the contract uses `Txn.sender` as the patient identity in both `grant_access` and `revoke_access` (`contract.py:151, 181`), so only the patient's own key can move their consent state. Client-side custody is what makes that gate meaningful.
- FR-035 **IMPLEMENTED** — grant/revoke go straight from browser to Algorand, proven live by transactions `X2BQ5FD4MW52B75WQGDB67TEULYLN7FHVFO6ZOBNI74PNCAKVOUA` and `OV2J2T5VWMIQG64JYGL7JEGZKKNZNKCMNIQU6AC4PDRQYZ6ZOO5A`.
- FR-033, FR-034 **IMPLEMENTED** — a visitor can transact without installing anything.
- SEC-005 **VALIDATED** — no `.env` file is tracked by git; only `.env.example`.

**Negative**
- **DOC-4** — `web/lib/demoWallet.ts:12` points at a non-existent file, and `docs/IMPLEMENTATION_PLAN.md:68` claims an unimplemented code path is implemented. Both must be corrected. The production wallet path is **NOT IMPLEMENTED**.
- The demo mnemonic sits in `sessionStorage` in plaintext; XSS on the demo page is key exfiltration. Bounded to TestNet play money, disclosed, but not structurally prevented.
- The consent path is not signer-abstracted, so the recorded "signer-object change, not an architecture change" claim is only half true.
- No frontend test of any kind.

**Neutral**
- The web app has exactly one route (`/`). Nothing about key custody is spread across a navigation surface.
- `web/lib/x402Client.ts:29-32` records a small, well-judged decision worth noting in passing: a 402 response means the SDK signed a payment that failed to settle (usually: the demo wallet has no TestNet USDC yet), so there is no `PAYMENT-RESPONSE` header to parse and the parser is deliberately skipped. That is the kind of expected-outcome handling missing from `api/src/routes/records.ts:49`.

## Conditions for future reconsideration

- **Correct DOC-4 before submission.** Remove the `lib/walletConnect.ts` reference at `web/lib/demoWallet.ts:12` or create the file, and rewrite `docs/IMPLEMENTATION_PLAN.md:68` to say the wallet path is *designed for* rather than *implemented*. A reviewer who follows the reference and finds nothing will re-read every other claim with suspicion — and the rest of the documentation does not deserve that.
- **Before any MainNet demo**, implement the real wallet adapter and refactor `grantAccessOnChain` / `revokeAccessOnChain` to accept a `ClientAvmSigner` rather than a `DemoWallet`. The demo wallet should then be one implementation of that interface, not the only shape the consent path understands.
- **Guard the demo wallet on network.** `getOrCreateDemoWallet()` should refuse to generate when `NEXT_PUBLIC_NETWORK !== "testnet"`, so the TestNet-only property is enforced rather than documented.
- **If real PHI is ever involved**, revisit `sessionStorage` entirely — the acceptable-risk argument depends wholly on the key controlling nothing of value.
