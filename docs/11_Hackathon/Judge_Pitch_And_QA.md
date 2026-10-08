# MedRail — Judge Pitch & Q&A

**Team Litchi** · Aditya Arnav, Rudra Pratap, Yuvraj Singh · Algorand Foundation Global x402 Challenge

| | |
|---|---|
| Live API | `https://medrail.onrender.com` |
| Live frontend | `https://medrail-1.onrender.com/` |
| Consent contract | App ID **768743428**, Algorand TestNet |
| Agent wallet | `UYBTLPHS6APCXVBDPASQMUIQCEORDIR6EMTVMNSDPSVRSR5HEPKQ5GO4YQ` |
| Patient wallet | `56LFG5EEHIJ4ZVMPHUMJH6BST2O3D4DMG3AWRZ2SN7Y3LLUDVUDILO66YM` |
| Live run | **$0.09 across 3 settled transactions**, plus 1 audit append |

---

## 30-Second Pitch

MedRail lets an AI agent discover, use, and pay for clinical services — no account, no API key, no permission from anyone but the patient. Three endpoints, priced in USDC on Algorand.

One paid call to the record endpoint is three things at once: a settled stablecoin payment, an on-chain consent grant the patient signed themselves, and an audit entry we cannot delete.

Not a mockup. An agent just paid nine cents across three TestNet transactions against our deployed API. Self-funded, so not revenue — but three separate keypairs, and every leg verifiable on-chain without us.

---

## 3-Minute Pitch

### [0:00 – 0:20] The problem

An AI agent is working a patient case. It needs three things: a symptom triage, a drug-interaction check, and the patient's record.

Today that's three vendor signups, three API keys, three billing relationships — and even then it cannot touch the record, because nobody can prove the patient allowed it.

Agents can't pay. Patients can't authorise. Same call, two broken things.

### [0:20 – 0:45] What we built

We're Team Litchi, and we built MedRail: three clinical endpoints an agent can discover, use and pay for with no account and no API key. Triage, two cents. Interaction check, two cents. Record summary, five cents — and that one is gated twice: by an x402 payment, and by an on-chain consent grant the patient signed with their own key.

So one paid call is three things at once — a settled USDC payment, an on-chain authorisation check, and an immutable audit append. That composition is the project. Consent contract: App ID 768743428, Algorand TestNet.

### [0:45 – 1:30] Live proof

*(Screen: terminal on the agent run, explorer tab ready.)*

Live right now — API at `https://medrail.onrender.com`, frontend at `https://medrail-1.onrender.com/`. We re-ran this today against that deployed service.

An agent with no prior knowledge of MedRail — its only MedRail-specific input is the base URL — reads `GET /`: eight endpoints, their prices, and which one carries a gate. Two cents, triage: EMERGENCY, score 70 — possible cardiac chest pain, respiratory distress. Two cents: MAJOR, warfarin plus aspirin.

Then the moment I want you to watch. Before spending five cents on the gated route, it checks the free consent oracle. Granted. Only then does it pay.

Nine cents. Three settled Algorand transactions, plus a fourth writing that access into the patient's audit trail. All four are on the explorer now.

And three separate keypairs. The patient granted that specific agent access, in a transaction they signed themselves — our backend is nowhere in that path. The agent pays from a key we do not hold. MedRail receives, and can sign for neither of the others. The indexer confirms sender is not receiver on every leg.

### [1:30 – 2:10] Why Algorand, why x402

Three things had to be true for this to work. Each is an Algorand property.

**Price.** Nine cents total is only viable because USDC is a native ASA, settlement is a single asset transfer with instant finality, and the facilitator sponsors the fee — our agent's payments land with `fee: 0`. A chain where gas costs more than the call cannot host a two-cent endpoint.

**The free pre-check.** Reading consent is a `simulate` call: it costs nothing. That is what makes "verify before you pay" an agent's default rather than a luxury.

**Box storage.** Grants and per-patient audit entries are first-class on-chain state at predictable cost — so the patient reads who opened their record straight off the ledger, not out of a log file we could quietly edit.

The payment authenticates the caller. The ledger authorises them. One rail, one round trip.

### [2:10 – 2:40] What we are not claiming

Three things you would probe. We'll raise them ourselves.

Our triage and interaction endpoints contain no model — no LLM, no embeddings. Eleven red-flag keyword groups and fourteen curated drug pairs, deterministic, argued in ADR-007. That was a safety decision, not a shortcut: a health endpoint that sounds authoritative and isn't reproducible is a real harm vector. Every response carries a non-diagnostic disclaimer, and the test suite asserts it as a correctness property.

Those settlements are genuine, between independent keypairs — but both wallets were seeded from our own TestNet float, because TestNet USDC has no other practical source. That is not external revenue. No unrelated party has paid us yet.

And the record behind the gate is a synthetic constant. The payment, the authorisation and the audit are real. The clinical content is not.

### [2:40 – 3:00] What's next, and the close

Next: MainNet, two known rule-engine fixes, and a first payment from a stranger's agent that finds us in the Bazaar catalogue instead of being handed the URL.

121 automated tests sit behind this — and the program running at 768743428 is byte-identical to a reproducible compile of the pinned TEAL in our repo, our source at commit `3012e2d`. So you do not have to trust a word I just said.

The patient holds the key. The agent holds the money. The ledger settles both, in one call.

