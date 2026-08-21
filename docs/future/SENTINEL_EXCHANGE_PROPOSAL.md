> # ⚠ UNBUILT PROPOSAL — NOT IMPLEMENTED
>
> **Nothing described in this document exists in this repository.**
>
> This is a forward-looking design proposal for a *different* product ("Sentinel Exchange", a
> pharma supply-chain system) that would reuse MedRail's Algorand and x402 plumbing as a starting
> point. It was written as a build plan and was never executed.
>
> **Verified absent from this repository as of 2026-08-21:** no `engine/` service, no `sim/`
> data generators, no `data/sentinel.db` or any SQLite database, no FastAPI application, no
> XGBoost or any ML model, no `SentinelProvenance` contract, no SSE event bus, no notification
> adapters, and none of the `/ops`, `/radar`, `/exchange`, `/zero-waste`, `/control` frontend
> routes. The web application has exactly one route (`/`).
>
> **What *does* exist** is documented in [`../README.md`](../README.md) and evidenced in
> [`../PROOF.md`](../PROOF.md): the `MedRailConsent` contract (TestNet App ID `768743428`), a
> Hono x402 resource server with three priced endpoints, and a Next.js demo frontend.
>
> This file is retained under `docs/future/` for design continuity. It is deliberately **not**
> part of the submission's technical documentation set, and its instruction to "rewrite README
> around Sentinel Exchange" is **superseded and must not be acted on**.
>
> — Relocated from `docs/SENTINEL_ARCHITECTURE.md` during the 2026-08-21 engineering review.

---

# Sentinel Exchange — Architecture & Build Plan

**A self-healing pharma supply network.** E1 (Smart Restock) is the nervous system, P1 (Demand
Sensing & Replenishment) is the brain, and the Live Medicine Exchange + Zero-Waste Ledger are the
immune response nobody else will build.

This document is the blueprint: what gets built, where it lives, how the pieces talk, and the order
to build them in. It assumes the existing MedRail repo (Algorand consent contract, Hono/x402
gateway, Next.js frontend) as the starting point and reuses it deliberately.

---

## 1. The one-paragraph thesis

Three services, one closed loop. Store/DC floors emit inventory truth (**E1**). A planning engine
fuses that truth with leading external signals to *anticipate* demand shocks before POS data moves
(**P1 / Outbreak Radar**). When the plan says "Tier-2 city X spikes in 7 days and we're short," it
doesn't file a purchase order — it opens a **market**: every node posts live asks and bids, and a
contract-net auction routes existing stock (urgency × expiry-risk × lane feasibility) to where it's
needed. If a near-expiry batch still finds no buyer inside its window, the **Zero-Waste** fallback
auto-routes it to an NGO channel and anchors the movement on Algorand for CSR/regulatory audit.
The plan then writes new thresholds back down into E1, closing the loop.

---

## 2. Service topology

```
┌──────────────────────────────────────────────────────────────────────────┐
│  web/          Next.js 16 · React 19 · Tailwind 4          :3000         │
│  5 surfaces: Ops Console · Outbreak Radar · Exchange Map ·               │
│              Zero-Waste Ledger · Scenario Control Room                   │
└───────────────┬──────────────────────────────────────────────────────────┘
                │  REST + SSE (/v1/stream)
┌───────────────▼──────────────────────────────────────────────────────────┐
│  api/          Hono · TypeScript · x402 · algosdk           :4021        │
│  EDGE LAYER — the only thing the browser and paying agents talk to.      │
│  · request shaping / auth / CORS                                         │
│  · x402 payment gating on premium intelligence endpoints                 │
│  · notification fan-out (email / SMS / WhatsApp-style / webhook)         │
│  · Algorand ledger writer (outbox drain, per-key serialization)          │
│  · SSE event bus → live dashboard                                        │
└───────────────┬──────────────────────────────────────┬───────────────────┘
                │  internal HTTP (typed client)        │  algosdk
┌───────────────▼──────────────────────────┐  ┌────────▼────────────────────┐
│  engine/   FastAPI · Python 3.12  :8000  │  │  contracts/  Algorand       │
│  THE BRAIN — sole owner of the database. │  │  · MedRailConsent (live,    │
│  · demand sensing + forecasting          │  │      App 768743428)         │
│  · outbreak radar (signal fusion)        │  │  · SentinelProvenance (new) │
│  · expiry-aware allocation (FEFO+)       │  └─────────────────────────────┘
│  · replenishment optimizer               │
│  · contract-net exchange clearing        │  ┌─────────────────────────────┐
│  · alert rules + escalation cadence      │  │  sim/   Python generators   │
│  · threshold write-back to E1            │◀─┤  · synthetic master data    │
└───────────────┬──────────────────────────┘  │  · 3y demand history        │
                │                             │  · correlated leading       │
┌───────────────▼──────────────────────────┐  │      indicators             │
│  data/sentinel.db   SQLite (WAL)         │  │  · live tick loop           │
│  single writer = engine                  │  │  · scenario YAMLs           │
└──────────────────────────────────────────┘  └─────────────────────────────┘
```

### Why this split (defend these in the Q&A)

