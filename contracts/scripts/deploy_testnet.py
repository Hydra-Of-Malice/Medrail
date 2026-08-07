"""Deploy MedRailConsent to Algorand and record the App ID.

Network-parameterized via the NETWORK env var — defaults to "testnet" so a bare
run can never accidentally touch MainNet; MainNet requires explicitly setting
NETWORK=mainnet, matching the deliberate friction described in
docs/IMPLEMENTATION_PLAN.md section 5.

Requires DEPLOYER_ADDRESS / DEPLOYER_MNEMONIC in contracts/.env, funded with
ALGO for the target network (and, before the first payment proof, the account
must also hold and have opted in to that network's USDC ASA — see
scripts/opt_in_usdc.py and docs/DEPLOYMENT.md). Safe to re-run:
`algokit_utils` deploy is idempotent per (app_name, creator) and will detect
an existing app rather than redeploying.

Usage:
    .venv/Scripts/python.exe scripts/deploy_testnet.py                # testnet (default)
    NETWORK=mainnet .venv/Scripts/python.exe scripts/deploy_testnet.py # mainnet — real funds
"""

import json
import os
import pathlib

from algokit_utils import (
    AlgorandClient,
    AppClientMethodCallCreateParams,
    AppFactory,
    AppFactoryParams,
    OnSchemaBreak,
    OnUpdate,
    OperationPerformed,
    PaymentParams,
    algo,
)
from dotenv import dotenv_values

ROOT = pathlib.Path(__file__).resolve().parent.parent
ARC56_PATH = ROOT / "artifacts" / "MedRailConsent.arc56.json"

NETWORK = os.environ.get("NETWORK", "testnet").lower()
if NETWORK not in ("testnet", "mainnet"):
    raise SystemExit(f"NETWORK must be 'testnet' or 'mainnet', got {NETWORK!r}")

DEPLOY_INFO_PATH = ROOT / "artifacts" / f"deploy_{NETWORK}.json"
EXPLORER_APP_URL = f"https://lora.algokit.io/{NETWORK}/application/{{app_id}}"

# Box MBR headroom: enough for a healthy number of grants + audit entries during
# the challenge's build phase without needing to call fund_mbr constantly.
# See GRANT_BOX_MBR in contract.py for the per-box cost this is sized against.
APP_FUNDING_ALGO = 5


def main() -> None:
    env = dotenv_values(ROOT / ".env")
    deployer_mnemonic = env.get("DEPLOYER_MNEMONIC")
    if not deployer_mnemonic:
        raise SystemExit("DEPLOYER_MNEMONIC missing from contracts/.env — see docs/DEPLOYMENT.md")

    algorand = AlgorandClient.mainnet() if NETWORK == "mainnet" else AlgorandClient.testnet()
    deployer = algorand.account.from_mnemonic(mnemonic=deployer_mnemonic)
    algorand.set_signer_from_account(deployer)

    print(f"Network:  {NETWORK}")
    info = algorand.account.get_information(deployer.address)
    print(f"Deployer: {deployer.address}")
    print(f"Balance:  {info.amount.algo} ALGO")

    def require_algo(min_micro_algo: int, purpose: str) -> None:
        current = algorand.account.get_information(deployer.address).amount.micro_algo
        if current < min_micro_algo:
            fund_hint = (
                "https://lora.algokit.io/testnet/fund"
                if NETWORK == "testnet"
                else "a real ALGO purchase/transfer to this address — this is MainNet, real funds"
            )
            raise SystemExit(f"Deployer needs more {NETWORK} ALGO to {purpose}. Fund it: {fund_hint}. Address: {deployer.address}")

    # Enough for contract creation + fees regardless of whether this run ends up
    # also funding the app account (that check happens separately, below, only
    # if a fresh app was actually created).
    require_algo(300_000, "deploy the contract")

    factory = AppFactory(
        AppFactoryParams(
            algorand=algorand,
            app_spec=ARC56_PATH.read_text(),
            app_name="MedRailConsent",
            default_sender=deployer.address,
        )
    )

    app_client, deploy_result = factory.deploy(
        on_update=OnUpdate.AppendApp,
        on_schema_break=OnSchemaBreak.Fail,
        create_params=AppClientMethodCallCreateParams(method="create"),
    )

    app_id = app_client.app_id
    app_address = app_client.app_address
    created = deploy_result.operation_performed == OperationPerformed.Create
    create_txid = deploy_result.create_result.tx_id if created and deploy_result.create_result else None

    print(f"App ID:      {app_id}")
    print(f"App address: {app_address}")
    print(f"Operation:   {deploy_result.operation_performed.name}")
    print(f"Create txn:  {create_txid or '(already existed — no new create txn)'}")

    # Fund the app account so it can cover box MBR for grants/audit entries itself
    # (see IMPLEMENTATION_PLAN.md for why boxes are app-funded, not caller-funded).
    # Only on first creation — an idempotent re-run against an already-deployed,
    # already-funded app shouldn't require (or spend) another APP_FUNDING_ALGO.
    # Preserve the original funding txid across idempotent re-runs instead of
    # nulling it out in the recorded deploy info.
    fund_txid = None
    if DEPLOY_INFO_PATH.exists():
        fund_txid = json.loads(DEPLOY_INFO_PATH.read_text()).get("fund_txid")

    if created:
        require_algo(algo(APP_FUNDING_ALGO).micro_algo + 200_000, "fund the new app account's box MBR")
        fund_result = algorand.send.payment(
            PaymentParams(sender=deployer.address, receiver=app_address, amount=algo(APP_FUNDING_ALGO))
        )
        fund_txid = fund_result.tx_id
        print(f"Funded app account: {fund_txid}")
    else:
        print("App already existed — skipped re-funding (use fund_mbr on-chain if it ever needs more).")

    DEPLOY_INFO_PATH.parent.mkdir(parents=True, exist_ok=True)
    DEPLOY_INFO_PATH.write_text(
        json.dumps(
            {
                "network": NETWORK,
                "app_id": app_id,
                "app_address": app_address,
                "deployer_address": deployer.address,
                "create_txid": create_txid,
                "fund_txid": fund_txid,
                "explorer_app_url": EXPLORER_APP_URL.format(app_id=app_id),
            },
            indent=2,
        )
    )
    print(f"\nWrote deploy info to {DEPLOY_INFO_PATH}")


if __name__ == "__main__":
    main()
