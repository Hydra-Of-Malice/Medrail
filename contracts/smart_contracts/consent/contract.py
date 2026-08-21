"""MedRailConsent — on-chain patient consent registry and access audit log.

Two things live here, deliberately kept in one small contract rather than
split up: the consent state machine (request -> grant -> revoke, with
optional expiry) that backs the patient-ownership story, and a per-patient
audit log that the MedRail backend appends to after every paid access,
whether or not that access required consent. One contract, one on-chain
source of truth for "who touched this patient's data and were they allowed
to."

Design notes that matter for reviewers:
  - Box storage, not local state: local state would require every requester
    to opt in to this app, which makes no sense for a stranger's read-only
    AI agent calling a pay-per-call endpoint. Boxes let any (patient,
    requester, scope) triple exist without either side opting in to
    anything except the box's own MBR cost, which the app account itself
    funds (see `fund_mbr`).
  - `log_access` is intentionally admin-only. It is called by the MedRail
    backend's own operator account immediately after the x402 facilitator
    confirms a settled payment — never by an arbitrary caller — so an
    audit-log entry is only ever written after money has actually moved.
    See docs/IMPLEMENTATION_PLAN.md section 3 for why this is a follow-up
    call rather than part of the same atomic group as the payment.
"""

from algopy import (
    Account,
    ARC4Contract,
    BoxMap,
    Bytes,
    Global,
    GlobalState,
    String,
    Txn,
    UInt64,
    arc4,
    gtxn,
    itxn,
    op,
    subroutine,
)

# Status codes stored in GrantRecord.status. Plain ints: algopy module-level
# constants must be compile-time literals, not constructed type instances.
STATUS_NONE = 0
STATUS_GRANTED = 1
STATUS_REVOKED = 2

# Fixed per-box costs (Algorand box MBR = 2_500 + 400 * (len(key) + len(value)) microAlgo).
# The *effective* box key includes this BoxMap's 1-byte key_prefix ("g"), so the key is
# 1 + 32 (sha256) = 33 bytes, not 32. Grant value (GrantRecord, ARC4-encoded) = 1 + 8 + 8 = 17.
# Verified against the deployed app's own account: with 5 boxes totalling 333 key+value bytes,
# min-balance - 100_000 (base) == 2_500 * 5 + 400 * 333 == 145_700 microAlgo, exactly.
# (An earlier revision omitted the prefix and under-reported every grant box by 400 microAlgo.)
GRANT_BOX_MBR = 2_500 + 400 * (33 + 17)
# Audit key = 32 (patient) + 8 (seq) = 40 bytes. Audit value is variable-length (ARC4 dynamic
# strings for scope/endpoint/action); we size the box generously at write time instead of
# hard-coding a value length here.


class GrantRecord(arc4.Struct):
    """Consent grant state for one (patient, requester, scope) triple."""

    status: arc4.UInt8
    granted_at: arc4.UInt64
    expires_at: arc4.UInt64  # 0 means "does not expire"


class AuditEntry(arc4.Struct):
    """One immutable log line: what was accessed, by whom, and under what consent scope."""

    ts: arc4.UInt64
    requester: arc4.Address
    scope: arc4.String
    endpoint: arc4.String
    action: arc4.String  # "open_call" | "consent_checked" | "granted" | "revoked" | "requested"


class AccessRequested(arc4.Struct):
    patient: arc4.Address
    requester: arc4.Address
    scope: arc4.String


class AccessGranted(arc4.Struct):
    patient: arc4.Address
    requester: arc4.Address
    scope: arc4.String
    expires_at: arc4.UInt64


class AccessRevoked(arc4.Struct):
    patient: arc4.Address
    requester: arc4.Address
    scope: arc4.String


@subroutine
def grant_key(patient: Account, requester: Account, scope: String) -> Bytes:
    """Deterministic, fixed-length (32-byte) box key for a consent triple."""
    return op.sha256(patient.bytes + requester.bytes + scope.bytes)


@subroutine
def audit_key(patient: Account, seq: UInt64) -> Bytes:
    return patient.bytes + op.itob(seq)


