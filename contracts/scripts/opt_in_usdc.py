"""One-time: opt the deployer account into the USDC ASA so it can receive a
transfer. Algorand requires every account to explicitly opt in to an ASA
before it can hold it — this is a zero-value, standard prerequisite step, not
a transfer of anything.

Network-parameterized via NETWORK, defaulting to "testnet" (see
scripts/deploy_testnet.py for the same convention).

Usage:
    .venv/Scripts/python.exe scripts/opt_in_usdc.py
    NETWORK=mainnet .venv/Scripts/python.exe scripts/opt_in_usdc.py
"""

import os
import pathlib

from algokit_utils import AlgorandClient, AssetOptInParams
from dotenv import dotenv_values

ROOT = pathlib.Path(__file__).resolve().parent.parent

NETWORK = os.environ.get("NETWORK", "testnet").lower()
if NETWORK not in ("testnet", "mainnet"):
    raise SystemExit(f"NETWORK must be 'testnet' or 'mainnet', got {NETWORK!r}")

# Verified live against AlgoNode indexers — see docs/IMPLEMENTATION_PLAN.md section 1.
USDC_ASA_ID = {"testnet": 10458941, "mainnet": 31566704}[NETWORK]


def main() -> None:
    env = dotenv_values(ROOT / ".env")
    algorand = AlgorandClient.mainnet() if NETWORK == "mainnet" else AlgorandClient.testnet()
    deployer = algorand.account.from_mnemonic(mnemonic=env["DEPLOYER_MNEMONIC"])
    algorand.set_signer_from_account(deployer)

    result = algorand.send.asset_opt_in(AssetOptInParams(sender=deployer.address, asset_id=USDC_ASA_ID))
    print(f"Opted in to USDC (ASA {USDC_ASA_ID}) on {NETWORK}: {result.tx_id}")


if __name__ == "__main__":
    main()
