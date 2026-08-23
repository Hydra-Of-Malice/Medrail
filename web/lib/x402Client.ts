import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { ALGOD_URL } from "./config";

/** Matches @x402/avm's ClientAvmSigner interface — see docs/ARCHITECTURE.md. */
export interface ClientAvmSigner {
  address: string;
  signTransactions(txns: Uint8Array[], indexesToSign?: number[]): Promise<(Uint8Array | null)[]>;
}

export function buildPaidFetch(signer: ClientAvmSigner) {
  const client = new x402Client();
  client.register("algorand:*", new ExactAvmScheme(signer, { algodUrl: ALGOD_URL }));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);
  return { fetchWithPayment, httpClient };
}

export interface PaidCallResult {
  status: number;
  body: unknown;
  paymentResponse: unknown;
}

export async function callPaidEndpoint(
  signer: ClientAvmSigner,
  url: string,
  init: RequestInit,
): Promise<PaidCallResult> {
  const { fetchWithPayment, httpClient } = buildPaidFetch(signer);
  const response = await fetchWithPayment(url, init);
  const body = await response.json();

  // A 402 here means the SDK constructed and signed a real payment but
  // settlement itself failed (almost always: the wallet has no
  // TestNet USDC yet) — there is no PAYMENT-RESPONSE header to parse in
  // that case, so don't let the parser throw over an expected outcome.
  const paymentResponse =
    response.status === 200 ? httpClient.getPaymentSettleResponse((name) => response.headers.get(name)) : null;

  return { status: response.status, body, paymentResponse };
}