| Decision | Reasoning |
|---|---|
| **Python engine, separate from the TS API** | Forecasting, optimization and the auction want pandas/XGBoost/scipy. Fighting that in TypeScript costs you a day you don't have. The `contracts/` dir already carries a Python toolchain, so it's not a new ecosystem. |
| **Hono API stays the only public edge** | You already have working x402 + CORS + Algorand plumbing there. Don't rewrite it. The engine never faces the internet — no auth surface, no CORS, no payment logic to duplicate. |
| **SQLite, single writer** | Two languages sharing one file is a classic footgun. Making the engine the *only* writer removes every locking question. The API reads through the engine's HTTP surface, never the file. WAL mode gives concurrent readers for free. Swap to Postgres later by changing `engine/app/db.py` alone. |
| **SSE, not WebSockets** | The demo is one-directional (server → dashboard). SSE is ~30 lines in Hono, survives reconnects natively, and needs no new dependency. Control actions go over normal POSTs. |
| **Scoring auction, not LP or multi-agent RL** | An LP allocator is a black box on stage and a solver dependency in the build. A contract-net auction with an explainable score is a day of work, visualizes as *movement*, and every match carries a human-readable "why this won." |
| **Ledger write is off the hot path** | The existing `log_access` code already taught this lesson — read-then-write box sequencing races under concurrency. Batch events go into an `ledger_outbox` table; a drainer in the API writes them serialized per batch. The UI shows `pending → confirmed` with the real TxID. |

---

## 3. The closed loop — three interfaces that make this one system

This is the section that answers the graded *"Use Case Understanding and Relevance"* criterion.
E1 and P1 are not two demos; they are joined by exactly three contracts:

**① `signals.up` — E1 → P1**
Every `inventory_txn` (sale, consumption, receipt, adjustment) is a demand observation. The engine
consumes them into `demand_history` and treats deviation-from-forecast as its own sensing signal.
*Where:* `engine/app/services/demand_sensing.py`

**② `thresholds.down` — P1 → E1**
The planner does not just emit a purchase suggestion; it **rewrites `thresholds.min_stock` and
`reorder_point` per (node, SKU)** with a reason string. The E1 dashboard shows the old value struck
through, the new value, and the reason — *"raised 120 → 310 because Outbreak Radar predicts a
+64% spike in Nagpur in 7 days."* This single feature is the visible proof that the two tracks are
one system.
*Where:* `engine/app/services/thresholds.py` → `web/components/stock/ThresholdEditor.tsx`

**③ `alerts.escalate` — E1 → Exchange → P1**
An E1 low-stock alert that stays OPEN past its SLA does not just re-send an email. It is
auto-converted into an **ask** on the exchange. If the exchange can't fill it, escalation climbs
L1 → L4 with a defined cadence and a named owner role.
*Where:* `engine/app/services/escalation.py` → `engine/app/services/exchange_engine.py`

---

## 4. Data model

One SQLite file, `data/sentinel.db`. Full DDL lives in `engine/app/schema.sql`.

### Master data (generated once by `sim/`)

| Table | Key columns |
|---|---|
| `products` | `sku`, `name`, `form`, `pack_size`, `is_critical`, `cold_chain`, `shelf_life_days`, `moq`, `unit_cost`, `therapeutic_class` |
| `nodes` | `node_id`, `type` (`DC`\|`STORE`\|`PHARMACY`\|`NGO`), `name`, `city`, `tier` (1/2/3), `region`, `lat`, `lon`, `capacity_units`, `cold_chain` |
| `lanes` | `from_node`, `to_node`, `lead_time_hours`, `cost_per_unit`, `mode`, `cold_chain_capable` |
| `promo_calendar` | `start_date`, `end_date`, `sku`, `region`, `uplift_pct` |

### Operational state (E1)

| Table | Key columns |
|---|---|
| `thresholds` | `node_id`, `sku`, `min_stock`, `reorder_point`, `safety_stock`, `max_stock`, `set_by` (`manual`\|`planner`), `reason`, `updated_at` |
| `batches` | `batch_id`, `sku`, `node_id`, `qty_on_hand`, `mfg_date`, `expiry_date`, `status` (`ACTIVE`\|`QUARANTINE`\|`DONATED`\|`WRITTEN_OFF`) |
| `inventory_txns` | `txn_id`, `ts`, `node_id`, `sku`, `batch_id`, `type` (`SALE`\|`CONSUMPTION`\|`RECEIPT`\|`ADJUSTMENT`\|`TRANSFER_OUT`\|`TRANSFER_IN`\|`DONATION`\|`WRITE_OFF`), `qty`, `ref` |
| `stock_view` | materialized: `node_id`, `sku`, `on_hand`, `on_order`, `earliest_expiry`, `days_of_cover`, `status` (`OK`\|`WATCH`\|`LOW`\|`STOCKOUT`\|`EXPIRY_RISK`) |

### Sensing & planning (P1)

