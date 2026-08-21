# MedRail — API Reference


Base URL: `http://localhost:4021` (local dev) or the deployed URL from `docs/DEPLOYMENT.md`.

All paid endpoints speak x402 protocol v2 (`PAYMENT-SIGNATURE` request header, `PAYMENT-REQUIRED`
on the 402, `PAYMENT-RESPONSE` on success) against the GoPlausible facilitator
(`https://facilitator.goplausible.xyz`), scheme `exact`, settled in USDC on Algorand.

## `POST /v1/triage` — $0.02, open

Rule-based clinical red-flag triage score. No consent required, no prior relationship needed —
callable by anyone's agent.

**Request**
```json
{ "symptoms": "Sudden chest pain and shortness of breath" }
```

**Response** `200`
```json
{
  "score": 70,
  "band": "emergency",
  "matchedFlags": ["possible cardiac chest pain", "respiratory distress"],
  "disclaimer": "MedRail triage is a transparent keyword heuristic for hackathon demonstration only. ..."
}
```

`band` is one of `routine | soon | urgent | emergency`. Scoring logic and the full red-flag
keyword table are in `api/src/services/triageScorer.ts` — deliberately transparent, not a
black-box model; see `docs/IMPLEMENTATION_PLAN.md` §4 for why.

## `POST /v1/interaction-check` — $0.02, open

Checks a medication list against a small, explicitly-sourced table of well-documented severe
interaction pairs (`api/src/data/interactions.json`).

**Request**
```json
{ "medications": ["warfarin", "aspirin"] }
```

**Response** `200`
```json
{
  "flagged": true,
  "matches": [{ "drugs": ["warfarin", "aspirin"], "severity": "major", "description": "..." }],
  "source": "...",
  "disclaimer": "..."
}
```

## `POST /v1/records/summary` — $0.05, x402 + on-chain consent

Requires payment **and** a currently-valid consent grant from `patientId` to `requesterAddress`
for scope `records:summary` on the deployed `MedRailConsent` contract — **and `requesterAddress`
must equal the address that signed the payment.** That last condition is what makes this an
authorisation check rather than a paywall; without it, any payer could assert an authorised
requester's address.

**A denied request is not charged.** The 403 cancels x402 settlement. Use the free
`GET /v1/consent/status` to check before paying.

**Request**
```json
{ "patientId": "<58-char Algorand address>", "requesterAddress": "<58-char Algorand address>" }
```

**Response `200`** (consent valid)
```json
{
  "patientId": "...",
  "requesterAddress": "...",
  "scope": "records:summary",
  "summary": { "bloodType": "O+", "allergies": ["penicillin"], "...": "..." },
  "consentVerifiedOnChain": true,
  "auditStatus": "recorded",
  "auditTxId": "...",
  "auditSequence": "3",
  "disclaimer": "Synthetic demo data ... no real patient information exists in this system."
}
```

**Response `403`** (paid, but no valid consent grant)
```json
{
  "error": "no valid consent grant from this patient for this requester and scope",
  "patientId": "...", "requesterAddress": "...",
  "charged": false,
  "hint": "GET /v1/consent/status?patient=&requester=&scope=records:summary is free"
}
```

**Response `403`** (payer does not match the asserted requester)
```json
{ "error": "requesterAddress must match the address that signed the payment", "requesterAddress": "...", "payer": "..." }
```

## `GET /v1/consent/status` — free

Read-only, unpaid. Query params: `patient`, `requester`, `scope` (all required, addresses are
58-char Algorand addresses).

```
GET /v1/consent/status?patient=...&requester=...&scope=records:summary
```
```json
{ "patient": "...", "requester": "...", "scope": "records:summary", "granted": true }
```

## `GET /v1/consent/app-info` — free

```json
{ "network": "testnet", "networkCaip2": "algorand:SGO1...", "consentAppId": 12345, "arc56SpecUrl": "/v1/consent/arc56" }
```

## `GET /v1/consent/arc56` — free

Serves `contracts/artifacts/MedRailConsent.arc56.json` directly, so any client (including a
third-party integrator) can construct its own ABI calls against the deployed contract without
needing this repository.

## `GET /v1/health` — free

```json
{ "ok": true, "service": "medrail-api", "network": "testnet", "consentAppId": 12345, "time": "..." }
```

## On-chain, not through this API

Consent grant/revoke/request are **not** backend endpoints — they are signed directly by the
patient's own wallet against Algorand (see `web/lib/consent.ts`). This backend never holds or
proxies a patient's signing key. See `docs/ARCHITECTURE.md` "Frontend's role."