*(If challenged that the run is staged: `npm run preflight` — eight checks against the live API, all green this morning, including the agent's own USDC balance and the on-chain grant.)*

---

## 5-Minute Pitch

> *Stage note before you start: pre-flight has passed 8/8 against the live API — service up, consent contract configured, facilitator reachable, 402 correct, agent wallet holding $0.71 USDC, grant active, ~171 audit writes affordable. Terminal is pre-typed against `https://medrail.onrender.com`. Do not run the agent twice; every later beat annotates output already on screen.*

### [0:00 – 0:30] The problem, stated machine-to-machine

*Nothing on screen. Face the room.*

> "We're Team Litchi. An AI agent working a patient case needs three things: symptom triage, a drug-interaction check, and the patient's own record. Today that's three vendor signups, three API keys, three billing relationships — and it still can't legally touch the record, because nobody can prove the patient allowed it.
>
> MedRail sells all three per call over x402, settled in USDC on Algorand. No account, no API key. And the record is gated by consent the patient signed with their own key, on chain. I'm going to let an agent do all of it, live, against our deployed API."

### [0:30 – 1:05] The thesis — and why it's an Algorand thesis

> "The claim is one sentence. **One paid call is three things at once: a settled stablecoin payment, an on-chain authorisation check, and an append to the patient's audit trail — all true of the same HTTP request.** Most x402 entries price an existing API per call. That's a payment rail bolted onto a product. Here, the payment and the authorisation are the same act.
>
> That composition is cheap on Algorand and awkward almost anywhere else. The facilitator sponsors the network fee, so a two-cent call actually costs two cents and the caller holds zero ALGO. The consent read is a `simulate` — free — which is why we can give the authorisation oracle away. And grants live in box storage, keyed by a hash of patient, requester and scope, so a stranger's agent can hold a grant without opting in to our app first."

### [1:05 – 1:50] Live — discovery, then two paid calls

*Terminal. Press Enter. Don't read the output aloud; point at it.*

> "This agent holds our base URL and nothing else. No account, no key, no prior relationship.
>
> **Discovery first.** It reads `GET /` — the service index. Eight endpoints, the price of each, which ones are gated, the App ID of the consent contract, and the ARC-56 spec URL it would need to build its own on-chain client. The prices it pays, it read out of that response.
>
> **Then it decides.** Chest pain and shortness of breath needs urgency scoring — two cents. Emergency, seventy: possible cardiac chest pain, respiratory distress. Two medications on board — another two cents. Warfarin plus aspirin, major. Anticoagulant plus antiplatelet raises bleeding risk, which changes how you'd manage a suspected cardiac event. That's why it bought the second service, not just the first."

### [1:50 – 2:30] The mechanism — the 402 challenge and the retry

*Second terminal. `curl` the same endpoint unpaid; base64-decode the `PAYMENT-REQUIRED` header.*

> "The agent did that handshake three times invisibly. Here it is once, slowly.
>
> An unpaid POST returns `402` with an **empty body** — the whole challenge is in the header. Decoded: x402 version 2, scheme `exact`, the network as a CAIP-2 id built from the TestNet genesis hash, amount **20000**, asset **10458941**, our `payTo`, and an `extra.feePayer`.
>
> Now look at what's ours and what isn't. Our route config holds the string `$0.02` and a network. **There is no asset id and no decimal conversion anywhere in our code.** The SDK asked the facilitator what USDC is on this network, got six decimals, and produced twenty thousand base units. The fee payer is the facilitator's. We didn't build those values — we built the thing that asks correctly. And we register only the network this process is configured for, so a TestNet process can't accept a MainNet-signed payment.
>
> The agent signs an asset transfer and retries the identical request with a `PAYMENT-SIGNATURE` header. Hold onto one detail: **settlement runs after our handler, and only on a sub-400 response.** Any 4xx we return cancels it."

### [2:30 – 3:05] The free oracle, then the gated call — the composition

*Same run, still on screen. Point at step 4.*

> "Now the record — and watch what it does **before** it spends. It calls the consent oracle, which is free, and asks whether it's allowed. Granted, on chain. *Now* the spend is justified. Five cents.
>
> **That's the beat: the agent refuses to spend money to be told no.** If that grant weren't active it would decline, spend nothing, and report what it already had.
>
> And inside that one paid call, in order: the middleware verifies the payment; the handler recovers the address that signed it; we read the grant from App 768743428; the response goes out; the payment settles; and the access is appended to the patient's own audit trail as a separate transaction naming that agent. **Two transaction ids come back in one response body, and only one of them is the payment.**"

### [3:05 – 3:30] The payment is the authentication

> "One design point, because it's the question you should ask. Consent grants are public — anyone can read a valid patient-and-requester pair off our own transaction history. So what stops me paying five cents and *claiming* to be an authorised requester?
>
> We recover the address that actually signed the payment out of the AVM payload and refuse unless it matches the requester whose consent we're checking. **403** — and settlement is cancelled, so the attack doesn't even cost the attacker the money. Then a control call, same payer asserting their own address: 200, record released. We run that attack against the live deployment as a script; it's not a claim. No API key can do this. **Paying is not being.**"

### [3:30 – 3:50] Why triage is a rule engine on purpose

> "Be clear before you score it: **there is no machine-learning model anywhere in this system.** No LLM, no embeddings, no vector store, no inference. Triage is eleven weighted red-flag phrases; the interaction check is a fourteen-row curated table.
>
> That's a safety decision with a written decision record, not a shortcut. A non-deterministic triage endpoint that reads as authoritative medical advice is a genuine harm vector, and an opaque model in a clinical path can't be audited by the clinician who'd have to trust it. What we get is determinism, a decision procedure you can read in forty lines, `matchedFlags` saying exactly which rules fired, no prompt-injection surface on a service that writes to a public ledger, and zero inference cost against a two-cent price. **The AI in this demo is the caller, not the endpoint.**"

### [3:50 – 4:20] Cross-check the indexer — then the disclosure

*Paste the agent's own transaction id into the public indexer.*

> "Straight from the public indexer, not from our server. Asset transfer, twenty thousand base units, fee zero — and **sender and receiver are different addresses.** The agent holds its own keypair, which we don't have. The patient who granted *that specific agent* access is a third address again: it signed its own grant, and it is neither the payer nor the payee. Three roles, three keypairs, checkable without us.
>
> And here's the part I'd rather tell you than have you find. **We funded both those wallets.** TestNet ALGO and USDC have no other practical source. So these are genuine account-to-account settlements between independent keypairs — they are **not external revenue.** No unrelated party has paid for this service. We've proven the mechanism, not demand, and I won't blur those two."

### [4:20 – 4:45] What we know we haven't finished

> "Four more, quickly — all in our own gap report, with reproduction commands.
>
> Type *'I have no chest pain'* into triage: thirty-five, urgent. Substring matching has no notion of negation. Feed the interaction checker the letters 'a' and 'b' and it flags five severe pairs — and our own test calls exactly that input and asserts only the disclaimer, so the suite runs that bug on every green run and can't see it. That's two fixes, not one.
>
> The contract at that App ID isn't the contract in our repo today. We found two defects — a transposed event field and an MBR constant four hundred microalgos light — fixed both in source, with three regression tests we ran against the old code first to watch them fail. We deliberately didn't redeploy, because our deploy path mints a new App ID and we'd have destroyed the history you just checked.
>
> No observability — no metrics, no tracing, no alerting. No performance numbers at all, not a p50, because anything we could measure would be a laptop. The record behind the gate is one fixed synthetic constant: this proves the permission layer, not a storage layer. And we're in the Bazaar catalogue as of this morning — but the only settles recorded against those entries are our own agent's. Findable is not the same as found."

### [4:45 – 5:00] What this proves, and what's next

> "An agent with no account, no API key and no relationship with us discovered a clinical service, priced it from the catalogue, decided what to buy, checked on chain whether it was allowed **before** spending, and paid nine cents across three settled Algorand transactions — while the patient, who is neither payer nor payee, kept control of the only call that touched their record and got an audit entry we cannot delete.
>
> Next: a stranger's agent instead of ours, MainNet under our own identity, and those two rule-engine fixes. Everything already true is on the public ledger, and every number I showed you has a command in the repo that reproduces it. Thank you."

---

## Judge Q&A

### Technical / Architecture

**Q: Why x402 at all? A subscription or an API key solves "let people pay for your API" and is boring, proven technology.**

**A:** An API key is a credential somebody has to *issue*, which means an account, a human signing up, and a billing relationship before the first call — for an agent that needs one drug-interaction check, that is three vendor onboardings to answer one question. x402 collapses it into one round trip: the agent hits `POST /v1/triage` cold, gets a 402 whose `PAYMENT-REQUIRED` header carries the price, the asset and the fee-payer, signs, and retries.

But the real reason is architectural, not commercial. With a key, the credential tells you *who* the caller is, and the server must hold per-caller state to know what that entitles them to. With x402 the payment signature *is* the identity — `/v1/records/summary` recovers the address that signed the payment and refuses unless it matches the requester whose consent it checks — so MedRail keeps no user table, no session store, no key rotation, and no per-caller state of any kind. The run against the deployed API is the proof: three services, $0.09, zero accounts created and zero keys issued.

**Q: Everything you have described is "an AI agent pays for an API." Why is this an Algorand project rather than a chain-agnostic one?**

**A:** Four AVM-specific properties carry this design, and removing any one breaks it.

1. **Fee sponsorship in the x402 `exact` AVM scheme.** The facilitator's `feePayer` (`ZMFK2OI7…RA22AA`) settles gas, so every settled payment we have shows `fee: 0` and a calling agent needs USDC but *no ALGO*. On a $0.02 sale you cannot ask the buyer to pre-fund a gas balance first.
2. **Fixed, sub-cent fees.** An audit write costs exactly 1,000 µALGO, a knowable constant, which is why `/v1/health` can report "about 171 audit writes affordable" rather than guessing against a gas market.
3. **Box storage** gives per-patient append-only state with a computable minimum balance — a grant box is exactly `2,500 + 400 × 50 = 22,500` µALGO, and the deployed app's observed min-balance of 550,400 µALGO reproduces from the protocol formula — so the audit trail lives on the ledger rather than in a database we could quietly edit.
4. **`readonly` ABI methods over algod `simulate`.** `check_access` runs as a simulated call that submits nothing and costs nothing, which is the entire reason a *free* consent oracle can exist and an agent can evaluate authorisation before deciding to spend.

Take away fee sponsorship or sub-cent fees and the unit economics die; take away free simulated reads and the pre-check has to be paid for.

**Q: Your priced endpoints depend on a third-party facilitator. What happens when GoPlausible goes down?**

**A:** The three priced routes stop; the five free routes keep serving, and that is verified rather than assumed — `/v1/health`, `GET /` and `/v1/consent/app-info` were all confirmed returning 200 with the facilitator pointed at a closed port.

The reason the priced routes cannot degrade more gracefully is specific and worth saying out loud: `accepts[].asset` and `extra.feePayer` are **not** in MedRail's configuration, they come from the facilitator's `/supported` at startup, so we cannot construct a valid 402 offline. What we control is the *legibility* of the failure — `api/src/app.ts` wraps the payment middleware, matches exactly the two SDK initialisation errors, and returns **503 with `Retry-After: 30`** and a stable `PAYMENT_FACILITATOR_UNAVAILABLE` code instead of the opaque 500 it used to return. That is the difference between telling an agent "this service is broken" and "try again shortly."

Two honest gaps: a cached-`/supported` fallback that would let the 402 itself be served during an outage is designed but not built, and the 503 path has no automated test yet because it needs the same facilitator stub our non-hermetic tests need.

**Q: The x402 middleware proves a payment settled. How do you know it was settled by the person whose consent you are checking?**

**A:** This was a real vulnerability in our own code, found in our engineering review, and it is the sharpest thing in the repo. The middleware proves *a* payment settled; it does not tell the handler *whose*.

Because `grant_access` transactions are public, the discovery step is trivial — one unauthenticated `curl` against the indexer for `application-id=768743428`, decode every call with method selector `8c3ad539`, and you recover complete `(patient, requester, scope)` triples. We executed that and got two, both with scope `records:summary`. An attacker could then pay the ordinary $0.05 while asserting someone else's `requesterAddress`, and `check_access` would return `true` because that grant genuinely exists.

The fix: `api/src/x402Payer.ts` decodes the verified `PAYMENT-SIGNATURE` header, takes `paymentGroup[paymentIndex]` — the other legs are facilitator-signed fee transactions, so only that one identifies the payer — and recovers the signing address; `records.ts:42` refuses unless `payer === requesterAddress`. We ran the actual attack against live TestNet and got **403 with no summary and no settlement**, paired with a control leg where the same payer asserts its own address and gets 200. The control is what makes it meaningful — a broken endpoint also returns 403.

**Q: Walk me through what actually happens on a call to the consent-gated endpoint.**

**A:** `POST /v1/records/summary` with `{patientId, requesterAddress}`.

1. zod validates both as real Algorand addresses, checksum included — a bad checksum used to surface as a 500 leaking internal exception text, and there is now a test asserting that string is gone.
2. **Payer binding:** recover the address that signed the payment; if it is not `requesterAddress`, 403.
3. `checkAccess` derives the box key — `"g" ‖ sha256(patient_pubkey ‖ requester_pubkey ‖ "records:summary")` — and invokes the contract's `readonly check_access` through algod `simulate`, declaring that single box reference. Nothing is submitted and nothing is spent. The contract returns `true` only if the box exists, `status == GRANTED`, and either `expires_at == 0` or `Global.latest_timestamp < expires_at`.
4. `false` → 403, plus a `consent_denied` audit entry so the patient can see who *tried*, not only who succeeded.
5. `true` → audit append, then the record.

The part to stress: the grant that gate reads was created by `grant_access`, which uses `Txn.sender` as the patient identity — so it can only have been signed by the patient's own key. Our backend cannot forge one, and revocation is a single patient-signed transaction that takes effect on the very next call, because step 3 is a live read and not a cached entitlement.

**Q: How does the audit write actually work, and why should anyone believe MedRail cannot tamper with it?**

**A:** `log_access` is admin-gated on-chain — `assert Txn.sender == self.admin.value` — so the only account that can append to a patient's trail is our operator, and no caller can forge an entry. The contract self-assigns the sequence: it reads its own `audit_seq` box, computes `next_seq`, writes both `audit_seq` and `audit_log[patient ‖ itob(next_seq)]`, and increments `total_audit_entries`.

The subtlety lives on our side: the AVM requires every box a program touches to be declared in the transaction's box-reference array *before* execution, so the backend must predict the sequence — `getAuditCount` via `simulate`, then `+1` — to name the right box. The key layouts are `"s" ‖ pubkey` (33 bytes) and `"a" ‖ pubkey ‖ itob(seq)` (41 bytes), and those derivations are pinned by golden vectors asserted from **both** the TypeScript and the Python side, so the two implementations cannot drift.

The write costs the operator 1,000 µALGO and the app account its box MBR — both are reported by `/v1/health` precisely because running dry is a *silent* failure. The response hands back `auditTxId` and `auditSequence` so the caller verifies the append themselves on a public explorer; the deployed-API run's was `SPX2VMUVYWLANO3IWT3AYONH47YKJ25C2V2F726RUP77HFRKBJXQ`.

The honest boundary: append-only and operator-signed is not the same as trustless — we control *whether* an entry is written, just not what a written entry says or whether it can later be deleted.

**Q: Algorand gives you atomic groups. Why isn't the audit write in the same group as the payment, so it's all-or-nothing?**

**A:** It was genuinely available — the `exact` AVM scheme permits up to 16 transactions in the client's signed group — and we rejected it deliberately.

To sign that leg, a caller would need our App ID, the `log_access` ABI signature, and the box references, *including a predicted sequence number it cannot compute without reading chain state first*. No off-the-shelf `@x402/fetch` client can do that. And `log_access` is admin-only anyway, so accepting caller-signed writes would mean rewriting the contract to let arbitrary callers append to a patient's audit trail, which destroys the property that makes the trail worth anything. We traded ledger-level atomicity for "any stranger's agent works with zero MedRail-specific code" — the thing that made the discovery-to-payment run possible in the first place.

State the asymmetry plainly rather than letting a judge find it: the admin gate guarantees there is **no logged access without a settled payment**; it does *not* guarantee there is no settled payment without a logged access. Atomicity becomes the right call the moment we control both ends, which is the orchestrator shape, not this one.

**Q: So if the audit write fails after the payment has settled, the caller has paid and got nothing?**

**A:** No — and the reason is structural rather than something we were careful about. In x402 v2, verify and settle are distinct phases: `@x402/hono` runs the route handler after verification, and `processSettlement` — the call that actually moves money — is unreachable if the handler throws or returns any status ≥ 400. Every error path in this system therefore lands *before* money moves, which is why a consent-denied 403 truthfully reports `charged: false`.

Separately, the success path is wrapped in a try/catch: if the audit write throws — operator out of ALGO, app account short of MBR, algod 5xx, a mispredicted box reference — the caller still receives 200 with the record and `auditStatus: "pending"`, rather than a 500 that would discard a sale they were entitled to.

Note the cost asymmetry runs the *other* way: a denial costs the caller nothing while costing us a chain fee for the `consent_denied` write, which is exactly why the free-and-refundable surface is rate-limited at 60/min and why the free consent oracle exists — an agent that checks first never gets there.

The gaps we will not paper over: a pending write is currently lost rather than queued, because there is no durable outbox, and that degradation path has no automated test.

**Q: You have pinned the API to a single instance. That is not an architecture, that is a constraint you could not solve.**

**A:** It is a constraint, and it falls directly out of the box-reference prediction. Two concurrent `log_access` calls for the same patient read the same count and both declare `audit_log[…n+1]`; the first lands, and the second's contract-computed `next_seq` is `n+2` — a box it never declared — so the AVM rejects it.

Be precise about what that failure is and is not: the on-chain log is never corrupted or misordered, because the contract self-assigns; the loser simply gets a rejected transaction. Our mitigation is `withPatientLock`, a ten-line per-patient promise chain — *per-patient*, not global, so unrelated patients still write concurrently, and it chains on both fulfilment and rejection so one failed write cannot wedge a patient's queue permanently.

That is only true inside one process, so `api/fly.toml` sets `max_machines_running = 1` with a comment stating why. The current shape stated honestly: the live service runs a single instance, but nothing in the hosting configuration enforces the pin the way that `fly.toml` line does — today "do not scale this out" is an operational rule, not an enforced invariant. The correct fix is to stop making the box key depend on a guessed counter: accept `seq` as an argument the contract validates and rejects on mismatch, converting a silent race into a clean retryable error. That needs a contract change and a redeploy.

**Q: Your own README says `/v1/records/summary` "does not currently bind the paying identity to the `requesterAddress` it checks consent against, so the consent gate does not yet function as an access control." That is your entire pitch. Which is it?**

**A:** The code binds it; that README paragraph is stale and it is our error. The bypass was real, we found it in our own review, and it is closed at `api/src/routes/records.ts:41-51` by the payer-recovery mechanism described above, verified by a live attack-and-control run against TestNet with the transcript recorded in `contracts/artifacts/g01-verification.json`.

What happened is that the fix landed and the USP section was updated while the Security section three screens down kept its pre-fix wording — a documentation defect, not a code one, and it should be rewritten to read "found, fixed, verified live, here is the evidence" before anyone else reads it. We would rather be the team whose documentation over-reports its own bugs than the one whose documentation under-reports them, but stale is not the same as rigorous, and this one is stale.

**Q: You claim the deployed program is this repository's source. Is the code I'm reading the code running at App 768743428?**

**A:** Two statements are both true and the order matters. The approval program at App `768743428` is byte-identical to a compile of the **pinned** TEAL in `contracts/artifacts/` — re-verified by an algod `compile` whose 1,404-character base64 program and hash `W4TMZHJOL7FIN5GIGJCWNB2HVI4C4WGVRDVY6BMUUOMWRFHMBJVSPZZ33U` match the chain exactly. Those pinned artifacts are `contract.py` as of commit `3012e2d`.

Today's `contract.py` is two fixes ahead — a transposed ARC-28 event field order, and `GRANT_BOX_MBR` that omitted the BoxMap's 1-byte key prefix (22,100 against the correct 22,500) — so a fresh compile of current source produces 927 lines of approval TEAL against the deployed 922 and deliberately does *not* reproduce the pinned set. It compiles to `contracts/artifacts/current/`, which CI regenerates and diffs, while a separate CI step asserts the pinned set was not regenerated. Neither fix touches the consent gate or the audit append.

We are holding the redeploy on purpose: `deploy_testnet.py` uses `OnUpdate.AppendApp`, which mints a *new* App ID, and redeploying would abandon `768743428` along with its boxes and its entire transaction history — which is the evidence this submission rests on.

---

### Algorand / x402-Specific

**Q: Why Algorand? This design would work on any x402-compatible chain — what makes the chain choice more than "we entered the Algorand challenge"?**

**A:** Straight answer first: we did not run a cross-chain bake-off, and we won't pretend otherwise. We entered an Algorand Foundation challenge and used its designated AVM facilitator. What we can defend is why the chain fits the design.

The authorisation read is free and sits inside the request path — `check_access` is `readonly=True` and executed through `AtomicTransactionComposer.simulate()`, no fee, no transaction, no state change, which is what lets `GET /v1/consent/status` be a free route and let our agent check consent for $0.00 before committing $0.05. USDC on Algorand is a native ASA, so the payment leg is a single protocol-level `axfer` with a flat minimum fee, not a token-contract call whose gas can exceed a $0.02 price. The audit append is a fixed, statable cost — box MBR plus a flat fee — so "every paid access writes to the ledger" is a rounding error rather than a business risk. Add single-round finality: no confirmation depth to wait out before we serve the body.

At $0.02 a call, the chain's cost floor decides whether the product is possible at all, and here it is a constant we can quote. (The arithmetic behind each of those is in the Technical section.)

**Q: What does the `exact` scheme actually mean in x402, and what does your 402 carry?**

**A:** `exact` means the client pays precisely the amount, in precisely the asset, to precisely the address named in the challenge — no metering, no streaming, no negotiation.

Our live 402 on `POST /v1/triage` returns an empty body and a base64 `PAYMENT-REQUIRED` header that decodes to: `scheme: "exact"`, `network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI="` (CAIP-2, TestNet genesis hash), `amount: "20000"` (base units — exactly $0.02 at 6 decimals), `asset: "10458941"` (TestNet USDC), our `payTo`, `maxTimeoutSeconds: 300`, and `extra.feePayer`.

Nothing there is hardcoded by us: we declare the price as the string `"$0.02"` and the SDK's money parser plus the facilitator's `/supported` resolve the rest. Verified end to end — the 402 advertised 20000 and the settled `axfer` moved exactly 20000, with `fee: 0`.

The client's side of `exact` on AVM is a payload of `{paymentGroup, paymentIndex}`: an atomic group of transactions plus the index of the one leg the caller signed. That structure is load-bearing for us — see the payer-binding question.

**Q: Is any of this only possible on Algorand, or is it portable to another x402 chain?**

**A:** Portable in principle, and we should be precise about which parts.

The x402 half is deliberately chain-agnostic: swapping `ExactAvmScheme` for another chain's scheme plus a facilitator that supports it is a change in one file, `api/src/x402.ts`, where we register exactly one CAIP-2 network on purpose so a TestNet process cannot accept a MainNet-signed payment. The consent contract would need rewriting, but an on-chain consent registry is a known pattern on every chain — we say so in our own docs.

Two honest corrections to the strongest version of this pitch: a free contract read is **not** Algorand-exclusive (`eth_call` is free too), and fee sponsorship is the facilitator's feature, not ours.

What does not port for free is the **economics**: a flat minimum fee plus a sponsored `feePayer` means an agent needs USDC and no gas token at all, and our per-call chain cost is a constant. On a fee-market chain it is a variable, and at $0.02–$0.05 per call a variable is fatal. So: not cryptographically exclusive, materially cheaper here, and we have not built or benchmarked a port — that is an argument about cost structure, not a measurement.

**Q: What is genuinely novel here, versus you just wiring together primitives that already existed?**

**A:** Mostly the latter, and our README says so in a section called "What is not novel, stated plainly": *x402 is a protocol we consume, not one we invented. Algorand box storage is standard. On-chain consent registries are a known pattern. The two intelligence endpoints are deterministic rule engines, not models. The novelty is the composition, not the parts.*

Specifically not ours: HTTP 402 has been in the spec since HTTP/1.1; the `exact` scheme, the `PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE`/`PAYMENT-RESPONSE` triple and verify/settle are all `@x402/*` at pinned 2.21.0; the facilitator verifies, settles, sponsors fees and supplies the asset id — we configure scheme, network, price and `payTo` and nothing more; payer recovery is two SDK exports and about fifteen lines; "immutable audit trail on a blockchain" is the oldest claim in the category. Our own novelty scorecard grades engineering novelty as **NONE**.

What is left, stated narrowly: one paid HTTP call that is simultaneously a settled USDC payment, an authorisation evaluation against a permission only the patient's key can create or revoke, and an append to a per-patient trail — with no account, key, or prior relationship on either side. Composition, argued from first principles, proven on-chain, at demonstration scale.

**Q: You issue no API keys and hold no sessions. How do you know the caller is the agent the patient authorised, rather than anyone who read that grant off the public indexer?**

**A:** Because the payment is the authentication. An x402 payment is a signed Algorand transaction, and a signature is an identity assertion — the credential was already inside the request, unread.

`payerFromRequest` (`api/src/x402Payer.ts`) decodes the verified `PAYMENT-SIGNATURE` header, takes `paymentGroup[paymentIndex]` — the one leg the caller signed; the others are the facilitator's fee-payer legs and identify nobody relevant — and recovers the sender. `routes/records.ts` returns **403** unless that address equals the `requesterAddress` whose consent it checks, and treats a failed recovery as a mismatch, never as a fallback.

Tested adversarially against live TestNet, not assumed: `scripts/verify-g01-fix.ts` grants a genuinely third-party address consent, pays from a *different* key while asserting that address, and gets 403 with no settlement — a 4xx cancels settlement in x402 v2, so the attempt cost the attacker nothing and earned them nothing — then runs the matched control and gets 200.

Two concessions. This was a real bug we shipped first and fixed (G-01, in our own gap report). And a signature proves control of a keypair and nothing more: nothing here establishes that an address belongs to a licensed clinician. Right boundary for a demo, blocking gap for anything clinical.

**Q: The AVM `exact` scheme allows up to 16 transactions in the client's signed group. You could have bundled the audit write into the payment — so your "one atomic call" isn't atomic, is it?**

**A:** Correct, and we state it that way in ADR-005 and in the novelty document: **"one call" describes the HTTP interaction, not the ledger.** Payment settles through the facilitator; `log_access` is a follow-up transaction moments later.

We could have bundled it and chose not to, for a recorded reason: a generic `@x402/fetch` client only knows how to build the transactions described in `paymentRequirements` — it has no way to know our App ID or method signature — so a custom group would break every off-the-shelf caller, which is the whole machine-to-machine premise. Two further blockers make it worse than a preference: box references must be declared in the transaction, so the client would have to predict the next audit sequence number it cannot compute without first reading chain state; and `log_access` is admin-only, so a caller could not sign it without opening the audit log to caller-signed writes and destroying that control.

The cost is permanent and we name it: a settled payment with a failed audit write is representable. It degrades to 200 with `auditStatus: "pending"` rather than a 500 — and nothing alerts on it, because we have no observability at all (G-15, open). The right fix is a durable outbox, which our own no-database decision excludes.

**Q: GoPlausible does your verify and settle, sponsors the fees, and even supplies the asset id. What did you actually build on the payment side?**

**A:** We built the resource server, which is exactly one of x402's three roles — the facilitator being responsible for verify+settle is the protocol's design, not a shortcut, and we say so in our security notes. We configure scheme, network, price and `payTo`; `accepts[].asset` and `extra.feePayer` come from the facilitator's `/supported` at startup, which is deliberate SDK-compatibility reasoning and also our sharpest coupling.

Our own reviewer reproduced the failure: point `FACILITATOR_URL` at a closed port and we cannot construct a 402 at all, because the asset and fee-payer are not in our config. We fixed the symptom, not the cause — that condition now returns **503 with `Retry-After: 30`** and a stable `PAYMENT_FACILITATOR_UNAVAILABLE` code instead of an opaque 500, which a calling agent can act on, and all five free routes keep serving (verified).

Still open, plainly: no cached `/supported` fallback, so an offline 402 is impossible; we do not independently re-verify the settled transaction against algod; and two of our nine API spec files call the live facilitator, so CI is not hermetic (CI-2, open).

**Q: Is the Bazaar discovery real, or is it a declaration in your code that nothing has ever consumed?**

**A:** Real, and re-checked against the live catalogue while preparing this.

Listing in the Bazaar is not a registration call — there is no "register my service" API in `@x402/extensions`. A resource is catalogued as a *side effect* of a verified payment against a resource whose 402 carries `extensions.bazaar`. We register `bazaarResourceServerExtension` and each priced route declares its real input and output shape. That is also why nothing was listable until this week: the app derives the resource URL from the request, and until the public deployment it said `localhost`.

Querying `https://facilitator.goplausible.xyz/discovery/resources` right now returns all three of our priced routes on `medrail.onrender.com` — `/v1/triage` and `/v1/interaction-check` at `amount: "20000"`, `/v1/records/summary` at `"50000"`, all `scheme: "exact"`, `asset: "10458941"`, our `payTo`, the facilitator's `feePayer`, full input/output schemas, and `extra.tag: "x402-global-challenge"` on every one, first seen 2026-08-23T05:34Z.

We emit that tag in two places on purpose: `resource.tags` is the protocol-correct field, but measured over the first 500 catalogue records, 454 carry the tag in `accepts[].extra.tag` and **zero** in `resource.tags` — the catalogue endpoint does not emit a `tags` key at all, so the spec-only placement would never appear where a judge looks.

Two caveats we volunteer: each record shows `settleCount: 2`, and those settles are our own agent's runs — being findable is not the same as being found; and the `resourceUrl` is recorded with an `http://` scheme because the app derives it from the request behind Render's TLS-terminating proxy, which is cosmetic but ours to fix.

---

### Business / Viability

**Q: Who is the actual customer here? A patient? A hospital? Who writes the cheque?**

**A:** The buyer is a program, not a person. x402 is a machine-to-machine protocol, so the customer is an autonomous agent working a clinical task — another team's orchestrator, a triage bot, a scheduled review job — and the cheque is written by whoever funds that agent's wallet.

That is the persona the whole surface is built for: `GET /` returns the catalogue with prices and gates so the agent can budget before committing, and the free consent oracle exists so it can find out whether a gated call will succeed before it spends. The patient is not the customer; the patient is the authoriser, and is what makes the gated endpoint sellable at all — no API key can give you the fact that the patient agreed.

Stated plainly: we have zero customers today. Not early traction, zero. What we have is a live URL, a proven mechanism, and one agent run — `UYBTLPHS…5GO4YQ` paying $0.09 across three settled TestNet transactions with no account and no API key.

**Q: Has anyone outside your team actually paid for this?**

**A:** No, and I will give you both halves.

The strong half: the payments are not self-payments. The agent signs with its own keypair, which this service does not hold; the patient `56LFG5EE…ILO66YM` is a third account that is neither payer nor payee and granted that specific agent access in a transaction it signed itself; the indexer shows sender ≠ receiver on all three settlements.

The half that is not strong: we funded both of those wallets from our own TestNet float, because TestNet ALGO and USDC have no other practical source. So no external or unrelated party has paid for this service, and none of this may be described as payment volume or revenue. What is proven is the mechanism between independent keypairs. Demand is untouched by it.

The one thing that changed this week is that there is now a public URL — `https://medrail.onrender.com` — so for the first time there is somewhere for a stranger's agent to call.

**Q: How does this ever make money at two to five cents a call?**

**A:** Not from the triage endpoint, and I will not argue eleven keyword rules are worth two cents. The price exists to make the metering real and to make the endpoint callable by a stranger's agent with no account, no key, and no contract.

The asset is the consent registry: a neutral, patient-signed, publicly queryable permission substrate that a record holder could point at without trusting us. You monetise that by being the registry of record — integration and assurance for the parties who need a defensible authorisation trail — not by charging per lookup, which is why `check_access` is deliberately free: a zero-fee simulated read anyone can run against App 768743428 without us.

Two other lines follow from what is already built, and neither is built: packaging the resource-server composition itself — payer binding plus consent gate plus audit append — so any clinical API can put its endpoints behind it; and infrastructure pass-through, since `fund_mbr` accepts a top-up from any sender and does not check the amount, so whoever benefits from the storage can fund it.

There is no revenue model in this repository and no market figure anywhere in it, because none exists and we are not going to invent one on a slide.

**Q: Are you even making money on a paid call today? What does one cost you to serve?**

**A:** On the two compute endpoints, effectively nothing: pure functions over static tables, zero inference cost, and the facilitator sponsors the transaction fee so the settled payment carries `fee: 0`.

On the gated endpoint the arithmetic is against us and I would rather show you than be asked. A successful `/v1/records/summary` call collects 50,000 µUSDC and permanently locks 59,300 µALGO of app-account minimum balance for the audit box, plus 18,900 µALGO the first time we ever write for a patient, plus a 1,000 µALGO network fee the operator account spends. That is one permanently locked box per access, so at any realistic ALGO price a $0.05 fee does not cover the audit design — the price has to follow the storage design, not the other way round.

The fixes are known and unbuilt: a hash-chained digest or batched anchoring instead of a box per access, or MBR funded by the party that wants the trail. Today's preflight says the app account has roughly 171 audit writes of headroom left, which is a capacity number, not a business model.

**Q: What stops a hospital EHR vendor from just building this themselves?**

**A:** Technically, nothing. The contract is 259 lines of Algorand Python under MIT, and we serve the compiled ARC-56 spec at `/v1/consent/arc56` on purpose so a third party can build against it without cloning us. So the honest answer is that the code is not the defensible thing.

The structural argument is this: a vendor-operated consent registry recreates the exact problem we started from — consent that lives inside whichever organisation holds the record, revocable only by asking the holder to do it. The property that makes this useful is that no organisation mediates it: the patient signs `grant_access` and `revoke_access` with their own key, our backend is not in that path and could not override it, and revocation takes effect on the next `check_access` for every reader at once. That is a property of one neutral registry, not of twenty vendor registries, and a fork mints a new App ID with zero grants in it.

The second piece is the one that does not fit their existing shape: their billing sells seats, integrations, and procurement cycles to institutions. Selling one drug-interaction check to an anonymous agent with no contract requires the money itself to carry the identity, which is what the payer binding does — `verify-g01-fix.ts` runs the impersonation attack live and gets a 403, with a matched 200 control.

And I will concede the real asymmetry: they have distribution and customers, we are three people with a TestNet app and no users. If a major vendor shipped patient-signed on-chain consent tomorrow, that would validate the thesis rather than kill it.

**Q: If the contract is open and the spec is public, what is your moat?**

**A:** Not the code, and I would distrust anyone who claimed otherwise about a 259-line contract. Three things are actually defensible, in ascending order of confidence.

The weakest: execution detail — the payer-to-requester binding, the free pre-flight oracle, the decision to keep the audit write out of the client's signed group so a generic `@x402/fetch` caller works unmodified. Stronger: neutrality, which is a positioning choice a record-holding incumbent structurally cannot make. Strongest, and entirely unrealised: the grant graph itself. Grants live in box storage keyed to one App ID, so the value accrues to whichever registry patients actually sign into, and copying the source gets you an empty one.

That is a network-effect argument, which means today it is worth nothing — we have six grant boxes and five audit entries, all self-generated.

**Q: How does a paying agent find you in the first place?**

**A:** Two free endpoints do the work once an agent has the URL. `GET /` is a machine-readable index of all eight routes with method, path, price, and gate, plus the App ID, the CAIP-2 network, and the ARC-56 spec URL — and a test asserts that advertised list equals the mounted route set so the catalogue cannot drift. `/v1/consent/arc56` then lets an agent build its own on-chain client and stop depending on our oracle entirely.

Getting the URL was the unsolved half, and I want to be exact about the state of it. The Bazaar discovery extension is wired — `api/src/x402.ts` registers it, every priced route declares its input and output shape and the `x402-global-challenge` tag, and the live 402 carries an `extensions.bazaar` block. But x402 has no registration call: a facilitator catalogues a resource by reading that declaration off a payment it verifies, keyed on the resource URL, and until this week ours said `localhost`, so nothing was listable.

The URL is now public, the first paid runs against it landed, and as of 2026-08-23T05:34Z the catalogue returns all three priced routes. What that does *not* mean is that anyone found us through it — the only settles recorded against those entries are our own agent's.

**Q: What is the regulatory story for real patient data? Is this HIPAA compliant?**

**A:** No, and nothing in this repository claims it is. There is no PHI in the system — `/v1/records/summary` returns a fixed synthetic constant regardless of `patientId` — so there is no covered entity, no business associate agreement, no privacy official, no risk analysis. No HIPAA, GDPR, SOC 2, or ISO work has been performed and none is claimed; every security document says so in its own words.

What I can defend is one architectural decision that survives contact with a regulator: no clinical content ever goes on the ledger. Only an address, a sha256 box key, a status byte, two timestamps, and constant scope and endpoint strings — because permanence is irreversible, and encrypting a record onto a public chain is a bet on cryptography holding for the lifetime of the data.

Two rights are actually served better than by a typical vendor: access and portability, because the consent state was never in our custody; and objection, because revocation is unilateral and needs nobody's cooperation.

And the tension I will name before you do: the metadata is public forever. Who granted whom, what scope, when, and that it ended — that graph is a low-resolution medical history, and it is not mitigable on-chain, only reduced with opaque scope identifiers, rotating per-relationship addresses, and bounded default expiry, none of which are implemented.

Our privacy document has the pre-PHI checklist, and every item on it is NOT IMPLEMENTED: client-side envelope encryption, off-chain content-addressed storage, operator key custody — today one hot mnemonic in an environment variable that is also the contract admin — a DPIA, controller and processor roles, breach notification that is currently impossible to execute because there is no alerting, and a clinical safety review of two rule engines with no measured sensitivity or specificity.

The blocking gap above all of those is identity: the gate proves the caller controls the address the patient granted, and nothing connects that address to a licensed clinician. For a demonstration that is the correct boundary. For anything clinical it is the wall, and no design for it exists.

**Q: Six months out, what would tell you this is working, and what would tell you it is not?**

**A:** Three falsifiable tests, none of which we pass today.

One: a settled payment from a wallet we never funded — the mechanism already works between independent keypairs, so what is missing is money we did not put there, and nothing in the codebase blocks it. Two: a patient granting from a real wallet rather than a browser-generated throwaway; there is no Pera or WalletConnect integration in `web/` at all, and our own docs flag the one place we overclaimed it. Three: one record holder pointing at App 768743428 instead of standing up their own table.

If in six months the only grants on that contract are ones we created, the thesis is wrong, and the honest read is that patient-sovereign consent had no buyer — not that the engineering failed. The engineering is checkable now: 121 tests, a live API and frontend, eight preflight checks green, and every claim on the critical path resolving to a transaction ID you can verify without us in the room.

---

### Honesty / Red-Team

**Q: Both the agent wallet and the patient wallet were funded from your own float. Haven't you just proven you can pay yourself?**

**A:** We've proven the mechanics, not demand, and our own docs say so under a heading called "What may and may not be claimed" (`docs/AGENT_RUN_FACTS.md`).

What the public indexer confirms without trusting us: three distinct keypairs, sender ≠ receiver on all three payments, asset `10458941`, amounts `20000/20000/50000` base units, `fee: 0` via facilitator sponsorship. The agent signs with a key this service does not hold, so those are genuine account-to-account settlements.

What it does not prove is that anyone wants this. Both floats were seeded from our wallet because TestNet USDC has no other practical source — no unrelated party *could* pay us there even if they wanted to.

We also kept the weaker earlier runs on the record instead of quietly deleting them: `Test_Results.md` §5.4 discloses that our first settled payment was a self-transfer, deployer to deployer, and `PROOF.md` §10 catalogues all four agent runs. External demand is a MainNet question, and we have not deployed to MainNet.

**Q: You call this an AI agent, but the triage endpoint is a keyword table and your demo client is a script. Isn't the "AI" framing misleading?**

**A:** Two separate charges, and both land partially.

On the endpoints: correct, and ADR-007 is an entire decision record about choosing it deliberately — zero ML, 11 red-flag keyword groups and 14 drug pairs. It goes further than that against us: `docs/09_Intelligence_Layer/Limitations.md` §8.4 flags that the phrase "AI intelligence endpoints" is itself inaccurate and names the five files carrying it. Two are still uncorrected, including `api/src/app.ts:267` — the service index an agent reads first. That one is on us. The offsetting fact is that the 402 challenge says "Rule-based clinical red-flag triage score. Not medical advice." *before* the caller spends $0.02, so the disclosure is pre-payment, not buried in a footer.

On the client: the demo agent has no LLM either. It is autonomous in the operational sense — no human, no account, no API key, no prior knowledge, prices read out of `GET /` at runtime — not the cognitive sense. Nothing in MedRail requires the caller to be a script; an LLM-driven agent takes the identical path.

**Q: What is actually not implemented, and what breaks first under real load?**

**A:** What breaks first is the audit trail, and it's arithmetic, not speculation. Every gated call permanently locks 59,300 µALGO of app-account box minimum balance — the box *is* the audit entry, so you can't reclaim it without destroying the record — and costs the operator a 1,000 µALGO fee. Preflight measured about 171 writes of headroom left. Past that the audit write fails and the caller still gets a `200` with `auditStatus: "pending"` — a paid call whose differentiator silently did not happen.

Second: horizontal scaling. `withPatientLock` is an in-process promise chain (G-11, still open). Run two instances and a concurrent racer on the same patient declares the wrong box reference, the AVM rejects the transaction, and you land in that same silent-pending state. We are pinned to one machine and we say so.

Not implemented, from our own register: no metrics, no tracing, no alerting (G-15); no load test or benchmark of any kind (G-24) — the only numbers that exist are two single laptop observations, 505 ms cold and ~15 ms warm, which we refuse to call a benchmark; no CI docker build; no frontend tests at all. Twelve of 37 findings in `ENGINEERING_GAP_REPORT.md` are open. We publish the count, not the highlights.

**Q: Your README says nothing is publicly hosted, but you're demoing a live URL. Which is true?**

**A:** Both, in sequence — and it's worth knowing which direction the error runs.

The docs were frozen at the 2026-08-22 engineering review; public hosting happened after it. ADR-011 selected Fly.io, `api/fly.toml` is correct, and it has never been applied — we deployed the container to Render instead and the documentation hasn't caught up. That's documentation lag, and it is the honest kind: our docs are behind reality, not ahead of it.

What it moves: the API and frontend are live now, a preflight passed all eight checks against the deployed API this session, and the Bazaar catalogue entries (E-6) that could only ever appear against a public URL are now present. What it does not move: there is still no MainNet deployment, and nobody outside the team has called us.

**Q: Why is `CONSENT_APP_ID` pinned to a constant, and what breaks if you redeploy?**

**A:** It isn't hardcoded in source — `config.ts:57` reads the env var with a fallback to the deploy script's own output file. But the fallback cannot work in a container, because the image doesn't carry `deploy_testnet.json`, so `CONSENT_APP_ID` must be set explicitly or `/v1/consent/status` and `/v1/records/summary` return 500. That was defect D-1/G-07, found in our own review and closed by pinning `768743428` explicitly.

The redeploy half is the more interesting one. `deploy_testnet.py` uses `OnUpdate.AppendApp`, which mints a *new* application rather than updating in place. A redeploy gets a new App ID and orphans everything on the old one: the grant boxes, the audit boxes, the sequence counter, `total_audit_entries`. Every patient would have to re-sign their grant, and the audit history is immutable and non-migratable — which is precisely the property we're selling.

So the App ID is not a config value we were careless with; it is the identity of the data. Production needs either registry indirection or a genuine upgrade path, and we have neither.

**Q: You claim source-to-chain byte-identity. Is the deployed app running your current code?**

**A:** No, and we'd rather state it than have you find it. `Test_Results.md` E-7 states the chain in the right order: the deployed program is byte-identical to the *pinned* TEAL in `contracts/artifacts/`, which is `contract.py` at commit `3012e2d`.

A fresh compile of today's source produces 927 lines of approval TEAL against the deployed 922, differing by exactly two fixes and one import that became unused. The fixes are C-1 — `request_access` emitted its ARC-28 event with `patient` and `requester` transposed — and C-2, `GRANT_BOX_MBR` returning 22,100 instead of the correct 22,500 because it omitted the BoxMap key prefix. Both are fixed in source, both have regression tests confirmed to *fail* against the pre-fix code, and neither is deployed, for the reason in the previous answer: shipping two low-severity fixes would have cost the entire on-chain history. CI keeps the two artifact sets in separate directories and asserts the pinned one was not regenerated.

So the precise claim is "the running bytecode traces to a named commit," not "the running bytecode is HEAD."

**Q: 121 passing tests — what does that actually assure?**

**A:** Less than the number suggests, and the section of `Test_Results.md` that covers it is titled "the test count still overstates the assurance."

Here is the concrete demonstration: `interactionChecker.spec.ts` calls `checkInteractions(["a","b"])` and asserts only that a disclaimer string is present. That exact call returns `flagged: true` with five severe-interaction matches, one classified `contraindicated`, because the matcher uses unanchored bidirectional substring containment. So every green run drives straight through a live defect (G-21, open) and notices nothing — inside a module that is fully line-covered, which is the cleanest evidence we have that coverage is not assurance.

Whole-suite coverage is 83.05% statements, 65.85% branches, measured locally, with no threshold gating a merge. What we do claim is narrower: five specific defects now have a test confirmed to fail against the pre-fix code. That is a statement about five behaviours, not about a suite. The technique that would catch the rest — mutation testing — does not exist here.

**Q: The consent gate protects a hardcoded synthetic record. Isn't the authorisation theatre?**

**A:** What sits behind the gate is a constant. `SYNTHETIC_RECORD` returns identically for every `patientId`, it's disclosed in the response body itself, and L-14 in `Limitations.md` records that the gate has never had anything real to protect. There are no patients in this system.

But the gate is not the mock part, and there's evidence that separates the two. Our own review found G-01, a CRITICAL: `requesterAddress` was caller-asserted and never bound to whoever paid, and the discovery step was executed rather than theorised — one unauthenticated indexer query recovers real `(patient, requester, scope)` triples from public grant transactions, so an attacker pays the ordinary $0.05, asserts a recovered address, and `check_access` returns true. We published that as CRITICAL in our own README before it was fixed.

The fix recovers the payer from the verified `PAYMENT-SIGNATURE` and refuses unless it equals the asserted requester. `verify-g01-fix.ts` runs the impersonation live against TestNet and pairs it with a control call from the same payer seconds later: 403, then 200. The 403 alone would prove nothing — a broken endpoint returns 403 too. The control leg is what shows it discriminates.

**Q: A denied record call is free to the caller but costs you a transaction fee. Can I drain you?**

**A:** Partially, yes, and that asymmetry is written into the rate limiter's own header comment rather than discovered by you.

A 403 cancels x402 settlement — `@x402/hono` only settles below status 400 — so a caller with no grant pays nothing, while we spend one Algorand fee writing the denial to the audit log (`records.ts:37`), and an empty operator account stops `log_access` working for everyone.

That's why `rateLimit.ts` is scoped to exactly the free and refundable surface — `/v1/consent/status`, `/v1/consent/arc56`, `/v1/records/summary` — at 60 requests per minute per client IP, and deliberately not to the priced routes, which are economically self-limiting at $0.02.

The honest weakness is that the limiter is in-memory, so behind more than one instance it degrades to per-instance rather than global — the same constraint that pins us to one machine. And `/v1/consent/status` is the amplification vector specifically: two sequential algod round-trips per free request, against public AlgoNode infrastructure.

**Q: Worst case on stage — what could actually go wrong in front of us?**

**A:** The one we can't explain. G-37: on 2026-08-22 a legitimate paid call came back `402` with no settled transaction, once. The identical call issued standalone seconds later returned 200, and a full re-run was clean. We tested the obvious hypothesis — two identical transfers from one payer colliding on transaction ID — with four paid calls, two concurrent and two sequential, and refuted it: all distinct, all settled. The register says the cause is not established and deliberately declines to guess one; the likeliest remaining explanation is a transient at the facilitator or in the window between verify and settle, unconfirmed.

Beyond that, our availability is coupled to GoPlausible: an outage now returns `503` with `Retry-After: 30` and a stable `PAYMENT_FACILITATOR_UNAVAILABLE` code instead of an opaque 500, but nothing automated exercises that path (TC-170), and 15 of our 93 API tests need the live facilitator to run at all. Free routes are unaffected either way.

That risk is why we ship an eight-check preflight that exits non-zero, and why we ran it against the deployed API before this session rather than trusting the demo to hold.

---

### Live Demo / Proof

**Q: Can you run this again, right now, in front of us?**

**A:** Yes, and against the same public URL you can hit yourself.

`cd api && npm run preflight` runs eight checks against `https://medrail.onrender.com` (API reachable, consent App `768743428` configured, audit-trail headroom, service index, facilitator reachable, 402 challenge well-formed, agent wallet funded, consent grant active) and exits 1 if anything blocks. Then `npx tsx scripts/agent-demo.ts` performs the run end to end in roughly fifteen seconds.

Two live constraints, stated because they move: the agent wallet holds about **$0.53 of TestNet USDC** — five more full runs at $0.09 each — and `/v1/health` currently reports **~165 remaining audit writes** (MedRail pays a 1,000 µALGO fee per audit append). At the preflight earlier this session those read $0.71 and ~171. The numbers decrease because the run is real, not because the slide is stale.

You can also drive it yourself in a browser at `https://medrail-1.onrender.com/`, which generates a throwaway TestNet wallet client-side.

**Q: How do I verify this happened without trusting anything you wrote?**

**A:** Don't read our repo — read the chain. Today's run against the deployed API produced three settled transfers and one audit append. Query the public indexer directly: `curl -s https://testnet-idx.algonode.cloud/v2/transactions/<TXID>`, or open `https://lora.algokit.io/testnet/transaction/<TXID>`.

| Call | Transaction ID | Round | Amount |
|---|---|---|---|
| `/v1/triage` | `BG5FSJZXWYMZAKGZAJ3LRZTZ4V56DJSWDMXA6NTY6NNWNH6JLCSA` | 66582385 | 20000 |
| `/v1/interaction-check` | `LXVIKXTAJVYWUMEU6KAL2HUWZAPCN4KM3T3JY6ETVPZTRFORJNBQ` | 66582387 | 20000 |
| `/v1/records/summary` | `JHZHELA6J53ZOVLDGMGXWMVSES4BQ65FY6U4FC3LCGWRU3NATYDQ` | 66582391 | 50000 |

All three: asset `10458941` (TestNet USDC, 6 decimals), `fee: 0` — facilitator-sponsored — sender `UYBTLPHS…5GO4YQ`, receiver `2WDV2J2F…TI64GE`. **Sender ≠ receiver on every leg**, which is the property most self-funded demos cannot show.

The audit append is `SPX2VMUVYWLANO3IWT3AYONH47YKJ25C2V2F726RUP77HFRKBJXQ` at round 66582389: an application call against App `768743428`, sent by the operator, whose decoded arguments name the patient and the requester. The grant itself, `IG4XEBTMRCKI724ZVHSYUN4ECTYBXAGZM5N35NP4Y3ZVWECG7WUQ`, has sender `56LFG5EE…ILO66YM` — the patient, who is neither payer nor payee.

Two caveats we would rather hand you than have you find: `contracts/artifacts/agent-run.json` is written *by the script being evidenced*, so it indexes the evidence rather than being it — the indexer readings are what settle the question. And `docs/07_Testing/Test_Results.md` §5.7 documents an earlier run against `localhost:4021`; that text predates the public deployment. The transaction ids above are from the public HTTPS endpoint.

**Q: What if I try to break it live?**

**A:** Please do — three attacks are worth your time.

**(1) Impersonation.** Pay with your own key while asserting someone else's address as `requesterAddress`. You get `403 {"error":"requesterAddress must match the address that signed the payment"}` and no settlement, because `api/src/x402Payer.ts` recovers the signer from the verified payment payload and `routes/records.ts` requires payer == requester. `scripts/verify-g01-fix.ts` runs this against live TestNet with a control leg — the same payer asserting its own address gets a 200 seconds later, which is what proves the endpoint discriminates rather than just refuses.

**(2) Revoke consent mid-demo.** The patient signs `revoke_access` with their own key, straight to Algorand, backend nowhere in the path. The next paid call is refused with `charged: false` — a 4xx cancels x402 settlement, so a rejected attempt costs you nothing — and the *denial itself* is written to the patient's on-chain trail, so your attempt to break it becomes a transaction you can look up. We cannot override that revocation; we do not hold the patient's key.

**(3) Read the round numbers closely.** The audit append (66582389) confirms *before* the $0.05 settlement (66582391). That is deliberate, not a bug — ADR-005 makes the audit a follow-up transaction rather than a leg in the client's signed group, so any off-the-shelf `@x402/fetch` caller works without knowing our App ID. The cost is that atomicity is ours to lose, not yours: if settlement failed after the audit wrote, MedRail is out the sale, never the caller's money.

On replay: the facilitator verifies the payload against the chain and Algorand rejects a duplicate transaction id, but that is protocol-level, and we have no dedicated replay test of our own — so we will not claim it as something we proved.

**Q: Is the agent actually autonomous, or is it a script following a plan you hardcoded?**

**A:** The only MedRail-specific value in `scripts/agent-demo.ts` is `API_BASE`. It reads the catalogue from `GET /`, and `agent-demo.ts:157-158` takes the prices it pays out of that response rather than from a constant. It reads the `gate` field, notices one route says `x402 + on-chain consent`, and calls the **free** consent oracle before committing to the $0.05 — the economically interesting behaviour, since checking costs nothing and being wrong costs five cents.

The honest limit: the decline branch at `agent-demo.ts:194-197` was **not exercised** in this run, because the grant was active. It is real code, not narration, but this run did not take it. If you want to see it, revoke the grant and re-run — that is the same attack as (2) above, and it turns our unproven branch into your demonstration.

**Q: Is that real money? Has anyone actually paid you?**

**A:** No, and we will not let that be inferred. These are genuine account-to-account USDC settlements between three independent keypairs — the indexer confirms sender ≠ receiver, and MedRail cannot sign for the agent or the patient. But both the agent wallet and the patient wallet were originally funded from our own TestNet float, because TestNet ALGO and USDC have no other practical source. **No unrelated third party has paid for this service.** What the transaction ids close is the payment *mechanics*; they say nothing about demand, and we claim no payment volume.

Two related disclosures in the same spirit: `/v1/triage` and `/v1/interaction-check` contain no model of any kind — an 11-group weighted keyword matcher and a 14-pair lookup table, a deliberate safety decision argued in ADR-007, not a shortcut. And what sits behind the consent gate is a fixed synthetic constant; the payment, the on-chain authorisation read, and the audit entry are real, the clinical content is not.

**Q: What could fail on stage, and what happens if it does?**

**A:** Three known failure modes, all of which fail *quietly* rather than loudly, which is exactly why the preflight exists.

**Facilitator outage** (GoPlausible is a third-party dependency, tracked as R-1): every priced route returns `503` with `Retry-After: 30` and a named `PAYMENT_FACILITATOR_UNAVAILABLE` code, so an outage is legible as an outage rather than as our 500. Free routes — including the consent oracle — are unaffected.

**Operator ALGO exhaustion:** a successful paid call degrades to `200` with `auditStatus: "pending"` instead of throwing away a sale the caller paid for; you would see it in the response body, and preflight's audit-headroom check is there to catch it before you do.

**Missing consent grant:** the run becomes a polite decline, not an error.

If the live run fails for any of these, the fallback is not a video — it is the chain. Every transaction id above is already confirmed and permanent on Algorand TestNet, and you can verify them from your own laptop whether or not our service is answering.