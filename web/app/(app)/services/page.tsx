import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Tag from "@/components/ui/Tag";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import { API_BASE } from "@/lib/config";
import { SERVICES } from "@/components/pages/services/catalogue";

interface CatalogueEndpoint {
  method: string;
  path: string;
  price: string;
  gate: string;
}

interface CatalogueResponse {
  service: string;
  description: string;
  endpoints: CatalogueEndpoint[];
}

async function getCatalogue(): Promise<CatalogueResponse> {
  const res = await fetch(`${API_BASE}/`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET / returned ${res.status}`);
  return res.json();
}

export default async function ServicesPage() {
  let catalogue: CatalogueResponse | null = null;
  let loadError: string | null = null;

  try {
    catalogue = await getCatalogue();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <div>
      <PageHeader
        title="Services"
        description="MedRail's clinical service catalogue - real endpoints, live on Algorand TestNet, fetched straight from the API's discovery entrypoint."
      />

      {loadError && (
        <ErrorState
          title="Could not load the service catalogue"
          description={`GET ${API_BASE ?? ""}/ failed: ${loadError}. Reload the page to try again.`}
        />
      )}

      {!loadError && catalogue && catalogue.endpoints.length === 0 && (
        <EmptyState
          title="No services listed"
          description="The API's discovery entrypoint returned an empty endpoint list."
        />
      )}

      {!loadError && catalogue && catalogue.endpoints.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {SERVICES.map((svc) => {
            const live = catalogue!.endpoints.find((e) => e.path === svc.path);
            const method = live?.method ?? svc.method;
            const price = live?.price ?? svc.fallbackPrice;
            const gate = live?.gate ?? svc.fallbackGate;
            const isFree = price.trim().toLowerCase() === "free";
            const needsConsent = gate.toLowerCase().includes("consent");

            return (
              <Card key={svc.slug}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-lg text-text">{svc.name}</h2>
                  <span className="font-mono text-sm tabular-nums text-value">{price}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-text-faint">
                  <span className="text-text-muted">{method}</span> {svc.path}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {!isFree && <Tag tone="value">x402 payment</Tag>}
                  {isFree && <Tag tone="neutral">Free</Tag>}
                  {needsConsent && <Tag tone="trust">Consent required</Tag>}
                  <Tag tone="success">Live</Tag>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-text-muted">{svc.shortDescription}</p>

                <Link
                  href={`/services/${svc.slug}`}
                  className="mt-4 inline-block text-sm font-medium text-trust underline decoration-trust/40 underline-offset-2 hover:text-trust/80"
                >
                  View details →
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
