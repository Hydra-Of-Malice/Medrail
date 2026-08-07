import algosdk from "algosdk";
import { ALGOD_URL, API_BASE } from "./config";
import type { DemoWallet } from "./demoWallet";

const algod = new algosdk.Algodv2("", ALGOD_URL, "");

const GRANT_ACCESS_METHOD = new algosdk.ABIMethod({
  name: "grant_access",
  args: [
    { type: "address", name: "requester" },
    { type: "string", name: "scope" },
    { type: "uint64", name: "duration_seconds" },
  ],
  returns: { type: "void" },
});

const REVOKE_ACCESS_METHOD = new algosdk.ABIMethod({
  name: "revoke_access",
  args: [
    { type: "address", name: "requester" },
    { type: "string", name: "scope" },
  ],
  returns: { type: "void" },
});

function grantBoxName(patient: string, requester: string, scope: string): Promise<Uint8Array> {
  const prefix = new TextEncoder().encode("g");
  const inner = new Uint8Array([
    ...algosdk.decodeAddress(patient).publicKey,
    ...algosdk.decodeAddress(requester).publicKey,
    ...new TextEncoder().encode(scope),
  ]);
  return crypto.subtle.digest("SHA-256", inner).then((digest) => new Uint8Array([...prefix, ...new Uint8Array(digest)]));
}

async function getAppId(): Promise<number> {
  const res = await fetch(`${API_BASE}/v1/consent/app-info`, { cache: "no-store" });
  const info = await res.json();
  if (!info.consentAppId) throw new Error("Consent contract is not deployed yet.");
  return info.consentAppId as number;
}

/** Patient signs directly with their own key — the backend never sees or proxies this. */
export async function grantAccessOnChain(
  wallet: DemoWallet,
  requester: string,
  scope: string,
  durationSeconds = 0,
): Promise<string> {
  const account = algosdk.mnemonicToSecretKey(wallet.mnemonic);
  const appId = await getAppId();
  const suggestedParams = await algod.getTransactionParams().do();
  const boxName = await grantBoxName(wallet.address, requester, scope);

  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: appId,
    method: GRANT_ACCESS_METHOD,
    methodArgs: [requester, scope, durationSeconds],
    sender: account.addr,
    signer: algosdk.makeBasicAccountTransactionSigner(account),
    suggestedParams,
    boxes: [{ appIndex: 0, name: boxName }],
  });

  const result = await atc.execute(algod, 4);
  return result.txIDs[0];
}

export async function revokeAccessOnChain(wallet: DemoWallet, requester: string, scope: string): Promise<string> {
  const account = algosdk.mnemonicToSecretKey(wallet.mnemonic);
  const appId = await getAppId();
  const suggestedParams = await algod.getTransactionParams().do();
  const boxName = await grantBoxName(wallet.address, requester, scope);

  const atc = new algosdk.AtomicTransactionComposer();
  atc.addMethodCall({
    appID: appId,
    method: REVOKE_ACCESS_METHOD,
    methodArgs: [requester, scope],
    sender: account.addr,
    signer: algosdk.makeBasicAccountTransactionSigner(account),
    suggestedParams,
    boxes: [{ appIndex: 0, name: boxName }],
  });

  const result = await atc.execute(algod, 4);
  return result.txIDs[0];
}
