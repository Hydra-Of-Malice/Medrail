from collections.abc import Generator

import algopy
import pytest
from algopy_testing import AlgopyTestContext, algopy_testing_context

from smart_contracts.consent.contract import (
    GRANT_BOX_MBR,
    STATUS_GRANTED,
    STATUS_REVOKED,
    AccessRequested,
    MedRailConsent,
)


@pytest.fixture()
def context() -> Generator[AlgopyTestContext, None, None]:
    with algopy_testing_context() as ctx:
        yield ctx


@pytest.fixture()
def contract(context: AlgopyTestContext) -> MedRailConsent:
    c = MedRailConsent()
    c.create()
    return c


def as_sender(context: AlgopyTestContext, contract: MedRailConsent, sender: algopy.Account):
    """Run the wrapped app call as `sender` instead of the context default."""
    return context.txn.create_group(
        gtxns=[
            context.any.txn.application_call(
                sender=sender,
                app_id=context.ledger.get_app(contract),
            )
        ],
        active_txn_index=0,
    )


def test_create_sets_admin(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    assert contract.admin.value == context.default_sender


def test_set_admin_only_admin(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    new_admin = context.any.account()
    contract.set_admin(new_admin)
    assert contract.admin.value == new_admin

    other = context.any.account()
    with pytest.raises(AssertionError):
        with as_sender(context, contract, other):
            contract.set_admin(context.any.account())


def test_request_access_emits_event_and_counts(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    patient = context.any.account()
    requester = context.default_sender

    contract.request_access(patient, algopy.String("records:summary"))

    assert contract.total_requests.value == algopy.UInt64(1)


def test_grant_then_check_access(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    patient = context.default_sender
    requester = context.any.account()
    scope = algopy.String("records:summary")

    contract.grant_access(requester, scope, algopy.UInt64(0))  # never expires

    assert contract.check_access(patient, requester, scope) is True
    assert contract.total_grants_active.value == algopy.UInt64(1)

    record = contract.get_grant(patient, requester, scope)
    assert record.status == algopy.arc4.UInt8(STATUS_GRANTED)


def test_check_access_false_when_no_grant(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    patient = context.any.account()
    requester = context.any.account()
    assert contract.check_access(patient, requester, algopy.String("records:summary")) is False


def test_grant_with_expiry_becomes_invalid_after_expiry(
    context: AlgopyTestContext, contract: MedRailConsent
) -> None:
    patient = context.default_sender
    requester = context.any.account()
    scope = algopy.String("records:summary")

    context.ledger.patch_global_fields(latest_timestamp=algopy.UInt64(1_000_000))
    contract.grant_access(requester, scope, algopy.UInt64(3600))  # 1 hour
    assert contract.check_access(patient, requester, scope) is True

    # Advance the simulated ledger clock past expiry.
    context.ledger.patch_global_fields(latest_timestamp=algopy.UInt64(1_000_000 + 3601))
    assert contract.check_access(patient, requester, scope) is False


def test_revoke_access(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    patient = context.default_sender
    requester = context.any.account()
    scope = algopy.String("records:summary")

    contract.grant_access(requester, scope, algopy.UInt64(0))
    assert contract.check_access(patient, requester, scope) is True

    contract.revoke_access(requester, scope)

    assert contract.check_access(patient, requester, scope) is False
    assert contract.total_grants_active.value == algopy.UInt64(0)
    assert contract.total_revocations.value == algopy.UInt64(1)

    record = contract.get_grant(patient, requester, scope)
    assert record.status == algopy.arc4.UInt8(STATUS_REVOKED)


def test_revoke_nonexistent_grant_asserts(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    requester = context.any.account()
    with pytest.raises(AssertionError):
        contract.revoke_access(requester, algopy.String("records:summary"))


def test_regrant_after_revoke_reactivates(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    patient = context.default_sender
    requester = context.any.account()
    scope = algopy.String("records:summary")

    contract.grant_access(requester, scope, algopy.UInt64(0))
    contract.revoke_access(requester, scope)
    assert contract.total_grants_active.value == algopy.UInt64(0)

    contract.grant_access(requester, scope, algopy.UInt64(0))
    assert contract.check_access(patient, requester, scope) is True
    assert contract.total_grants_active.value == algopy.UInt64(1)


def test_log_access_admin_only(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    patient = context.any.account()
    requester = context.any.account()

    seq = contract.log_access(
        patient, requester, algopy.String("open:triage"), algopy.String("/v1/triage"), algopy.String("open_call")
    )
    assert seq == algopy.UInt64(1)
    assert contract.get_audit_count(patient) == algopy.UInt64(1)

    entry = contract.get_audit_entry(patient, algopy.UInt64(1))
    assert entry.endpoint == algopy.arc4.String("/v1/triage")
    assert entry.action == algopy.arc4.String("open_call")


def test_log_access_rejects_non_admin(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    intruder = context.any.account()
    patient = context.any.account()

    with pytest.raises(AssertionError):
        with as_sender(context, contract, intruder):
            contract.log_access(
                patient, intruder, algopy.String("open:triage"), algopy.String("/v1/triage"), algopy.String("open_call")
            )


def test_audit_log_sequence_increments_per_patient(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    patient_a = context.any.account()
    patient_b = context.any.account()
    requester = context.any.account()

    contract.log_access(patient_a, requester, algopy.String("open:triage"), algopy.String("/v1/triage"), algopy.String("open_call"))
    contract.log_access(patient_a, requester, algopy.String("open:triage"), algopy.String("/v1/triage"), algopy.String("open_call"))
    contract.log_access(patient_b, requester, algopy.String("open:triage"), algopy.String("/v1/triage"), algopy.String("open_call"))

    assert contract.get_audit_count(patient_a) == algopy.UInt64(2)
    assert contract.get_audit_count(patient_b) == algopy.UInt64(1)


def test_get_audit_entry_missing_asserts(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    patient = context.any.account()
    with pytest.raises(AssertionError):
        contract.get_audit_entry(patient, algopy.UInt64(99))


def test_withdraw_excess_admin_only(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    intruder = context.any.account()
    with pytest.raises(AssertionError):
        with as_sender(context, contract, intruder):
            contract.withdraw_excess(algopy.UInt64(1000))


def test_request_access_event_field_order(context: AlgopyTestContext, contract: MedRailConsent) -> None:
    """Regression test for defect C-1.

    `AccessRequested` is declared (patient, requester, scope). `request_access` is called
    BY the requester, so `Txn.sender` is the requester and `patient` is the ABI argument.
    An earlier revision emitted these transposed, inverting the data for every ARC-28
    consumer. `test_request_access_emits_event_and_counts` asserts only the counter and
    would not have caught it.
    """
    patient = context.any.account()
    requester = context.default_sender  # request_access is sent by the requester
    assert patient != requester, "fixture must use distinct accounts to be meaningful"

    contract.request_access(patient, algopy.String("records:summary"))

    txn = context.txn.last_active
    assert int(txn.num_logs) >= 1, "request_access must emit an ARC-28 event"

    # ARC-28 log layout: <4-byte event selector><ARC-4 encoded struct>.
    # AccessRequested = (address patient, address requester, string scope), so the two
    # 32-byte addresses are at offsets 4..36 and 36..68 of the payload.
    payload = bytes(txn.logs(int(txn.num_logs) - 1))
    assert len(payload) >= 4 + 32 + 32, "event payload shorter than two addresses"

    assert payload[4:36] == patient.bytes.value, (
        "first address in AccessRequested must be the PATIENT (defect C-1)"
    )
    assert payload[36:68] == requester.bytes.value, (
        "second address in AccessRequested must be the REQUESTER (defect C-1)"
    )


def test_grant_box_mbr_matches_the_protocol_formula() -> None:
    """Regression test for defect C-2.

    Algorand box MBR is 2_500 + 400 * (len(key) + len(value)). The effective key for the
    `grants` BoxMap includes its 1-byte key_prefix, so the key is 33 bytes (1 + sha256),
    not 32. An earlier revision omitted the prefix and under-reported every grant box by
    400 microAlgo through a public ABI method advertised as a sizing constant.

    Confirmed against the deployed app account on TestNet: 5 boxes / 333 key+value bytes
    -> min-balance - 100_000 == 2_500 * 5 + 400 * 333 == 145_700 microAlgo.
    """
    key_len = 1 + 32   # "g" prefix + sha256(patient || requester || scope)
    value_len = 1 + 8 + 8  # GrantRecord: uint8 status, uint64 granted_at, uint64 expires_at

    assert GRANT_BOX_MBR == 2_500 + 400 * (key_len + value_len)
    assert GRANT_BOX_MBR == 22_500

    # The specific bug: forgetting the prefix byte costs exactly 400 microAlgo per box.
    without_prefix = 2_500 + 400 * (32 + value_len)
    assert GRANT_BOX_MBR - without_prefix == 400


def test_get_grant_box_mbr_returns_the_corrected_constant(
    context: AlgopyTestContext, contract: MedRailConsent
) -> None:
    """The public ABI method exists to be quoted by a backend sizing fund_mbr calls,
    so it must return the true cost, not an approximation."""
    assert contract.get_grant_box_mbr() == algopy.UInt64(22_500)
