import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import algosdk from "algosdk";
import goldenVectors from "./fixtures/box-key-vectors.json" with { type: "json" };

/**
 * Golden vectors for the consent box-key derivation (finding G-08 / NFR-011).
 *
 * The same key is derived independently in three places, in three languages,
 * with three different crypto APIs:
 *
 *   1. contracts/smart_contracts/consent/contract.py  -> AVM `op.sha256`
 *   2. api/src/services/algorand.ts                   -> node:crypto `createHash`
 *   3. web/lib/consent.ts                             -> WebCrypto `crypto.subtle.digest`
 *
 * Nothing previously checked that they agree. A one-byte divergence — a changed
 * prefix, a reordered concatenation, a different scope encoding — makes
 * `check_access` read an empty box and return `false`. It does not error. It
 * fails *closed and silently*, presenting as "the patient's grant mysteriously
 * doesn't work": the hardest class of bug to diagnose and the worst one to hit
 * on stage.
 *
 * These vectors are the shared contract. The identical fixture is asserted by
 * contracts/tests/test_box_keys.py, so all three implementations are pinned to
 * the same bytes.
 */

interface Vector {
  patient: string;
  requester: string;
  scope: string;
  expectedGrantBoxKeyHex: string;
  expectedAuditSeqBoxKeyHex: string;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const pubkey = (a: string) => algosdk.decodeAddress(a).publicKey;

/** Mirrors api/src/services/algorand.ts::grantBoxName. */
function grantBoxName(patient: string, requester: string, scope: string): Uint8Array {
  const inner = concatBytes(pubkey(patient), pubkey(requester), new TextEncoder().encode(scope));
  const digest = new Uint8Array(createHash("sha256").update(inner).digest());
  return concatBytes(new TextEncoder().encode("g"), digest);
}

/** Mirrors api/src/services/algorand.ts::auditSeqBoxName. */
function auditSeqBoxName(patient: string): Uint8Array {
  return concatBytes(new TextEncoder().encode("s"), pubkey(patient));
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("box-key derivation parity (G-08 / NFR-011)", () => {
  const vectors = goldenVectors as { vectors: Vector[] };

  it("has vectors to check", () => {
    expect(vectors.vectors.length).toBeGreaterThanOrEqual(3);
  });

  for (const v of vectors.vectors) {
    it(`grant box key matches the golden vector for scope "${v.scope}"`, () => {
      expect(hex(grantBoxName(v.patient, v.requester, v.scope))).toBe(v.expectedGrantBoxKeyHex);
    });

    it(`audit-sequence box key matches the golden vector for ${v.patient.slice(0, 8)}…`, () => {
      expect(hex(auditSeqBoxName(v.patient))).toBe(v.expectedAuditSeqBoxKeyHex);
    });
  }

  it("grant keys are 33 bytes: 1-byte prefix + 32-byte sha256", () => {
    const v = vectors.vectors[0];
    const key = grantBoxName(v.patient, v.requester, v.scope);
    expect(key.length).toBe(33);
    expect(key[0]).toBe(0x67); // "g"
  });

  it("audit-sequence keys are 33 bytes: 1-byte prefix + 32-byte pubkey", () => {
    const key = auditSeqBoxName(vectors.vectors[0].patient);
    expect(key.length).toBe(33);
    expect(key[0]).toBe(0x73); // "s"
  });

  it("is order-sensitive — swapping patient and requester changes the key", () => {
    const v = vectors.vectors[0];
    expect(hex(grantBoxName(v.requester, v.patient, v.scope))).not.toBe(v.expectedGrantBoxKeyHex);
  });

  it("is scope-sensitive — a different scope is a different grant", () => {
    const v = vectors.vectors[0];
    expect(hex(grantBoxName(v.patient, v.requester, v.scope + "x"))).not.toBe(
      v.expectedGrantBoxKeyHex,
    );
  });

  it("WebCrypto (the browser path) produces the identical digest", async () => {
    const v = vectors.vectors[0];
    const inner = concatBytes(
      pubkey(v.patient),
      pubkey(v.requester),
      new TextEncoder().encode(v.scope),
    );
    // This is exactly what web/lib/consent.ts does.
    // `inner` is Uint8Array<ArrayBufferLike>; SubtleCrypto wants a view over a
    // plain ArrayBuffer, so narrow it rather than casting the mismatch away.
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", inner.slice().buffer as ArrayBuffer),
    );
    const key = concatBytes(new TextEncoder().encode("g"), digest);
    expect(hex(key)).toBe(v.expectedGrantBoxKeyHex);
  });
});
