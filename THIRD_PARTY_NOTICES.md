# Third-party notices

MedRail's own code is licensed under the [MIT License](LICENSE). It depends on the third-party
packages and services below. They are installed from npm or PyPI, or called over the network at
run time. No third-party source code is copied into this repository. Each component keeps its own
license, which you can read in the package itself or at the linked project.

## Smart contract toolchain (`contracts/`)

| Component | How it is used | License |
|---|---|---|
| [Algorand Python](https://github.com/algorandfoundation/puya) (`algorand-python`) | Language library the contract is written in | AGPL-3.0-or-later |
| [PuyaPy](https://github.com/algorandfoundation/puya) (`puyapy`) | Compiles the contract to TEAL (dev dependency) | AGPL-3.0-or-later |
| [algorand-python-testing](https://github.com/algorandfoundation/algorand-python-testing) | AVM simulator for the contract unit tests (dev dependency) | AGPL-3.0-or-later |
| [AlgoKit Utils](https://github.com/algorandfoundation/algokit-utils-py) (`algokit-utils`) | Deploy and exercise scripts | MIT |
| [py-algorand-sdk](https://github.com/algorand/py-algorand-sdk) | Algorand client for the scripts | MIT |
| [python-dotenv](https://github.com/theskumar/python-dotenv) | Loads `.env` files in scripts | BSD-3-Clause |
| [pytest](https://github.com/pytest-dev/pytest) | Test runner (dev dependency) | MIT |

## API (`api/`)

| Component | How it is used | License |
|---|---|---|
| [Hono](https://github.com/honojs/hono), [@hono/node-server](https://github.com/honojs/node-server) | HTTP server and routing | MIT |
| [@x402/core, @x402/avm, @x402/hono, @x402/fetch, @x402/extensions](https://www.npmjs.com/package/@x402/core) | x402 payment protocol, Algorand scheme, middleware, client, and Bazaar discovery | Apache-2.0 |
| [algosdk](https://github.com/algorand/js-algorand-sdk) | Algorand transactions and contract calls | MIT |
| [zod](https://github.com/colinhacks/zod) | Request validation | MIT |
| [dotenv](https://github.com/motdotla/dotenv) | Loads `.env` files | BSD-2-Clause |
| [TypeScript](https://github.com/microsoft/TypeScript) | Type checking and build (dev dependency) | Apache-2.0 |
| [Vitest](https://github.com/vitest-dev/vitest), @vitest/coverage-v8 | Tests and coverage (dev dependency) | MIT |
| [tsx](https://github.com/privatenumber/tsx) | Runs TypeScript scripts (dev dependency) | MIT |

## Web app (`web/`)

| Component | How it is used | License |
|---|---|---|
| [Next.js](https://github.com/vercel/next.js) | Web framework | MIT |
| [React, React DOM](https://github.com/facebook/react) | UI | MIT |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | Styling (dev dependency) | MIT |
| [@txnlab/use-wallet-react, -pera, -lute](https://github.com/TxnLab/use-wallet) | Wallet connection for Pera and Lute | MIT |
| @x402/core, @x402/avm, @x402/fetch, algosdk | Browser-side payment signing and contract calls | Apache-2.0, MIT |
| ESLint, eslint-config-next | Linting (dev dependency) | MIT |
| [Fraunces](https://fonts.google.com/specimen/Fraunces), [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans), [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) | Fonts, downloaded at build time by `next/font/google` and served with the app | SIL Open Font License 1.1 |

## External services

These are called over the network. None of their code is included in this repository.

| Service | How it is used | Terms |
|---|---|---|
| [GoPlausible x402 facilitator](https://facilitator.goplausible.xyz) | Verifies and settles x402 payments, sponsors network fees | GoPlausible's terms |
| [AlgoNode](https://algonode.io) | Public Algorand algod and indexer endpoints | AlgoNode's terms |
| [Google Gemini API](https://ai.google.dev) | Optional record summary (`POST /v1/summarize`) | Google's API terms |
| [Lora](https://lora.algokit.io), [Circle faucet](https://faucet.circle.com) | Linked from the app for explorer views and free TestNet funds | Their own terms |
| [shields.io](https://shields.io) | Badge images in the README, loaded by URL | CC0-1.0 (service) |
