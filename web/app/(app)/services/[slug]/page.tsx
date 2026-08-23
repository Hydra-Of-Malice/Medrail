import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Tag from "@/components/ui/Tag";
import { API_BASE } from "@/lib/config";
import { findService } from "@/components/pages/services/catalogue";

interface CatalogueEndpoint {
  method: string;
  path: string;
  price: string;
  gate: string;
}

const JSON_BLOCK_CLASS =
  "whitespace-pre-wrap break-words rounded-[6px] bg-surface-2 p-3 font-mono text-xs";

async function getLiveEndpoint(path: string): Promise<CatalogueEndpoint | null> {
  try {
    const res = await fetch(`${API_BASE}/`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    const endpoints: CatalogueEndpoint[] = Array.isArray(body?.endpoints) ? body.endpoints : [];
    return endpoints.find((e) => e.path === path) ?? null;
  } catch {
    return null;
  }
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = findService(slug);
  if (!service) notFound();

  const live = await getLiveEndpoint(service.path);
  const method = live?.method ?? service.method;
  const price = live?.price ?? service.fallbackPrice;
  const gate = live?.gate ?? service.fallbackGate;
  const isFree = price.trim().toLowerCase() === "free";

  return (
    <div>
      <PageHeader
        title={service.name}
        description={service.shortDescription}
        action={
          <Link
            href="/services"
            className="text-sm font-medium text-trust underline decoration-trust/40 underline-offset-2 hover:text-trust/80"
          >
            ← All services
          </Link>
        }
      />

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-text-faint">Endpoint</p>
            <p className="mt-1 font-mono text-sm text-text">
              <span className="text-text-muted">{method}</span> {service.path}
            </p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-text-faint">Price</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-value">{price}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-text-faint">Payment</p>
            <p className="mt-1 text-sm text-text-muted">
              {isFree
                ? "Free - no payment required."
                : `x402 payment required - ${price} in USDC, quoted via HTTP 402 before the request is fulfilled.`}
            </p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-text-faint">Consent</p>
            <p className="mt-1 text-sm text-text-muted">
              {service.consentRequired ? (
                <>
                  Patient consent required - verified on-chain before this endpoint responds. See{" "}
                  <Link
                    href="/consent"
                    className="text-trust underline decoration-trust/40 underline-offset-2 hover:text-trust/80"
                  >
                    /consent
                  </Link>
                  .
                </>
              ) : (
                "Not required."
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {!isFree && <Tag tone="value">x402 payment</Tag>}
          {isFree && <Tag tone="neutral">Free</Tag>}
          {service.consentRequired && <Tag tone="trust">Consent required</Tag>}
          <Tag tone="success">Live</Tag>
        </div>

        {!live && (
          <p className="mt-3 text-xs text-text-faint">
            Showing last-known values - the live catalogue at{" "}
            <span className="font-mono">{API_BASE ?? ""}/</span> could not be reached just now, so
            price and gate above reflect this endpoint&apos;s documented values instead of a fresh
            fetch. Gate: <span className="font-mono">{gate}</span>.
          </p>
        )}
      </Card>

      <section className="mt-8">
        <h2 className="font-display text-lg text-text">What it does</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">{service.longDescription}</p>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-text">Example request / response</h2>
          <span className="font-mono text-[11px] text-text-faint">
            {service.example.verified ? "verified transcript from a real call" : "illustrative of the response shape"}
          </span>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-text-faint">Request</p>
            <div className="mt-1.5">
              <pre className={JSON_BLOCK_CLASS}>{JSON.stringify(service.example.request, null, 2)}</pre>
            </div>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-text-faint">Response</p>
            <div className="mt-1.5">
              <pre className={JSON_BLOCK_CLASS}>{JSON.stringify(service.example.response, null, 2)}</pre>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg text-text">Integration example</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
          {isFree
            ? "A plain HTTP call is enough - no payment or signing involved."
            : "A plain curl call like this will get back HTTP 402 Payment Required with a payment quote - completing the call needs a signed x402 USDC payment attached to the retried request, which curl alone can't do. See "}
          {!isFree && (
            <Link
              href="/developer"
              className="text-trust underline decoration-trust/40 underline-offset-2 hover:text-trust/80"
            >
              /developer
            </Link>
          )}
          {!isFree && " for the real, interactive pay-and-call flow against this same endpoint."}
        </p>
        <div className="mt-3">
          <pre className={JSON_BLOCK_CLASS}>{service.curl(API_BASE ?? "")}</pre>
        </div>
      </section>
    </div>
  );
}
