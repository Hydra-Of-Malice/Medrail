import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import algosdk from "algosdk";
import goldenVectors from "./fixtures/box-key-vectors.json" with { type: "json" };

/**
 * Unit tests for the chain service (G-05).
 *
 * Everything in api/src/services/algorand.ts either decides whether a record is
 * released, writes a line into a patient's immutable audit trail, or reports
 * whether the accounts funding that trail are still solvent — and none of it was
 * reachable from a test, because every path ends in an algod round trip.
 *
 * So algod and the transaction composer are stubbed at the algosdk boundary.
 * Everything else in algosdk stays real: address decoding, `encodeUint64`,
 * `getApplicationAddress` and the ABI method definitions are exactly what the
 * box keys and the ABI encoding depend on, and faking those would only test the
 * fake. Nothing here opens a socket.
 */

/** One `addMethodCall` as the service composed it. */
interface ComposedCall {
  method: string;
  appId: number;
  sender: string;
  methodArgs: readonly unknown[];
  boxes: Array<{ appIndex: number; name: Uint8Array }>;
}

interface ExecuteResult {
  txIDs: string[];
  methodResults: Array<{ returnValue: unknown }>;
}

/**
 * The stub's control surface. Hoisted above the imports so the `vi.mock`
 * factories below can close over it, and mutated per test.
 */
const chain = vi.hoisted(() => ({
  /** Every composed ABI call, in composition order. */
  composed: [] as ComposedCall[],
  /** Every address `accountInformation` was asked about, in call order. */
  accountInfoCalls: [] as string[],
  simulate: null as ((call: ComposedCall) => unknown) | null,
  execute: null as ((call: ComposedCall) => Promise<ExecuteResult>) | null,
  accountInformation: null as ((address: string) => Promise<Record<string, number>>) | null,
  config: { algodServer: "https://algod.invalid", consentAppId: 0, operatorMnemonic: "stub-mnemonic" },
  operatorAddress: "",
}));

vi.mock("../src/config.js", () => ({
  config: chain.config,
  requireConsentAppId: () => {
    if (!chain.config.consentAppId) throw new Error("CONSENT_APP_ID is not set");
    return chain.config.consentAppId;
  },
}));

vi.mock("algosdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("algosdk")>();
  const real = actual.default;

  /** Stands in for the algod HTTP client. */
  class StubAlgodv2 {
    getTransactionParams() {
      return {
        do: async () => ({
          fee: 0,
          minFee: 1000,
          firstValid: 1,
          lastValid: 1001,
          genesisID: "testnet-v1.0",
          genesisHash: new Uint8Array(32),
        }),
      };
    }

    accountInformation(address: string) {
      return {
        do: async () => {
          chain.accountInfoCalls.push(address);
          if (!chain.accountInformation) throw new Error("test did not stub accountInformation");
          return chain.accountInformation(address);
        },
      };
    }
  }

  class StubComposer {
    private call: ComposedCall | undefined;

    addMethodCall(params: {
      appID: number | bigint;
      method: { name: string };
      methodArgs: readonly unknown[];
      sender: unknown;
      boxes?: Array<{ appIndex: number; name: Uint8Array }>;
    }): void {
      this.call = {
        method: params.method.name,
        appId: Number(params.appID),
        sender: String(params.sender),
        methodArgs: params.methodArgs,
        boxes: params.boxes ?? [],
      };
      // Recorded synchronously at composition time. This array is the ordering
      // signal the per-patient lock tests read, so it must be pushed before any
      // await inside the service, not when the call settles.
      chain.composed.push(this.call);
    }

    async simulate(): Promise<{ methodResults: Array<{ returnValue: unknown }> }> {
      if (!chain.simulate) throw new Error("test did not stub simulate");
      return { methodResults: [{ returnValue: chain.simulate(this.call!) }] };
    }

    async execute(): Promise<ExecuteResult> {
      if (!chain.execute) throw new Error("test did not stub execute");
      return chain.execute(this.call!);
    }
  }

  const patched = {
    ...real,
    Algodv2: StubAlgodv2,
    AtomicTransactionComposer: StubComposer,
    // Keeps key material out of the repository and out of the test run: the
    // composer never signs, so the secret key is only ever carried around.
    mnemonicToSecretKey: () => ({
      addr: real.decodeAddress(chain.operatorAddress),
      sk: new Uint8Array(64),
    }),
  };
  return { ...actual, ...patched, default: patched };
});

