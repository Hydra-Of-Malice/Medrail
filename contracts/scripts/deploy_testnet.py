"""Deploy MedRailConsent to Algorand TestNet and record the App ID.

Requires DEPLOYER_ADDRESS / DEPLOYER_MNEMONIC in contracts/.env, funded with a
few TestNet ALGO (free play-money — see docs/DEPLOYMENT.md for how to get
some; there is no working unauthenticated faucet left as of 2026-08, so this
is a one-time manual step). Safe to re-run: `algokit_utils` deploy is
idempotent per (app_name, creator) and will detect an existing app rather
than redeploying.

Usage:
    .venv/Scripts/python.exe scripts/deploy_testnet.py
"""

import json
import pathlib

from algokit_utils import (
    AlgorandClient,
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
DEPLOY_INFO_PATH = ROOT / "artifacts" / "deploy_testnet.json"

# Box MBR headroom: enough for a healthy number of grants + audit entries during
# the challenge's build phase without needing to call fund_mbr constantly.
# See GRANT_BOX_MBR in contract.py for the per-box cost this is sized against.
APP_FUNDING_ALGO = 5


def main() -> None:
    env = dotenv_values(ROOT / ".env")
    deployer_mnemonic = env.get("DEPLOYER_MNEMONIC")
    if not deployer_mnemonic:
        raise SystemExit("DEPLOYER_MNEMONIC missing from contracts/.env — see docs/DEPLOYMENT.md")

    algorand = AlgorandClient.testnet()
    deployer = algorand.account.from_mnemonic(mnemonic=deployer_mnemonic)
    algorand.set_signer_from_account(deployer)

    info = algorand.account.get_information(deployer.address)
    print(f"Deployer: {deployer.address}")
    print(f"Balance:  {info.amount.algo} ALGO")
    if info.amount.micro_algo < algo(APP_FUNDING_ALGO).micro_algo + 200_000:
        raise SystemExit(
            "Deployer needs more TestNet ALGO. Fund it at "
            "https://lora.algokit.io/testnet/fund and re-run this script. "
            f"Address: {deployer.address}"
        )

    factory = AppFactory(
        AppFactoryParams(
            algorand=algorand,
            app_spec=str(ARC56_PATH),
            app_name="MedRailConsent",
            default_sender=deployer.address,
        )
    )

    app_client, deploy_result = factory.deploy(
        on_update=OnUpdate.AppendApp,
        on_schema_break=OnSchemaBreak.Fail,
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
    fund_result = algorand.send.payment(
        PaymentParams(
            sender=deployer.address,
            receiver=app_address,
            amount=algo(APP_FUNDING_ALGO),
        )
    )
    print(f"Funded app account: {fund_result.tx_id}")

    DEPLOY_INFO_PATH.parent.mkdir(parents=True, exist_ok=True)
    DEPLOY_INFO_PATH.write_text(
        json.dumps(
            {
                "network": "testnet",
                "app_id": app_id,
                "app_address": app_address,
                "deployer_address": deployer.address,
                "create_txid": create_txid,
                "fund_txid": fund_result.tx_id,
                "explorer_app_url": f"https://lora.algokit.io/testnet/application/{app_id}",
            },
            indent=2,
        )
    )
    print(f"\nWrote deploy info to {DEPLOY_INFO_PATH}")


if __name__ == "__main__":
    main()
