# MedRail Web — judge-facing demo frontend

The presentation layer over the MedRail x402 API. Its job is to let someone who has never seen
this project construct, sign, and settle a **real** Algorand payment in under a minute, and then
grant and revoke **real** on-chain consent — without installing a wallet extension first.

Everything on this page is live. There are no mocked responses and no canned transaction IDs.

## Stack

| | |
|---|---|
| Framework | Next.js 16.3.0 (App Router, Turbopack) |
| UI | React 19.2.8, Tailwind CSS 4 |
| Chain | `algosdk` ^3.6.0 against public AlgoNode infrastructure |
| Payments | `@x402/fetch`, `@x402/avm`, `@x402/core` (x402 protocol v2, scheme `exact`) |

One route: `/` (`app/page.tsx`).

## What each piece does

| Path | Responsibility |
|---|---|
| `components/NetworkBadge.tsx` | Polls `GET /v1/health` — the badge reflects real backend state, including the configured App ID |
| `components/DemoWalletCard.tsx` | Shows the session wallet's address and live ALGO balance, links to the TestNet dispenser |
| `components/LiveDemoPanel.tsx` | Endpoint picker and the paid-call flow; renders HTTP status, response body, and a link to the settled transaction |
| `components/ConsentChecker.tsx` | Grant / revoke / check against `MedRailConsent`, signed in the browser |
| `components/PricingTable.tsx` | The endpoint, price, and gate table |
| `lib/x402Client.ts` | Registers `ExactAvmScheme` and wraps `fetch` so a 402 is answered with a real signed payment |
| `lib/consent.ts` | Builds and submits `grant_access` / `revoke_access` app calls directly via `AtomicTransactionComposer` |
| `lib/demoWallet.ts` | Generates a TestNet-only keypair in the browser, held in `sessionStorage` |
| `lib/api.ts`, `lib/config.ts` | Backend client and network/explorer configuration |

## Two things worth understanding about the architecture

**The backend never sees a patient key.** `grant_access` and `revoke_access` are constructed and
signed client-side in `lib/consent.ts` and submitted straight to Algorand. The API is not in that
path at all — it only ever *reads* consent state. This is the property that makes the
"patient owns their data" claim structurally true rather than a policy promise.

**The demo wallet is a signer, not a wallet integration.** `lib/demoWallet.ts` implements the
SDK's `ClientAvmSigner` interface — `{ address, signTransactions }` — which is the same interface
a real wallet library (Pera, Defly, `@txnlab/use-wallet`) exposes. Swapping in a real wallet is
therefore a change of signer object, not a change of architecture.

> **Not implemented:** there is currently **no** real-wallet integration. The demo wallet is the
> only signer. A comment elsewhere in the codebase references a `lib/walletConnect.ts`; that file
> does not exist. See `../docs/ENGINEERING_GAP_REPORT.md` (G-18).

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

Requires the API running on the URL in `NEXT_PUBLIC_API_BASE` (default `http://localhost:4021`) —
see [`../api`](../api) and [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | `http://localhost:4021` | MedRail API base URL |
| `NEXT_PUBLIC_NETWORK` | `testnet` | Selects the algod endpoint and explorer links (`testnet` \| `mainnet`) |

Both are `NEXT_PUBLIC_*` and therefore baked into the client bundle. No secret belongs in this
application.

## Trying the live flow

1. The page generates a TestNet wallet on first load and shows its address.
2. Fund it with free TestNet ALGO at <https://lora.algokit.io/testnet/fund>, and with TestNet USDC
   (ASA `10458941`) from <https://faucet.circle.com> — select **Algorand Testnet**.
   The account must opt in to the USDC asset before it can receive a transfer; the browser demo
   wallet does not do this automatically, so an unfunded or un-opted-in wallet will produce a
   signed-but-unsettled payment. That outcome is handled and explained in the UI rather than
   surfacing as an error.
3. Pick an endpoint and click **Pay and call live**.
4. Use the **On-chain consent** panel to grant yourself access, then call the records endpoint.

## Verification

```bash
npx tsc --noEmit -p tsconfig.json
npm run build
```

Both pass. There are currently **no automated tests** in this package — see
[`../docs/07_Testing/Test_Plan.md`](../docs/07_Testing/Test_Plan.md).

## Build and deployment

`Dockerfile` is present but has never been built in CI, and carries known defects (no
`.dockerignore`, `npm install` rather than `npm ci`, no `output: "standalone"`). See
[`../docs/08_Deployment/Docker.md`](../docs/08_Deployment/Docker.md) before using it.

---

Full project documentation: [`../docs/README.md`](../docs/README.md).
Architecture and reasoning: [`../docs/03_Architecture/`](../docs/03_Architecture/).