| Table | Key columns |
|---|---|
| `demand_history` | `date`, `node_id`, `sku`, `units` |
| `signals` | `ts`, `region`, `signal_type`, `value`, `z_score` |
| `forecasts` | `run_id`, `node_id`, `sku`, `horizon_date`, `p10`, `p50`, `p90`, `model`, `drivers_json` |
| `outbreak_signals` | `run_id`, `region`, `spike_prob`, `expected_onset_date`, `lead_days`, `severity`, `contributing_json` |
| `replenishment_plan` | `plan_id`, `run_id`, `from_node`, `to_node`, `sku`, `qty`, `ship_by`, `rationale_json` |

`signal_type` ∈ `TEMP_DROP`, `HUMIDITY`, `POLLEN_INDEX`, `SCHOOL_ABSENCE`, `SEARCH_TREND`,
`WASTEWATER_FLU_RNA`, `CLINIC_FOOTFALL`, `FORECAST_DEVIATION`.

### Alerting (E1)

| Table | Key columns |
|---|---|
| `alerts` | `alert_id`, `ts`, `node_id`, `sku`, `severity` (`INFO`\|`WARN`\|`CRITICAL`), `type` (`LOW_STOCK`\|`STOCKOUT_IMMINENT`\|`EXPIRY_RISK`\|`OUTBREAK_WARNING`\|`CAPACITY`\|`COLD_CHAIN`), `state` (`OPEN`\|`ACK`\|`RESOLVED`\|`ESCALATED`), `message`, `payload_json` |
| `notifications` | `notif_id`, `alert_id`, `channel` (`EMAIL`\|`SMS`\|`WHATSAPP`\|`WEBHOOK`\|`CONSOLE`), `recipient`, `status`, `sent_at`, `provider_ref`, `body` |
| `escalations` | `alert_id`, `level` (1–4), `owner_role`, `due_at`, `escalated_at`, `closed_at` |

### Exchange & zero-waste

| Table | Key columns |
|---|---|
| `asks` | `ask_id`, `node_id`, `sku`, `qty`, `need_by`, `urgency_score`, `status` |
| `bids` | `bid_id`, `node_id`, `sku`, `batch_id`, `qty`, `expiry_date`, `expiry_risk`, `status` |
| `matches` | `match_id`, `ask_id`, `bid_id`, `qty`, `score`, `score_breakdown_json`, `lane`, `eta`, `status` (`PROPOSED`\|`ACCEPTED`\|`IN_TRANSIT`\|`DELIVERED`\|`FAILED`) |
| `donations` | `donation_id`, `batch_id`, `qty`, `ngo_node_id`, `reason`, `units_rescued` |
| `ledger_outbox` | `event_id`, `kind`, `ref_id`, `payload_json`, `payload_hash`, `status` (`PENDING`\|`SUBMITTED`\|`CONFIRMED`\|`FAILED`), `algorand_txid`, `confirmed_round`, `attempts` |

---

## 5. Synthetic data design — where the differentiation actually lives

The build ask says *"GenAI-generated with realistic boundary conditions."* Generic random data
loses points. Two things make yours defensible:

### 5.1 Designed lead-lag correlation (this is what makes "anticipation" real)

The outbreak claim — *"we know 6–9 days early"* — is only true if the generator **builds the lead
into the data**. Generate the latent outbreak intensity curve first, then derive both the signals
and the demand from it, with different lags:

```
latent_outbreak_intensity(t)          ← Gaussian wave, peak in flu season
  ├─ WASTEWATER_FLU_RNA(t)      = f(intensity(t))          lag  0d   noise σ=0.15
  ├─ SEARCH_TREND(t)            = f(intensity(t - 2))      lag  2d   noise σ=0.25
  ├─ SCHOOL_ABSENCE(t)          = f(intensity(t - 3))      lag  3d   noise σ=0.20
  ├─ CLINIC_FOOTFALL(t)         = f(intensity(t - 5))      lag  5d   noise σ=0.10
  └─ POS demand(t)              = f(intensity(t - 8)) × seasonality × promo × node_mix
```

Weather (`TEMP_DROP`, `HUMIDITY`) is an *independent driver* that shifts the intensity curve's
onset, not a derivative of it — otherwise your model is just reading its own answer back.

Result: the model genuinely sees the spike ~8 days before POS does, and you can *prove it* by
showing the radar firing while the stock chart is still flat. Document the lags in
`sim/generators/signals.py` — a judge who asks "isn't this circular?" gets a real answer:
*the lags are the hypothesis; the model has to learn them from noisy data, and we measure whether
it did.*

### 5.2 Boundary conditions to plant deliberately

Bake each of these into the seed and name them in your README — it reads as rigour:

| Boundary case | Where planted | What it proves |
|---|---|---|
| Batch expiring **today** with 400 units | metro DC, critical SKU | expiry-aware allocation beats FIFO |
| SKU with **zero demand** for 60 days | Tier-3 store | forecaster doesn't hallucinate demand |
| **MOQ > annual demand** | low-volume cold-chain SKU | optimizer must refuse to reorder |
| **Lead time (72h) > days of cover (2d)** | Tier-2 city, flu SKU | only the exchange can save it, not replenishment |
| Node at **100% capacity** | metro DC | allocation must respect capacity ceiling |
| **Negative adjustment** (damage/theft, −35) | random store | stock view handles non-sale depletion |
| **Cold-chain lane unavailable** for a cold SKU | one Tier-2 lane | match scoring must filter infeasible lanes |
| Two asks, **one bid**, both critical | during surge | auction must arbitrate, visibly |
| Batch that **fails to match and expires** | metro DC | triggers the donation path (the emotional beat) |
| Duplicate/late-arriving txn | ingest path | idempotency on `txn_id` |

