import { createHash } from "node:crypto";
import algosdk from "algosdk";
import { config, requireConsentAppId } from "../config.js";

const algod = new algosdk.Algodv2("", config.algodServer, "");

let operatorAccount: algosdk.Account | undefined;
function getOperator(): algosdk.Account {
  if (!config.operatorMnemonic) {
    throw new Error("OPERATOR_MNEMONIC is not set — see docs/DEPLOYMENT.md");
  }
  operatorAccount ??= algosdk.mnemonicToSecretKey(config.operatorMnemonic);
  return operatorAccount;
}

// Constructed directly from the contract's known ARC-4 signatures (see
// contracts/artifacts/MedRailConsent.arc56.json) rather than parsed via
// ABIContract, so this has no dependency on how a given algosdk version
// handles ARC-56 vs. ARC-4 app-spec parsing.
const CHECK_ACCESS_METHOD = new algosdk.ABIMethod({
  name: "check_access",
  args: [
    { type: "address", name: "patient" },
    { type: "address", name: "requester" },
    { type: "string", name: "scope" },
  ],
  returns: { type: "bool" },
});

const GET_AUDIT_COUNT_METHOD = new algosdk.ABIMethod({
  name: "get_audit_count",
  args: [{ type: "address", name: "patient" }],
  returns: { type: "uint64" },
});

const LOG_ACCESS_METHOD = new algosdk.ABIMethod({
  name: "log_access",
  args: [
    { type: "address", name: "patient" },
    { type: "address", name: "requester" },
    { type: "string", name: "scope" },
    { type: "string", name: "endpoint" },
    { type: "string", name: "action" },
  ],
  returns: { type: "uint64" },
});

function pubkey(address: string): Uint8Array {
  return algosdk.decodeAddress(address).publicKey;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** BoxMap(Bytes, GrantRecord, key_prefix="g") key for grant_key(patient, requester, scope) = sha256(patient+requester+scope). */
function grantBoxName(patient: string, requester: string, scope: string): Uint8Array {
  const prefix = new TextEncoder().encode("g");
  const inner = concatBytes(pubkey(patient), pubkey(requester), new TextEncoder().encode(scope));
  const digest = createHash("sha256").update(inner).digest();
  return concatBytes(prefix, new Uint8Array(digest));
}

/** BoxMap(Account, UInt64, key_prefix="s") key for audit_seq[patient]. */
function auditSeqBoxName(patient: string): Uint8Array {
  return concatBytes(new TextEncoder().encode("s"), pubkey(patient));
}

/** BoxMap(Bytes, AuditEntry, key_prefix="a") key for audit_log[patient.bytes + itob(seq)]. */
function auditLogBoxName(patient: string, seq: bigint): Uint8Array {
  return concatBytes(new TextEncoder().encode("a"), pubkey(patient), algosdk.encodeUint64(seq));
}

/** Read-only, zero-fee simulated call — no transaction is submitted to the network. */
export async function checkAccess(patient: string, requester: string, scope: string): Promise<boolean> {
  const appId = requireConsentAppId();
  const operator = getOperator();
  const suggestedParams = await algod.getTransactionParams().do();

  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: appId,
    method: CHECK_ACCESS_METHOD,
    methodArgs: [patient, requester, scope],
    sender: operator.addr,
    signer: algosdk.makeBasicAccountTransactionSigner(operator),
    suggestedParams,
    boxes: [{ appIndex: 0, name: grantBoxName(patient, requester, scope) }],
  });

  const result = await atc.simulate(algod);
  return result.methodResults[0]?.returnValue === true;
}

/** Read-only, zero-fee simulated call. */
export async function getAuditCount(patient: string): Promise<bigint> {
  const appId = requireConsentAppId();
  const operator = getOperator();
  const suggestedParams = await algod.getTransactionParams().do();

  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: appId,
    method: GET_AUDIT_COUNT_METHOD,
    methodArgs: [patient],
    sender: operator.addr,
    signer: algosdk.makeBasicAccountTransactionSigner(operator),
    suggestedParams,
    boxes: [{ appIndex: 0, name: auditSeqBoxName(patient) }],
  });

  const result = await atc.simulate(algod);
  return (result.methodResults[0]?.returnValue as bigint) ?? 0n;
}

// log_access predicts its own audit-log box key from the current sequence
// number (read-then-write), so two concurrent calls for the same patient
// could race and collide on the same predicted box. A per-patient queue
// keeps this backend's own calls strictly ordered; it does not protect
// against a second, independently-run backend sharing the same operator
// account — noted as a known limitation in docs/SECURITY.md.
const patientQueues = new Map<string, Promise<unknown>>();
function withPatientLock<T>(patient: string, fn: () => Promise<T>): Promise<T> {
  const prior = patientQueues.get(patient) ?? Promise.resolve();
  const next = prior.then(fn, fn);
  patientQueues.set(
    patient,
    next.catch(() => undefined),
  );
  return next;
}

