# MedRail Web — judge-facing demo frontend

The presentation layer over the MedRail x402 API. Its job is to let someone who has never seen
this project connect a real Algorand wallet, then construct, sign, and settle a **real** payment,
and grant, revoke, or deny **real** on-chain consent from the patient's side too.

Everything on this page is live. There are no mocked responses and no canned transaction IDs.

## Stack

| | |
|---|---|
| Framework | Next.js 16.3.0 (App Router, Turbopack) |
| UI | React 19.2.8, Tailwind CSS 4 |
| Chain | `algosdk` ^3.6.0 against public AlgoNode infrastructure |
| Payments | `@x402/fetch`, `@x402/avm`, `@x402/core` (x402 protocol v2, scheme `exact`) |
| Wallets | `@txnlab/use-wallet-react` with the Pera and Lute adapters |

One route: `/` (`app/page.tsx`).

## What each piece does

| Path | Responsibility |
|---|---|
| `components/NetworkBadge.tsx` | Polls `GET /v1/health` — the badge reflects real backend state, including the configured App ID |
| `components/WalletProviders.tsx` | Wraps the app in `@txnlab/use-wallet-react`'s `WalletProvider`, sharing one connected wallet across every panel |
| `components/ConnectWalletCard.tsx` | Lets a judge connect a real TestNet wallet (Pera or Lute), shows its address and live ALGO balance |
| `components/LiveDemoPanel.tsx` | Endpoint picker and the paid-call flow; renders HTTP status, response body, and a link to the settled transaction |
| `components/ConsentChecker.tsx` | Grant / revoke / check against `MedRailConsent` for the connected wallet, signed in the wallet itself |
| `components/UserPanel.tsx` | Patient dashboard — profile, an access log of who has asked for a record, blacklist flags, and approve/deny/revoke per requester |
| `components/PricingTable.tsx` | The endpoint, price, and gate table |
| `lib/x402Client.ts` | Registers `ExactAvmScheme` and wraps `fetch` so a 402 is answered with a real signed payment; defines the `ClientAvmSigner` contract |
| `lib/walletConnect.ts` | The `WalletManager` configuration and the adapter from use-wallet's `algosdk.TransactionSigner` to `ClientAvmSigner` |
| `lib/consent.ts` | Builds and submits `grant_access` / `revoke_access` app calls directly via `AtomicTransactionComposer`, signed by whatever wallet is connected |
| `lib/dummyData.ts` | Illustrative patient profile and access-log entries used only by `UserPanel` — approving/revoking one still submits a real transaction |
| `lib/api.ts`, `lib/config.ts` | Backend client and network/explorer configuration |

## Two things worth understanding about the architecture

**The backend never sees a patient key.** `grant_access` and `revoke_access` are constructed
client-side in `lib/consent.ts` and signed by whichever wallet is connected — the API is not in
that path at all, it only ever *reads* consent state. This is the property that makes the
"patient owns their data" claim structurally true rather than a policy promise.

**Wallet integration is real, not a stand-in.** `components/ConnectWalletCard.tsx` connects a
genuine Pera or Lute wallet via `@txnlab/use-wallet-react`; `lib/walletConnect.ts` adapts its
`algosdk.TransactionSigner` to the `ClientAvmSigner` shape `lib/x402Client.ts` needs for payments,
and `lib/consent.ts` takes the signer directly for `grant_access`/`revoke_access` — no mnemonic
ever touches this codebase. (Defly is deliberately not included: its adapter currently pulls in a
deprecated WalletConnect v1 dependency tree with unresolved high-severity advisories — re-run
`npm audit` in this package before reconsidering it.)

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

1. In the **Live demo** panel, connect a TestNet-mode Pera or Lute wallet and approve the connection.
2. Fund it with free TestNet ALGO at <https://lora.algokit.io/testnet/fund>, and with TestNet USDC
   (ASA `10458941`) from <https://faucet.circle.com> — select **Algorand Testnet**.
   The account must opt in to the USDC asset before it can receive a transfer; connecting a wallet
   does not do this automatically, so an unfunded or un-opted-in wallet will produce a
   signed-but-unsettled payment. That outcome is handled and explained in the UI rather than
   surfacing as an error.
3. Pick an endpoint and click **Run this call as the agent**, approving the signature in your wallet.
4. Use the **On-chain consent** panel to grant yourself access, then call the records endpoint. Or
   open the **Patient dashboard** section to approve, deny, or revoke individual requesters.

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