---

## 6. Algorithms — what each service actually computes

### 6.1 Outbreak Radar — `engine/app/services/outbreak_radar.py`

```
for each region:
    z[s] = rolling z-score of signal s over trailing 28d
    composite = Σ w[s] · max(0, z[s])        weights: wastewater .35, search .25,
                                              absence .20, footfall .10, weather .10
    spike_prob     = logistic(composite, k, x0)        → 0..1
    expected_onset = today + argmax_lag(cross-corr(signal, demand))   → date
    lead_days      = expected_onset − today
    severity       = f(spike_prob, Σ critical-SKU exposure in region)
emit OUTBREAK_WARNING alert when spike_prob > 0.65 AND lead_days ≥ 3
```
Keep the weights in `engine/app/config.py` so you can tune live on stage.

### 6.2 Forecasting — `engine/app/services/forecaster.py`

Two models, always both, because the comparison *is* the result:
- **Baseline**: seasonal-naive (same weekday, 4-week median). This is what MedCare does today.
- **Sensed**: XGBoost on lag features + calendar + promo + **the leading indicators**.

Report **WAPE and bias per SKU-region for both**, plus lift. A chart showing "baseline missed the
spike by 6 days, sensed model caught it" is worth more than any accuracy number in isolation.
Fall back to seasonal-naive automatically when a series has < 90 observations.

### 6.3 Expiry-aware allocation — `engine/app/services/allocation.py`

Not FEFO. **FEFO-with-reachability**:
```
score(batch b → node n) =
      w1 · shelf_life_utilisation(b, n)     # will it be consumed before expiry at n's run-rate?
    + w2 · criticality(sku)
    + w3 · projected_stockout_severity(n, sku)
    − w4 · lane_cost(b.node → n)
    − w5 · INFEASIBLE if lead_time > days_to_expiry OR cold-chain mismatch OR capacity full
```
The key move: a batch with 20 days left going to a fast-moving Tier-2 node scores *higher* than
the same batch sitting in a slow metro DC — that's the "excess near-expiry metro stock" problem
solved directly.

### 6.4 Replenishment optimizer — `engine/app/services/replenishment.py`

```
safety_stock = z(service_level) · σ_demand_during_lead_time · sqrt(lead_time)
             + surge_buffer(spike_prob, lead_days)          ← the Radar's contribution
reorder_point = μ_demand · lead_time + safety_stock
order_qty     = clamp(EOQ, MOQ, capacity_headroom)  rounded to pack_size
frequency     = argmin over {daily, 2×/wk, weekly} of (holding + ordering + expected stockout cost)
```
Write `reorder_point` and `min_stock` back to `thresholds` with `set_by='planner'` and a `reason`.
**That write-back is interface ②. Do not skip it.**

### 6.5 Contract-net exchange — `engine/app/services/exchange_engine.py`

```
POST asks:  any node where projected_on_hand(need_by) < reorder_point
            urgency = criticality × stockout_severity × (1 / hours_to_stockout)
POST bids:  any node where on_hand > max_stock  OR  expiry_risk(batch) > 0.5
            expiry_risk = 1 − (days_to_expiry / (days_of_cover_at_this_node + lead_time))

CLEAR (greedy, urgency-descending — deterministic and explainable):
  for ask in sorted(asks, key=-urgency):
      feasible = [bid for bid in bids if same_sku
                                      and lane_exists(bid.node → ask.node)
                                      and eta ≤ ask.need_by
                                      and cold_chain_ok
                                      and days_to_expiry ≥ eta + min_shelf_life_on_arrival]
      best = argmax(match_score)
      match_score = 0.40·urgency + 0.30·expiry_risk + 0.20·(1 − norm_lane_cost)
                                 + 0.10·(1 − norm_eta)
      commit partial fills; decrement bid.qty; emit MATCH event to SSE
```
Every match stores `score_breakdown_json` so the UI can print
*"Nagpur outbid Pune: urgency 0.91 vs 0.34, both drawing on the same Mumbai batch."*
That sentence on screen is your Pillar-2 moment.

### 6.6 Zero-waste fallback — `engine/app/services/waste_router.py`

```
nightly / on-tick:
  for batch where days_to_expiry ≤ donation_window (default 21d)
                and no ACCEPTED match exists
                and expiry_risk > 0.7:
      pick nearest NGO node with cold-chain compatibility
      write DONATION txn + donations row + batch.status = DONATED
      enqueue ledger_outbox(kind='BATCH_DONATED', payload_hash=sha256(canonical_json))
```
**Nothing is ever written off silently.** Every write-off requires the router to have tried and
failed, and both outcomes are anchored on chain.

---

## 7. Algorand layer — reusing what already works

Add **one** new contract next to `MedRailConsent` (leave the live App 768743428 untouched — it's
your proof of a working deployment).