/**
 * Liveness of the two accounts that keep the audit trail working.
 *
 * `log_access` is signed by the operator, so the operator pays the fee; the
 * audit box is stored under the application account, so *that* account pays the
 * box MBR. Either running dry stops audit writes, and the failure is silent
 * from the caller's side — the paid call still returns 200 and degrades to
 * `auditStatus: "pending"`. Reporting both balances turns that into something
 * you notice before a demo rather than after one.
 *
 * Read stale-while-revalidate: the reader never waits on algod. A liveness
 * endpoint that blocks on a third-party network call is not a liveness
 * endpoint, and Fly polls this one on a timer. `primeChainAccountHealth()` is
 * called once at boot so the first real request already has a value.
 */
export interface ChainAccountHealth {
  operatorAddress: string;
  operatorSpendableMicroAlgo: number;
  appAccountAddress: string | null;
  appAccountSpendableMicroAlgo: number | null;
  /** Fee per log_access call. Box MBR is charged to the app account, not this one. */
  microAlgoPerAuditWrite: number;
  /** Conservative estimate — the smaller of what each account can still fund. */
  estimatedAuditWritesRemaining: number;
  warning: string | null;
  sampledAt: string;
}

const AUDIT_WRITE_FEE = 1_000;
/** One grant box costs 22,500 µALGO; an audit box is smaller. Use the larger figure. */
const APP_MICROALGO_PER_BOX = 22_500;
const HEALTH_TTL_MS = 30_000;

let healthValue: ChainAccountHealth | undefined;
let healthError: string | undefined;
let healthSampledAt = 0;
let healthInFlight: Promise<void> | undefined;

async function spendable(address: string): Promise<number> {
  const info = await algod.accountInformation(address).do();
  return Math.max(0, Number(info.amount) - Number(info.minBalance ?? 0));
}

async function sampleChainAccountHealth(): Promise<void> {
  const operator = getOperator();
  const operatorAddress = operator.addr.toString();
  const operatorSpendable = await spendable(operatorAddress);

  let appAccountAddress: string | null = null;
  let appSpendable: number | null = null;
  if (config.consentAppId) {
    appAccountAddress = algosdk.getApplicationAddress(config.consentAppId).toString();
    appSpendable = await spendable(appAccountAddress);
  }

  const byOperator = Math.floor(operatorSpendable / AUDIT_WRITE_FEE);
  const byApp = appSpendable === null ? byOperator : Math.floor(appSpendable / APP_MICROALGO_PER_BOX);
  const remaining = Math.min(byOperator, byApp);

  let warning: string | null = null;
  if (remaining === 0) {
    warning = "Audit writes will fail. Fund the operator and/or the application account.";
  } else if (remaining < 20) {
    warning = `Only about ${remaining} more audit writes are affordable. Top up before a demo.`;
  }

  healthValue = {
    operatorAddress,
    operatorSpendableMicroAlgo: operatorSpendable,
    appAccountAddress,
    appAccountSpendableMicroAlgo: appSpendable,
    microAlgoPerAuditWrite: AUDIT_WRITE_FEE,
    estimatedAuditWritesRemaining: remaining,
    warning,
    sampledAt: new Date().toISOString(),
  };
  healthError = undefined;
}

/** Refreshes in the background. Never throws, never awaited by a request. */
export function primeChainAccountHealth(): void {
  if (healthInFlight) return;
  healthSampledAt = Date.now();
  healthInFlight = sampleChainAccountHealth()
    .catch((e: unknown) => {
      healthError = e instanceof Error ? e.message : String(e);
    })
    .finally(() => {
      healthInFlight = undefined;
    });
}

/**
 * Returns whatever the last successful sample said, triggering a refresh if it
 * has gone stale. Exactly one of the two fields is populated: either we have a
 * reading, or we say why we do not.
 */
export function chainAccountHealth(): { chain: ChainAccountHealth | null; chainError: string | null } {
  if (Date.now() - healthSampledAt >= HEALTH_TTL_MS) primeChainAccountHealth();
  if (healthValue) return { chain: healthValue, chainError: null };
  return { chain: null, chainError: healthError ?? "not sampled yet" };
}

/**
 * Admin-only, real on-chain transaction. Called by our own operator account
 * immediately after the x402 facilitator confirms settlement — see
 * docs/IMPLEMENTATION_PLAN.md section 3 for why this is a follow-up call
 * rather than part of the payment's own atomic group.
 */
export async function logAccess(
  patient: string,
  requester: string,
  scope: string,
  endpoint: string,
  action: string,
): Promise<{ txId: string; sequence: bigint }> {
  return withPatientLock(patient, async () => {
    const appId = requireConsentAppId();
    const operator = getOperator();
    const suggestedParams = await algod.getTransactionParams().do();

    const currentCount = await getAuditCount(patient);
    const predictedSeq = currentCount + 1n;

    const atc = new algosdk.AtomicTransactionComposer();
    atc.addMethodCall({
      appID: appId,
      method: LOG_ACCESS_METHOD,
      methodArgs: [patient, requester, scope, endpoint, action],
      sender: operator.addr,
      signer: algosdk.makeBasicAccountTransactionSigner(operator),
      suggestedParams,
      boxes: [
        { appIndex: 0, name: auditSeqBoxName(patient) },
        { appIndex: 0, name: auditLogBoxName(patient, predictedSeq) },
      ],
    });

    const result = await atc.execute(algod, 4);
    const sequence = (result.methodResults[0]?.returnValue as bigint) ?? predictedSeq;
    return { txId: result.txIDs[0], sequence };
  });
}
