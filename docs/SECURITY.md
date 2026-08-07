# MedRail — Security Notes

Written plainly: what's protected, what's not real (because there's no real PHI in this system),
and known limitations stated rather than hidden. A hackathon-grade honest threat model is worth
more to judges than a polished one that overclaims.

## There is no real patient data in this system

`/v1/records/summary` returns a single fixed synthetic record
(`api/src/routes/records.ts`, `SYNTHETIC_RECORD`) regardless of which `patientId` is queried.
Nothing about MedRail today stores, encrypts, or transmits real health information. This is
stated up front because the architecture below (client-side envelope encryption, PHI-never-
on-chain) describes the *design* a production version would need — it is not a claim that real
PHI is currently protected by it, because there isn't any yet.

## What's actually on-chain

Only: an address, a hashed `(patient, requester, scope)` key, a status byte, two timestamps, and
free-text `scope`/`endpoint`/`action` strings in the audit log (currently constants like
`"records:summary"`, `"/v1/records/summary"`, `"consent_checked"` — never patient-supplied free
text in this build). No name, no diagnosis, no medical content of any kind touches Algorand.
A production version storing real data would keep that data client-side-encrypted in
content-addressed off-chain storage, with only a hash/CID pointer on-chain — the box-storage
design already anticipates this (`grants`/`audit_log` store references and metadata, not
payloads) but no encryption pipeline exists yet because there's no real data to encrypt.

## Key management

| Key | Held by | Purpose | Never |
|---|---|---|---|
| Deployer mnemonic (`contracts/.env`) | Local dev machine, gitignored | One-time contract deploy + funding | committed to git |
| Operator mnemonic (`api/.env`) | Backend process, gitignored | Signs `log_access` calls (admin-gated) and simulates read-only calls | used for patient-signed actions |
| Patient/requester keys | The user's own wallet (demo: browser `sessionStorage`; production: a real wallet extension) | Signs `grant_access`/`revoke_access`/x402 payments | held or proxied by the backend, ever |

The demo wallet (`web/lib/demoWallet.ts`) is explicitly TestNet-only, generated client-side,
stored only in `sessionStorage` (cleared when the tab closes), and never sent to the backend in
plaintext — only signed transaction bytes are ever transmitted. It exists purely so a judge can
try the live flow in under a minute without installing a wallet extension first.

## Admin authority on the contract

`log_access` and `withdraw_excess` check `Txn.sender == self.admin.value` on-chain
(`contract.py`). `set_admin` lets the operator key rotate without redeploying — useful if the
backend's hosting environment changes, but also means whoever holds the current admin key can
write arbitrary audit entries and reclaim excess ALGO. For this build, that's the same operator
account that deployed the contract; a production version would want this behind a multisig or a
hardware-backed key, not a single hot mnemonic in an environment variable.

## Known limitation: audit-log write ordering

`log_access` predicts its own box key from the current sequence count (`get_audit_count`, then
writes at `count + 1`). `api/src/services/algorand.ts` serializes calls per-patient in-process
(`withPatientLock`) to prevent two concurrent requests for the same patient from racing and
colliding on the same predicted box — but this only protects a *single* running backend process.
Running two independent backend instances against the same operator account and contract without
an external lock could still race. Scoped out of this build as a known limitation rather than
solved with a distributed lock, which would be disproportionate engineering for a hackathon
audit log; a production version would either move the sequencing fully on-chain (have the
contract self-assign the next sequence number rather than trusting the caller's prediction) or
run a single-writer queue in front of the operator account.

## Known, deliberate design choice: consent-denied calls are still charged

`/v1/records/summary` charges the x402 fee whether or not the consent check ultimately succeeds
— see `docs/API.md`. This is a considered choice (the fee pays for a real on-chain lookup either
way, the same way a paid "record not found" API response is still billable), not an oversight,
and it's stated plainly in the endpoint's own response body (`"paidButDenied": true"`).

## Non-diagnostic disclaimers are load-bearing, not decorative

`/v1/triage` and `/v1/interaction-check` are transparent heuristics, not clinical decision
support — see `docs/IMPLEMENTATION_PLAN.md` §4 for why this is a genuine safety design choice
(a hackathon "AI triage" endpoint that reads as authoritative medical advice is a real harm
vector) and not a hedge against liability. Every response includes a disclaimer field; this is
treated as a correctness requirement in the test suite
(`api/test/triageScorer.spec.ts`, `interactionChecker.spec.ts`), not just documentation.

## Network/infrastructure

- CORS is intentionally permissive (`origin: "*"`) because MedRail's whole value proposition is
  "any agent, anywhere, can call this" — there is no session or cookie-based auth to protect
  against CSRF in the first place; every state-changing call requires either a verified x402
  payment or a patient's own transaction signature.
- The API trusts the facilitator's settlement result as the source of truth for "was this paid."
  It does not independently re-verify the settled transaction against algod before responding —
  matching the standard x402 trust model (the facilitator is explicitly the component responsible
  for verify+settle), not a shortcut specific to this build.