`contracts/smart_contracts/sentinel/contract.py` → **`SentinelProvenance`**

Copy the exact structural patterns from `consent/contract.py` — they're already proven and
compile clean:

| Reuse from `MedRailConsent` | For |
|---|---|
| `BoxMap` + `key_prefix` + sha256 key derivation | `batch_events` keyed by `sha256(batch_id) + itob(seq)` |
| `audit_seq` per-key counter box | `batch_seq[batch_id]` |
| admin-only `log_access` gating | admin-only `anchor_event` — only the backend operator anchors |
| `fund_mbr` / `withdraw_excess` | identical, unchanged |
| `arc4.emit` structured events | `BatchMoved`, `BatchDonated`, `BatchWrittenOff` |

ABI surface:
```python
anchor_event(batch_id: String, kind: String, from_node: String,
             to_node: String, qty: UInt64, payload_hash: Bytes) -> UInt64
get_batch_event_count(batch_id: String) -> UInt64
get_batch_event(batch_id: String, seq: UInt64) -> BatchEvent
```

**Critical carry-over lesson:** `api/src/services/algorand.ts` already documents the read-then-write
race on predicted box names and solves it with `withPatientLock`. The batch anchoring has the
identical hazard — reuse `withKeyLock`, keyed on `batch_id`, in `api/src/services/ledgerWriter.ts`.
Do not re-discover this bug.

**Ledger is off the critical path.** Engine writes `ledger_outbox` rows; the API drains them on an
interval, marks `SUBMITTED` → `CONFIRMED`, and pushes an SSE event so the UI flips a badge from
"pending" to a clickable Lora explorer link. If Algorand is slow or the demo laptop's network dies,
the app keeps running and the badge just stays pending — the demo never hard-fails on chain I/O.

**Keep x402 alive** as the commercial story: price the premium intelligence endpoints
(`POST /v1/forecast/outbreak`, `POST /v1/exchange/quote`) exactly as the existing three are priced.
"A distributor's agent pays $0.05 to ask our radar whether to pre-buy" is a business model, and it
costs you nothing — the middleware is already wired in `api/src/app.ts`.

---

## 8. Alert & escalation design (E1's graded deliverables)

**Rules** (`engine/app/services/alert_rules.py`) evaluated every tick:

| Rule | Condition | Severity |
|---|---|---|
| `LOW_STOCK` | `on_hand ≤ reorder_point` | WARN |
| `STOCKOUT_IMMINENT` | `days_of_cover < lead_time_days` | CRITICAL |
| `EXPIRY_RISK` | `expiry_risk(batch) > 0.6` | WARN |
| `OUTBREAK_WARNING` | `spike_prob > 0.65 ∧ lead_days ≥ 3` | CRITICAL |
| `CAPACITY` | `on_hand > 0.95 × capacity_units` | INFO |
| `COLD_CHAIN` | excursion flag on a cold SKU | CRITICAL |

**Dedupe & noise control** — judges notice this: one open alert per `(node, sku, type)`; suppress
re-fire inside a cooldown; escalate severity instead of spamming; quiet hours per node with
CRITICAL always breaking through.

**Escalation cadence** (`escalation.py`) — this is P1's explicit "recommend an escalation cadence"
ask, so make it a first-class, configurable table:

| Level | Fires after | Owner role | Channels | Auto-action |
|---|---|---|---|---|
| L1 | immediately | Store Manager | WhatsApp + Email | — |
| L2 | +2h unresolved | Regional Planner | + SMS | **auto-post ask to exchange** |
| L3 | +6h unresolved | DC Head | + phone-call task | expand match radius, relax cost weight |
| L4 | +12h unresolved | Supply Head + Medical Affairs | all channels | emergency inter-region transfer |

**Delivery** (`api/src/services/notify/`) — adapter interface with `console`, `email` (SMTP/Resend),
`sms` (Twilio), `whatsapp` (Twilio/Meta), `webhook`. Every adapter has a **`SIMULATED` mode** that
writes to `notifications` instead of hitting a provider — the dashboard's Notification Inbox renders
them as real phone/email cards. Demo without credentials, flip one env var for the real thing.

---

## 9. Frontend surfaces