class MedRailConsent(ARC4Contract):
    def __init__(self) -> None:
        self.admin = GlobalState(Account)
        self.total_requests = GlobalState(UInt64(0))
        self.total_grants_active = GlobalState(UInt64(0))
        self.total_revocations = GlobalState(UInt64(0))
        self.total_audit_entries = GlobalState(UInt64(0))

        self.grants = BoxMap(Bytes, GrantRecord, key_prefix="g")
        self.audit_seq = BoxMap(Account, UInt64, key_prefix="s")
        self.audit_log = BoxMap(Bytes, AuditEntry, key_prefix="a")

    @arc4.abimethod(create="require")
    def create(self) -> None:
        """Deployer becomes the initial admin (the MedRail backend operator account)."""
        self.admin.value = Txn.sender

    @arc4.abimethod
    def set_admin(self, new_admin: Account) -> None:
        """Rotate the backend operator key without redeploying the contract."""
        assert Txn.sender == self.admin.value, "only admin"
        self.admin.value = new_admin

    @arc4.abimethod
    def fund_mbr(self, payment: gtxn.PaymentTransaction) -> None:
        """Top up the app account's own balance so it can cover box MBR itself.

        Callable by anyone (typically the admin at setup time, or periodically
        as more grants/audit entries accumulate). Boxes are owned by the app
        account, not by callers, so the app must carry enough balance to
        create them; this keeps every other method's signature simple.
        """
        assert payment.receiver == Global.current_application_address, "must pay the app"

    @arc4.abimethod
    def request_access(self, patient: Account, scope: String) -> None:
        """Requester signals interest in a scope. No state is persisted for this —
        it is a notification event only; the patient's `grant_access` call is the
        first thing that actually costs box MBR and becomes queryable state."""
        self.total_requests.value += 1
        # AccessRequested is declared (patient, requester, scope) and Txn.sender is the
        # *requester* here, so the patient argument must come first. An earlier revision
        # passed these in call order and emitted every event with the two addresses
        # transposed, silently inverting the data for any ARC-28 consumer.
        arc4.emit(AccessRequested(arc4.Address(patient), arc4.Address(Txn.sender), arc4.String(scope)))

    @arc4.abimethod
    def grant_access(self, requester: Account, scope: String, duration_seconds: UInt64) -> None:
        """Txn.sender is the patient. duration_seconds == 0 means no expiry."""
        key = grant_key(Txn.sender, requester, scope)
        expires_at = UInt64(0) if duration_seconds == UInt64(0) else Global.latest_timestamp + duration_seconds

        # A box can exist while inactive (previously revoked), so "does the box
        # exist" is not the same question as "is it already counted as active" —
        # the counter must key off prior *status*, not prior *existence*.
        was_active_before = False
        if self.grants.maybe(key)[1]:
            was_active_before = self.grants.maybe(key)[0].status == arc4.UInt8(STATUS_GRANTED)

        self.grants[key] = GrantRecord(
            status=arc4.UInt8(STATUS_GRANTED),
            granted_at=arc4.UInt64(Global.latest_timestamp),
            expires_at=arc4.UInt64(expires_at),
        )
        if not was_active_before:
            self.total_grants_active.value += 1

        arc4.emit(
            AccessGranted(
                arc4.Address(Txn.sender),
                arc4.Address(requester),
                arc4.String(scope),
                arc4.UInt64(expires_at),
            )
        )

    @arc4.abimethod
    def revoke_access(self, requester: Account, scope: String) -> None:
        """Txn.sender is the patient."""
        key = grant_key(Txn.sender, requester, scope)
        assert self.grants.maybe(key)[1], "no such grant"
        record = self.grants.maybe(key)[0].copy()

        was_active = record.status == arc4.UInt8(STATUS_GRANTED)
        self.grants[key] = GrantRecord(
            status=arc4.UInt8(STATUS_REVOKED),
            granted_at=record.granted_at,
            expires_at=record.expires_at,
        )
        if was_active:
            self.total_grants_active.value -= 1
            self.total_revocations.value += 1

        arc4.emit(AccessRevoked(arc4.Address(Txn.sender), arc4.Address(requester), arc4.String(scope)))

    @arc4.abimethod(readonly=True)
    def check_access(self, patient: Account, requester: Account, scope: String) -> bool:
        """True iff a currently-valid (granted, unexpired, unrevoked) consent exists."""
        key = grant_key(patient, requester, scope)
        if not self.grants.maybe(key)[1]:
            return False
        record = self.grants.maybe(key)[0].copy()
        if record.status != arc4.UInt8(STATUS_GRANTED):
            return False
        expires_at = record.expires_at.as_uint64()
        if expires_at == UInt64(0):
            return True
        return bool(Global.latest_timestamp < expires_at)

    @arc4.abimethod(readonly=True)
    def get_grant(self, patient: Account, requester: Account, scope: String) -> GrantRecord:
        key = grant_key(patient, requester, scope)
        assert self.grants.maybe(key)[1], "no such grant"
        return self.grants.maybe(key)[0].copy()

    @arc4.abimethod
    def log_access(self, patient: Account, requester: Account, scope: String, endpoint: String, action: String) -> UInt64:
        """Admin-only. Appends one immutable audit entry for `patient` and returns its
        sequence number. Called by the MedRail backend right after the x402
        facilitator confirms settlement for a call touching that patient."""
        assert Txn.sender == self.admin.value, "only admin"

        seq, existed = self.audit_seq.maybe(patient)
        next_seq = UInt64(1) if not existed else seq + 1
        self.audit_seq[patient] = next_seq

        self.audit_log[audit_key(patient, next_seq)] = AuditEntry(
            ts=arc4.UInt64(Global.latest_timestamp),
            requester=arc4.Address(requester),
            scope=arc4.String(scope),
            endpoint=arc4.String(endpoint),
            action=arc4.String(action),
        )
        self.total_audit_entries.value += 1
        return next_seq

    @arc4.abimethod(readonly=True)
    def get_audit_count(self, patient: Account) -> UInt64:
        return self.audit_seq.get(patient, default=UInt64(0))

    @arc4.abimethod(readonly=True)
    def get_audit_entry(self, patient: Account, seq: UInt64) -> AuditEntry:
        key = audit_key(patient, seq)
        assert self.audit_log.maybe(key)[1], "no such audit entry"
        return self.audit_log.maybe(key)[0].copy()

    @arc4.abimethod(readonly=True)
    def get_grant_box_mbr(self) -> UInt64:
        """Minimum balance a single grant box locks up — a compile-time constant
        the backend can quote when sizing `fund_mbr` calls, without hard-coding it."""
        return UInt64(GRANT_BOX_MBR)

    @arc4.abimethod
    def withdraw_excess(self, amount: UInt64) -> None:
        """Admin-only escape hatch to reclaim ALGO over the app's MBR requirement
        (e.g. if it was overfunded via `fund_mbr`). Never touches box contents."""
        assert Txn.sender == self.admin.value, "only admin"
        itxn.Payment(receiver=self.admin.value, amount=amount, fee=0).submit()