type AlgorandService = typeof import("../src/services/algorand.js");

/**
 * A fresh module instance per test. algorand.ts holds the per-patient lock queue,
 * the memoised operator account and the health cache in module scope, so a shared
 * instance would leak state between cases — and the health contract is *about*
 * that state.
 */
async function loadService(): Promise<AlgorandService> {
  vi.resetModules();
  return await import("../src/services/algorand.js");
}

/** Drains the microtask queue, so every await not held open by a gate has settled. */
function settle(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  return { promise, release };
}

interface BoxKeyVector {
  patient: string;
  requester: string;
  scope: string;
  expectedGrantBoxKeyHex: string;
  expectedAuditSeqBoxKeyHex: string;
}

/**
 * The same golden vectors api/test/boxKeyParity.spec.ts and
 * contracts/tests/test_box_keys.py assert. Reused rather than re-derived: a box
 * name the service computes correctly but attaches to the wrong call is still a
 * silent `false` from `check_access`, and only these assertions catch that.
 */
const [GRANT_VECTOR] = (goldenVectors as { vectors: BoxKeyVector[] }).vectors;
const { patient: PATIENT, requester: REQUESTER, scope: SCOPE } = GRANT_VECTOR;
/** `expectedAuditSeqBoxKeyHex` is `"s" || pubkey(patient)`; drop the prefix byte. */
const PATIENT_PUBKEY_HEX = GRANT_VECTOR.expectedAuditSeqBoxKeyHex.slice(2);

const APP_ID = 768743428;
const ENDPOINT = "/v1/records/summary";
const OPERATOR_ADDRESS = algosdk.generateAccount().addr.toString();

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

beforeEach(() => {
  chain.composed.length = 0;
  chain.accountInfoCalls.length = 0;
  chain.simulate = null;
  chain.execute = null;
  chain.accountInformation = null;
  chain.config.consentAppId = APP_ID;
  chain.operatorAddress = OPERATOR_ADDRESS;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkAccess", () => {
  it("returns the contract's bool for a live grant", async () => {
    chain.simulate = () => true;
    const service = await loadService();

    await expect(service.checkAccess(PATIENT, REQUESTER, SCOPE)).resolves.toBe(true);
  });

  it("returns the contract's bool for a revoked or missing grant", async () => {
    chain.simulate = () => false;
    const service = await loadService();

    await expect(service.checkAccess(PATIENT, REQUESTER, SCOPE)).resolves.toBe(false);
  });

  it("fails closed on anything that is not literally `true`", async () => {
    const service = await loadService();

    // The strict `=== true` is the whole safety property here. A simulate that
    // returned no method result — an empty box, a decode change, a future
    // algosdk shape shift — must read as "no consent", never as "truthy".
    chain.simulate = () => undefined;
    await expect(service.checkAccess(PATIENT, REQUESTER, SCOPE)).resolves.toBe(false);

    chain.simulate = () => "true";
    await expect(service.checkAccess(PATIENT, REQUESTER, SCOPE)).resolves.toBe(false);
  });

  it("reads the grant box the contract will look in", async () => {
    chain.simulate = () => true;
    const service = await loadService();

    await service.checkAccess(PATIENT, REQUESTER, SCOPE);

    expect(chain.composed).toHaveLength(1);
    const [call] = chain.composed;
    expect(call.method).toBe("check_access");
    expect(call.appId).toBe(APP_ID);
    expect(call.sender).toBe(OPERATOR_ADDRESS);
    // Argument order is not cosmetic: grant_key hashes patient-then-requester,
    // so a swap addresses a different, empty box.
    expect(call.methodArgs).toEqual([PATIENT, REQUESTER, SCOPE]);
    expect(call.boxes).toHaveLength(1);
    expect(call.boxes[0].appIndex).toBe(0);
    expect(hex(call.boxes[0].name)).toBe(GRANT_VECTOR.expectedGrantBoxKeyHex);
  });

  it("refuses to call an unconfigured application", async () => {
    chain.config.consentAppId = 0;
    const service = await loadService();

    // Calling app 0 would not fail loudly; it would fail as a confusing chain
    // error on every consent check in the service.
    await expect(service.checkAccess(PATIENT, REQUESTER, SCOPE)).rejects.toThrow(/CONSENT_APP_ID/);
    expect(chain.composed).toHaveLength(0);
  });
});