| Route | Act | Must show |
|---|---|---|
| `/ops` | E1 | Stock grid (on-hand vs threshold vs cover), status chips, threshold editor with **planner-set values marked and reasoned**, live alert feed, notification inbox, reorder recommendation table |
| `/radar` | Pillar 1 | Signal stack (each indicator's z-score over time), fused spike probability, **lead-days gauge**, forecast chart with baseline vs sensed overlaid on actuals, region heat map |
| `/exchange` | Pillar 2 | **Live network map with animated flows**, order book (asks left / bids right), match ticker with score breakdown, accept/reject controls |
| `/zero-waste` | Pillar 3 | Expiry heatmap by DC, donation ledger table with TxID badges → Lora explorer, "units rescued" counter, write-off vs rescued ratio |
| `/control` | Demo driver | Scenario picker, virtual clock speed, "inject flu surge" button, KPI row, reset |

**KPI row** (persistent, top of every page) — these are your scoreboard:
`Forecast WAPE (sensed vs baseline)` · `Stockout hours avoided` · `Fill rate %` ·
`Units rescued from expiry` · `Waste %` · `Median alert lead time` · `Open escalations`

Run every scenario twice — **baseline mode** (no radar, no exchange, static thresholds) and
**Sentinel mode** — and show the deltas side by side. A judge seeing "stockout hours 214 → 31,
waste 8.4% → 1.9%" needs no further explanation.

---

## 10. File structure to replicate

```
MedRail/
├── README.md                            ← rewrite around Sentinel Exchange
├── data/
│   ├── generated/                       (gitignored) CSVs from sim/seed_all.py
│   └── sentinel.db                      (gitignored) SQLite, WAL
│
├── sim/                                 ★ NEW — synthetic data + live event loop
│   ├── requirements.txt
│   ├── seed_all.py                      one command → data/generated/*.csv
│   ├── clock.py                         virtual time, speed multiplier
│   ├── engine_loop.py                   emits inventory_txns per tick → engine
│   ├── generators/
│   │   ├── products.py                  40 SKUs, criticality, cold chain, MOQ, shelf life
│   │   ├── network.py                   4 metro DCs, 8 Tier-2 DCs, 30 stores, 5 NGOs, lanes
│   │   ├── demand_history.py            3y daily, seasonality + flu wave + promo + noise
│   │   ├── signals.py                   ★ correlated leading indicators (§5.1 lag design)
│   │   ├── batches.py                   expiry-tagged opening inventory, metro skew
│   │   ├── orders.py                    distributor order patterns (lumpy, bullwhip)
│   │   └── boundaries.py                ★ injects the §5.2 boundary cases explicitly
│   └── scenarios/
│       ├── baseline.yaml
│       ├── flu_surge_tier2.yaml         ★ the demo scenario (+60%)
│       ├── expiry_glut_metro.yaml
│       └── cold_chain_failure.yaml
│
├── engine/                              ★ NEW — the brain (FastAPI, port 8000)
│   ├── requirements.txt
│   ├── pyproject.toml
│   ├── .env.example
│   ├── app/
│   │   ├── main.py                      FastAPI app, routers, lifespan → db init
│   │   ├── config.py                    model weights, thresholds, feature flags
│   │   ├── db.py                        SQLite conn, WAL pragma, migration runner
│   │   ├── schema.sql                   ★ all DDL from §4
│   │   ├── seed.py                      loads data/generated/*.csv → sentinel.db
│   │   ├── models/                      pydantic DTOs (mirror in web/lib/types.ts)
│   │   │   ├── common.py                Node, Product, Batch, Lane, Threshold
│   │   │   ├── forecast.py              ForecastPoint, OutbreakSignal
│   │   │   ├── exchange.py              Ask, Bid, Match
│   │   │   └── alerts.py                Alert, Notification, Escalation
│   │   ├── routers/
│   │   │   ├── health.py                GET  /health
│   │   │   ├── stock.py                 GET  /stock, /stock/{node}  PUT /thresholds
│   │   │   ├── forecast.py              POST /forecast/run  GET /forecast
│   │   │   ├── outbreak.py              POST /outbreak/run  GET /outbreak/current
│   │   │   ├── allocation.py            POST /allocate/run  GET /allocation
│   │   │   ├── exchange.py              POST /exchange/clear  GET /exchange/book|matches
│   │   │   ├── waste.py                 GET  /waste/at-risk  POST /waste/route
│   │   │   ├── alerts.py                POST /alerts/evaluate  GET /alerts  POST /alerts/{id}/ack
│   │   │   ├── metrics.py               GET  /metrics/kpis
│   │   │   └── sim.py                   POST /sim/tick|scenario|reset
│   │   ├── services/
│   │   │   ├── inventory.py             stock_view materialization, FEFO picking
│   │   │   ├── demand_sensing.py        ① feature build: lags, rolling, regressors
│   │   │   ├── forecaster.py            XGBoost + seasonal-naive baseline, WAPE
│   │   │   ├── outbreak_radar.py        ★ signal fusion → spike_prob + lead_days
│   │   │   ├── thresholds.py            ② dynamic ROP/safety stock + write-back
│   │   │   ├── replenishment.py         qty & frequency optimizer (EOQ, MOQ, capacity)
│   │   │   ├── allocation.py            expiry-aware FEFO-with-reachability
│   │   │   ├── exchange_engine.py       ★ contract-net ask/bid/clear
│   │   │   ├── scoring.py               urgency, expiry_risk, lane feasibility
│   │   │   ├── waste_router.py          ★ donation fallback + ledger_outbox write
│   │   │   ├── alert_rules.py           rule set → alerts (dedupe, cooldown)
│   │   │   ├── escalation.py            ③ L1–L4 cadence state machine
│   │   │   └── metrics.py               KPI computation, baseline-vs-sentinel deltas
│   │   └── ml/
│   │       ├── features.py
│   │       ├── train.py                 offline training entrypoint
│   │       └── artifacts/               (gitignored) saved models
│   └── tests/
│       ├── test_forecaster.py           beats baseline on the surge window
│       ├── test_allocation.py           never allocates past expiry
│       ├── test_exchange.py             critical ask outbids routine ask
│       ├── test_alert_rules.py          dedupe + cooldown hold
│       └── test_boundaries.py           ★ one test per §5.2 boundary case
│
├── api/                                 EXTEND the existing Hono service
│   ├── src/
│   │   ├── app.ts                       + mount new routes, + price new x402 endpoints
│   │   ├── config.ts                    + ENGINE_URL, NOTIFY_MODE, PROVENANCE_APP_ID
│   │   ├── x402.ts                      unchanged
│   │   ├── routes/
│   │   │   ├── health.ts consent.ts triage.ts interaction.ts records.ts   (keep as-is)
│   │   │   ├── stock.ts                 GET /v1/stock, PUT /v1/thresholds
│   │   │   ├── alerts.ts                GET /v1/alerts, POST /v1/alerts/:id/ack
│   │   │   ├── forecast.ts              ★ x402-priced /v1/forecast/outbreak
│   │   │   ├── exchange.ts              /v1/exchange/book|matches|run|accept
│   │   │   ├── waste.ts                 /v1/waste/at-risk, /v1/waste/route
│   │   │   ├── ledger.ts                /v1/ledger/:refId → TxID + explorer URL
│   │   │   ├── notifications.ts         /v1/notifications  (the simulated inbox)
│   │   │   ├── metrics.ts               /v1/metrics/kpis
│   │   │   ├── sim.ts                   /v1/sim/*  (proxied control)
│   │   │   └── stream.ts                ★ GET /v1/stream — SSE fan-out
│   │   └── services/
│   │       ├── algorand.ts              existing consent calls (unchanged)
│   │       ├── ledgerWriter.ts          ★ outbox drainer, withKeyLock(batch_id)
│   │       ├── engineClient.ts          typed fetch wrapper → FastAPI
│   │       ├── eventBus.ts              in-process pub/sub → SSE subscribers
│   │       └── notify/
│   │           ├── index.ts             dispatcher, retry, dedupe, quiet hours
│   │           ├── templates.ts         per-channel message bodies
│   │           └── channels/
│   │               ├── console.ts  email.ts  sms.ts  whatsapp.ts  webhook.ts
│   └── test/
│       ├── (existing specs stay)
│       ├── notify.spec.ts               SIMULATED mode writes rows, honours quiet hours
│       └── ledgerWriter.spec.ts         serialization under concurrent batch events
│
├── contracts/
│   ├── smart_contracts/
│   │   ├── consent/contract.py          UNCHANGED — live App 768743428, your proof
│   │   └── sentinel/contract.py         ★ NEW SentinelProvenance (§7)
│   ├── tests/
│   │   ├── test_consent.py              unchanged
│   │   └── test_sentinel.py             ★ anchor/read/admin-gate/sequence tests
│   ├── scripts/
│   │   ├── deploy_testnet.py            + deploy SentinelProvenance
│   │   └── exercise_sentinel.py         ★ live anchor → read-back proof script
│   └── artifacts/                       + SentinelProvenance.arc56.json, deploy json
│
├── web/                                 EXTEND the existing Next.js app
│   ├── app/
│   │   ├── page.tsx                     landing: the 3-act story + enter buttons
│   │   ├── ops/page.tsx                 ★ E1 console
│   │   ├── radar/page.tsx               ★ Pillar 1
│   │   ├── exchange/page.tsx            ★ Pillar 2
│   │   ├── zero-waste/page.tsx          ★ Pillar 3
│   │   └── control/page.tsx             ★ scenario control room
│   ├── components/
│   │   ├── kpi/KpiRow.tsx  ScenarioControls.tsx  BaselineToggle.tsx
│   │   ├── stock/StockGrid.tsx  ThresholdEditor.tsx  DaysOfCoverBar.tsx
│   │   ├── alerts/AlertFeed.tsx  AlertCard.tsx  NotificationInbox.tsx
│   │   │          EscalationTimeline.tsx
│   │   ├── radar/SignalStack.tsx  ForecastChart.tsx  LeadDaysGauge.tsx
│   │   │         OutbreakMap.tsx
│   │   ├── exchange/NetworkMap.tsx  FlowAnimation.tsx  OrderBook.tsx
│   │   │            MatchTicker.tsx  ScoreBreakdown.tsx
│   │   ├── waste/ExpiryHeatmap.tsx  DonationLedgerTable.tsx  TxProofBadge.tsx
│   │   └── (existing consent components stay)
│   └── lib/
│       ├── api.ts                       extend
│       ├── sse.ts                       ★ EventSource hook w/ reconnect
│       ├── types.ts                      ★ mirror of engine/app/models
│       ├── geo.ts                       lat/lon → SVG projection for the map
│       └── format.ts
│
├── docs/
│   ├── SENTINEL_ARCHITECTURE.md         this file
│   ├── DATA_DICTIONARY.md               ★ every table + the §5.2 boundary-case register
│   ├── ALGORITHMS.md                    ★ §6 formulas, weights, and why
│   ├── DEMO_SCRIPT.md                   ★ the 5-minute run of show
│   ├── RESULTS.md                       ★ baseline-vs-Sentinel KPI table
│   └── (existing MedRail docs stay)
│
└── scripts/
    ├── dev-all.ps1                      start engine + api + web together (Windows)
    ├── dev-all.sh
    └── reset-demo.ps1                   wipe db → reseed → replay to T-0
```

---

## 11. Build order — 5 days

Each day ends with something demoable. Never let all three services be broken simultaneously.

**Day 1 — Data + skeleton.**
`sim/generators/*` producing all CSVs including the lag-designed signals and the boundary register.
`engine/app/schema.sql` + `db.py` + `seed.py`. FastAPI up with `/health` and `/stock`.
Hono `engineClient.ts` + `/v1/stock` proxying through. Next.js `/ops` rendering a static stock grid.
*Demoable: real generated inventory on screen, end to end through all three services.*

**Day 2 — E1 complete.**
`inventory.py` stock view, `alert_rules.py`, `sim/engine_loop.py` ticking. SSE (`eventBus.ts` +
`stream.ts` + `lib/sse.ts`). Notification adapters in SIMULATED mode + inbox UI. Threshold editor.
*Demoable: run the clock, watch stock fall, alerts fire, phone-style notifications land live.
**E1 is fully delivered at end of Day 2** — everything after is upside.*

**Day 3 — P1 brain.**
`demand_sensing.py`, `forecaster.py` (both models), `outbreak_radar.py`, `thresholds.py`
write-back, `replenishment.py`, `allocation.py`. `/radar` page with signal stack, forecast overlay,
lead-days gauge.
*Demoable: radar fires 7 days before the stockout; thresholds visibly rewrite themselves in `/ops`
with reasons. **The closed loop is now visible** — this is the moment the pairing stops being two demos.*

**Day 4 — The Exchange.**
`scoring.py`, `exchange_engine.py`, escalation auto-posting asks. `/exchange` map with animated
flows, order book, match ticker with score breakdown.
*Demoable: medicine visibly moving between cities, Tier-2 outbidding a metro restock.*

**Day 5 — Zero-waste + polish.**
`SentinelProvenance` contract + TestNet deploy + `ledgerWriter.ts` outbox drainer.
`waste_router.py`. `/zero-waste` with real TxIDs linking to Lora. Run all scenarios in baseline
and Sentinel mode, fill `docs/RESULTS.md`. Rehearse `docs/DEMO_SCRIPT.md` end to end twice.

**Cut list, in order** (decide these *now*, not at 2am on Day 5): map flow animation → static arrows;
XGBoost → gradient-boosted sklearn or even ridge regression; SMS/WhatsApp real providers → SIMULATED
only; Algorand anchoring → local hash-chain with the contract shown as compiled-and-tested.
Never cut: the threshold write-back (interface ②), the score breakdown text, or the
baseline-vs-Sentinel KPI comparison. Those three are what make it *your* project.

---

## 12. Local run

```bash
# terminal 1 — engine
cd engine && python -m venv .venv && .venv/Scripts/activate
pip install -r requirements.txt
python -m app.seed && uvicorn app.main:app --reload --port 8000

# terminal 2 — api
cd api && npm install && npm run dev          # :4021

# terminal 3 — web
cd web && npm install && npm run dev          # :3000

# terminal 4 — the world moving
cd sim && python engine_loop.py --scenario flu_surge_tier2 --speed 60
```

Or `./scripts/dev-all.ps1`.

New env vars — `api/.env`: `ENGINE_URL=http://localhost:8000`, `NOTIFY_MODE=SIMULATED`,
`PROVENANCE_APP_ID=`. `engine/.env`: `DB_PATH=../data/sentinel.db`, `SPIKE_PROB_THRESHOLD=0.65`.
`web/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:4021`.

---

## 13. The demo narrative (build toward this, not away from it)

1. **"Here's how MedCare works today."** `/ops`, baseline mode. Nagpur, Amoxicillin. Stock is fine.
   Forecast is flat. Everyone's happy.
2. **"Now watch the radar."** `/radar`. Wastewater flu RNA is climbing in Vidarbha. Search trend
   follows. School absence follows. POS demand is *still flat.* Spike probability 0.81,
   **expected onset in 7 days.** Nobody's dashboard knows this yet.
3. **"The plan reacts before the demand does."** Back to `/ops` — thresholds have rewritten
   themselves, with the reason printed. An alert fires with 7 days of lead time instead of 7 hours.
4. **"But the lead time is 72 hours and the factory can't help."** The alert escalates to L2 and
   auto-posts an **ask** to the exchange.
5. **"So the network heals itself."** `/exchange`. Mumbai DC has 500 units expiring in 26 days.
   Nagpur's ask (urgency 0.91) outbids Pune's routine restock (0.34). Watch it move on the map.
6. **"And what couldn't move?"** `/zero-waste`. A cold-chain batch that no lane could reach in time
   routes to an NGO instead of a write-off — anchored on Algorand, TxID clickable, on TestNet, live.
7. **The scoreboard.** Baseline vs Sentinel: stockout hours, fill rate, waste %, units rescued.

Close on the line that separates you from every other team:
*"Everyone else detects low stock. We predict the outbreak, let the medicine find its own way there,
and guarantee that if it still can't make it, no dose is ever thrown away."*
