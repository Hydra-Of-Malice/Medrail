import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import ConsentTimeline from "@/components/pages/consent-detail/ConsentTimeline";

const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a);

export default async function ConsentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const parts = decoded.split("|");

  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    return (
      <div>
        <PageHeader title="Consent grant" description="Consent grant detail." />
        <EmptyState
          title="No on-chain history for this identifier"
          description="This link doesn't encode a valid patient / requester / scope identifier."
        />
      </div>
    );
  }

  const [patient, requester, scope] = parts;

  return (
    <div>
      <PageHeader
        title="Consent grant"
        description={`${shortAddr(patient)} → ${shortAddr(requester)} · ${scope}`}
      />
      <ConsentTimeline patient={patient} requester={requester} scope={scope} />
    </div>
  );
}