describe("getAuditCount", () => {
  it("returns the uint64 as a bigint", async () => {
    chain.simulate = () => 42n;
    const service = await loadService();

    const count = await service.getAuditCount(PATIENT);
    expect(count).toBe(42n);
    expect(typeof count).toBe("bigint");
  });

  it("reads zero for a patient with no audit trail yet", async () => {
    // A patient who has never been looked up has no audit-sequence box, so the
    // simulated call comes back with nothing to decode.
    chain.simulate = () => undefined;
    const service = await loadService();

    await expect(service.getAuditCount(PATIENT)).resolves.toBe(0n);
  });

  it("reads the patient's audit-sequence box", async () => {
    chain.simulate = () => 1n;
    const service = await loadService();

    await service.getAuditCount(PATIENT);

    const [call] = chain.composed;
    expect(call.method).toBe("get_audit_count");
    expect(call.methodArgs).toEqual([PATIENT]);
    expect(call.boxes).toHaveLength(1);
    expect(hex(call.boxes[0].name)).toBe(GRANT_VECTOR.expectedAuditSeqBoxKeyHex);
  });
});

describe("logAccess", () => {
  /** Audit count currently 4, so the next entry is predicted at sequence 5. */
  function stubHappyWrite(returnValue: unknown = 5n, txId = "AUDITTX1"): void {
    chain.simulate = () => 4n;
    chain.execute = async () => ({ txIDs: [txId], methodResults: [{ returnValue }] });
  }

  it("returns the transaction id and the sequence the contract assigned", async () => {
    stubHappyWrite();
    const service = await loadService();

    const result = await service.logAccess(PATIENT, REQUESTER, SCOPE, ENDPOINT, "consent_checked");

    expect(result).toEqual({ txId: "AUDITTX1", sequence: 5n });
  });

  it("passes the five ABI arguments in the order the contract declares them", async () => {
    stubHappyWrite();
    const service = await loadService();

    await service.logAccess(PATIENT, REQUESTER, SCOPE, ENDPOINT, "consent_denied");

    const write = chain.composed.find((c) => c.method === "log_access")!;
    // A transposition here writes a permanently wrong line into an append-only
    // log — e.g. the endpoint recorded as the action.
    expect(write.methodArgs).toEqual([PATIENT, REQUESTER, SCOPE, ENDPOINT, "consent_denied"]);
    expect(write.appId).toBe(APP_ID);
    expect(write.sender).toBe(OPERATOR_ADDRESS);
  });

  it("reserves both boxes the write touches", async () => {
    stubHappyWrite();
    const service = await loadService();

    await service.logAccess(PATIENT, REQUESTER, SCOPE, ENDPOINT, "consent_checked");

    // The sequence counter is read *and* incremented, and the new entry is
    // written to a key derived from the incremented value. The AVM rejects a
    // box access that was not declared, so both references must be present or
    // every audit write fails at execution time.
    const write = chain.composed.find((c) => c.method === "log_access")!;
    expect(write.boxes).toHaveLength(2);
    expect(write.boxes.map((b) => b.appIndex)).toEqual([0, 0]);

    expect(hex(write.boxes[0].name)).toBe(GRANT_VECTOR.expectedAuditSeqBoxKeyHex);
    // `"a" || pubkey(patient) || itob(seq)`. The pubkey comes from the same
    // golden vector as the sequence box, so both names trace to one fixture.
    expect(hex(write.boxes[1].name)).toBe(`61${PATIENT_PUBKEY_HEX}${hex(algosdk.encodeUint64(5n))}`);
  });

  it("reads the current count before predicting the next box", async () => {
    stubHappyWrite();
    const service = await loadService();

    await service.logAccess(PATIENT, REQUESTER, SCOPE, ENDPOINT, "consent_checked");

    expect(chain.composed.map((c) => c.method)).toEqual(["get_audit_count", "log_access"]);
  });

  it("falls back to the predicted sequence when the call returns no value", async () => {
    stubHappyWrite(undefined, "AUDITTX2");
    const service = await loadService();

    const result = await service.logAccess(PATIENT, REQUESTER, SCOPE, ENDPOINT, "consent_checked");

    // The caller renders this into the API response, so it must be a number
    // rather than `undefined` even when the ABI return goes missing.
    expect(result.sequence).toBe(5n);
    expect(result.txId).toBe("AUDITTX2");
  });
});

