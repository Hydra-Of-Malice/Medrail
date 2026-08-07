"""Run a real request -> grant -> check -> revoke cycle against the deployed
MedRailConsent app on TestNet, using two fresh throwaway accounts (patient,
requester) funded from the deployer. Prints every transaction ID so they can
be independently verified on a block explorer.

Requires contracts/artifacts/deploy_testnet.json to exist (run
deploy_testnet.py first) and the deployer account to still hold a little
spare TestNet ALGO to fund the two throwaway accounts.

Usage:
    .venv/Scripts/python.exe scripts/exercise_contract.py
"""

import json
import pathlib

from algokit_utils import (
    AlgorandClient,
    AppClient,
    AppClientMethodCallParams,
    AppClientParams,
    PaymentParams,
    algo,
)
from dotenv import dotenv_values

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEPLOY_INFO_PATH = ROOT / "artifacts" / "deploy_testnet.json"
ARC56_PATH = ROOT / "artifacts" / "MedRailConsent.arc56.json"


def main() -> None:
    if not DEPLOY_INFO_PATH.exists():
        raise SystemExit("Run deploy_testnet.py first — no deploy_testnet.json found.")

    deploy_info = json.loads(DEPLOY_INFO_PATH.read_text())
    app_id = deploy_info["app_id"]

    env = dotenv_values(ROOT / ".env")
    algorand = AlgorandClient.testnet()
    deployer = algorand.account.from_mnemonic(mnemonic=env["DEPLOYER_MNEMONIC"])
    algorand.set_signer_from_account(deployer)

    patient = algorand.account.random()
    requester = algorand.account.random()
    algorand.set_signer_from_account(patient)
    algorand.set_signer_from_account(requester)

    print(f"App ID:    {app_id}")
    print(f"Patient:   {patient.address}")
    print(f"Requester: {requester.address}")

    for acct in (patient, requester):
        fund_txn = algorand.send.payment(
            PaymentParams(sender=deployer.address, receiver=acct.address, amount=algo(1))
        )
        print(f"Funded {acct.address[:8]}...: {fund_txn.tx_id}")

    app_client = AppClient(
        AppClientParams(
            algorand=algorand,
            app_id=app_id,
            app_spec=str(ARC56_PATH),
        )
    )

    scope = "records:summary"

    r1 = app_client.send.call(
        AppClientMethodCallParams(
            method="request_access",
            args=[patient.address, scope],
            sender=requester.address,
        )
    )
    print(f"request_access:      {r1.tx_ids[-1]}")

    r2 = app_client.send.call(
        AppClientMethodCallParams(
            method="grant_access",
            args=[requester.address, scope, 0],  # never expires
            sender=patient.address,
        )
    )
    print(f"grant_access:         {r2.tx_ids[-1]}")

    check1 = app_client.send.call(
        AppClientMethodCallParams(
            method="check_access",
            args=[patient.address, requester.address, scope],
            sender=deployer.address,
        )
    )
    print(f"check_access (after grant):  {check1.abi_return}  (txn {check1.tx_ids[-1]})")

    r3 = app_client.send.call(
        AppClientMethodCallParams(
            method="revoke_access",
            args=[requester.address, scope],
            sender=patient.address,
        )
    )
    print(f"revoke_access:        {r3.tx_ids[-1]}")

    check2 = app_client.send.call(
        AppClientMethodCallParams(
            method="check_access",
            args=[patient.address, requester.address, scope],
            sender=deployer.address,
        )
    )
    print(f"check_access (after revoke): {check2.abi_return}  (txn {check2.tx_ids[-1]})")

    assert check1.abi_return is True, "expected access to be valid right after grant"
    assert check2.abi_return is False, "expected access to be invalid right after revoke"
    print("\nFull cycle verified on real TestNet.")


if __name__ == "__main__":
    main()
