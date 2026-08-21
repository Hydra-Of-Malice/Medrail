"""Cross-language golden-vector tests for the consent box-key derivation.

Finding G-08 / NFR-011: the same key is derived independently in three places —

  1. smart_contracts/consent/contract.py  -> AVM ``op.sha256`` (this is the authority)
  2. api/src/services/algorand.ts         -> node:crypto ``createHash``
  3. web/lib/consent.ts                   -> WebCrypto ``crypto.subtle.digest``

— and nothing previously checked that they agree. A one-byte divergence makes
``check_access`` read an empty box and return ``False``. It does not raise. It fails
*closed and silently*, presenting as "the patient's grant mysteriously doesn't work".

This module asserts the Python derivation against the **same fixture file** the
TypeScript suite uses (``api/test/fixtures/box-key-vectors.json``), so all three
implementations are pinned to identical bytes. If the fixture and this file ever
disagree, one of the three has drifted and the build fails here.
"""

import hashlib
import json
import pathlib

import pytest
from algosdk.encoding import decode_address

FIXTURE = (
    pathlib.Path(__file__).resolve().parent.parent.parent
    / "api"
    / "test"
    / "fixtures"
    / "box-key-vectors.json"
)


def _load_vectors() -> list[dict]:
    if not FIXTURE.exists():  # pragma: no cover - guarded by the test below
        return []
    return json.loads(FIXTURE.read_text(encoding="utf-8"))["vectors"]


VECTORS = _load_vectors()


def grant_box_key(patient: str, requester: str, scope: str) -> bytes:
    """Mirrors contract.py::grant_key plus the BoxMap key_prefix "g".

    The contract computes ``op.sha256(patient.bytes + requester.bytes + scope.bytes)``
    and stores it in ``BoxMap(Bytes, GrantRecord, key_prefix="g")``, so the *effective*
    box key on the ledger is the prefix byte followed by the 32-byte digest.
    """
    inner = decode_address(patient) + decode_address(requester) + scope.encode("utf-8")
    return b"g" + hashlib.sha256(inner).digest()


def audit_seq_box_key(patient: str) -> bytes:
    """Mirrors BoxMap(Account, UInt64, key_prefix="s") — the key is the raw public key."""
    return b"s" + decode_address(patient)


def test_fixture_is_present_and_shared_with_the_typescript_suite() -> None:
    assert FIXTURE.exists(), (
        f"golden-vector fixture missing at {FIXTURE}. It is shared with "
        "api/test/boxKeyParity.spec.ts and must not be duplicated."
    )
    assert len(VECTORS) >= 3


@pytest.mark.parametrize("vector", VECTORS, ids=lambda v: v["scope"] or "empty-scope")
def test_grant_box_key_matches_golden_vector(vector: dict) -> None:
    derived = grant_box_key(vector["patient"], vector["requester"], vector["scope"])
    assert derived.hex() == vector["expectedGrantBoxKeyHex"], (
        "Python grant box-key derivation has drifted from the shared fixture. "
        "The TypeScript backend and the browser client both derive this key too — "
        "a mismatch makes consent lookups silently return False."
    )


@pytest.mark.parametrize("vector", VECTORS, ids=lambda v: v["patient"][:8])
def test_audit_seq_box_key_matches_golden_vector(vector: dict) -> None:
    derived = audit_seq_box_key(vector["patient"])
    assert derived.hex() == vector["expectedAuditSeqBoxKeyHex"]


def test_key_lengths_match_the_documented_layout() -> None:
    v = VECTORS[0]
    grant = grant_box_key(v["patient"], v["requester"], v["scope"])
    seq = audit_seq_box_key(v["patient"])

    assert len(grant) == 33, "1-byte prefix + 32-byte sha256"
    assert grant[:1] == b"g"
    assert len(seq) == 33, "1-byte prefix + 32-byte public key"
    assert seq[:1] == b"s"

    # This is the length that GRANT_BOX_MBR must account for (defect C-2): the
    # effective key is 33 bytes, not the 32 bytes of the bare digest.
    from smart_contracts.consent.contract import GRANT_BOX_MBR

    assert GRANT_BOX_MBR == 2_500 + 400 * (len(grant) + 17)


def test_derivation_is_order_and_scope_sensitive() -> None:
    v = VECTORS[0]
    baseline = grant_box_key(v["patient"], v["requester"], v["scope"])

    # A grant is directional: patient -> requester is not requester -> patient.
    assert grant_box_key(v["requester"], v["patient"], v["scope"]) != baseline
    # A grant is scoped: a different scope is a different grant.
    assert grant_box_key(v["patient"], v["requester"], v["scope"] + "x") != baseline