describe("withPatientLock", () => {
  const patientA = algosdk.generateAccount().addr.toString();
  const patientB = algosdk.generateAccount().addr.toString();

  it("serialises two writes for the same patient", async () => {
    chain.simulate = () => 0n;
    const gate = deferred();
    let executions = 0;
    chain.execute = async () => {
      executions += 1;
      await gate.promise;
      return { txIDs: [`TX${executions}`], methodResults: [{ returnValue: BigInt(executions) }] };
    };
    const service = await loadService();

    const order: string[] = [];
    const first = service.logAccess(patientA, REQUESTER, SCOPE, ENDPOINT, "consent_checked");
    const second = service.logAccess(patientA, REQUESTER, SCOPE, ENDPOINT, "consent_checked");
    void first.then(() => order.push("first"));
    void second.then(() => order.push("second"));

    await settle();

    // The second call has not read the audit count yet, let alone composed a
    // write. That is the point: both calls predict their own audit-log box key
    // from the current sequence, so overlapping them would have them predict
    // the *same* key and one of the two writes would be rejected on chain.
    expect(chain.composed.map((c) => c.method)).toEqual(["get_audit_count", "log_access"]);
    expect(executions).toBe(1);

    gate.release();
    await Promise.all([first, second]);
    await settle();

    expect(chain.composed.map((c) => c.method)).toEqual([
      "get_audit_count",
      "log_access",
      "get_audit_count",
      "log_access",
    ]);
    expect(order).toEqual(["first", "second"]);
  });

  it("does not serialise writes for different patients", async () => {
    chain.simulate = () => 0n;
    const gate = deferred();
    let executions = 0;
    chain.execute = async () => {
      executions += 1;
      await gate.promise;
      return { txIDs: [`TX${executions}`], methodResults: [{ returnValue: 1n }] };
    };
    const service = await loadService();

    const both = Promise.all([
      service.logAccess(patientA, REQUESTER, SCOPE, ENDPOINT, "consent_checked"),
      service.logAccess(patientB, REQUESTER, SCOPE, ENDPOINT, "consent_checked"),
    ]);

    await settle();

    // Both are in flight while the gate is still shut. A global lock would make
    // one unrelated patient's slow chain round trip stall every other paid
    // request in the process.
    expect(executions).toBe(2);
    const writes = chain.composed.filter((c) => c.method === "log_access");
    expect(writes).toHaveLength(2);
    expect(writes.map((c) => c.methodArgs[0]).sort()).toEqual([patientA, patientB].sort());

    gate.release();
    await both;
  });

  it("keeps the queue moving after a failed write", async () => {
    chain.simulate = () => 0n;
    let attempts = 0;
    chain.execute = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("validity window expired");
      return { txIDs: ["TX2"], methodResults: [{ returnValue: 1n }] };
    };
    const service = await loadService();

    const failed = service.logAccess(patientA, REQUESTER, SCOPE, ENDPOINT, "consent_checked");
    const next = service.logAccess(patientA, REQUESTER, SCOPE, ENDPOINT, "consent_checked");

    await expect(failed).rejects.toThrow(/validity window expired/);
    // A rejected write must not wedge the queue: the lock chains with
    // `.then(fn, fn)` precisely so one transient algod failure does not stop
    // that patient's audit trail permanently.
    await expect(next).resolves.toEqual({ txId: "TX2", sequence: 1n });
  });
});

