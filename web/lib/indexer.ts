import algosdk from "algosdk";
import { NETWORK } from "./config";
import { GRANT_ACCESS_METHOD, REVOKE_ACCESS_METHOD, REQUEST_ACCESS_METHOD, LOG_ACCESS_METHOD, getAppId } from "./consent";
import { USDC_ASSET_ID } from "./usdc";

/** Real, live queries against the public TestNet/MainNet indexer — no fabricated
 * history anywhere in this file. Verified against testnet-idx.algonode.cloud
 * before writing: account-transactions filtered by asset-id (payments),
 * application-id-filtered transactions decoded by ABI selector (consent/audit
 * events), and application box listing (grant enumeration). */
export const INDEXER_URL = NETWORK === "mainnet" ? "https://mainnet-idx.algonode.cloud" : "https://testnet-idx.algonode.cloud";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface IndexerPayment {
  txId: string;
  sender: string;
  receiver: string;
  amountMicroUsdc: number;
  round: number;
  roundTime: string;
  note: string | null;
}

/** Every settled USDC transfer to `payToAddress` — this is MedRail's real payment history. */
export async function getPayments(payToAddress: string, limit = 100): Promise<IndexerPayment[]> {
  const url = new URL(`${INDEXER_URL}/v2/accounts/${payToAddress}/transactions`);
  url.searchParams.set("asset-id", String(USDC_ASSET_ID));
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`indexer request failed: ${res.status}`);
  const data = await res.json();
  const txns = (data.transactions ?? []) as Record<string, unknown>[];

  return txns
    .filter((t) => t["asset-transfer-transaction"])
    .map((t) => {
      const at = t["asset-transfer-transaction"] as { receiver: string; amount: number };
      let note: string | null = null;
      if (typeof t.note === "string") {
        try {
          note = atob(t.note);
        } catch {
          note = null;
        }
      }
      return {
        txId: t.id as string,
        sender: t.sender as string,
        receiver: at.receiver,
        amountMicroUsdc: at.amount,
        round: t["confirmed-round"] as number,
        roundTime: new Date((t["round-time"] as number) * 1000).toISOString(),
        note,
      };
    })
    .sort((a, b) => b.round - a.round);
}

export type ConsentAction = "grant_access" | "revoke_access" | "request_access" | "log_access";

const METHODS: Record<ConsentAction, algosdk.ABIMethod> = {
  grant_access: GRANT_ACCESS_METHOD,
  revoke_access: REVOKE_ACCESS_METHOD,
  request_access: REQUEST_ACCESS_METHOD,
  log_access: LOG_ACCESS_METHOD,
};

export interface ConsentEvent {
  txId: string;
  round: number;
  roundTime: string;
  sender: string;
  action: ConsentAction;
  args: Record<string, string>;
}

function decodeAppCall(t: Record<string, unknown>): ConsentEvent | null {
  const at = t["application-transaction"] as { "application-args"?: string[] } | undefined;
  const argsB64 = at?.["application-args"];
  if (!argsB64 || argsB64.length === 0) return null;

  const selector = b64ToBytes(argsB64[0]);
  const match = (Object.entries(METHODS) as [ConsentAction, algosdk.ABIMethod][]).find(([, method]) =>
    bytesEqual(selector, method.getSelector()),
  );
  if (!match) return null;
  const [action, method] = match;

  const args: Record<string, string> = {};
  method.args.forEach((argSpec, i) => {
    const raw = argsB64[i + 1];
    if (raw === undefined) return;
    // All four consent methods take plain address/string/uint64 args, never a
    // transaction or reference type, so this narrowing is always valid here.
    const decoded = (argSpec.type as algosdk.ABIType).decode(b64ToBytes(raw));
    args[argSpec.name ?? `arg${i}`] = String(decoded);
  });

  return {
    txId: t.id as string,
    round: t["confirmed-round"] as number,
    roundTime: new Date((t["round-time"] as number) * 1000).toISOString(),
    sender: t.sender as string,
    action,
    args,
  };
}

/** Every grant/revoke/request/log_access call ever made against MedRailConsent, decoded
 * from indexer history. This is what makes a global, cross-patient Audit Trail and Consent
 * feed possible — the contract's own box storage can't be enumerated by requester. */
export async function getConsentEvents(limit = 200): Promise<ConsentEvent[]> {
  const appId = await getAppId();
  const url = new URL(`${INDEXER_URL}/v2/transactions`);
  url.searchParams.set("application-id", String(appId));
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`indexer request failed: ${res.status}`);
  const data = await res.json();
  const txns = (data.transactions ?? []) as Record<string, unknown>[];

  return txns
    .map(decodeAppCall)
    .filter((e): e is ConsentEvent => e !== null)
    .sort((a, b) => b.round - a.round);
}
