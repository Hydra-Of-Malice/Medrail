import { API_BASE } from "./config";

export interface HealthResponse {
  ok: boolean;
  service: string;
  network: string;
  consentAppId: number | null;
  time: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/v1/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(`health check failed: ${res.status}`);
  return res.json();
}

export interface ConsentStatus {
  patient: string;
  requester: string;
  scope: string;
  granted: boolean;
}

export async function getConsentStatus(patient: string, requester: string, scope: string): Promise<ConsentStatus> {
  const url = new URL(`${API_BASE}/v1/consent/status`);
  url.searchParams.set("patient", patient);
  url.searchParams.set("requester", requester);
  url.searchParams.set("scope", scope);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `status check failed: ${res.status}`);
  return body;
}