describe("chainAccountHealth", () => {
  /** Comfortably solvent: ~9,900 operator-funded writes, ~217 app-funded boxes. */
  const HEALTHY = {
    operator: { amount: 10_000_000, minBalance: 100_000 },
    app: { amount: 5_000_000, minBalance: 100_000 },
  };

  function stubBalances(operator: Record<string, number>, app: Record<string, number>): void {
    chain.accountInformation = async (address) =>
      address === OPERATOR_ADDRESS ? operator : app;
  }

  it("never makes the reader wait on algod", async () => {
    const gate = deferred();
    chain.accountInformation = async () => {
      await gate.promise;
      return HEALTHY.operator;
    };
    const service = await loadService();

    // Fly polls /v1/health on a timer. A liveness endpoint that blocks on a
    // third-party network call is not a liveness endpoint.
    const cold = service.chainAccountHealth();
    expect(cold.chain).toBeNull();
    expect(cold.chainError).toBe("not sampled yet");

    gate.release();
    await settle();

    expect(service.chainAccountHealth().chain).not.toBeNull();
  });

  it("surfaces a failed sample as chainError instead of throwing", async () => {
    chain.accountInformation = async () => {
      throw new Error("algod 503");
    };
    const service = await loadService();

    expect(() => service.primeChainAccountHealth()).not.toThrow();
    await settle();

    const { chain: reading, chainError } = service.chainAccountHealth();
    expect(reading).toBeNull();
    expect(chainError).toBe("algod 503");
  });

  it("still reports a reason when the failure is not an Error", async () => {
    chain.accountInformation = () => Promise.reject("socket hang up");
    const service = await loadService();

    service.primeChainAccountHealth();
    await settle();

    expect(service.chainAccountHealth().chainError).toBe("socket hang up");
  });

  it("reports both funding accounts once a sample lands", async () => {
    stubBalances(HEALTHY.operator, HEALTHY.app);
    const service = await loadService();

    service.primeChainAccountHealth();
    await settle();

    const { chain: reading, chainError } = service.chainAccountHealth();
    expect(chainError).toBeNull();
    expect(reading).not.toBeNull();
    expect(reading!.operatorAddress).toBe(OPERATOR_ADDRESS);
    expect(reading!.operatorSpendableMicroAlgo).toBe(9_900_000);
    // The audit box MBR is charged to the application account, not the
    // operator, so a solvent operator alone does not keep audit writes working.
    expect(reading!.appAccountAddress).toBe(algosdk.getApplicationAddress(APP_ID).toString());
    expect(reading!.appAccountSpendableMicroAlgo).toBe(4_900_000);
    expect(reading!.microAlgoPerAuditWrite).toBe(1_000);
    // The estimate is the smaller of the two: 4,900,000 / 22,500 boxes.
    expect(reading!.estimatedAuditWritesRemaining).toBe(217);
    expect(reading!.warning).toBeNull();
    expect(Number.isNaN(Date.parse(reading!.sampledAt))).toBe(false);
  });

  it("warns before the accounts run dry, not after", async () => {
    // 400,000 µALGO of app-account headroom is 17 more audit boxes.
    stubBalances(HEALTHY.operator, { amount: 500_000, minBalance: 100_000 });
    const service = await loadService();

    service.primeChainAccountHealth();
    await settle();

    const reading = service.chainAccountHealth().chain!;
    expect(reading.estimatedAuditWritesRemaining).toBe(17);
    expect(reading.warning).toMatch(/Only about 17 more audit writes/);
  });

  it("says outright that writes will fail at zero headroom", async () => {
    // No minBalance field at all on the operator (the `?? 0` path), and an app
    // account already below its own minimum — which must clamp to 0, not go
    // negative and read as "plenty left".
    stubBalances({ amount: 500 }, { amount: 100, minBalance: 900 });
    const service = await loadService();

    service.primeChainAccountHealth();
    await settle();

    const reading = service.chainAccountHealth().chain!;
    expect(reading.operatorSpendableMicroAlgo).toBe(500);
    expect(reading.appAccountSpendableMicroAlgo).toBe(0);
    expect(reading.estimatedAuditWritesRemaining).toBe(0);
    expect(reading.warning).toMatch(/Audit writes will fail/);
  });

  it("falls back to the operator's own capacity when no app id is configured", async () => {
    chain.config.consentAppId = 0;
    stubBalances({ amount: 30_000, minBalance: 10_000 }, {});
    const service = await loadService();

    service.primeChainAccountHealth();
    await settle();

    const reading = service.chainAccountHealth().chain!;
    expect(chain.accountInfoCalls).toEqual([OPERATOR_ADDRESS]);
    expect(reading.appAccountAddress).toBeNull();
    expect(reading.appAccountSpendableMicroAlgo).toBeNull();
    // 20,000 / 1,000 = exactly 20, which is the boundary the warning sits on.
    expect(reading.estimatedAuditWritesRemaining).toBe(20);
    expect(reading.warning).toBeNull();
  });

  it("does not start a second sample while one is in flight", async () => {
    const gate = deferred();
    chain.accountInformation = async (address) => {
      await gate.promise;
      return address === OPERATOR_ADDRESS ? HEALTHY.operator : HEALTHY.app;
    };
    const service = await loadService();

    service.primeChainAccountHealth();
    service.primeChainAccountHealth();
    await settle();

    // Health is polled on a timer by the platform and read on every request.
    // Without the in-flight guard, a slow algod turns that into a pile-up.
    expect(chain.accountInfoCalls).toEqual([OPERATOR_ADDRESS]);

    gate.release();
    await settle();
    expect(chain.accountInfoCalls).toHaveLength(2);
  });

  it("re-samples once the reading has gone stale", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    stubBalances(HEALTHY.operator, HEALTHY.app);
    const service = await loadService();

    service.chainAccountHealth();
    await settle();
    expect(chain.accountInfoCalls).toHaveLength(2);

    // Inside the 30s TTL the reader is a pure cache read.
    now.mockReturnValue(1_700_000_029_999);
    service.chainAccountHealth();
    await settle();
    expect(chain.accountInfoCalls).toHaveLength(2);

    now.mockReturnValue(1_700_000_030_000);
    service.chainAccountHealth();
    await settle();
    expect(chain.accountInfoCalls).toHaveLength(4);
  });

  it("keeps serving the last good reading when a refresh fails", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    stubBalances(HEALTHY.operator, HEALTHY.app);
    const service = await loadService();

    service.chainAccountHealth();
    await settle();
    const good = service.chainAccountHealth().chain!;

    chain.accountInformation = async () => {
      throw new Error("algod 503");
    };
    now.mockReturnValue(1_700_000_030_000);
    await settle();

    // Stale-while-revalidate, stated plainly: once a reading exists it is
    // preferred over the error, so `chainError` stays null and the ageing
    // `sampledAt` is the only signal that refreshes have started failing.
    const after = service.chainAccountHealth();
    await settle();
    expect(after.chain).toEqual(good);
    expect(after.chainError).toBeNull();
  });
});
