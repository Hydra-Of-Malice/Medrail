# `contracts/artifacts/` — two artifact sets, and why

## `contracts/artifacts/*` — **the deployed program**

These are the compilation of `smart_contracts/consent/contract.py` **as of commit `3012e2d`**, and
they are what is running on Algorand TestNet as App
[`768743428`](https://lora.algokit.io/testnet/application/768743428).

They are pinned, not regenerated. `MedRailConsent.approval.teal` assembles via `algod` to bytecode
byte-identical to the deployed program — 1404 base64 characters, compile hash
`W4TMZHJOL7FIN5GIGJCWNB2HVI4C4WGVRDVY6BMUUOMWRFHMBJVSPZZ33U` — and
`MedRailConsent.arc56.json` is the ABI that `api/src/app.ts` serves at `/v1/consent/arc56` and that
`api/src/services/algorand.ts` builds its calls against. All three must describe the app the API
actually talks to, so they follow the chain, not the source tree.

**Regenerate these only as part of a redeploy**, and update `PROOF.md` §7 in the same change.

## `contracts/artifacts/current/*` — **the current source**

The compilation of today's `contract.py`. CI regenerates these on every run and fails if the
committed copies drift, so the source cannot change without the artifacts changing with it.

## Why they differ right now

Two contract defects found in the engineering review are **fixed in source and deliberately not
deployed**, so that App `768743428` keeps its App ID, its consent grants and its audit history —
`deploy_testnet.py` uses `OnUpdate.AppendApp`, which mints a *new* application rather than updating
in place.

| | Fix |
|---|---|
| **C-1** (G-12) | `AccessRequested` was emitted with the patient and requester addresses transposed, silently inverting the event for any ARC-28 consumer. |
| **C-2** (G-20) | `GRANT_BOX_MBR` omitted the `BoxMap` key prefix, under-reporting every grant box by 400 µALGO. |

The whole difference is three hunks — those two fixes and one import that became unused:

```bash
git diff 3012e2d -- contracts/smart_contracts/consent/contract.py
```

which shows up here as 927 lines of approval TEAL in `current/` against 922 in the deployed set.
Both are covered by `contracts/tests/`, which run against the AVM simulator and therefore test the
**source**, not the deployed program. That gap is the point of this README.
