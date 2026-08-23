import TransactionDetailClient from "@/components/pages/transactions/TransactionDetailClient";

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TransactionDetailClient id={id} />;
}
